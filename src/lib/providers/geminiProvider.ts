import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseProvider } from './baseProvider';
import { ChatMessage, ChatContent } from '@/lib/types/chat';

export class GeminiProvider extends BaseProvider {
  name = 'gemini';
  models = ['gemini-pro', 'gemini-pro-vision'];
  private client: GoogleGenerativeAI | null = null;

  protected getApiKey(): string | null {
    return process.env.NEXT_PUBLIC_GOOGLE_API_KEY || null;
  }

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('Google API key not found');
      this.client = new GoogleGenerativeAI(apiKey);
    }
    return this.client;
  }

  async sendMessage(messages: ChatMessage[], model: string): Promise<ChatContent[]> {
    try {
      const client = this.getClient();
      const selectedModel = model === 'auto' ? 'gemini-pro' : (model || 'gemini-pro');
      const genModel = client.getGenerativeModel({ model: selectedModel });
      
      // Get the last user message for Gemini (simplified for now)
      const lastUserMessage = messages.filter(m => m.role === 'user').pop();
      if (!lastUserMessage) {
        throw new Error('No user message found');
      }

      // Flatten content to text for Gemini
      const textContent = this.flattenContent(lastUserMessage.content);
      const result = await genModel.generateContent(textContent);
      const response = await result.response;
      
      const content = response.text() || 'No response from Gemini';
      return [{
        type: 'text',
        content
      }];
    } catch (error) {
      throw new Error(`Gemini request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
