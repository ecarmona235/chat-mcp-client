import { NextResponse } from 'next/server';
import { MCPServerManager } from '@/lib/mcp-server';
import { env } from '@/app/config/env';

export async function GET() {
  console.log('MCP Server URL:', env.MCP_SERVER_URL);
  const manager = MCPServerManager.getInstance(env.MCP_SERVER_URL);
  
  try {
    const tools = await manager.executeWithConnection(async (client) => {
      const response = await client.listTools();
      return response.tools;
    });

    return NextResponse.json({ success: true, tools });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}