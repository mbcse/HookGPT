import { Lexer } from 'streaming-json';
import { jsonrepair } from 'jsonrepair';
import { UniswapHookData } from '../types/agent';

/**
 * Helper class for handling streaming tagged content
 */
export class JsonStreamHandler {
  private lexer: Lexer;
  private rawContent: string = '';
  private lastParsedData: Partial<UniswapHookData> = {};

  constructor() {
    this.lexer = new Lexer();
    console.log("JsonStreamHandler initialized");
  }

  /**
   * Processes a new content fragment and returns the extracted hook data
   * @param contentFragment The content fragment string to process
   * @returns The parsed UniswapHookData object (partial)
   */
  processFragment(contentFragment: string): Partial<UniswapHookData> {
    try {
      // Append to the raw content
      this.rawContent += contentFragment;
      console.log(`Raw content updated, now ${this.rawContent.length} characters`);
      
      // Extract data from tags in the accumulated content
      const hookData = this.extractTagsFromContent(this.rawContent);
      
      if (hookData) {
        console.log("Extracted hook data:", Object.keys(hookData).join(', '));
        // Update with new data but preserve existing fields
        this.lastParsedData = { ...this.lastParsedData, ...hookData };
      }
      
      // Always include the raw content in the returned object for debugging
      return { ...this.lastParsedData, _rawContent: this.rawContent };
    } catch (e) {
      console.error("Error processing content fragment:", e);
      return { ...this.lastParsedData, _rawContent: this.rawContent };
    }
  }

  /**
   * Extract tag data from content
   * @param content The string content containing XML-like tags
   * @returns The parsed UniswapHookData object or null
   */
  extractHookCodeJson(content: string): Partial<UniswapHookData> | null {
    try {
      console.log("Attempting to extract hook data from tagged content");
      return this.extractTagsFromContent(content);
    } catch (e) {
      console.error("Error extracting hook data from tags:", e);
    }
    
    console.log("No tag structure found in content");
    return null;
  }

  /**
   * Extract data from XML-like tags
   * @param content The string content containing XML-like tags
   * @returns Extracted hook data
   */
  private extractTagsFromContent(content: string): Partial<UniswapHookData> | null {
    try {
      const hookData: Partial<UniswapHookData> = {};
      let foundAnyData = false;
      
      // Extract name
      const nameMatch = content.match(/<name>([\s\S]*?)<\/name>/);
      if (nameMatch && nameMatch[1]) {
        hookData.name = nameMatch[1].trim();
        foundAnyData = true;
      }
      
      // Extract description
      const descriptionMatch = content.match(/<description>([\s\S]*?)<\/description>/);
      if (descriptionMatch && descriptionMatch[1]) {
        hookData.description = descriptionMatch[1].trim();
        foundAnyData = true;
      }
      
      // Extract code from hookCode tag
      const codeMatch = content.match(/<hookCode>([\s\S]*?)<\/hookCode>/);
      if (codeMatch && codeMatch[1]) {
        hookData.code = codeMatch[1].trim();
        foundAnyData = true;
      }
      
      // Extract gas estimate
      const gasMatch = content.match(/<gasEstimate>([\s\S]*?)<\/gasEstimate>/);
      if (gasMatch && gasMatch[1]) {
        try {
          hookData.gasEstimate = parseInt(gasMatch[1].trim());
          foundAnyData = true;
        } catch (e) {
          console.error("Error parsing gas estimate:", e);
        }
      }
      
      // Extract complexity from implementation details (if available)
      const complexityMatch = content.toLowerCase().match(/complexity[:\s]*(low|medium|high)/);
      if (complexityMatch && complexityMatch[1]) {
        hookData.complexity = complexityMatch[1] as 'low' | 'medium' | 'high';
        foundAnyData = true;
      }
      
      // Extract functionalities from implementation details
      const featureRegex = /<feature>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/feature>/g;
      let featureMatch;
      const functionalities: string[] = [];
      while ((featureMatch = featureRegex.exec(content)) !== null) {
        if (featureMatch[1]) {
          functionalities.push(featureMatch[1].trim());
        }
      }
      if (functionalities.length > 0) {
        hookData.functionalities = functionalities;
        foundAnyData = true;
      }
      
      // Extract test code
      const testCodeMatch = content.match(/<testCode>([\s\S]*?)<\/testCode>/);
      if (testCodeMatch && testCodeMatch[1]) {
        hookData.testCode = testCodeMatch[1].trim();
        foundAnyData = true;
      }

      // Extract examples
      const exampleRegex = /<example>([\s\S]*?)<\/example>/g;
      let exampleMatch;
      const examples: string[] = [];
      while ((exampleMatch = exampleRegex.exec(content)) !== null) {
        if (exampleMatch[1]) {
          examples.push(exampleMatch[1].trim());
        }
      }
      if (examples.length > 0) {
        hookData.examples = examples;
        foundAnyData = true;
      }
      
      // Extract hook type
      const hookTypes = [
        'before swap', 'after swap', 
        'before initialize', 'after initialize', 
        'before modify position', 'after modify position'
      ];
      
      for (const type of hookTypes) {
        if (content.toLowerCase().includes(type)) {
          hookData.hookType = type as any;
          foundAnyData = true;
          break;
        }
      }
      
      if (!hookData.hookType && foundAnyData) {
        hookData.hookType = 'custom';
      }

      // Extract reply content too (for reference)
      const replyMatch = content.match(/<reply>([\s\S]*?)<\/reply>/);
      if (replyMatch && replyMatch[1]) {
        hookData._replyContent = replyMatch[1].trim();
        foundAnyData = true;
      }

      return foundAnyData ? hookData : null;
    } catch (e) {
      console.error("Error extracting tags:", e);
      return null;
    }
  }

  /**
   * Get the final hook data, removing the raw content
   */
  getFinalData(): Partial<UniswapHookData> {
    const finalData = { ...this.lastParsedData };
    if (finalData._rawContent) {
      delete finalData._rawContent;
    }
    if (finalData._replyContent) {
      delete finalData._replyContent;
    }
    console.log("Returning final data:", Object.keys(finalData).join(', '));
    return finalData;
  }

  /**
   * Reset the handler for a new streaming session
   */
  reset(): void {
    this.lexer = new Lexer();
    this.rawContent = '';
    this.lastParsedData = {};
    console.log("JsonStreamHandler reset");
  }

  /**
   * Get the current raw content
   */
  getRawContent(): string {
    return this.rawContent;
  }
} 
