import { env } from "@/app/config/env";
import { cacheService } from "@/services/cache";

interface DynamicDiscoveryInterface {
  getAllTools(): Promise<any[]>;
  findToolsByCategory(category: string): Promise<any[]>;
  findToolsByCapability(capability: string): Promise<any[]>;
  getToolSummaries(): Promise<{name: string, description: string}[]>;
  validateToolSchema(tool: any): boolean;
  refreshToolSchema(toolName: string, server: string): Promise<void>;
  areToolsAvailable(): Promise<boolean>;
  getToolAvailabilityStatus(): Promise<{available: boolean, cachedTools: number, serverStatus: any}>;
}

class DynamicDiscovery implements DynamicDiscoveryInterface {
  // Error tracking for circuit breaker pattern
  private serverErrorCounts: Map<string, { count: number, lastError: number }> = new Map();
  private maxRetries = 3;
  private circuitBreakerTimeout = 60000; // 1 minute
  private lastDiscoveryAttempt = 0;
  private discoveryCooldown = 30000; // 30 seconds between discovery attempts

  constructor() {
    // Cache service is now handled by the dedicated CacheService
  }

  // Check if server is in circuit breaker state
  private isServerBlocked(server: string): boolean {
    const errorInfo = this.serverErrorCounts.get(server);
    if (!errorInfo) return false;
    
    const timeSinceLastError = Date.now() - errorInfo.lastError;
    return errorInfo.count >= this.maxRetries && timeSinceLastError < this.circuitBreakerTimeout;
  }

  // Record server error
  private recordServerError(server: string): void {
    const current = this.serverErrorCounts.get(server) || { count: 0, lastError: 0 };
    this.serverErrorCounts.set(server, {
      count: current.count + 1,
      lastError: Date.now()
    });
    console.log(`Recorded error for server ${server}. Total errors: ${current.count + 1}`);
  }

  // Reset server error count on success
  private resetServerError(server: string): void {
    this.serverErrorCounts.delete(server);
    console.log(`Reset error count for server ${server}`);
  }

  // Check if we should attempt discovery (cooldown)
  private shouldAttemptDiscovery(): boolean {
    const timeSinceLastAttempt = Date.now() - this.lastDiscoveryAttempt;
    return timeSinceLastAttempt > this.discoveryCooldown;
  }

  async getAllTools(): Promise<any[]> {
    try {
      // Check cooldown to prevent rapid retries
      if (!this.shouldAttemptDiscovery()) {
        console.log('Discovery attempt blocked by cooldown, returning cached tools');
        const cachedTools = await this.getCachedTools();
        if (cachedTools.length > 0) {
          return cachedTools;
        }
        return [];
      }

      this.lastDiscoveryAttempt = Date.now();

      // Try to get cached tools from all servers
      const allTools: any[] = [];
      
      for (const server of env.MCP_SERVERS) {
        // Skip servers in circuit breaker state
        if (this.isServerBlocked(server)) {
          console.log(`Skipping server ${server} due to circuit breaker`);
          continue;
        }

        const cachedTools = await cacheService.getToolDiscovery(server);
        if (cachedTools) {
          allTools.push(...cachedTools);
        }
      }
      
      // If we have cached tools, return them
      if (allTools.length > 0) {
        return allTools;
      }
      
      // Otherwise, fetch fresh tools with error handling
      const tools = await this.fetchToolsFromMCPServer();
      return tools;
    } catch (error) {
      console.error('Failed to get tools:', error);
      // Return cached tools as fallback
      return await this.getCachedTools();
    }
  }

  // Get cached tools from all servers
  private async getCachedTools(): Promise<any[]> {
    const allTools: any[] = [];
    for (const server of env.MCP_SERVERS) {
      const cachedTools = await cacheService.getToolDiscovery(server);
      if (cachedTools) {
        allTools.push(...cachedTools);
      }
    }
    return allTools;
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
      let successfulServers = 0;

      // Fetch tools from all MCP servers
      for (const server of mcpServers) {
        // Skip servers in circuit breaker state
        if (this.isServerBlocked(server)) {
          console.log(`Skipping server ${server} due to circuit breaker`);
          continue;
        }

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
              
              // Reset error count on success
              this.resetServerError(server);
              successfulServers++;
              
              console.log(`Successfully fetched ${data.count || data.tools.length} tools from MCP server: ${server}`);
            } else {
              console.warn(`MCP server ${server} returned invalid response format`);
              this.recordServerError(server);
            }
          } else {
            console.warn(`MCP server ${server} responded with status: ${response.status}`);
            this.recordServerError(server);
          }
        } catch (error) {
          console.warn(`Failed to fetch tools from MCP server ${server}:`, error);
          this.recordServerError(server);
          // Continue with other servers even if one fails
        }
      }

      // If no servers were successful, throw error
      if (successfulServers === 0) {
        throw new Error('No MCP servers responded successfully');
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

  // Check if any tools are available (cached or fresh)
  async areToolsAvailable(): Promise<boolean> {
    try {
      const tools = await this.getAllTools();
      return tools.length > 0;
    } catch (error) {
      console.error('Error checking tool availability:', error);
      return false;
    }
  }

  // Get detailed tool availability status
  async getToolAvailabilityStatus(): Promise<{available: boolean, cachedTools: number, serverStatus: any}> {
    const cachedTools = await this.getCachedTools();
    const serverStatus: any = {};
    
    // Check status of each server
    for (const server of env.MCP_SERVERS) {
      const isBlocked = this.isServerBlocked(server);
      const errorInfo = this.serverErrorCounts.get(server);
      
      serverStatus[server] = {
        blocked: isBlocked,
        errorCount: errorInfo?.count || 0,
        lastError: errorInfo?.lastError || null,
        hasCachedTools: cachedTools.some(tool => tool.server === server)
      };
    }
    
    return {
      available: cachedTools.length > 0,
      cachedTools: cachedTools.length,
      serverStatus
    };
  }
}

export default DynamicDiscoveryInterface;
export { DynamicDiscovery };
