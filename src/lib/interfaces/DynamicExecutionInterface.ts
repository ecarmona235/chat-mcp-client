interface DynamicExecutionInterface {
  executeTool(toolName: string, parameters: any, server?: string): Promise<any>;
  cancelExecution(executionId: string): Promise<void>;
  getExecutionStatus(executionId: string): Promise<any>;
}

class DynamicExecution implements DynamicExecutionInterface {
  private redis: any; // Will be injected
  private cacheService: any; // Will be injected

  constructor(redis: any, cacheService: any) {
    this.redis = redis;
    this.cacheService = cacheService;
  }

  // Generate unique execution ID
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  // Execute a tool with given parameters
  async executeTool(toolName: string, parameters: any, server: string = 'default'): Promise<{
    executionId: string;
    status: 'running' | 'completed' | 'failed';
    result?: any;
    error?: string;
  }> {
    const executionId = this.generateExecutionId();
    
    try {
      // Check cache first for identical tool calls
      const cacheKey = `tool_result:${toolName}:${JSON.stringify(parameters)}`;
      const cachedResult = await this.cacheService.getToolSchema(cacheKey);
      
      if (cachedResult) {
        return {
          executionId,
          status: 'completed',
          result: cachedResult
        };
      }

      // Call MCP server via API
      const response = await fetch('/api/mcp-call-tool', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toolName,
          parameters,
          server
        })
      });

      if (!response.ok) {
        // Server error - MCP server down
        console.log(`[EXECUTION FAILED] Server error for tool ${toolName}: MCP server unavailable`);
        
        return {
          executionId,
          status: 'failed' as const,
          error: 'MCP server is currently unavailable'
        };
      }

      const result = await response.json();
      
      if (!result.success) {
        // Tool execution failed
        console.log(`[EXECUTION FAILED] Tool ${toolName} failed: ${result.error || 'Unknown error'}`);
        
        return {
          executionId,
          status: 'failed' as const,
          error: result.error || 'Tool execution failed'
        };
      }

      // Success - cache result with 1-hour TTL
      await this.cacheService.setToolSchema(cacheKey, result.result, 3600);
      
      const successData = {
        executionId,
        status: 'completed' as const,
        result: result.result
      };
      
      // Store success in Redis with 1-hour TTL
      await this.redis.setex(`execution:${executionId}:completed`, 3600, JSON.stringify(successData));
      
      return successData;

    } catch (error) {
      // Network or other error
      console.log(`[EXECUTION FAILED] Network error for tool ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        executionId,
        status: 'failed' as const,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  // Cancel an ongoing execution
  async cancelExecution(executionId: string): Promise<void> {
    // Mark execution as cancelled in Redis
    const cancelledData = {
      executionId,
      status: 'cancelled' as const,
      cancelledAt: new Date().toISOString()
    };
    
    await this.redis.setex(`execution:${executionId}:cancelled`, 3600, JSON.stringify(cancelledData));
  }

  // Get execution status and results
  async getExecutionStatus(executionId: string): Promise<{
    status: 'running' | 'completed' | 'cancelled' | 'not_found';
    result?: any;
    error?: string;
    executionId: string;
  }> {
    // Check for different execution states (removed 'failed' since we don't store failed executions)
    const states = ['running', 'completed', 'cancelled'];
    
    for (const state of states) {
      const data = await this.redis.get(`execution:${executionId}:${state}`);
      if (data) {
        const parsedData = JSON.parse(data);
        return {
          status: parsedData.status,
          result: parsedData.result,
          error: parsedData.error,
          executionId: parsedData.executionId
        };
      }
    }
    
    // Execution not found
    return {
      status: 'not_found',
      executionId
    };
  }
}

export default DynamicExecutionInterface;
export { DynamicExecution };
