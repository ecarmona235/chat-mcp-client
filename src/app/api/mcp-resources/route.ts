import { NextResponse } from 'next/server';
import { MCPServerManager } from '@/lib/mcp-server';

export async function GET() {
  const manager = MCPServerManager.getInstance();
  
  try {
    const resources = await manager.executeWithConnection(async (client) => {
      const response = await client.listResources();
      return response.resources;
    });

    return NextResponse.json({ success: true, resources });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}