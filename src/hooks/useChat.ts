import { useState, useCallback } from 'react';
import { ChatMessage, ChatState, ChatContent } from '@/lib/types/chat';
import { ProviderFactory } from '@/lib/providers/providerFactory';

export function useChat() {
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    currentProvider: null,
    currentModel: null,
    isLoading: false,
    error: null
  });

  const [providerIndex, setProviderIndex] = useState(0);
  const availableProviders = ['openai', 'claude', 'gemini'];

  const getNextProvider = useCallback(() => {
    const nextIndex = (providerIndex + 1) % availableProviders.length;
    setProviderIndex(nextIndex);
    return availableProviders[nextIndex];
  }, [providerIndex]);

  const sendMessage = useCallback(async (content: string) => {
    let selectedProvider = chatState.currentProvider;
    let selectedModel = chatState.currentModel;

    // Auto mode logic
    // TODO: update this to be more robust and handle:
    // 1. Success rate (avoid failing providers)
    // 2. Response time (prefer faster ones)
    // 3. Cost (prefer cheaper ones)
    // 4. Rate limits (avoid overused ones)
    if (!selectedProvider || selectedProvider === 'auto') {
      selectedProvider = getNextProvider();
      selectedModel = 'default';
    }

    if (!selectedProvider || !selectedModel) {
      setChatState(prev => ({ ...prev, error: 'No provider or model selected' }));
      return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content: [{
        type: 'text',
        content
      }],
      timestamp: new Date()
    };

    setChatState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isLoading: true,
      error: null
    }));

    try {
      const provider = ProviderFactory.getProvider(selectedProvider);
      if (!provider) {
        throw new Error(`Provider ${selectedProvider} not found`);
      }

      const response = await provider.sendMessage(chatState.messages, selectedModel);
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };

      setChatState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        isLoading: false
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setChatState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }));
    }
  }, [chatState.currentProvider, chatState.currentModel]);

  const setProvider = useCallback((provider: string, model: string) => {
    setChatState(prev => ({
      ...prev,
      currentProvider: provider,
      currentModel: model
    }));
  }, []);

  const getAvailableModels = useCallback((provider: string) => {
    const providerInstance = ProviderFactory.getProvider(provider);
    return providerInstance?.models || [];
  }, []);

  return {
    ...chatState,
    sendMessage,
    setProvider,
    getAvailableModels
  };
}
