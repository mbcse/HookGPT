// Define types for agent data
export interface StyleData {
  all: string[];
  chat: string[];
  post: string[];
}

// New interface for Uniswap v4 Hook data
export interface UniswapHookData {
  name: string;
  description: string;
  code: string;
  hookType: 'before swap' | 'after swap' | 'before initialize' | 'after initialize' | 'before modify position' | 'after modify position' | 'custom';
  gasEstimate?: number;
  complexity?: 'low' | 'medium' | 'high';
  functionalities?: string[];
  dependencies?: string[];
  testCode?: string;
  notes?: string;
  version?: string;
  author?: string;
  timestamp?: string;
  _rawContent?: string; // For storing raw JSON fragments during assembly
  [key: string]: any; // Add index signature to allow dynamic access
}

// Define the return type for extraction function
export interface ExtractedData {
  message: string;
  json: UniswapHookData | null;
}

// Define types for streaming chunks
export interface StreamChunk {
  type: 'data' | 'error';
  content: any;
  errorType?: string;
  error?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
} 