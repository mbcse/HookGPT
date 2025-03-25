"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { jsonrepair } from 'jsonrepair';
import ChatComponent from './ChatComponent';
import HookCodePreview from './HookCodePreview';
import { useSession } from '../context/SessionContext';
import { getEmptyUniswapHookData } from '../utils/jsonUtils';
import { UniswapHookData } from '../types/agent';
import { useRouter } from 'next/navigation';
import { JsonStreamHandler } from '../utils/streamUtils';

const HookCreationPage = () => {
  const { sessionId, isInitializingSession, sessionError, initializeSession } = useSession();
  const router = useRouter();
  
  const [jsonData, setJsonData] = useState<UniswapHookData>(getEmptyUniswapHookData());
  const [streamingHookCode, setStreamingHookCode] = useState<Partial<UniswapHookData>>({});
  const [isStreamingHookCode, setIsStreamingHookCode] = useState<boolean>(false);
  const [streamingComplete, setStreamingComplete] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Reference to the JSON stream handler
  const jsonStreamHandlerRef = useRef<JsonStreamHandler | null>(null);

  // Initialize session when component mounts
  useEffect(() => {
    if (!sessionId && !isInitializingSession) {
      console.log("Initializing session on component mount");
      initializeSession();
    }
  }, [sessionId, isInitializingSession, initializeSession]);
  
  // Debug logging for streamingHookCode
  useEffect(() => {
    console.log("streamingHookCode updated:", Object.keys(streamingHookCode));
  }, [streamingHookCode]);
  
  // Reset handler when starting a new streaming session
  useEffect(() => {
    if (isStreaming && !jsonStreamHandlerRef.current) {
      console.log("Creating new JsonStreamHandler for streaming");
      jsonStreamHandlerRef.current = new JsonStreamHandler();
      // Reset states when streaming starts
      setStreamingComplete(false);
    } else if (!isStreaming && jsonStreamHandlerRef.current) {
      // Clean up when streaming ends
      console.log("Cleaning up JsonStreamHandler after streaming");
      jsonStreamHandlerRef.current = null;
    }
  }, [isStreaming]);

  // Handle hook code data
  const handleHookCodeData = (content: string) => {
    try {
      console.log("Hook code data received, length:", content.length);
      
      // Check if this is a tagged format response
      const hasHookCodeTag = content.includes('<hookCode>') && content.includes('</hookCode>');
      
      if (hasHookCodeTag) {
        // Extract the hook code from the tags if present
        const hookCodeMatch = content.match(/<hookCode>([\s\S]*?)<\/hookCode>/);
        
        if (hookCodeMatch && hookCodeMatch[1]) {
          const hookCode = hookCodeMatch[1].trim();
          
          // Create a partial UniswapHookData object with the parsed content
          const parsedData: Partial<UniswapHookData> = {
            code: hookCode
          };
          
          // Extract name (fixed regex from <n> to <name>)
          const nameRegex = /<name>([\s\S]*?)<\/name>/;
          const nameMatch = content.match(nameRegex);
          if (nameMatch && nameMatch[1]) {
            parsedData.name = nameMatch[1].trim();
          }
          
          // Extract description
          const descRegex = /<description>([\s\S]*?)<\/description>/;
          const descMatch = content.match(descRegex);
          if (descMatch && descMatch[1]) {
            parsedData.description = descMatch[1].trim();
          }
          
          // Extract gas estimate
          const gasRegex = /<gasEstimate>([\s\S]*?)<\/gasEstimate>/;
          const gasMatch = content.match(gasRegex);
          if (gasMatch && gasMatch[1]) {
            const gasValue = parseInt(gasMatch[1].trim());
            if (!isNaN(gasValue)) {
              parsedData.gasEstimate = gasValue;
            }
          }
          
          console.log("Created parsed data from tags:", parsedData);
          
          // Update the streaming hook code state
          setStreamingHookCode(parsedData);
          setIsStreamingHookCode(true);
          
          // Update the JSON data for immediate display
          setJsonData({
            ...getEmptyUniswapHookData(),
            ...parsedData
          });
          
          return;
        }
      }
      
      // If we get here, try to process as JSON
      if (!jsonStreamHandlerRef.current) {
        jsonStreamHandlerRef.current = new JsonStreamHandler();
      }
      
      const parsedData = jsonStreamHandlerRef.current.processFragment(content);
      if (parsedData) {
        setStreamingHookCode(parsedData);
        setIsStreamingHookCode(true);
      }
    } catch (e) {
      console.error("Error processing hook code data:", e);
    }
  };

  // Handle streaming state changes
  const handleStreamingChange = (isStreaming: boolean) => {
    console.log("Streaming state changed:", isStreaming);
    setIsStreaming(isStreaming);
    
    if (!isStreaming) {
      // When streaming stops, consider the hook code complete
      console.log("Streaming complete, finalizing hook code");
      setStreamingComplete(true);
      
      // Update jsonData with streamingHookCode if it has content
      if (Object.keys(streamingHookCode).length > 0 && jsonStreamHandlerRef.current) {
        // Get the final data without raw content
        const finalHookCode = jsonStreamHandlerRef.current.getFinalData();
        console.log("Setting final hook code data:", Object.keys(finalHookCode));
        
        setJsonData(finalHookCode as UniswapHookData);
      }
    } else {
      // Reset streaming state when a new stream starts
      console.log("New streaming session starting, resetting states");
      setStreamingComplete(false);
      setStreamingHookCode({});
    }
  };

  // Handle errors
  const handleError = (errorMessage: string) => {
    console.error("Error received:", errorMessage);
    setError(errorMessage);
  };

  // Hook data to display (either streaming or final)
  const hookDataToRender = isStreamingHookCode && Object.keys(streamingHookCode).length > 0 
    ? streamingHookCode 
    : Object.keys(jsonData).length > 1 ? jsonData : streamingHookCode;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-black border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-600 rounded-full shadow-md">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">HookGPT</h1>
            <p className="text-sm text-gray-400">Create Uniswap V4 hooks through prompt in seconds</p>
          </div>
        </div>
        {sessionId && (
          <div className="text-xs text-gray-400">
            Session ID: <span className="font-mono">{sessionId.substring(0, 8)}...</span>
          </div>
        )}
      </div>

      {/* Session Initialization Loading */}
      {isInitializingSession && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-xl shadow-xl max-w-md w-full border border-gray-800">
            <div className="flex items-center justify-center mb-4">
              <Loader2 className="w-8 h-8 animate-spin text-green-500 mr-3" />
              <h2 className="text-xl font-semibold text-white">Initializing Session</h2>
            </div>
            <p className="text-gray-400 text-center">
              Please wait while we set up your hook creation session...
            </p>
          </div>
        </div>
      )}

      {/* Session Error */}
      {sessionError && !isInitializingSession && (
        <div className="p-4 bg-red-900 border-b border-red-800">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-red-300">{sessionError}</span>
            </div>
            <button
              onClick={() => {
                initializeSession();
              }}
              className="px-4 py-2 bg-gray-800 text-red-400 rounded-lg hover:bg-gray-700 border border-red-800 flex items-center gap-2"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden bg-black">
        {/* Left Panel - Chat */}
        <div className="w-1/2 flex flex-col border-r border-gray-800 min-h-0">
          <ChatComponent 
            onStreamingChange={handleStreamingChange}
            onReplyReceived={handleHookCodeData}
            onError={handleError}
          />
        </div>

        {/* Right Panel - Hook Code Preview */}
        <div className="w-1/2 overflow-hidden">
          <HookCodePreview 
            hookData={hookDataToRender}
            isStreamingHookCode={isStreamingHookCode}
            streamingComplete={streamingComplete}
          />
        </div>
      </div>

      {/* Error Display at the bottom */}
      {error && !isStreaming && (
        <div className="p-4 bg-red-900 border-t border-red-800">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-red-300">{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="px-4 py-2 bg-gray-800 text-red-400 rounded-lg hover:bg-gray-700 border border-red-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HookCreationPage; 