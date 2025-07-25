import { ChatContent } from '@/lib/types/chat';

interface ContentRendererProps {
  content: ChatContent;
}

export function ContentRenderer({ content }: ContentRendererProps) {
  switch (content.type) {
    case 'text':
      return (
        <div className="whitespace-pre-wrap">
          {content.content as string}
        </div>
      );

    case 'image':
      const imageData = content.content as any;
      return (
        <div className="my-2">
          {imageData.url ? (
            <img 
              src={imageData.url} 
              alt="Generated image"
              className="max-w-full h-auto rounded-lg shadow-md"
            />
          ) : imageData.base64 ? (
            <img 
              src={`data:${imageData.mimeType};base64,${imageData.base64}`}
              alt="Generated image"
              className="max-w-full h-auto rounded-lg shadow-md"
            />
          ) : (
            <div className="text-gray-500 italic">Image content (no displayable format)</div>
          )}
        </div>
      );

    case 'tool':
      const toolData = content.content as any;
      return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 my-2">
          <div className="font-semibold text-blue-800">Tool Call: {toolData.name}</div>
          <div className="text-sm text-blue-600 mt-1">ID: {toolData.id}</div>
          {toolData.input && (
            <div className="text-sm text-gray-700 mt-2">
              <strong>Input:</strong>
              <pre className="bg-white p-2 rounded mt-1 text-xs overflow-auto">
                {JSON.stringify(toolData.input, null, 2)}
              </pre>
            </div>
          )}
        </div>
      );

    case 'thinking':
      return (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 my-2">
          <div className="font-semibold text-gray-700">Thinking...</div>
          <div className="text-sm text-gray-600 mt-1">
            {JSON.stringify(content.content, null, 2)}
          </div>
        </div>
      );

    default:
      return (
        <div className="text-gray-500 italic">
          Unsupported content type: {content.type}
        </div>
      );
  }
} 