import { NextResponse } from 'next/server';
import { MCPServerManager } from '@/lib/mcp-server';
import { env } from '@/app/config/env';

export async function POST(request: Request) {
  const { server, toolName, args } = await request.json();
  
  if (!server) {
    return NextResponse.json(
      { success: false, error: 'Server parameter is required' },
      { status: 400 }
    );
  }

  // Find the server URL from environment
  const serverUrl = env.MCP_SERVERS.find(serverUrl => serverUrl === server);
  
  if (!serverUrl) {
    return NextResponse.json(
      { success: false, error: `Server '${server}' not found` },
      { status: 404 }
    );
  }

  const manager = MCPServerManager.getInstance(serverUrl);
  
  try {
    const result = await manager.executeWithConnection(async (client) => {
      return await client.callTool({
        name: toolName,
        arguments: args
      });
    });

    return NextResponse.json({ 
      success: true, 
      server,
      result 
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        server,
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}