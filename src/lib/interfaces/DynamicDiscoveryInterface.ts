import { env } from "@/app/config/env";
import { cacheService } from "@/services/cache";

interface DynamicDiscoveryInterface {
  getAllTools(): Promise<any[]>;
  findToolsByCategory(category: string): Promise<any[]>;
  findToolsByCapability(capability: string): Promise<any[]>;
  getToolSummaries(): Promise<{name: string, description: string}[]>;
  validateToolSchema(tool: any): boolean;
  refreshToolSchema(toolName: string, server: string): Promise<void>;
}

class DynamicDiscovery implements DynamicDiscoveryInterface {
  constructor() {
    // Cache service is now handled by the dedicated CacheService
  }

  async getAllTools(): Promise<any[]> {
    try {
      // Try to get cached tools from all servers
      const allTools: any[] = [];
      
      for (const server of env.MCP_SERVERS) {
        const cachedTools = await cacheService.getToolDiscovery(server);
        if (cachedTools) {
          allTools.push(...cachedTools);
        }
      }
      
      // If we have cached tools, return them
      if (allTools.length > 0) {
        return allTools;
      }
      
      // Otherwise, fetch fresh tools
      const tools = await this.fetchToolsFromMCPServer();
      return tools;
    } catch (error) {
      console.error('Failed to get tools:', error);
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
    // First try semantic search using Chroma
    const semanticResults = await cacheService.findSimilarTools(capability, 10);
    
    if (semanticResults.length > 0) {
      return semanticResults;
    }
    
    // Fallback to traditional search if semantic search fails
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
              // Normalize tools with server info
              const normalizedTools = this.normalizeToolData(data.tools, server);
              allTools.push(...normalizedTools);
              
              // Cache the tools for this server
              await cacheService.setToolDiscovery(server, normalizedTools);
              
              // Store tool embeddings for semantic search
              for (const tool of normalizedTools) {
                await cacheService.storeToolEmbedding(tool);
              }
              
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

      return allTools;
      
    } catch (error) {
      console.error('Error fetching tools from MCP servers:', error);
      throw new Error('Failed to connect to any MCP server');
    }
  }

  private normalizeToolData(tools: any[], server: string): any[] {
    return tools.map(tool => ({
      name: tool.name || 'unknown_tool',
      description: tool.description || 'No description available',
      category: tool.category || 'general',
      capabilities: tool.capabilities || [],
      schema: tool.schema || {},
      server: server, // Add server info
      // Minimal summary for LLM (only name and description)
      summary: {
        name: tool.name || 'unknown_tool',
        description: tool.description || 'No description available'
      }
    }));
  }

  // Clear cache for all servers
  private async clearCache(): Promise<void> {
    for (const server of env.MCP_SERVERS) {
      await cacheService.clearServerCache(server);
    }
  }

  // Method to manually refresh cache (useful for testing)
  async refreshCache(): Promise<void> {
    await this.clearCache();
    await this.getAllTools();
  }

  // Validate tool schema structure
  validateToolSchema(tool: any): boolean {
    try {
      // Check required fields
      if (!tool.name || !tool.description) {
        console.warn(`Tool missing required fields: ${tool.name || 'unknown'}`);
        return false;
      }

      // Check if schema exists
      if (!tool.schema) {
        console.warn(`Tool ${tool.name} missing schema`);
        return false;
      }

      // Validate JSON Schema structure
      if (tool.schema.inputSchema) {
        const inputSchema = tool.schema.inputSchema;
        
        // Check if it's a valid object
        if (typeof inputSchema !== 'object' || inputSchema === null) {
          console.warn(`Tool ${tool.name} has invalid inputSchema type`);
          return false;
        }

        // Check if properties exist and is an object
        if (inputSchema.properties && typeof inputSchema.properties !== 'object') {
          console.warn(`Tool ${tool.name} has invalid properties in inputSchema`);
          return false;
        }

        // Check if required array is valid (if it exists)
        if (inputSchema.required && !Array.isArray(inputSchema.required)) {
          console.warn(`Tool ${tool.name} has invalid required array in inputSchema`);
          return false;
        }

        // Validate that required fields exist in properties
        if (inputSchema.required && inputSchema.properties) {
          for (const requiredField of inputSchema.required) {
            if (!inputSchema.properties[requiredField]) {
              console.warn(`Tool ${tool.name} has required field '${requiredField}' that doesn't exist in properties`);
              return false;
            }
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`Error validating schema for tool ${tool.name}:`, error);
      return false;
    }
  }

  // Refresh tool schema from specific server
  async refreshToolSchema(toolName: string, server: string): Promise<void> {
    try {
      // Clear cache for this specific server
      await cacheService.clearServerCache(server);
      
      // Fetch fresh tools from server
      const response = await fetch(`/api/mcp-tools?server=${server}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.tools) {
          const tool = data.tools.find((t: any) => t.name === toolName);
          if (tool) {
            // Normalize and cache the updated tool
            const normalizedTool = this.normalizeToolData([tool], server)[0];
            
            // Update Redis cache
            await cacheService.setToolSchema(toolName, server, normalizedTool.schema);
            
            // Update Chroma embedding
            await cacheService.storeToolEmbedding(normalizedTool);
            
            console.log(`Refreshed schema for tool ${toolName} from server ${server}`);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to refresh schema for tool ${toolName} from server ${server}:`, error);
      throw error;
    }
  }
}

export default DynamicDiscoveryInterface;
export { DynamicDiscovery };
