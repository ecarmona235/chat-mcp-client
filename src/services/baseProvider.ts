import { ChatMessage, ChatProvider, ChatContent } from '@/lib/types/chat';

export abstract class BaseProvider implements ChatProvider {
  abstract name: string;
  abstract models: string[];

  abstract sendMessage(messages: ChatMessage[], model: string): Promise<ChatContent[]>;
  
  isAvailable(): boolean {
    try {
      const apiKey = this.getApiKey();
      return !!apiKey && apiKey.trim().length > 0;
    } catch (error) {
      return false;
    }
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
