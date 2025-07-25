import { NextResponse } from 'next/server';
import { MCPServerManager } from '@/lib/mcp-server';
import { env } from '@/app/config/env';

export async function POST(request: Request) {
  const { toolName, args } = await request.json();
  const manager = MCPServerManager.getInstance(env.MCP_SERVER_URL);
  
  try {
    const result = await manager.executeWithConnection(async (client) => {
      return await client.callTool({
        name: toolName,
        arguments: args
      });
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}