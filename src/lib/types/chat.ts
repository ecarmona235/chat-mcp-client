export interface ToolCall {
  id: string;
  name: string;
  input: any;
}

export interface ImageData {
  url?: string;
  base64?: string;
  mimeType: string;
}

export interface ChatContent {
  type: 'text' | 'image' | 'tool' | 'thinking';
  content: string | ImageData | ToolCall;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: ChatContent[];
  timestamp: Date;
}

export interface ChatProvider {
  name: string;
  models: string[];
  sendMessage(messages: ChatMessage[], model: string): Promise<ChatContent[]>;
  isAvailable(): boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  currentProvider: string | null;
  currentModel: string | null;
  isLoading: boolean;
  error: string | null;
}
