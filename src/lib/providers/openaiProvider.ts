import OpenAI from 'openai';
import { BaseProvider } from './baseProvider';
import { ChatMessage, ChatContent } from '@/lib/types/chat';
import { env } from "@/app/config/env";
import { Logger } from "@/app/utils/logger";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const logger = new Logger("OpenAIProvider");

export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  models = ['gpt-3.5-turbo', 'gpt-3.5-turbo-16k'];
  private client: OpenAI | null = null;
  private mcpClient: Client | null = null;
  private mcpTransport: StreamableHTTPClientTransport | null = null;
  private availableTools: any[] = [];
  private toolFunctions: any[] = []; 

  protected getApiKey(): string | null {
    return env.OPENAI_API_KEY || null;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.getApiKey();
      if (!apiKey) throw new Error('OpenAI API key not found');
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  private async getMCPClient(): Promise<Client> {
    if (!this.mcpClient) {
      this.mcpTransport = new StreamableHTTPClientTransport(
        new URL(env.MCP_SERVER_URL)
      );
      
      this.mcpClient = new Client(
        { name: "ai-mcp-client", version: "1.0.0" },
        { capabilities: { prompts: {}, resources: {}, tools: {} } }
      );
      
      await this.mcpClient.connect(this.mcpTransport);
      
      // Fetch available tools and generate functions
      await this.loadAvailableTools();
    }
    return this.mcpClient;
  }

  private async loadAvailableTools(): Promise<void> {
    try {
      const toolsResponse = await this.mcpClient!.listTools();
      this.availableTools = toolsResponse.tools || [];
      
      // Generate function definitions from tool schemas
      this.toolFunctions = this.availableTools.map(tool => ({
        name: `execute_${tool.name}`,
        description: tool.description || `Execute the ${tool.name} tool`,
        parameters: tool.inputSchema || {
          type: 'object',
          properties: {},
          required: []
        }
      }));
      
      logger.info(`Loaded ${this.toolFunctions.length} MCP tools`);
    } catch (error) {
      logger.error('Failed to load MCP tools:', error);
      this.availableTools = [];
      this.toolFunctions = [];
    }
  }

  async sendMessage(messages: ChatMessage[], model: string): Promise<ChatContent[]> {
    try {
      const client = this.getClient();
      const selectedModel = model === 'auto' ? 'gpt-3.5-turbo' : (model || 'gpt-3.5-turbo');
      
      // Get available functions (dynamic from MCP tools + utility functions)
      const functions = [
        {
          name: 'get_mcp_tools',
          description: 'Get available MCP tools and their schemas',
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        ...this.toolFunctions // Add dynamic tool functions
      ];

      const response = await client.chat.completions.create({
        model: selectedModel,
        messages: this.formatMessages(messages),
        tools: functions.map(f => ({ type: 'function', function: f })),
        tool_choice: 'auto',
        max_tokens: 1000,
        temperature: 0.7
      });
      
      const choice = response.choices[0];
      
      // Check if AI wants to call a function
      if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
        const toolCall = choice.message.tool_calls[0];
        const functionCall = toolCall.function;
        
        // Execute the function using MCP SDK
        let result: any = { error: 'Unknown function' };
        try {
          const mcpClient = await this.getMCPClient();
          
          if (functionCall.name === 'get_mcp_tools') {
            const toolsResponse = await mcpClient.listTools();
            result = { result: toolsResponse };
          } else if (functionCall.name.startsWith('execute_')) {
            // Extract tool name from function name (remove 'execute_' prefix)
            const toolName = functionCall.name.replace('execute_', '');
            const args = JSON.parse(functionCall.arguments || '{}');
            
            const toolResponse = await mcpClient.callTool({
              name: toolName,
              arguments: args
            });
            result = { result: toolResponse };
          }
        } catch (error) {
          result = { error: error instanceof Error ? error.message : 'Unknown MCP error' };
        }
        
        // Format the response based on the function called
        let content;
        if (functionCall.name === 'get_mcp_tools') {
          if (result.result && result.result.tools) {
            const tools = result.result.tools;
            content = `I found ${tools.length} available MCP tools:\n\n${tools.map((tool: any, index: number) => 
              `${index + 1}. **${tool.name}** - ${tool.description || 'No description available'}`
            ).join('\n')}\n\nYou can ask me to use any of these tools by name.`;
          } else {
            content = `I couldn't retrieve the available tools. Error: ${JSON.stringify(result.error || result)}`;
          }
        } else if (functionCall.name.startsWith('execute_')) {
          const toolName = functionCall.name.replace('execute_', '');
          if (result.result) {
            content = `✅ **${toolName}** executed successfully:\n\n${JSON.stringify(result.result, null, 2)}`;
          } else {
            content = `❌ **${toolName}** execution failed. Error: ${JSON.stringify(result.error || result)}`;
          }
        } else {
          content = `Function ${functionCall.name} executed. Result: ${JSON.stringify(result, null, 2)}`;
        }
        
        return [{
          type: 'text',
          content
        }];
      }
      
      const content = choice?.message?.content || 'No response from OpenAI';
      return [{
        type: 'text',
        content
      }];
    } catch (error) {
      throw new Error(`OpenAI request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
