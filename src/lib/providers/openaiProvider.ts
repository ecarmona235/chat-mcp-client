import OpenAI from 'openai';
import { BaseProvider } from './baseProvider';
import { ChatMessage, ChatContent } from '@/lib/types/chat';
import { env } from "@/app/config/env";
import { Logger } from "@/app/utils/logger";

const logger = new Logger("OpenAIProvider");

export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  models = ['gpt-3.5-turbo', 'gpt-3.5-turbo-16k'];
  private client: OpenAI | null = null; 

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

  async sendMessage(messages: ChatMessage[], model: string): Promise<ChatContent[]> {
    try {
      const client = this.getClient();
      const selectedModel = model === 'auto' ? 'gpt-3.5-turbo' : (model || 'gpt-3.5-turbo');
      
      // Define available functions for MCP tools
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
        {
          name: 'execute_mcp_tool',
          description: 'Execute an MCP tool with given arguments',
          parameters: {
            type: 'object',
            properties: {
              toolName: {
                type: 'string',
                description: 'Name of the tool to execute'
              },
              args: {
                type: 'object',
                description: 'Arguments for the tool'
              }
            },
            required: ['toolName']
          }
        }
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
        
        // Execute the function
        let result;
        if (functionCall.name === 'get_mcp_tools') {
          const toolsResponse = await fetch('http://localhost:3000/api/mcp-tools');
          result = await toolsResponse.json();
        } else if (functionCall.name === 'execute_mcp_tool') {
          const args = JSON.parse(functionCall.arguments || '{}');
          const toolResponse = await fetch('http://localhost:3000/api/mcp-call-tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(args)
          });
          result = await toolResponse.json();
        }
        
        return [{
          type: 'text',
          content: `Function ${functionCall.name} executed. Result: ${JSON.stringify(result, null, 2)}`
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
