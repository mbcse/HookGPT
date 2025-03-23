import prisma from '../prisma/client';
import type { Prisma } from '@prisma/client';

/**
 * Repository for HookCode-related database operations
 */
export class HookCodeRepository {
  /**
   * Create a new hook code
   * @param data Hook code data
   * @returns The created hook code
   */
  async createHookCode(data: {
    name: string;
    description: string;
    code: string;
    gasEstimate?: string;
    implementationDetails?: any;
    testCode?: string;
    examples?: any;
    sessionId: string;
  }): Promise<any> {
    // Check if a hook code already exists for this session
    const existingHook = await prisma.hookCode.findUnique({
      where: { sessionId: data.sessionId },
    });

    if (existingHook) {
      // Update the existing hook code
      return prisma.hookCode.update({
        where: { id: existingHook.id },
        data,
      });
    }

    // Create a new hook code
    return prisma.hookCode.create({
      data,
    });
  }

  /**
   * Get a hook code by ID
   * @param id Hook code ID
   * @returns The hook code or null if not found
   */
  async getHookCodeById(id: string): Promise<any | null> {
    return prisma.hookCode.findUnique({
      where: { id },
    });
  }

  /**
   * Get a hook code by session ID
   * @param sessionId Session ID
   * @returns The hook code or null if not found
   */
  async getHookCodeBySessionId(sessionId: string): Promise<any | null> {
    return prisma.hookCode.findUnique({
      where: { sessionId },
    });
  }

  /**
   * Delete a hook code
   * @param id Hook code ID
   * @returns The deleted hook code
   */
  async deleteHookCode(id: string): Promise<any> {
    return prisma.hookCode.delete({
      where: { id },
    });
  }

  /**
   * Delete a hook code by session ID
   * @param sessionId Session ID
   * @returns The deleted hook code or null if not found
   */
  async deleteHookCodeBySessionId(sessionId: string): Promise<any | null> {
    const code = await this.getHookCodeBySessionId(sessionId);
    if (!code) return null;
    
    return prisma.hookCode.delete({
      where: { id: code.id },
    });
  }
} 