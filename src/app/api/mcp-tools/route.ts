import { NextResponse } from 'next/server';
import { MCPServerManager } from '@/lib/mcp-server';

export async function GET() {
  const manager = MCPServerManager.getInstance();
  
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