import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './baseProvider';
import { ChatMessage, ChatContent } from '@/lib/types/chat';
import { env } from "@/app/config/env";
import { Logger } from "@/app/utils/logger";

const logger = new Logger("ClaudeProvider");


export class ClaudeProvider extends BaseProvider {
  name = 'claude';
  models = ['Claude-Haiku-3', 'Claude-Haiku-3-5', 'Claude-Sonnet-4', 'Claude-Sonnet-3-7', 'Claude-Opus-4'];
  private client: Anthropic | null = null;

  protected getApiKey(): string | null {
    return env.ANTHROPIC_API_KEY || null;
  }

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('Anthropic API key not found');
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async sendMessage(messages: ChatMessage[], model: string): Promise<ChatContent[]> {
    try {
      const client = this.getClient();
      const selectedModel = model === 'auto' ? 'Claude-Haiku-3' : (model || 'Claude-Haiku-3');
      const response = await client.messages.create({
        model: selectedModel,
        messages: this.formatMessages(messages),
        max_tokens: 1000
      });
      
      return this.parseClaudeResponse(response.content);
    } catch (error) {
      throw new Error(`Claude request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseClaudeResponse(content: any[]): ChatContent[] {
    return content.map(item => {
      if ('text' in item) {
        return {
          type: 'text',
          content: item.text
        };
      } else if ('source' in item) {
        return {
          type: 'image',
          content: {
            url: item.source.url,
            mimeType: item.source.type
          }
        };
      } else if ('type' in item && item.type === 'tool_use') {
        return {
          type: 'tool',
          content: {
            id: item.id,
            name: item.name,
            input: item.input
          }
        };
      } else {
        return {
          type: 'text',
          content: 'Unsupported content type'
        };
      }
    });
  }
}
