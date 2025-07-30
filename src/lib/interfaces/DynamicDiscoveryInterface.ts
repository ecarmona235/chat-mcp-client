import { env } from "@/app/config/env";

interface DynamicDiscoveryInterface {
  getAllTools(): Promise<any[]>;
  findToolsByCategory(category: string): Promise<any[]>;
  findToolsByCapability(capability: string): Promise<any[]>;
}

class DynamicDiscovery implements DynamicDiscoveryInterface {
  // TODO: Replace with Redis when Redis is set up
  private toolCache: Map<string, any[]> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Initialize cache
    this.toolCache = new Map();
    this.cacheTimestamp = 0;
  }

  async getAllTools(): Promise<any[]> {
    const now = Date.now();
    
    // Check if cache is still valid
    if (this.toolCache.has('all_tools') && 
        (now - this.cacheTimestamp) < this.CACHE_TTL) {
      return this.toolCache.get('all_tools')!;
    }

    try {
      // Fetch tools from MCP server
      const tools = await this.fetchToolsFromMCPServer();
      
      // Cache the result
      this.toolCache.set('all_tools', tools);
      this.cacheTimestamp = now;
      
      return tools;
    } catch (error) {
      console.error('Failed to fetch tools from MCP server:', error);
      
      // Return cached data if available, even if expired
      if (this.toolCache.has('all_tools')) {
        console.warn('Returning cached tools due to MCP server error');
        return this.toolCache.get('all_tools')!;
      }
      
      // Return empty array if no cache and server is down
      return [];
    }
  }

  async findToolsByCategory(category: string): Promise<any[]> {
    const allTools = await this.getAllTools();
    const searchTerm = category.toLowerCase();
    
    return allTools.filter(tool => {
      // Check if tool has category metadata (exact match)
      if (tool.category && tool.category.toLowerCase() === searchTerm) {
        return true;
      }
      
      // Check if tool name contains category
      if (tool.name && tool.name.toLowerCase().includes(searchTerm)) {
        return true;
      }
      
      // Check if description contains category
      if (tool.description && tool.description.toLowerCase().includes(searchTerm)) {
        return true;
      }
      
      // Check if any capability contains category
      if (tool.capabilities && Array.isArray(tool.capabilities)) {
        return tool.capabilities.some((cap: string) => 
          cap.toLowerCase().includes(searchTerm)
        );
      }
      
      return false;
    });
  }

  async findToolsByCapability(capability: string): Promise<any[]> {
    const allTools = await this.getAllTools();
    const searchTerm = capability.toLowerCase();
    
    return allTools.filter(tool => {
      // Check if tool has capabilities metadata
      if (tool.capabilities && Array.isArray(tool.capabilities)) {
        return tool.capabilities.some((cap: string) => 
          cap.toLowerCase().includes(searchTerm)
        );
      }
      
      // Check if tool name contains capability
      if (tool.name && tool.name.toLowerCase().includes(searchTerm)) {
        return true;
      }
      
      // Check if description contains capability
      if (tool.description && tool.description.toLowerCase().includes(searchTerm)) {
        return true;
      }
      
      // Check if category contains capability
      if (tool.category && tool.category.toLowerCase().includes(searchTerm)) {
        return true;
      }
      
      return false;
    });
  }

  // Get minimal tool summaries for LLM processing
  async getToolSummaries(): Promise<{name: string, description: string}[]> {
    const allTools = await this.getAllTools();
    return allTools.map(tool => tool.summary);
  }

  private async fetchToolsFromMCPServer(): Promise<any[]> {
    try {
      // TODO: Replace with actual MCP server endpoints
      const mcpServers: Array<string> = env.MCP_SERVERS;
      const allTools: any[] = [];

      // Fetch tools from all MCP servers
      for (const server of mcpServers) {
        try {
          const response = await fetch(`/api/mcp-tools?server=${server}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();
            
            // Handle the new API response format
            if (data.success && data.tools) {
              allTools.push(...data.tools);
              console.log(`Successfully fetched ${data.count || data.tools.length} tools from MCP server: ${server}`);
            } else {
              console.warn(`MCP server ${server} returned invalid response format`);
            }
          } else {
            console.warn(`MCP server ${server} responded with status: ${response.status}`);
          }
        } catch (error) {
          console.warn(`Failed to fetch tools from MCP server ${server}:`, error);
          // Continue with other servers even if one fails
        }
      }

      if (allTools.length === 0) {
        throw new Error('No tools found from any MCP server');
      }

      // Validate and normalize tool data
      return this.normalizeToolData(allTools);
      
    } catch (error) {
      console.error('Error fetching tools from MCP servers:', error);
      throw new Error('Failed to connect to any MCP server');
    }
  }

  private normalizeToolData(tools: any[]): any[] {
    return tools.map(tool => ({
      name: tool.name || 'unknown_tool',
      description: tool.description || 'No description available',
      category: tool.category || 'general',
      capabilities: tool.capabilities || [],
      schema: tool.schema || {},
      // Minimal summary for LLM (only name and description)
      summary: {
        name: tool.name || 'unknown_tool',
        description: tool.description || 'No description available'
      }
    }));
  }

  // TODO: Replace with Redis when Redis is set up
  private clearCache(): void {
    this.toolCache.clear();
    this.cacheTimestamp = 0;
  }

  // Method to manually refresh cache (useful for testing)
  async refreshCache(): Promise<void> {
    this.clearCache();
    await this.getAllTools();
  }
}

export default DynamicDiscoveryInterface;
export { DynamicDiscovery };
