import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseProvider } from './baseProvider';
import { ChatMessage, ChatContent } from '@/lib/types/chat';
import { env } from "@/app/config/env";
import { Logger } from "@/app/utils/logger";

const logger = new Logger("GeminiProvider");

export class GeminiProvider extends BaseProvider {
  name = 'gemini';
  models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-Pro'];
  private client: GoogleGenerativeAI | null = null;

  protected getApiKey(): string | null {
    return env.GOOGLE_API_KEY || null;
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
      const selectedModel = model === 'auto' ? 'gemini-2.5-flash' : (model || 'gemini-2.5-flash');
      const genModel = client.getGenerativeModel({ model: selectedModel });
      
      
      const systemMessage = messages.find(m => m.role === 'system');
      console.log("systemMessage", systemMessage);
      const userMessages = messages.filter(m => m.role === 'user');
      console.log("userMessages", userMessages);
      const lastUserMessage = userMessages[userMessages.length - 1];
      
      if (!lastUserMessage) {
        throw new Error('No user message found');
      }

      // Build context for Gemini
      let context = '';
      if (systemMessage) {
        const systemContent = this.flattenContent(systemMessage.content);
        context = `System: ${systemContent}\n\n`;
      }
      console.log("context", context);
      
      const userContent = this.flattenContent(lastUserMessage.content);
      const textContent = context + `User: ${userContent}`;
      console.log("textContent", textContent);
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
