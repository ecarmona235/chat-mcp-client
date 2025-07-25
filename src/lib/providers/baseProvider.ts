import { ChatMessage, ChatProvider, ChatContent } from '@/lib/types/chat';

export abstract class BaseProvider implements ChatProvider {
  abstract name: string;
  abstract models: string[];

  abstract sendMessage(messages: ChatMessage[], model: string): Promise<ChatContent[]>;
  
  isAvailable(): boolean {
    // Check if API key is available
    const apiKey = this.getApiKey(); // TODO: update this to use config/env for validation
    return !!apiKey;
  }

  protected abstract getApiKey(): string | null;

  protected formatMessages(messages: ChatMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: this.flattenContent(msg.content)
    }));
  }

  protected flattenContent(content: ChatContent[]): string {
    // For now, we'll flatten to text for compatibility
    // This can be enhanced later to handle images and other content types
    return content
      .filter(item => item.type === 'text')
      .map(item => item.content as string)
      .join('\n');
  }
}
