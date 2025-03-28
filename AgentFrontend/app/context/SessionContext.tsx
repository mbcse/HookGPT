"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Message } from '../types/agent';

interface SessionContextType {
  sessionId: string | null;
  isInitializingSession: boolean;
  sessionError: string | null;
  customMessages: Message[];
  setCustomMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  initializeSession: (initialMessage?: string) => Promise<void>;
  addUserMessage: (content: string) => void;
  addAssistantMessage: (content: string) => void;
  removeDuplicateMessages: () => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};

interface SessionProviderProps {
  children: ReactNode;
}

export const SessionProvider = ({ children }: SessionProviderProps) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isInitializingSession, setIsInitializingSession] = useState<boolean>(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [customMessages, setCustomMessages] = useState<Message[]>([]);
  const [isDeduplicating, setIsDeduplicating] = useState<boolean>(false);

  const initializeSession = async (initialMessage: string = "") => {
    if (sessionId || isInitializingSession) return; // Skip if we already have a session   
    console.log("Initializing session from context");
    console.log(initialMessage)
    setIsInitializingSession(true);
    setSessionError(null);
    
    try {
      const response = await fetch('http://localhost:3000/hooks/init-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          initialMessage
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to initialize session: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Session initialized:', data);
      setSessionId(data.sessionId);
    } catch (error) {
      console.error('Error initializing session:', error);
      setSessionError(`Failed to initialize session: ${(error as Error).message}`);
    } finally {
      setIsInitializingSession(false);
    }
  };

  // Helper function to remove duplicate messages
  const removeDuplicateMessages = () => {
    // Deduplicate both user and assistant messages
    setIsDeduplicating(true);
    
    // First, separate user and assistant messages
    const userMessages = customMessages.filter(msg => msg.role === 'user');
    const assistantMessages = customMessages.filter(msg => msg.role === 'assistant');
    
    // Deduplicate user messages
    const uniqueUserMessages: Message[] = [];
    const seenUserContent = new Set<string>();
    
    // Process user messages in reverse order (newest first)
    for (let i = userMessages.length - 1; i >= 0; i--) {
      const current = userMessages[i];
      const trimmedContent = current.content.trim();
      
      if (!seenUserContent.has(trimmedContent)) {
        seenUserContent.add(trimmedContent);
        uniqueUserMessages.unshift(current); // Add to beginning to maintain order
      }
    }
    
    // Deduplicate assistant messages
    const uniqueAssistantMessages: Message[] = [];
    const seenAssistantContent = new Set<string>();
    
    // Process assistant messages in reverse order (newest first)
    for (let i = assistantMessages.length - 1; i >= 0; i--) {
      const current = assistantMessages[i];
      const trimmedContent = current.content.trim();
      
      if (!seenAssistantContent.has(trimmedContent)) {
        seenAssistantContent.add(trimmedContent);
        uniqueAssistantMessages.unshift(current); // Add to beginning to maintain order
      }
    }
    
    // Combine user and assistant messages, preserving order
    const allMessages = [...uniqueUserMessages, ...uniqueAssistantMessages];
    
    // Sort messages by timestamp in ID
    allMessages.sort((a, b) => {
      // Extract timestamp from ID if possible
      const getTimestamp = (id: string) => {
        // Handle both user-timestamp-random and assistant-timestamp-random formats
        if (id.includes('-')) {
          const parts = id.split('-');
          if (parts.length > 1) {
            // The timestamp should be the second part
            return Number(parts[1]);
          }
        }
        // Fallback to using the entire ID as a number
        return Number(id);
      };
      
      return getTimestamp(a.id) - getTimestamp(b.id);
    });
    
    setCustomMessages(allMessages);
    setIsDeduplicating(false);
  };

  const addUserMessage = (content: string) => {
    // Check if this exact message already exists
    const exactDuplicate = customMessages.some(msg => 
      msg.role === 'user' && msg.content.trim() === content.trim()
    );
    
    if (!exactDuplicate) {
      const userMessage: Message = {
        id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        role: 'user',
        content
      };
      
      setCustomMessages(prev => [...prev, userMessage]);
    }
  };

  const addAssistantMessage = (content: string) => {
    // More robust check for duplicate messages
    const messageExists = customMessages.some(msg => 
      msg.role === 'assistant' && 
      (msg.content === content || 
       // Also check if the message is a substring or superstring
       msg.content.includes(content) || 
       content.includes(msg.content))
    );
    
    if (!messageExists && content.trim() !== "") {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        role: 'assistant',
        content
      };
      
      setCustomMessages(prev => [...prev, assistantMessage]);
    }
  };

  // Effect to remove duplicates when messages change
  useEffect(() => {
    if (customMessages.length > 2 && !isDeduplicating) {
      removeDuplicateMessages();
    }
  }, [customMessages.length]);

  const value = {
    sessionId,
    isInitializingSession,
    sessionError,
    customMessages,
    setCustomMessages,
    initializeSession,
    addUserMessage,
    addAssistantMessage,
    removeDuplicateMessages,
  };

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}; 