import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class MCPServerManager {
  private static instance: MCPServerManager;
  
  static getInstance() {
    if (!this.instance) {
      this.instance = new MCPServerManager();
    }
    return this.instance;
  }

  async executeWithConnection<T>(operation: (client: Client) => Promise<T>): Promise<T> {
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost:3001/mcp")
    );
    const client = new Client(
      { name: "nextjs-client", version: "1.0.0" },
      { capabilities: { prompts: {}, resources: {}, tools: {} } }
    );

    try {
      await client.connect(transport);
      return await operation(client);
    } finally {
      client.close();
    }
  }
}