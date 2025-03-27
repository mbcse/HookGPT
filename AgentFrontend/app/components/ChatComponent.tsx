"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useChat } from 'ai/react';
import { Loader2, XCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { Message, StreamChunk, UniswapHookData } from '../types/agent';
import { config } from '../config';

// CSS for typing cursor animation
const typingCursorStyle = {
  display: 'inline-block',
  width: '2px',
  height: '1em',
  backgroundColor: '#6366f1',
  marginLeft: '2px',
  animation: 'blink 0.8s step-end infinite',
};

// Note about server performance
const PerformanceNote = () => (
  <div className="bg-amber-800/50 text-amber-200 p-3 rounded-lg mb-4 text-sm text-center">
    <AlertTriangle className="inline-block w-4 h-4 mr-1 mb-1" />
    This service is hosted on a server with minimal resources and with rate limits to avoid abuse. Responses may take longer than expected.
  </div>
);

// API endpoint for generating hook code
const API_ENDPOINT = config.backendEndpoint + '/hooks/generate-hook-code';

interface ChatComponentProps {
  onStreamingChange: (isStreaming: boolean) => void;
  onReplyReceived: (reply: string) => void;
  onError: (error: string) => void;
}

const ChatComponent: React.FC<ChatComponentProps> = ({ 
  onStreamingChange, 
  onReplyReceived,
  onError
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { 
    sessionId, 
    customMessages, 
    addUserMessage, 
    addAssistantMessage 
  } = useSession();
  
  const [streamingReply, setStreamingReply] = useState<string>("");
  const [isStreamingReply, setIsStreamingReply] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");

  // Simplify parsed content state to just have reply
  const [parsedContent, setParsedContent] = useState<{
    reply: string;
    hookCode: string; // Keep this for the onReplyReceived callback
  }>({
    reply: "",
    hookCode: ""
  });

  // For parsing tags in buffer
  const bufferRef = useRef<string>("");

  // 1. First, use a ref to track the accumulated reply
  const accumulatedReplyRef = useRef<string>("");

  // Add a ref to track whether we've auto-submitted a message
  const hasAutoSubmittedRef = useRef<boolean>(false);

  // Debug messages
  useEffect(() => {
    console.log("Current messages:", customMessages.map(msg => ({
      role: msg.role,
      contentPreview: msg.content.substring(0, 30) + "...",
      id: msg.id
    })));
    console.log("Streaming state:", isStreamingReply);
    console.log("Parsed content length:", parsedContent.reply.length);
  }, [customMessages, isStreamingReply, parsedContent.reply]);

  // Reset all streaming state
  const resetStreamingState = (isStreaming: boolean = false) => {
    if (isStreaming) {
      // When STARTING streaming, reset everything
      setStreamingReply("");
      bufferRef.current = "";
      accumulatedReplyRef.current = "";
      setParsedContent({
        reply: "",
        hookCode: ""
      });
    } else {
      // When ENDING streaming, don't reset accumulated reply or parsed content
      // Just reset the streaming UI states
      setStreamingReply("");
      bufferRef.current = "";
    }
    
    setIsStreamingReply(isStreaming);
    setStreamError(null);
    setIsTyping(isStreaming);
    onStreamingChange(isStreaming);
  };

  // Handle errors consistently
  const handleStreamError = (errorMessage: string) => {
    setStreamError(errorMessage);
    onError(errorMessage);
    resetStreamingState(false);
  };

  // Process text by simulating typing
  const processTextWithTypingEffect = (text: string) => {
    console.log("PROCESSING TEXT WITH TYPING EFFECT ", text)

    // Add the text to buffer for tag parsing
    bufferRef.current += text;
    
    // Process the buffer to extract various tags
    processBuffer();
    
    // For backward compatibility, still update streamingReply but try to filter out XML tags
    const cleanedText = text.replace(/<\/?[a-zA-Z]+>/g, '');
    setStreamingReply(prev => prev + cleanedText);
    setIsTyping(true);
    setIsStreamingReply(true);
  };
  
  // Process the buffer to extract tags
  const processBuffer = () => {
    const buffer = bufferRef.current;
    
    // Check for each tag and append content to reply
    appendTagContentToReply('<reply>', '</reply>');
    extractHookCode('<hookCode>', '</hookCode>');
    // appendTagContentToReply('<name>', '</name>', '## ');
    // appendTagContentToReply('<description>', '</description>', '\n\n**Description**: ');
    // appendTagContentToReply('<gasEstimate>', '</gasEstimate>', '\n\n**Gas Estimate**: ');
    
    // Handle implementation details
    // processImplementationDetails();
    
    // Handle examples
    // processExamples();
  };
  
  // 2. Update appendTagContentToReply to use both state and ref
  const appendTagContentToReply = (openTag: string, closeTag: string, prefix: string = '') => {
    const buffer = bufferRef.current;
    
    if (buffer.includes(openTag)) {
      const startIdx = buffer.indexOf(openTag) + openTag.length;
      if (buffer.includes(closeTag, startIdx)) {
        console.log("FOUND TAG ", openTag, closeTag);
        const endIdx = buffer.indexOf(closeTag, startIdx);
        const content = buffer.substring(startIdx, endIdx).trim();
        console.log("CONTENT IS ", content);
        
        if (content) {
          // Update accumulated reference directly without depending on parsedContent state
          accumulatedReplyRef.current += prefix + content;
          
          // Update state for display purposes
          setParsedContent(prev => ({
            ...prev,
            reply: accumulatedReplyRef.current // Use the ref value directly
          }));
        }
        
        // Remove the processed tag from the buffer
        bufferRef.current = buffer.substring(0, buffer.indexOf(openTag)) + 
                           buffer.substring(endIdx + closeTag.length);
        
        // Process again to handle nested or multiple tags
        processBuffer();
      }
    }
  };

  // Special case for hookCode to send to parent component
  const extractHookCode = (openTag: string, closeTag: string) => {
    const buffer = bufferRef.current;
    
    if (buffer.includes(openTag)) {
      const startIdx = buffer.indexOf(openTag) + openTag.length;
      if (buffer.includes(closeTag, startIdx)) {
        const endIdx = buffer.indexOf(closeTag, startIdx);
        const content = buffer.substring(startIdx, endIdx).trim();
        
        if (content) {
          // Set hook code
          setParsedContent(prev => ({
            ...prev,
            hookCode: content
          }));
          
          // IMPORTANT: Format the hook code as a UniswapHookData object
          // This will help the parent component display it correctly
          const formattedContent = `<hookCode>${content}</hookCode>`;
          
          // Send to parent in the expected format
          console.log("SENDING HOOK CODE TO PARENT");
          onReplyReceived(formattedContent);
        }
        
        // Remove the processed tag from the buffer
        bufferRef.current = buffer.substring(0, buffer.indexOf(openTag)) + 
                           buffer.substring(endIdx + closeTag.length);
        
        // Process again to handle nested or multiple tags
        processBuffer();
      }
    }
  };

  // Process implementation details with nested tags
  const processImplementationDetails = () => {
    const buffer = bufferRef.current;
    
    if (buffer.includes('<implementationDetails>')) {
      const detailsStart = buffer.indexOf('<implementationDetails>') + '<implementationDetails>'.length;
      if (buffer.includes('</implementationDetails>', detailsStart)) {
        const detailsEnd = buffer.indexOf('</implementationDetails>', detailsStart);
        const detailsContent = buffer.substring(detailsStart, detailsEnd).trim();
        
        // Start implementation details section
        setParsedContent(prev => ({
          ...prev,
          reply: prev.reply + '\n\n**Implementation Details**:'
        }));
        
        // Process all feature tags
        let featureContent = detailsContent;
        
        while (featureContent.includes('<feature>')) {
          const featureStart = featureContent.indexOf('<feature>') + '<feature>'.length;
          if (featureContent.includes('</feature>', featureStart)) {
            const featureEnd = featureContent.indexOf('</feature>', featureStart);
            const featureData = featureContent.substring(featureStart, featureEnd).trim();
            
            // Extract feature components
            const name = extractTagContent(featureData, 'name');
            const description = extractTagContent(featureData, 'description');
            const codeSnippet = extractTagContent(featureData, 'codeSnippet');
            
            // Add feature to reply
            let featureText = '\n\n- ';
            if (name) featureText += `**${name}**: `;
            if (description) featureText += description;
            if (codeSnippet) featureText += `\n\`\`\`\n${codeSnippet}\n\`\`\``;
            
            setParsedContent(prev => ({
              ...prev,
              reply: prev.reply + featureText
            }));
            
            // Update featureContent to remove the processed feature
            featureContent = featureContent.substring(featureEnd + '</feature>'.length);
          } else {
            break;
          }
        }
        
        // Remove the processed implementationDetails tag from buffer
        bufferRef.current = buffer.substring(0, buffer.indexOf('<implementationDetails>')) + 
                           buffer.substring(detailsEnd + '</implementationDetails>'.length);
        
        // Process again to handle other tags
        processBuffer();
      }
    }
  };
  
  // Process examples
  const processExamples = () => {
    const buffer = bufferRef.current;
    
    if (buffer.includes('<examples>')) {
      const examplesStart = buffer.indexOf('<examples>') + '<examples>'.length;
      if (buffer.includes('</examples>', examplesStart)) {
        const examplesEnd = buffer.indexOf('</examples>', examplesStart);
        const examplesContent = buffer.substring(examplesStart, examplesEnd).trim();
        
        // Start examples section
        setParsedContent(prev => ({
          ...prev,
          reply: prev.reply + '\n\n**Examples**:'
        }));
        
        // Extract all example tags
        let exampleContent = examplesContent;
        let exampleNumber = 1;
        
        while (exampleContent.includes('<example>')) {
          const exampleStart = exampleContent.indexOf('<example>') + '<example>'.length;
          if (exampleContent.includes('</example>', exampleStart)) {
            const exampleEnd = exampleContent.indexOf('</example>', exampleStart);
            const example = exampleContent.substring(exampleStart, exampleEnd).trim();
            
            // Add example to reply
            setParsedContent(prev => ({
              ...prev,
              reply: prev.reply + `\n\n${exampleNumber}. ${example}`
            }));
            
            exampleNumber++;
            
            // Update exampleContent to remove the processed example
            exampleContent = exampleContent.substring(exampleEnd + '</example>'.length);
          } else {
            break;
          }
        }
        
        // Remove the processed examples tag from buffer
        bufferRef.current = buffer.substring(0, buffer.indexOf('<examples>')) + 
                           buffer.substring(examplesEnd + '</examples>'.length);
        
        // Process again to handle other tags
        processBuffer();
      }
    }
  };
  
  // Extract tag content helper
  const extractTagContent = (content: string, tagName: string): string => {
    const openTag = `<${tagName}>`;
    const closeTag = `</${tagName}>`;
    
    if (content.includes(openTag) && content.includes(closeTag)) {
      const startIdx = content.indexOf(openTag) + openTag.length;
      const endIdx = content.indexOf(closeTag, startIdx);
      return content.substring(startIdx, endIdx).trim();
    }
    return '';
  };

  // Process hook code chunk
  const processHookCodeChunk = (content: any) => {
    let hookCodeData = "";
    
    if (typeof content === 'string') {
      hookCodeData = content;
    } else if (typeof content === 'object' && content !== null) {
      try {
        hookCodeData = JSON.stringify(content);
      } catch (error) {
        console.error("Error stringifying hook code object:", error);
        return;
      }
    } else {
      console.warn("Unhandled hook code content type:", typeof content);
      return;
    }
    
    // Send the hook code to the parent component
    onReplyReceived(hookCodeData);
    return hookCodeData;
  };

  // Process server-sent events - update to use just reply
  const processStreamEvents = async (response: Response) => {
    // Reset accumulated reply at the start of new streaming
    accumulatedReplyRef.current = "";
    
    console.log("API RESPONSE BODY ", response.body)
    const reader = response.body?.getReader();
    
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let finalReply = "";

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      
      // Process complete SSE events
      const events = buffer.split("\n\n");
      buffer = events.pop() || ""; // Keep the last incomplete event in the buffer
      
      for (const event of events) {
        if (!event.trim() || !event.startsWith("data: ")) continue;
        
        const data = event.replace("data: ", "").trim();
        
        if (data === "[DONE]") {
          resetStreamingState(false);
          continue;
        }
        
        try {
          const chunk = JSON.parse(data) as StreamChunk;

          console.log("CHUNK IS ", chunk)
          
          switch (chunk.type) {
            case 'data':
              const contentText = typeof chunk.content === 'string' 
                ? chunk.content 
                : JSON.stringify(chunk.content);
                
              finalReply += contentText;

              // Process the text through our tag parser
              processTextWithTypingEffect(contentText);
              console.log("PARSED CONTENT IS ", parsedContent)

              break;
              
            case 'error':
              handleStreamError(chunk.content);
              break;
              
            default:
              console.warn("Unknown chunk type:", chunk.type);
          }
        } catch (error) {
          console.error("Error parsing SSE event:", error, data);
        }
      }
    }
    
    console.log("PARSED CONTENT AT END IS ", parsedContent)
    // 3. Update the processStreamEvents to use our ref
    console.log("FINAL ACCUMULATED REPLY:", accumulatedReplyRef.current);
    
    // Get a copy of the final message BEFORE resetting state
    const finalMessage = accumulatedReplyRef.current || finalReply;
    
    // Final reset of streaming state
    resetStreamingState(false);
    
    // After resetting, check if we have a message to add
    if (finalMessage && finalMessage.trim() !== "") {
      console.log("ADDING ASSISTANT MESSAGE WITH LENGTH:", finalMessage.length);
      addAssistantMessage(finalMessage);
    }
    
    return { finalReply };
  };

  // Custom fetch function to handle SSE streaming
  const customFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
    // Check if we have a session ID
    if (!sessionId) {
      const errorMsg = "No active session. Please wait for session initialization or refresh the page.";
      handleStreamError(errorMsg);
      throw new Error("No active session ID");
    }

    // Reset streaming state for a new message
    resetStreamingState(true);

    try {
      // Add sessionId to the request body
      let modifiedOptions = { ...options };
      
      if (options?.body) {
        try {
          const requestBody = JSON.parse(options.body as string);
          requestBody.sessionId = sessionId;
          modifiedOptions.body = JSON.stringify(requestBody);
        } catch (error) {
          console.error("Error modifying request body:", error);
          throw new Error("Failed to add session ID to request");
        }
      }
      
      const response = await fetch(url, modifiedOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const { finalReply } = await processStreamEvents(response);
      
      // Create a mock response for the useChat hook
      return new Response(
        JSON.stringify({ text: finalReply }), 
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      );
    } catch (error) {
      console.error("Error in custom fetch:", error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : "Failed to connect to the server. Please try again.";
        
      handleStreamError(errorMessage);
      throw error;
    }
  };

  // Configure useChat hook
  const { handleSubmit, stop } = useChat({
    streamProtocol: 'text',
    api: API_ENDPOINT,
    fetch: customFetch
  });

  // Custom stop handler
  const handleStop = () => {
    stop();
    resetStreamingState(false);
  };

  // Handle form submission
  const handleCustomSubmit = useCallback(async (e: React.FormEvent, isAutoSubmission = false) => {
    e.preventDefault();
    
    // Log message counts for debugging
    const userMsgCount = customMessages.filter(msg => msg.role === 'user').length;
    const assistantMsgCount = customMessages.filter(msg => msg.role === 'assistant').length;
    console.log(`Current message counts - User: ${userMsgCount}, Assistant: ${assistantMsgCount}`);
    
    // For manual submissions, ensure we have input
    if (!isAutoSubmission && !input.trim()) return;
    
    // Get the message content either from input (manual) or from existing user messages (auto)
    const userInputMessage = isAutoSubmission 
      ? customMessages.filter(msg => msg.role === 'user').pop()?.content || ''
      : input.trim();
    
    if (!userInputMessage) return;
    
    setInput("");
    
    // Only add the user message if this is a manual submission
    if (!isAutoSubmission) {
      console.log("Adding new user message to chat history:", userInputMessage);
      addUserMessage(userInputMessage);
    } else {
      console.log("Auto-submission - not adding duplicate user message to chat history");
    }
    
    // Begin streaming
    resetStreamingState(true);
    
    try {
      // Important: Get the CURRENT state of messages to avoid duplicates
      const currentMessages = [...customMessages];
      
      // Send the message with the system prompt
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            ...currentMessages, 
            { 
              role: "user", 
              content: `${userInputMessage}`
            }
          ],
          sessionId: sessionId
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      await processStreamEvents(response);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      handleStreamError(errorMessage);
    }
  }, [input, customMessages, sessionId, addUserMessage, resetStreamingState, processStreamEvents, handleStreamError]);

  // Auto-scroll to bottom when messages change or streaming content updates
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [customMessages, streamingReply]);

  // Automatically send the first user message when component mounts
  useEffect(() => {
    // Check if we have at least one user message but no assistant messages
    // and ensure we haven't auto-submitted already
    const userMessages = customMessages.filter(msg => msg.role === 'user');
    const assistantMessages = customMessages.filter(msg => msg.role === 'assistant');
    
    if (userMessages.length > 0 && 
        assistantMessages.length === 0 && 
        !isStreamingReply && 
        sessionId && 
        !hasAutoSubmittedRef.current) {
      
      // Get the most recent user message
      const lastUserMessage = userMessages[userMessages.length - 1];
      console.log("Auto-submitting initial user message:", lastUserMessage.content);
      
      // Mark that we've auto-submitted to prevent subsequent submissions
      hasAutoSubmittedRef.current = true;
      
      // Use setTimeout to ensure this happens after render
      setTimeout(() => {
        // Create a synthetic event object
        const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
        handleCustomSubmit(syntheticEvent, true); // Pass true as isAutoSubmission
      }, 100);
    }
  }, [customMessages, sessionId, isStreamingReply, handleCustomSubmit]);

  // Monitor message count changes
  useEffect(() => {
    // Count message types
    const userMsgCount = customMessages.filter(msg => msg.role === 'user').length;
    const assistantMsgCount = customMessages.filter(msg => msg.role === 'assistant').length;
    
    // Reset the auto-submit flag if we have equal or more assistant messages than user messages
    // This allows for a new manual submission cycle
    if (assistantMsgCount >= userMsgCount && hasAutoSubmittedRef.current) {
      console.log("Conversation cycle complete - enabling new message auto-submission");
      hasAutoSubmittedRef.current = false;
    }
  }, [customMessages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Performance Note */}
        <PerformanceNote />
        
        {/* Welcome Message */}
        {customMessages.length === 0 && !isStreamingReply && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <h2 className="text-2xl font-bold text-white mb-4">Welcome to HookGPT</h2>
            <p className="text-gray-400 mb-8 max-w-md">
              Describe the Uniswap v4 hook you want to create, and we'll generate Solidity code instantly.
            </p>
            <div className="bg-gray-800 p-4 rounded-lg max-w-md w-full mb-4">
              <h3 className="text-green-400 font-semibold mb-2">Example prompts:</h3>
              <ul className="text-gray-300 text-sm space-y-3">
                <li className="p-2 bg-gray-700 rounded cursor-pointer hover:bg-gray-600" onClick={() => setInput("Create a hook that adds a 0.5% fee to all swaps and sends it to a designated address")}>
                  "Create a hook that adds a 0.5% fee to all swaps and sends it to a designated address"
                </li>
                <li className="p-2 bg-gray-700 rounded cursor-pointer hover:bg-gray-600" onClick={() => setInput("I need a hook that only allows swaps during certain times of day")}>
                  "I need a hook that only allows swaps during certain times of day"
                </li>
                <li className="p-2 bg-gray-700 rounded cursor-pointer hover:bg-gray-600" onClick={() => setInput("Make a hook that prevents front-running by implementing a minimum time between position changes")}>
                  "Make a hook that prevents front-running by implementing a minimum time between position changes"
                </li>
              </ul>
            </div>
          </div>
        )}
        
        {/* Messages */}
        {(customMessages.length > 0 || isStreamingReply) && (
          <div className="space-y-6 pb-4">
            {customMessages.map((msg, index) => (
              msg.role === 'user' ? (
                <div 
                  key={msg.id || index}
                  className="flex justify-end"
                >
                  <div className="max-w-[85%] rounded-lg p-4 bg-blue-900 text-blue-100 rounded-tr-none">
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ) : (
                <div key={msg.id || index}>
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-lg p-4 bg-gray-800 text-gray-100 rounded-tl-none">
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                </div>
              )
            ))}
            
            {/* Streaming Reply */}
            {isStreamingReply && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg p-4 bg-gray-800 text-gray-100 rounded-tl-none">
                  <div className="whitespace-pre-wrap text-gray-100">
                    {parsedContent.reply || streamingReply.replace(/<\/?[a-zA-Z]+>|<\/?[a-zA-Z]+\s*[a-zA-Z]+>/g, '')}
                    {isTyping && <span style={typingCursorStyle as React.CSSProperties}></span>}
                  </div>
                </div>
              </div>
            )}
            
            {/* Error Message */}
            {streamError && (
              <div className="flex justify-center">
                <div className="bg-red-900 text-red-100 p-3 rounded-lg max-w-[85%] flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-red-300" />
                  <span>{streamError}</span>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Reference to auto-scroll */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-gray-800 bg-gray-900">
        <form onSubmit={(e) => handleCustomSubmit(e, false)} className="flex items-end space-x-2">
          <div className="flex-1 bg-gray-800 rounded-lg p-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCustomSubmit(e, false);
                }
              }}
              placeholder="Describe the Uniswap v4 hook you want to create..."
              className="w-full bg-transparent border-0 focus:ring-0 text-white resize-none outline-none placeholder-gray-500"
              rows={2}
              disabled={isStreamingReply}
            />
          </div>
          <div className="flex space-x-2">
            {isStreamingReply && (
              <button
                type="button"
                onClick={handleStop}
                className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            )}
            <button
              type="submit"
              disabled={isStreamingReply || !input.trim()}
              className={`p-2 rounded-lg ${
                isStreamingReply || !input.trim() 
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isStreamingReply ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
            </button>
          </div>
        </form>
        <div className="text-xs text-gray-500 mt-2">
          Press Enter to send. Shift+Enter for new line.
        </div>
      </div>
    </div>
  );
};

export default ChatComponent; 