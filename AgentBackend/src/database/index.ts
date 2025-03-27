import prisma from './prisma/client';
import { SessionRepository } from './repositories/sessionRepository';
import { MessageRepository } from './repositories/messageRepository';
import { HookCodeRepository } from './repositories/hookCodeRepository';

// Export repositories
export { SessionRepository } from './repositories/sessionRepository';
export { MessageRepository } from './repositories/messageRepository';
export { HookCodeRepository } from './repositories/hookCodeRepository';

// Database service class
export class DatabaseService {
  private static instance: DatabaseService;
  
  public readonly sessions: SessionRepository;
  public readonly messages: MessageRepository;
  public readonly hookCodes: HookCodeRepository;
  
  private constructor() {
    this.sessions = new SessionRepository();
    this.messages = new MessageRepository();
    this.hookCodes = new HookCodeRepository();
  }
  
  /**
   * Get the singleton instance of DatabaseService
   * @returns DatabaseService instance
   */
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }
  
  /**
   * Connect to the database
   */
  public async connect(): Promise<void> {
    await prisma.$connect();
  }
  
  /**
   * Disconnect from the database
   */
  public async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }
}

// Export the prisma client
export { prisma }; 