import { NextRequest, NextResponse } from 'next/server';
import { ProviderFactory } from '@/lib/providers/providerFactory';
import { ChatMessage } from '@/lib/types/chat';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Request body received:', JSON.stringify(body, null, 2));
    const { messages, provider, model } = body;

    const providerInstance = ProviderFactory.getProvider(provider);
    if (!providerInstance) {
      return NextResponse.json(
        { error: `Provider ${provider} not found` },
        { status: 400 }
      );
    }

    // Add system message about MCP capabilities if this is the first message
    const enhancedMessages = messages.length === 1 ? [
      {
        role: 'system',
        content: [{
          type: 'text',
          content: `You have access to MCP (Model Context Protocol) tools. You can:
1. Get available tools: Make a GET request to /api/mcp-tools
2. Execute tools: Make a POST request to /api/mcp-call-tool with {"toolName": "tool_name", "args": {...}}
3. Get resources: Make a GET request to /api/mcp-resources

When you need to use a tool, first fetch its schema to understand the required parameters.`
        }],
        timestamp: new Date()
      },
      ...messages
    ] : messages;

    console.log('Enhanced messages being sent to provider:', JSON.stringify(enhancedMessages, null, 2));
    const response = await providerInstance.sendMessage(enhancedMessages, model);

    return NextResponse.json({ success: true, content: response });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 