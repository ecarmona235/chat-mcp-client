import { BaseProvider } from './baseProvider';
import { ChatMessage, ChatContent } from '@/lib/types/chat';
import { env } from "@/app/config/env";
import { Logger } from "@/app/utils/logger";
import { DynamicFlow } from '@/lib/interfaces/DynamicFlowInterface';
import { DynamicDiscovery } from '@/lib/interfaces/DynamicDiscoveryInterface';
import { DynamicExecution } from '@/lib/interfaces/DynamicExecutionInterface';
import { LLMFormatting } from '@/lib/interfaces/LLMFormattingInterface';
import { Transparency } from '@/lib/interfaces/TransparencyInterface';
import { Consent } from '@/lib/interfaces/ConsentInterface';

const logger = new Logger("GeminiProvider");

export class GeminiProvider extends BaseProvider {
  name = 'gemini';
  models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-Pro'];
  private dynamicFlow: DynamicFlow; 

  constructor() {
    super();
    // Initialize DynamicFlow with all dependencies
    this.dynamicFlow = new (DynamicFlow as any)(
      new (DynamicDiscovery as any)(),
      new (DynamicExecution as any)(),
      new (LLMFormatting as any)(),
      new (Transparency as any)(),
      new (Consent as any)()
    );
  }

  protected getApiKey(): string | null {
    return env.GOOGLE_API_KEY || null;
  }

  async sendMessage(messages: ChatMessage[], model: string): Promise<ChatContent[]> {
    try {
      // Extract user request from messages
      const userRequest = this.extractUserRequest(messages);
      
      if (!userRequest) {
        return [{
          type: 'text',
          content: 'I couldn\'t understand your request. Please try again.'
        }];
      }
      
      // Delegate to DynamicFlow for tool orchestration
      const response = await this.dynamicFlow.processUserRequest(userRequest, model);
      
      return [{
        type: 'text',
        content: response
      }];
    } catch (error) {
      logger.error('Gemini provider error:', error);
      return [{
        type: 'text',
        content: `I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }];
    }
  }

  private extractUserRequest(messages: ChatMessage[]): string {
    // Extract the user's request from the conversation
    const userMessages = messages.filter(msg => msg.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];
    
    if (lastUserMessage && lastUserMessage.content.length > 0) {
      const content = lastUserMessage.content[0];
      if (content.type === 'text') {
        return content.content as string;
      }
    }
    
    return '';
  }
}
