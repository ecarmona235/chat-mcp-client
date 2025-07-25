import { ChatProvider } from '@/lib/types/chat';
import { OpenAIProvider } from '@/lib/providers/openaiProvider';
import { ClaudeProvider } from '@/lib/providers/claudeProvider';
import { GeminiProvider } from '@/lib/providers/geminiProvider';

export class ProviderFactory {
  private static providers: Map<string, ChatProvider> = new Map();

  static getProvider(name: string): ChatProvider | null {
    if (!this.providers.has(name)) {
      switch (name) {
        case 'openai':
          this.providers.set(name, new OpenAIProvider());
          break;
        case 'claude':
          this.providers.set(name, new ClaudeProvider());
          break;
        case 'gemini':
          this.providers.set(name, new GeminiProvider());
          break;
        default:
          return null;
      }
    }
    return this.providers.get(name) || null;
  }

  static getAvailableProviders(): string[] {
    return ['openai', 'claude', 'gemini'].filter(name => {
      const provider = this.getProvider(name);
      return provider?.isAvailable() || false;
    });
  }
}
