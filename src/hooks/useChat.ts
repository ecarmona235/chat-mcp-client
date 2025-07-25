import { useState, useCallback } from 'react';
import { ChatMessage, ChatState, ChatContent } from '@/lib/types/chat';

export function useChat() {
  const [chatState, setChatState] = useState<ChatState>({
    messages: [],
    currentProvider: null,
    currentModel: null,
    isLoading: false,
    error: null
  });

  const [providerIndex, setProviderIndex] = useState(0);
  const availableProviders = ['openai', 'gemini'];

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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...chatState.messages, userMessage],
          provider: selectedProvider,
          model: selectedModel
        })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to get response');
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.content,
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
    // Hardcoded models for now - could be fetched from API if needed
          const modelMap: Record<string, string[]> = {
        openai: ['gpt-3.5-turbo', 'gpt-3.5-turbo-16k', 'gpt-4o', 'gpt-4o-mini'],
        // claude: ['Claude-Haiku-3', 'Claude-Haiku-3-5', 'Claude-Sonnet-4', 'Claude-Sonnet-3-7', 'Claude-Opus-4'],
        gemini: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-Pro']
      };
    return modelMap[provider] || [];
  }, []);

  return {
    ...chatState,
    sendMessage,
    setProvider,
    getAvailableModels
  };
}
