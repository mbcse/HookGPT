import type { Request, RequestHandler, Response } from "express";

import { hooksService } from "@/api/hooks/hooksService";
import { handleServiceResponse } from "@/common/utils/httpHandlers";
import { UniswapHookGeneratorAgent } from "@/common/ai/uniswapHookAgent/AgentServer";
import { LLLModelConfig, LLMProviders } from "@/common/ai/LLMModelManager";
import { EmbeddingConfig, EmbeddingProvider } from "@/common/ai/EmbeddingManager";
import { VectorStoreConfig, VectorStoreProvider } from "@/common/ai/VectorStoreManager";
import { LangChainAdapter } from 'ai';
import { DatabaseService } from "@/database";
import { Logger } from "@/common/utils/logger";

const modelConfig: LLLModelConfig = {
  provider: LLMProviders.OPENAI,
  apiKey: process.env.OPENAI_API_KEY || '',
  modelName: "o3-mini",
};
const embeddingConfig: EmbeddingConfig = {
  provider: EmbeddingProvider.OPENAI,
  apiKey: process.env.OPENAI_API_KEY || '',
  modelName: "text-embedding-3-large",
};
const vectorStoreConfig: VectorStoreConfig = {
  provider: VectorStoreProvider.PGVECTOR,
  connectionConfig: {
    postgresConnectionOptions: {
      type: "postgres",
      host: process.env.DB_HOST || "127.0.0.1",
      port: parseInt(process.env.DB_PORT || "5432"),
      user: process.env.DB_USER || "test",
      password: process.env.DB_PASSWORD || "test",
      database: process.env.DB_NAME || "api",
      ssl: {
        rejectUnauthorized: false // Set to true in production if you have valid certificates
      }
    },
    tableName: "uniswap_hooks",
  },
};

Logger.info('HOOKS', 'Configuration loaded', { 
  modelProvider: modelConfig.provider, 
  modelName: modelConfig.modelName,
  embeddingProvider: embeddingConfig.provider,
  embeddingModel: embeddingConfig.modelName,
  vectorStoreProvider: vectorStoreConfig.provider
});

interface LLMError {
  name?: string;
  message?: string;
  lc_error_code?: string;
  [key: string]: any;
}

class HooksController {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
    Logger.info('HOOKS_CONTROLLER', 'Controller initialized');
  }

  /**
   * Initialize a new session
   * @param req Request object
   * @param res Response object
   * @returns Session ID and optional welcome message
   */
  public initSession: RequestHandler = async (req: Request, res: Response) => {
    // Start a timer for the entire operation with the initial info included
    const timer = Logger.time('HOOKS_INIT_SESSION', 'Initialize new session', { 
      initialMessage: req.body.initialMessage ? 'Present' : 'None' 
    });
    
    try {
      // Connect to the database with timing
      const dbTimer = Logger.time('HOOKS_INIT_SESSION', 'Database connection');
      await this.db.connect();
      dbTimer.end();
      
      // Create a new session with timing
      const sessionTimer = Logger.time('HOOKS_INIT_SESSION', 'Create new session');
      const session = await this.db.sessions.createSession();
      sessionTimer.success('Session created', { sessionId: session.id });
      
      // If an initial message was provided, store it with timing
      if (req.body.initialMessage) {
        const messageTimer = Logger.time('HOOKS_INIT_SESSION', 'Store initial message');
        await this.db.messages.createMessage({
          content: req.body.initialMessage,
          role: 'user',
          sessionId: session.id,
        });
        messageTimer.success('Initial message stored');
      }
      
      // Successfully complete the operation
      timer.success('Session initialization completed');
      
      return res.status(200).json({
        sessionId: session.id,
        message: "Session initialized successfully"
      });
    } catch (error) {
      // Log the error with the timer
      timer.error('Error initializing session', error);
      
      return res.status(500).json({ 
        error: "Failed to initialize session",
        message: (error as Error).message || String(error)
      });
    }
  };

  public chat: RequestHandler = async (req: Request, res: Response) => {
    const timer = Logger.time('HOOKS_CHAT', 'Complete chat operation', { 
      sessionId: req.body.sessionId,
      messageCount: req.body.messages?.length || 0
    });
    
    try {
      // Connect to the database
      const dbTimer = Logger.time('HOOKS_CHAT', 'Database connection');
      await this.db.connect();
      dbTimer.end();
      
      // Validate that the session ID is provided
      if (!req.body.sessionId) {
        Logger.error('HOOKS_CHAT', 'Missing session ID');
        return res.status(400).json({ 
          error: "Session ID is required",
          message: "Please initialize a session first using the /init-session endpoint"
        });
      }
      
      // Check if the session exists
      const sessionCheckTimer = Logger.time('HOOKS_CHAT', 'Session validation');
      const sessionExists = await this.db.sessions.getSessionById(req.body.sessionId);
      sessionCheckTimer.end();
      
      if (!sessionExists) {
        Logger.error('HOOKS_CHAT', 'Session not found', { sessionId: req.body.sessionId });
        return res.status(404).json({ 
          error: "Session not found",
          message: "The provided session ID does not exist"
        });
      }
      
      const agentCreateTimer = Logger.time('HOOKS_CHAT', 'Create Hooks agent');
      const hooksAgentServer = await UniswapHookGeneratorAgent.create(modelConfig, embeddingConfig, vectorStoreConfig);
      agentCreateTimer.end();
      
      Logger.info('HOOKS_CHAT', 'Messages received', req.body.messages);
      const message = req.body.messages[req.body.messages.length - 1].content;
      Logger.info('HOOKS_CHAT', 'Processing latest message', message);
      
      // Store the user's message in the database
      const storeMessageTimer = Logger.time('HOOKS_CHAT', 'Store user message');
      await this.db.messages.createMessage({
        content: message,
        role: 'user',
        sessionId: req.body.sessionId,
      });
      storeMessageTimer.end();
      
      // Initialize the session and get message history and context
      const sessionId = req.body.sessionId;
      Logger.info('HOOKS_CHAT', 'Initializing agent session', { sessionId });
      
      const initSessionTimer = Logger.time('HOOKS_CHAT', 'Initialize agent session');
      const { messageHistory, context, sessionId: actualSessionId, hookCode } = await hooksAgentServer.initializeSession(sessionId, message);
      initSessionTimer.end();
      
      Logger.info('HOOKS_CHAT', 'Agent session initialized', { 
        actualSessionId,
        messageHistoryLength: messageHistory.length,
        contextLength: context.length,
        hasHookCode: !!hookCode
      });
      
      // Set up SSE headers
      Logger.info('HOOKS_CHAT', 'Setting up SSE response');
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // First, stream the reply
      Logger.info('HOOKS_CHAT', 'Starting to stream reply...');
      let fullReply = '';
      
      try {
        const replyTimer = Logger.time('HOOKS_CHAT', 'Generate reply');
        const replyStream = await hooksAgentServer.generateReply(actualSessionId, message, messageHistory, context, hookCode);
        Logger.info('HOOKS_CHAT', 'Reply stream created, ready to iterate');
        
        let chunkCount = 0;
        for await (const chunk of replyStream) {
          chunkCount++;
          Logger.info('HOOKS_CHAT', `Reply chunk ${chunkCount} received`, chunk);
          
          // Accumulate the full reply for database storage
          if (chunk.reply) {
            fullReply += chunk.reply;
          }
          
          // Convert the chunk object to a string before writing to the response
          const replyContent = chunk.reply || chunk;
          const replyChunk = {
            type: 'reply',
            content: replyContent
          };
          const chunkString = JSON.stringify(replyChunk);
          // Format as SSE (Server-Sent Events)
          res.write(`data: ${chunkString}\n\n`);
        }
        replyTimer.end();
        Logger.info('HOOKS_CHAT', `Reply streaming complete. Total chunks: ${chunkCount}`);
        
        // Store the complete reply in the database
        if (fullReply) {
          const storeReplyTimer = Logger.time('HOOKS_CHAT', 'Store assistant reply');
          await this.db.messages.createMessage({
            content: fullReply,
            role: 'assistant',
            sessionId: actualSessionId,
          });
          storeReplyTimer.end();
          
          Logger.info('HOOKS_CHAT', 'Stored complete reply in database', { 
            sessionId: actualSessionId, 
            replyLength: fullReply.length 
          });
        }
      } catch (error) {
        const replyError = error as LLMError;
        Logger.error('HOOKS_CHAT', 'Error generating reply', replyError);
        const errorChunk = {
          type: 'error',
          content: 'Failed to generate reply. Please try again.',
          errorType: 'replyError'
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
      }
      
      // Then, stream the hook code
      Logger.info('HOOKS_CHAT', 'Starting to stream hook code...');
      let hookData: any = null;
      
      try {
        const hookTimer = Logger.time('HOOKS_CHAT', 'Generate hook code');
        const hookCodeStream = await hooksAgentServer.generateHookCode(actualSessionId, message, messageHistory, context, hookCode);
        Logger.info('HOOKS_CHAT', 'Hook code stream created, ready to iterate');
        
        let chunkCount = 0;
        for await (const chunk of hookCodeStream) {
          chunkCount++;
          Logger.info('HOOKS_CHAT', `Hook code chunk ${chunkCount} received`, chunk);
          
          // Store the complete hook data
          if (chunk) {
            hookData = chunk;
          }
          
          // Convert the chunk object to a string before writing to the response
          const hookCodeChunk = {
            type: 'hookCode',
            content: chunk
          };
          const chunkString = JSON.stringify(hookCodeChunk);
          // Format as SSE (Server-Sent Events)
          res.write(`data: ${chunkString}\n\n`);
        }
        hookTimer.end();
        Logger.info('HOOKS_CHAT', `Hook code streaming complete. Total chunks: ${chunkCount}`);
        
        // Store the hook code in the database
        if (hookData) {
          const storeHookTimer = Logger.time('HOOKS_CHAT', 'Store hook code');
          await this.db.hookCodes.createHookCode({
            name: hookData.name || 'Unnamed Hook',
            description: hookData.description || 'No description provided',
            code: hookData.code || '',
            gasEstimate: hookData.gasEstimate,
            implementationDetails: hookData.implementationDetails,
            testCode: hookData.testCode,
            examples: hookData.examples,
            sessionId: actualSessionId,
          });
          storeHookTimer.end();
          
          Logger.info('HOOKS_CHAT', 'Stored hook code in database', { 
            sessionId: actualSessionId,
            hookDataSize: JSON.stringify(hookData).length
          });
        }
      } catch (error) {
        const hookCodeError = error as LLMError;
        Logger.error('HOOKS_CHAT', 'Error generating hook code', hookCodeError);
        
        // Check if it's a parsing error
        const isParsingError = hookCodeError.name === 'OutputParserException' || 
                              hookCodeError.message?.includes('parsing') ||
                              hookCodeError.lc_error_code === 'OUTPUT_PARSING_FAILURE';
        
        const errorChunk = {
          type: 'error',
          content: isParsingError 
            ? 'Failed to parse hook code. The AI generated incomplete or invalid JSON.'
            : 'Failed to generate hook code. Please try again.',
          errorType: 'hookCodeError',
          error: hookCodeError.message || String(hookCodeError)
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
      }
      
      // End the stream with a done event
      Logger.info('HOOKS_CHAT', 'Completing SSE response');
      res.write('data: [DONE]\n\n');
      res.end();
      
      timer.success('Chat operation completed successfully');
    } catch (error) {
      const generalError = error as Error;
      timer.error('Error in chat handler', generalError);
      
      // Check if headers have already been sent
      if (!res.headersSent) {
        res.status(500).json({ error: "An error occurred while processing your request" });
      } else {
        // If headers are already sent, just end the response
        const errorChunk = {
          type: 'error',
          content: 'An error occurred while processing your request',
          error: generalError.message || String(generalError)
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  };

  public generateReply: RequestHandler = async (req: Request, res: Response) => {
    const timer = Logger.time('HOOKS_GENERATE_REPLY', 'Complete reply generation operation');
    Logger.info('HOOKS_GENERATE_REPLY', 'Reply generation request received', { 
      sessionId: req.body.sessionId,
      messageCount: req.body.messages?.length || 0
    });
    
    try {
      // Connect to the database
      const dbTimer = Logger.time('HOOKS_GENERATE_REPLY', 'Database connection');
      await this.db.connect();
      dbTimer.end();
      
      // Validate that the session ID is provided
      if (!req.body.sessionId) {
        Logger.error('HOOKS_GENERATE_REPLY', 'Missing session ID');
        return res.status(400).json({ 
          error: "Session ID is required",
          message: "Please initialize a session first using the /init-session endpoint"
        });
      }
      
      // Check if the session exists
      const sessionCheckTimer = Logger.time('HOOKS_GENERATE_REPLY', 'Session validation');
      const sessionExists = await this.db.sessions.getSessionById(req.body.sessionId);
      sessionCheckTimer.end();
      
      if (!sessionExists) {
        Logger.error('HOOKS_GENERATE_REPLY', 'Session not found', { sessionId: req.body.sessionId });
        return res.status(404).json({ 
          error: "Session not found",
          message: "The provided session ID does not exist"
        });
      }
      
      const agentCreateTimer = Logger.time('HOOKS_GENERATE_REPLY', 'Create Hooks agent');
      const hooksAgentServer = await UniswapHookGeneratorAgent.create(modelConfig, embeddingConfig, vectorStoreConfig);
      agentCreateTimer.end();
      
      Logger.info('HOOKS_GENERATE_REPLY', 'Messages received', req.body.messages);
      const message = req.body.messages[req.body.messages.length - 1].content;
      Logger.info('HOOKS_GENERATE_REPLY', 'Processing latest message', message);
      
      // Store the user's message in the database
      const storeMessageTimer = Logger.time('HOOKS_GENERATE_REPLY', 'Store user message');
      await this.db.messages.createMessage({
        content: message,
        role: 'user',
        sessionId: req.body.sessionId,
      });
      storeMessageTimer.end();
      
      // Initialize the session and get message history and context
      const sessionId = req.body.sessionId;
      Logger.info('HOOKS_GENERATE_REPLY', 'Initializing agent session', { sessionId });
      
      const initSessionTimer = Logger.time('HOOKS_GENERATE_REPLY', 'Initialize agent session');
      const { messageHistory, context, sessionId: actualSessionId, hookCode } = await hooksAgentServer.initializeSession(sessionId, message);
      initSessionTimer.end();
      
      Logger.info('HOOKS_GENERATE_REPLY', 'Agent session initialized', { 
        actualSessionId,
        messageHistoryLength: messageHistory.length,
        contextLength: context.length,
        hasHookCode: !!hookCode
      });
      
      // Set up SSE headers
      Logger.info('HOOKS_GENERATE_REPLY', 'Setting up SSE response');
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // First, stream the reply
      Logger.info('HOOKS_GENERATE_REPLY', 'Starting to stream reply...');
      let fullReply = '';
      
      try {
        const replyTimer = Logger.time('HOOKS_GENERATE_REPLY', 'Generate reply');
        const replyStream = await hooksAgentServer.generateReply(actualSessionId, message, messageHistory, context, hookCode);
        Logger.info('HOOKS_GENERATE_REPLY', 'Reply stream created, ready to iterate');
        
        let chunkCount = 0;
        for await (const chunk of replyStream) {
          chunkCount++;
          Logger.info('HOOKS_GENERATE_REPLY', `Reply chunk ${chunkCount} received`, chunk);
          
          // Accumulate the full reply for database storage
          if (chunk.reply) {
            fullReply += chunk.reply;
          }
          
          // Convert the chunk object to a string before writing to the response
          const replyContent = chunk.reply || chunk;
          const replyChunk = {
            type: 'reply',
            content: replyContent
          };
          const chunkString = JSON.stringify(replyChunk);
          // Format as SSE (Server-Sent Events)
          res.write(`data: ${chunkString}\n\n`);
        }
        replyTimer.end();
        Logger.info('HOOKS_GENERATE_REPLY', `Reply streaming complete. Total chunks: ${chunkCount}`);
        
        // Store the complete reply in the database
        if (fullReply) {
          const storeReplyTimer = Logger.time('HOOKS_GENERATE_REPLY', 'Store assistant reply');
          await this.db.messages.createMessage({
            content: fullReply,
            role: 'assistant',
            sessionId: actualSessionId,
          });
          storeReplyTimer.end();
          
          Logger.info('HOOKS_GENERATE_REPLY', 'Stored complete reply in database', { 
            sessionId: actualSessionId, 
            replyLength: fullReply.length 
          });
        }
      } catch (error) {
        const replyError = error as LLMError;
        Logger.error('HOOKS_GENERATE_REPLY', 'Error generating reply', replyError);
        const errorChunk = {
          type: 'error',
          content: 'Failed to generate reply. Please try again.',
          errorType: 'replyError'
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
      }
     
      // End the stream with a done event
      Logger.info('HOOKS_GENERATE_REPLY', 'Completing SSE response');
      res.write('data: [DONE]\n\n');
      res.end();
      
      timer.end();
      Logger.info('HOOKS_GENERATE_REPLY', 'Reply generation completed successfully');
    } catch (error) {
      const generalError = error as Error;
      Logger.error('HOOKS_GENERATE_REPLY', 'Error in reply generation handler', generalError);
      
      // Check if headers have already been sent
      if (!res.headersSent) {
        res.status(500).json({ error: "An error occurred while processing your request" });
      } else {
        // If headers are already sent, just end the response
        const errorChunk = {
          type: 'error',
          content: 'An error occurred while processing your request',
          error: generalError.message || String(generalError)
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      
      timer.end();
      Logger.info('HOOKS_GENERATE_REPLY', 'Reply generation failed');
    }
  }

  public generateHookCode: RequestHandler = async (req: Request, res: Response) => {
    const timer = Logger.time('HOOKS_GENERATE_CODE', 'Complete hook code generation operation');
    Logger.info('HOOKS_GENERATE_CODE', 'Hook code generation request received', { 
      sessionId: req.body.sessionId,
      messageCount: req.body.messages?.length || 0,
      messages: req.body.messages
    });
    
    try {
      // Connect to the database
      const dbTimer = Logger.time('HOOKS_GENERATE_CODE', 'Database connection');
      await this.db.connect();
      dbTimer.end();
      
      // Validate that the session ID is provided
      if (!req.body.sessionId) {
        Logger.error('HOOKS_GENERATE_CODE', 'Missing session ID');
        return res.status(400).json({ 
          error: "Session ID is required",
          message: "Please initialize a session first using the /init-session endpoint"
        });
      }
      
      // Check if the session exists
      const sessionCheckTimer = Logger.time('HOOKS_GENERATE_CODE', 'Session validation');
      const sessionExists = await this.db.sessions.getSessionById(req.body.sessionId);
      sessionCheckTimer.end();
      
      if (!sessionExists) {
        Logger.error('HOOKS_GENERATE_CODE', 'Session not found', { sessionId: req.body.sessionId });
        return res.status(404).json({ 
          error: "Session not found",
          message: "The provided session ID does not exist"
        });
      }
      
      const agentCreateTimer = Logger.time('HOOKS_GENERATE_CODE', 'Create Hooks agent');
      const hooksAgentServer = await UniswapHookGeneratorAgent.create(modelConfig, embeddingConfig, vectorStoreConfig);
      agentCreateTimer.end();
      
      const message = req.body.messages[req.body.messages.length - 1].content;
      Logger.info('HOOKS_GENERATE_CODE', 'Processing latest message', message);
      
      // Initialize the session and get message history and context
      const sessionId = req.body.sessionId;
      Logger.info('HOOKS_GENERATE_CODE', 'Initializing agent session', { sessionId });
      
      const initSessionTimer = Logger.time('HOOKS_GENERATE_CODE', 'Initialize agent session');
      const { messageHistory, context, sessionId: actualSessionId, hookCode } = await hooksAgentServer.initializeSession(sessionId, message);
      initSessionTimer.end();
      
      Logger.info('HOOKS_GENERATE_CODE', 'Agent session initialized', { 
        actualSessionId,
        messageHistoryLength: messageHistory.length,
        contextLength: context.length,
        hasHookCode: !!hookCode
      });
      
      // Set up SSE headers
      Logger.info('HOOKS_GENERATE_CODE', 'Setting up SSE response');
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Stream the hook code
      Logger.info('HOOKS_GENERATE_CODE', 'Starting to stream hook code...');
      let hookData: any = null;
      
      try {
        const hookTimer = Logger.time('HOOKS_GENERATE_CODE', 'Generate hook code');
        const hookCodeStream = await hooksAgentServer.generateHookCode(actualSessionId, message, messageHistory, context, hookCode);
        Logger.info('HOOKS_GENERATE_CODE', 'Hook code stream created, ready to iterate');
        
        let chunkCount = 0;
        for await (const chunk of hookCodeStream) {
          chunkCount++;
          Logger.info('HOOKS_GENERATE_CODE', `Hook code chunk ${chunkCount} received`, chunk);
          
          // Store the complete hook data
          if (chunk) {
            hookData += chunk;
          }
          
          // Convert the chunk object to a string before writing to the response
          const hookCodeChunk = {
            type: 'data',
            content: chunk
          };
          const chunkString = JSON.stringify(hookCodeChunk);
          // Format as SSE (Server-Sent Events)
          res.write(`data: ${chunkString}\n\n`);
        }
        hookTimer.end();
        Logger.info('HOOKS_GENERATE_CODE', `Hook code streaming complete. Total chunks: ${chunkCount}`);
        
        // Store the hook code in the database
        if (hookData) {

            console.log(hookData);
          const storeHookTimer = Logger.time('HOOKS_GENERATE_CODE', 'Store hook code');
          await this.db.hookCodes.createHookCode({
            name: hookData.name || 'Unnamed Hook',
            description: hookData.description || 'No description provided',
            code: hookData.code || '',
            gasEstimate: hookData.gasEstimate,
            implementationDetails: hookData.implementationDetails,
            testCode: hookData.testCode,
            examples: hookData.examples,
            sessionId: actualSessionId,
          });
          storeHookTimer.end();
          
          Logger.info('HOOKS_GENERATE_CODE', 'Stored hook code in database', { 
            sessionId: actualSessionId,
            hookDataSize: JSON.stringify(hookData).length
          });
        }

        // // End the stream with a done event
        // Logger.info('HOOKS_GENERATE_CODE', 'Completing SSE response');
        // res.write('data: [DONE]\n\n');
        // res.end();
      } catch (error) {
        const hookCodeError = error as LLMError;
        Logger.error('HOOKS_GENERATE_CODE', 'Error generating hook code', hookCodeError);
        
        // Check if it's a parsing error
        const isParsingError = hookCodeError.name === 'OutputParserException' || 
                              hookCodeError.message?.includes('parsing') ||
                              hookCodeError.lc_error_code === 'OUTPUT_PARSING_FAILURE';
        
        const errorChunk = {
          type: 'error',
          content: isParsingError 
            ? 'Failed to parse hook code. The AI generated incomplete or invalid JSON.'
            : 'Failed to generate hook code. Please try again.',
          errorType: 'hookCodeError',
          error: hookCodeError.message || String(hookCodeError)
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
      }
      
      // End the stream with a done event
      Logger.info('HOOKS_GENERATE_CODE', 'Completing SSE response');
      res.write('data: [DONE]\n\n');
      res.end();
      
      timer.end();
      Logger.info('HOOKS_GENERATE_CODE', 'Hook code generation completed successfully');
    } catch (error) {
      const generalError = error as Error;
      Logger.error('HOOKS_GENERATE_CODE', 'Error in hook code generation handler', generalError);
      
      // Check if headers have already been sent
      if (!res.headersSent) {
        res.status(500).json({ error: "An error occurred while processing your request" });
      } else {
        // If headers are already sent, just end the response
        const errorChunk = {
          type: 'error',
          content: 'An error occurred while processing your request',
          error: generalError.message || String(generalError)
        };
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      
      timer.end();
      Logger.info('HOOKS_GENERATE_CODE', 'Hook code generation failed');
    }
  };
}

export const hooksController = new HooksController(); 