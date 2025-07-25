import OpenAI from 'openai';
import { BaseProvider } from './baseProvider';
import { ChatMessage, ChatContent } from '@/lib/types/chat';

export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  models = ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo'];
  private client: OpenAI | null = null;

  protected getApiKey(): string | null {
    return process.env.NEXT_PUBLIC_OPENAI_API_KEY || null;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('OpenAI API key not found');
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async sendMessage(messages: ChatMessage[], model: string): Promise<ChatContent[]> {
    try {
      const client = this.getClient();
      const selectedModel = model === 'auto' ? 'gpt-4' : (model || 'gpt-3.5-turbo');
      const response = await client.chat.completions.create({
        model: selectedModel,
        messages: this.formatMessages(messages),
        max_tokens: 1000,
        temperature: 0.7
      });
      
      const content = response.choices[0]?.message?.content || 'No response from OpenAI';
      return [{
        type: 'text',
        content
      }];
    } catch (error) {
      throw new Error(`OpenAI request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
