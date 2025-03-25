declare module 'streaming-json' {
  export class Lexer {
    /**
     * Appends a JSON string fragment to the current lexer state
     */
    AppendString(jsonFragment: string): void;
    
    /**
     * Completes the current JSON state to form valid JSON
     * @returns A string containing syntactically valid JSON
     */
    CompleteJSON(): string;
  }
} 