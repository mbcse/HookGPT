import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { OutputFixingParser } from "langchain/output_parsers";

import { HumanMessage } from "@langchain/core/messages";
import { LLLModelConfig, LLMModelManager } from "../LLMModelManager";
import { EmbeddingConfig, EmbeddingManager } from "../EmbeddingManager";
import { VectorStoreConfig, VectorStoreManager } from "../VectorStoreManager";
import { RunnableSequence } from "@langchain/core/runnables";
import { z } from "zod";
import { IterableReadableStream } from '@langchain/core/utils/stream';
import { DatabaseService } from '../../../database';
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Logger } from "../../utils/logger";
import { DynamicStructuredTool } from '@langchain/core/tools';
import { uniswapHookReplyPrompt, uniswapHookSystemPrompt, uniswapHookSystemPrompt2 } from '../systemPromtTemplates/uniswapHookSystemPrompt';

// Define types for the response streams
export type ReplyResponse = {
  type: 'reply';
  content: string;
};

export type HookCodeResponse = {
  type: 'hookCode';
  content: any;
};

export type CombinedResponse = ReplyResponse | HookCodeResponse;

// Schema for hook code generation output
export const hookCodeSchema = z.object({
  reply: z.string().describe("Reply to the user's message or any other information you need to ask to generate the hook code"),
  name: z.string().describe("Name of the hook"),
  description: z.string().describe("Brief description of what the hook does"),
  code: z.string().describe("Complete Solidity code for the Uniswap v4 hook"),
  gasEstimate: z.string().optional().describe("Estimated gas cost for the hook operations"),
  implementationDetails: z.array(z.object({
    feature: z.string().describe("Name of the feature or function"),
    description: z.string().describe("How the feature works"),
    codeSnippet: z.string().optional().describe("Relevant code snippet")
  })).optional(),
  testCode: z.string().optional().describe("Optional test code for the hook"),
  examples: z.array(z.string()).optional().describe("Usage examples"),
});
 

export class UniswapHookGeneratorAgent {
  private llm: LLMModelManager;
  private embedder: EmbeddingManager;
  private vectorStore: VectorStoreManager;
  private db: DatabaseService;

  private constructor(modelConfig: LLLModelConfig, embeddingConfig: EmbeddingConfig, vectorStoreConfig: VectorStoreConfig) {
    // Enable tools by default for the LLM
    const configWithTools: LLLModelConfig = {
      ...modelConfig,
      enableTools: false
    };
    
    const initTimer = Logger.time('HOOK_AGENT_INIT', 'Initialize UniswapHookGeneratorAgent components');
    
    this.llm = LLMModelManager.getInstance(configWithTools);
    this.embedder = EmbeddingManager.getInstance(embeddingConfig);
    this.vectorStore = new VectorStoreManager(vectorStoreConfig, this.embedder.getEmbedder());
    this.db = DatabaseService.getInstance();
    
    initTimer.success(`UniswapHookGeneratorAgent created with tools ${this.llm.areToolsEnabled() ? 'enabled' : 'disabled'}`);
  }

  /**
   * Create a new agent instance
   * @param modelConfig LLM model configuration
   * @param embeddingConfig Embedding configuration
   * @param vectorStoreConfig Vector store configuration
   * @returns New agent instance
   */
  public static async create(modelConfig: LLLModelConfig, embeddingConfig: EmbeddingConfig, vectorStoreConfig: VectorStoreConfig): Promise<UniswapHookGeneratorAgent> {
    const createTimer = Logger.time('HOOK_AGENT_CREATE', 'Creating new UniswapHookGeneratorAgent', {
      modelProvider: modelConfig.provider,
      modelName: modelConfig.modelName,
      embeddingProvider: embeddingConfig.provider
    });
    
    const agent = new UniswapHookGeneratorAgent(modelConfig, embeddingConfig, vectorStoreConfig);
    createTimer.success('Agent creation completed');
    
    return agent;
  }

  /**
   * Initialize the agent and prepare session data
   * @param sessionId Unique session identifier
   * @param userMessage The user's message
   * @returns Object containing message history, context, and hook code
   */
  public async initializeSession(sessionId: string, userMessage: string): Promise<{ messageHistory: string, context: string, sessionId: string, hookCode: any }> {
    const sessionTimer = Logger.time('HOOK_AGENT_SESSION', `Initialize session ${sessionId}`, { 
      sessionId, 
      messageLength: userMessage.length 
    });
    
    try {
      // Initialize vector store
      const vectorStoreTimer = Logger.time('HOOK_AGENT_SESSION', 'Initialize vector store');
      await this.vectorStore.init();
      vectorStoreTimer.success('Vector store initialized successfully');
      
      // Ensure database connection and get/create session
      const dbTimer = Logger.time('HOOK_AGENT_SESSION', 'Database connection');
      await this.db.connect();
      
      // Get or create session
      let session = await this.db.sessions.getSessionById(sessionId);
      if (!session) {
        session = await this.db.sessions.createSession();
        dbTimer.success('New session created', { sessionId: session.id });
      } else {
        dbTimer.success('Using existing session', { sessionId: session.id });
      }
      
      // Store message in database
      const storeMessageTimer = Logger.time('HOOK_AGENT_SESSION', 'Store user message');
      await this.db.messages.createMessage({
        content: userMessage,
        role: 'user',
        sessionId: session.id,
      });
      storeMessageTimer.success('User message stored', { sessionId: session.id });

      // Fetch relevant context from vector store
      const contextTimer = Logger.time('HOOK_AGENT_SESSION', 'Retrieve context from vector store');
      const relevantDocs = await this.vectorStore.getVectorStore().similaritySearch(userMessage, 3);
      
      const context = relevantDocs.map(doc => doc.pageContent).join('\n');
      const contextInfo: Record<string, any> = { 
        documentsFound: relevantDocs.length, 
        contextLength: context.length 
      };
      
      if (relevantDocs.length > 0) {
        contextInfo['firstDocumentMetadata'] = relevantDocs[0].metadata;
      }
      
      contextTimer.success('Context retrieved', contextInfo);

      // Create message history string from database
      const historyTimer = Logger.time('HOOK_AGENT_SESSION', 'Build message history');
      const dbMessages = await this.db.messages.getMessagesBySessionId(session.id);
      
      // Remove the last message (current user message) from history
      const previousMessages = dbMessages.slice(0, dbMessages.length);
      
      // Format message history as "User Message: content" or "Assistant Message: content"
      const messageHistory = previousMessages.map(msg => {
        const roleLabel = msg.role === 'user' ? 'User Message' : 'Assistant Message';
        return `${roleLabel}: ${msg.content}`;
      }).join('\n');
      
      historyTimer.success('Message history built', { 
        messageCount: previousMessages.length,
        historyLength: messageHistory.length 
      });

      // Fetch current hook code from database
      const hookCodeTimer = Logger.time('HOOK_AGENT_SESSION', 'Retrieve hook code');
      const hookCodeRecord = await this.db.hookCodes.getHookCodeBySessionId(session.id);
      let hookCode: any = null;
      
      if (!hookCodeRecord) {
        hookCode = {
          name: "",
          description: "",
          code: "",
          implementationDetails: [],
          examples: []
        };
        hookCodeTimer.success('Created empty hook code template');
      } else {
        // If we have a record, extract its content
        if (typeof hookCodeRecord.content === 'string') {
          // If content is a string, try to parse it as JSON
          try {
            hookCode = JSON.parse(hookCodeRecord.content);
            hookCodeTimer.success('Parsed hook code from JSON string', {
              hasName: !!hookCode?.name,
              hasCode: !!hookCode?.code,
              detailsCount: hookCode?.implementationDetails?.length || 0
            });
          } catch (e) {
            hookCode = {}; // Fallback to empty object
            hookCodeTimer.error('Failed to parse hook code content as JSON', e);
          }
        } else {
          // Otherwise, use the content directly
          hookCode = hookCodeRecord.content;
          hookCodeTimer.success('Retrieved hook code object', {
            hasName: !!hookCode?.name,
            hasCode: !!hookCode?.code,
            detailsCount: hookCode?.implementationDetails?.length || 0
          });
        }
      }

      sessionTimer.success('Session initialization complete', { 
        sessionId: session.id, 
        messageHistoryLength: messageHistory.length,
        contextLength: context.length,
        hasHookCode: !!hookCode
      });

      return {
        messageHistory,
        context,
        sessionId: session.id,
        hookCode
      };
    } catch (error) {
      sessionTimer.error('Failed to initialize session', error);
      throw error;
    }
  }

  /**
   * Generate a reply for the user
   * @param sessionId Session identifier
   * @param userMessage User message
   * @param messageHistory Previous message history
   * @param context Relevant context
   * @param hookCode Current hook code
   * @returns Stream of reply chunks
   */
  public async generateReply(sessionId: string, userMessage: string, messageHistory: string, context: string, hookCode: any): Promise<IterableReadableStream<any>> {
    const replyTimer = Logger.time('HOOK_AGENT_REPLY', 'Generate reply', { sessionId });
    
    try {

    const ReplySchema = z.object({
        reply: z.string()
        });

        const parser = new StructuredOutputParser(ReplySchema);
      const formattedHookCode = typeof hookCode === 'object' ? JSON.stringify(hookCode, null, 2) : hookCode;
      
      Logger.info('HOOK_AGENT_REPLY', 'Building reply chain', {
        messageHistoryLength: messageHistory.length,
        hookCodeLength: formattedHookCode?.length || 0,
        contextLength: context.length
      });

      // Create prompt template with placeholders
      const promptTemplate = ChatPromptTemplate.fromTemplate(uniswapHookReplyPrompt);
      
      // Create a chain that processes the prompt
      const chain = RunnableSequence.from([
        {
          userMessage: (input: any) => input.userMessage,
          messageHistory: (input: any) => input.messageHistory || "",
          context: (input: any) => input.context || "",
          hookCode: (input: any) => input.hookCode || "",
          formatInstructions: (input) => parser.getFormatInstructions(),
        },
        promptTemplate,
        this.llm.getModel(),
        parser
        ]);
      
      // Input data
      const input = {
        userMessage,
        messageHistory,
        context,
        hookCode: formattedHookCode
      };
      
      // Get the reply as a stream
      const stream = await chain.stream(input);
      
      // Add logging to the stream
    //   const loggedStream = this.addStreamLogging(stream, 'HOOK_AGENT_REPLY');
      
      replyTimer.success('Reply generation started successfully');
      
      return stream;
    } catch (error) {
      replyTimer.error('Error generating reply', error);
      throw error;
    }
  }

  /**
   * Generate Solidity code for a Uniswap v4 hook
   * @param sessionId Session identifier
   * @param userMessage User message
   * @param messageHistory Previous message history
   * @param context Relevant context
   * @param hookCode Current hook code
   * @returns Stream of hook code chunks
   */
  public async generateHookCode(sessionId: string, userMessage: string, messageHistory: string, context: string, hookCode: any): Promise<IterableReadableStream<any>> {
    const codeTimer = Logger.time('HOOK_AGENT_CODE', 'Generate hook code', { sessionId });
    
    try {
      const formattedHookCode = typeof hookCode === 'object' ? JSON.stringify(hookCode, null, 2) : hookCode;

      console.log("context", context);
      console.log("messageHistory", messageHistory);
      console.log("formattedHookCode", formattedHookCode);
      
      Logger.info('HOOK_AGENT_CODE', 'Building hook code generation chain', {
        messageHistoryLength: messageHistory.length,
        hookCodeLength: formattedHookCode?.length || 0,
        contextLength: context.length
      });

      // Define the tool/function for hook code generation
      // const tools = [
      const tools = [
        new DynamicStructuredTool({
                name: "generateUniswapHook",
                description: "Generate Uniswap v4 hook code based on user requirements",
                schema: hookCodeSchema,
                func: async ({ reply, name, description, code, gasEstimate, implementationDetails, testCode, examples }) => {   
                return JSON.stringify({
                    reply: reply,
                    name: name,
                    description: description,
                    code: code,
                    gasEstimate: gasEstimate,
                    implementationDetails: implementationDetails,
                    testCode: testCode,
                    examples: examples,
                });
                }
        })
      ]

      const parser = StructuredOutputParser.fromZodSchema(hookCodeSchema);
      
      // Create prompt template
      const promptTemplate = ChatPromptTemplate.fromTemplate(uniswapHookSystemPrompt2);
      
      // Get a model with tools enabled
      const model = this.llm.getModel();
      if (!model) {
        throw new Error('LLM model is not initialized or available');
      }
      
      // Use type assertion to handle bindTools method which may not be recognized by TypeScript
      const modelWithTools = (model as any).bindTools?.(tools) || model;
      
      // Create a chain that processes the prompt and uses tool calling
      const chain = RunnableSequence.from([
        {
          userMessage: (input: any) => input.userMessage,
          messageHistory: (input: any) => input.messageHistory || "",
          context: (input: any) => input.context || "",
          hookCode: (input: any) => input.hookCode || "",
          formatInstructions: (input) => parser.getFormatInstructions(),
        },
        promptTemplate,
        this.llm.getModel(),
        // // Extract and process the tool calls from the response
        // async (response) => {
        //   const toolCalls = response.tool_calls || [];
        //   if (toolCalls.length > 0 && toolCalls[0].function) {
        //     try {
        //       // Parse the function arguments
        //       const args = JSON.parse(toolCalls[0].function.arguments);
        //       return args;
        //     } catch (e) {
        //       Logger.error('HOOK_AGENT_CODE', 'Failed to parse tool call arguments', e);
        //       return { 
        //         reply: "Error processing hook code generation. Please try again.",
        //         name: "",
        //         description: "",
        //         code: ""
        //       };
        //     }
        //   }
          
        //   // Fallback if no tool calls are found
        //   return {
        //     reply: response.content || "No structured output was generated.",
        //     name: "",
        //     description: "",
        //     code: ""
        //   };
        // },
       new StringOutputParser()
      ]);
      
      // Input data
      const input = {
        userMessage,
        messageHistory,
        context,
        hookCode: formattedHookCode
      };
      
      // Generate hook code as a stream
      const stream = await chain.stream(input);
      
      codeTimer.success('Hook code generation started successfully');
      
      return stream;
    } catch (error) {
      codeTimer.error('Error generating hook code', error);
      throw error;
    }
  }

  /**
   * Add logging to a stream
   * @param stream The stream to log
   * @param prefix Log prefix
   * @returns Stream with logging
   */
  private async *addStreamLogging<T>(stream: AsyncIterable<T>, prefix: string): AsyncGenerator<T> {
    let counter = 0;
    
    for await (const chunk of stream) {
      counter++;
      
      const chunkInfo = typeof chunk === 'string' 
        ? { length: chunk.length } 
        : { type: typeof chunk, keys: Object.keys(chunk) };
      
      Logger.debug(prefix, `Stream chunk ${counter}`, { ...chunkInfo });
      
      yield chunk;
    }
    
    Logger.info(prefix, `Stream complete, yielded ${counter} chunks`);
  }
} 