import { NextResponse } from 'next/server';
import { MCPServerManager } from '@/services/mcp-server';
import { env } from '@/app/config/env';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serverName = searchParams.get('server');
  
  if (!serverName) {
    return NextResponse.json(
      { success: false, error: 'Server parameter is required' },
      { status: 400 }
    );
  }

  // Find the server URL from environment
  const serverUrl = env.MCP_SERVERS.find(server => server === serverName);
  
  if (!serverUrl) {
    return NextResponse.json(
      { success: false, error: `Server '${serverName}' not found` },
      { status: 404 }
    );
  }

  const manager = MCPServerManager.getInstance(serverUrl);
  
  try {
    const tools = await manager.executeWithConnection(async (client) => {
      const response = await client.listTools();
      return response.tools;
    });

    return NextResponse.json({ 
      success: true, 
      server: serverName,
      tools,
      count: tools.length
    });
  } catch (error) {
    console.error('Error in MCP tools API:', error);
    return NextResponse.json(
      { 
        success: false, 
        server: serverName,
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}