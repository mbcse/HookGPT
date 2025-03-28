"use client";

import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { UniswapHookData } from '../types/agent';

interface HookCodePreviewProps {
  hookData: Partial<UniswapHookData>;
  isStreamingHookCode: boolean;
  streamingComplete: boolean;
}

const HookCodePreview: React.FC<HookCodePreviewProps> = ({
  hookData,
  isStreamingHookCode,
  streamingComplete
}) => {
  // Check if we have raw content that's being accumulated
  const isAccumulatingJson = hookData && 
    hookData._rawContent && 
    (!hookData.name || !hookData.code);

  // Add debug logging
  useEffect(() => {
    console.log("HookCodePreview rendered with:", 
      hookData ? Object.keys(hookData).join(', ') : 'no data',
      "isStreamingHookCode:", isStreamingHookCode,
      "streamingComplete:", streamingComplete
    );
    
    if (hookData && hookData._rawContent) {
      console.log("Raw content length:", hookData._rawContent.length);
    }
  }, [hookData, isStreamingHookCode, streamingComplete]);

  // Add a debug effect to see if we're getting updates
  useEffect(() => {
    console.log("HookCodePreview hook data:", hookData);
    if (hookData && hookData.code) {
      console.log("Hook code available:", hookData.code.substring(0, 50) + "...");
    }
  }, [hookData]);

  // Helper function to safely check array length
  const hasItems = (arr?: any[]) => arr && arr.length > 0;

  // Extract raw XML tags from content to display UI
  const extractReplyContent = () => {
    if (!hookData || !hookData._rawContent) return null;
    
    const replyMatch = hookData._rawContent.match(/<reply>([\s\S]*?)<\/reply>/);
    if (replyMatch && replyMatch[1]) {
      return (
        <div className="bg-gray-900 rounded-lg p-4 mb-4 shadow-md">
          <h3 className="text-lg font-semibold text-blue-400 mb-2">AI Response</h3>
          <div className="text-gray-300 whitespace-pre-wrap">
            {replyMatch[1].trim()}
          </div>
        </div>
      );
    }
    
    return null;
  };

  // Render the Solidity code with syntax highlighting
  const renderSolidityCode = () => {
    if (!hookData.code) return null;
    
    return (
      <div className="bg-gray-900 rounded-lg p-4 mb-4 shadow-md">
        <h3 className="text-lg font-semibold text-green-400 mb-2">Solidity Code</h3>
        <pre className="text-sm text-green-300 overflow-x-auto p-4 bg-gray-950 rounded font-mono">
          {hookData.code}
        </pre>
      </div>
    );
  };

  // Render test code if available
  const renderTestCode = () => {
    if (!hookData.testCode) return null;
    
    return (
      <div className="bg-gray-900 rounded-lg p-4 mb-4 shadow-md">
        <h3 className="text-lg font-semibold text-yellow-400 mb-2">Test Code</h3>
        <pre className="text-sm text-yellow-300 overflow-x-auto p-4 bg-gray-950 rounded font-mono">
          {hookData.testCode}
        </pre>
      </div>
    );
  };

  const renderSection = (title: string, content: string | string[] | undefined, type = 'string') => {
    if (!content || (Array.isArray(content) && content.length === 0)) return null;
    
    return (
      <div className="bg-gray-800 rounded-lg p-4 mb-4 shadow-sm transition-all duration-300 ease-in-out">
        <h3 className="text-lg font-semibold text-green-400 mb-2">{title}</h3>
        {type === 'string' ? (
          <p className="text-gray-300">{content as string}</p>
        ) : (
          <ul className="list-disc pl-5 space-y-1">
            {(content as string[]).map((item: string, index: number) => (
              <li key={index} className="text-gray-300">{item}</li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  // Render hook complexity badge
  const renderComplexityBadge = () => {
    if (!hookData.complexity) return null;
    
    const getBadgeColor = () => {
      switch(hookData.complexity) {
        case 'low': return 'bg-green-600 text-green-100';
        case 'medium': return 'bg-yellow-600 text-yellow-100';
        case 'high': return 'bg-red-600 text-red-100';
        default: return 'bg-blue-600 text-blue-100';
      }
    };
    
    return (
      <span className={`${getBadgeColor()} px-2 py-1 rounded text-xs font-semibold ml-2`}>
        {hookData.complexity}
      </span>
    );
  };

  return (
    <div className="p-4 space-y-4 h-full overflow-y-auto bg-black">
      <div className="flex items-center justify-center mb-6">
        <h2 className="text-xl font-bold text-green-300">UNISWAP V4 HOOK CODE</h2>
        {isStreamingHookCode && !streamingComplete && (
          <div className="flex items-center ml-3">
            <Loader2 className="w-5 h-5 animate-spin text-green-400" />
            <span className="text-green-400 ml-2 text-sm font-medium">
              {isAccumulatingJson ? 'Processing hook code...' : 'Generating...'}
            </span>
          </div>
        )}
      </div>
      
      {/* Show JSON accumulation progress if we're still building the JSON */}
      {isAccumulatingJson && !streamingComplete && (
        <div className="bg-gray-900 p-4 rounded-lg mb-4 shadow-md">
          <div className="flex items-center mb-2">
            <Loader2 className="w-4 h-4 animate-spin text-green-400 mr-2" />
            <h3 className="text-md font-medium text-green-300">Generating Hook Code</h3>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-600 transition-all duration-300 ease-out" 
              style={{ 
                width: `${Math.min(
                  100, 
                  hookData._rawContent ? 
                    Math.max(5, Math.min(95, hookData._rawContent.length / 50)) : 5
                )}%` 
              }}
            ></div>
          </div>
          <p className="text-xs text-green-400 mt-2">
            Received {hookData._rawContent ? 
              Math.round(hookData._rawContent.length / 100) / 10 : 0} KB of data
          </p>
        </div>
      )}
      
      {/* Extract and show AI response from reply tag */}
      {extractReplyContent()}
      
      {/* Hook name and type */}
      {hookData.name && (
        <div className="bg-gray-800 rounded-lg p-4 mb-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-green-400">{hookData.name}</h3>
            <div className="flex items-center">
              {hookData.hookType && (
                <span className="bg-blue-600 text-blue-100 px-3 py-1 rounded-full text-xs font-semibold ml-2">
                  {hookData.hookType}
                </span>
              )}
              {renderComplexityBadge()}
            </div>
          </div>
          {hookData.description && (
            <p className="text-gray-300 mt-2">{hookData.description}</p>
          )}
        </div>
      )}
      
      {/* Main Code Display - Priority Focus */}
      {renderSolidityCode()}
      
      {/* Test Code */}
      {renderTestCode()}
      
      {/* Other Information */}
      {hookData.gasEstimate && renderSection('Gas Estimate', `~${hookData.gasEstimate} gas units`)}
      {hasItems(hookData.functionalities) && renderSection('Features', hookData.functionalities, 'array')}
      {hasItems(hookData.examples) && renderSection('Usage Examples', hookData.examples, 'array')}
    </div>
  );
};

export default HookCodePreview; 