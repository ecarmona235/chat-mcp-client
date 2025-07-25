import { useState } from 'react';
import { useChat } from '@/hooks/useChat';
import { ContentRenderer } from './ContentRenderer';

export function Chat() {
  const { messages, isLoading, error, sendMessage, setProvider, getAvailableModels } = useChat();
  const [inputValue, setInputValue] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendMessage(inputValue);
      setInputValue('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">Chat</h2>
        <div className="flex gap-2">
          <select 
            value={selectedProvider}
            onChange={(e) => {
              const provider = e.target.value;
              setSelectedProvider(provider);
              setSelectedModel(''); // Reset model when provider changes
              setProvider(provider, '');
            }}
            className="border rounded px-2 py-1"
          >
            <option value="">Select Provider</option>
            <option value="openai">OpenAI</option>
            <option value="claude">Claude</option>
            <option value="gemini">Gemini</option>
            <option value="auto">Auto</option>
          </select>

          {selectedProvider && selectedProvider !== 'auto' && (
            <select
              value={selectedModel}
              onChange={(e) => {
                const model = e.target.value;
                setSelectedModel(model);
                setProvider(selectedProvider, model);
              }}
              className="border rounded px-2 py-1"
            >
              <option value="">Select Model</option>
              <option value="auto">Auto (Best Model)</option>
              {getAvailableModels(selectedProvider).map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="border rounded-lg h-96 overflow-y-auto p-4 mb-4">
        {messages.map((message, index) => (
          <div key={index} className={`mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
            <div className={`inline-block p-3 rounded-lg max-w-xs lg:max-w-md ${
              message.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200'
            }`}>
              {message.content.map((content, contentIndex) => (
                <ContentRenderer key={contentIndex} content={content} />
              ))}
            </div>
          </div>
        ))}
        {isLoading && <div className="text-gray-500">Loading...</div>}
        {error && <div className="text-red-500">{error}</div>}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 border rounded px-3 py-2"
          disabled={isLoading}
        />
        <button 
          type="submit" 
          disabled={isLoading || !inputValue.trim()}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
