'use client';

import { useMCPClient } from '../hooks/useMCPClient';

export default function MCPClient() {
  const { tools, resources, loading, error, connected, connect, callTool } = useMCPClient();

  const handleTestTool = async (toolName: string) => {
    try {
      const result = await callTool(toolName, { random_string: "test" });
      console.log(`Tool ${toolName} result:`, result);
    } catch (err) {
      console.error(`Tool ${toolName} failed:`, err);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">MCP Client</h1>
      
      {!connected ? (
        <button
          onClick={connect}
          disabled={loading}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
        >
          {loading ? 'Connecting...' : 'Connect to MCP Server'}
        </button>
      ) : (
        <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          <strong>✅ Connected Successfully!</strong>
          <br />
          Found {tools.length} tools and {resources.length} resources
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}

      {connected && (
        <div className="mt-6">
          {/* Tools Section */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold mb-4">Available Tools</h2>
            <div className="grid gap-4">
              {tools.map((tool, index) => (
                <div key={tool.name} className="p-4 border rounded-lg">
                  <h3 className="font-semibold text-lg">{index + 1}. {tool.name}</h3>
                  <p className="text-gray-600 mt-2">{tool.description}</p>
                  <button
                    onClick={() => handleTestTool(tool.name)}
                    className="mt-2 bg-gray-500 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Test Tool
                  </button>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm text-blue-600">
                      View Input Schema
                    </summary>
                    <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto text-gray-900">
                      {JSON.stringify(tool.inputSchema, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          </div>

          {/* Resources Section */}
          <div>
            <h2 className="text-2xl font-semibold mb-4">Available Resources</h2>
            <div className="grid gap-4">
              {resources.map((resource, index) => (
                <div key={resource.name} className="p-4 border rounded-lg">
                  <h3 className="font-semibold text-lg">{index + 1}. {resource.name}</h3>
                  <p className="text-gray-600 mt-2">{resource.description}</p>
                  <p className="text-sm text-gray-500 mt-1">URI: {resource.uri}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}