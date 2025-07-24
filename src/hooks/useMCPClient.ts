import { useState, useCallback } from 'react';

interface Tool {
  name: string;
  description?: string;
  inputSchema: any;
}

interface Resource {
  name: string;
  uri: string;
  description?: string;
}

interface MCPResponse {
  success: boolean;
  tools?: Tool[];
  resources?: Resource[];
  error?: string;
}

export function useMCPClient() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get tools
      const toolsResponse = await fetch('/api/mcp-tools');
      const toolsData: MCPResponse = await toolsResponse.json();
      
      // Get resources
      const resourcesResponse = await fetch('/api/mcp-resources');
      const resourcesData: MCPResponse = await resourcesResponse.json();
      
      if (toolsData.success && resourcesData.success) {
        setTools(toolsData.tools || []);
        setResources(resourcesData.resources || []);
        setConnected(true);
      } else {
        throw new Error(toolsData.error || resourcesData.error || 'Failed to connect');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const callTool = useCallback(async (toolName: string, args: any) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/mcp-call-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName, args })
      });
      
      const data = await response.json();
      
      if (data.success) {
        return data.result;
      } else {
        throw new Error(data.error || 'Tool call failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    tools,
    resources,
    loading,
    error,
    connected,
    connect,
    callTool
  };
}