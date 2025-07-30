import Redis from 'ioredis';
import { ChromaClient, Collection } from 'chromadb';

// Cache configuration
const CACHE_TTL = {
  TOOL_SCHEMA: 60 * 60,        // 1 hour
  LLM_ANALYSIS: 30 * 60,       // 30 minutes
  SERVER_STATUS: 5 * 60,        // 5 minutes
  TOOL_DISCOVERY: 10 * 60,     // 10 minutes
  USER_SESSION: 24 * 60 * 60   // 24 hours
};

// Redis key prefixes for organization
const REDIS_KEYS = {
  TOOL_SCHEMA: 'tool:schema:',
  LLM_ANALYSIS: 'llm:analysis:',
  SERVER_STATUS: 'server:status:',
  TOOL_DISCOVERY: 'tool:discovery:',
  USER_SESSION: 'user:session:',
  CACHE_TIMESTAMP: 'cache:timestamp:'
};

export class CacheService {
  private redis: Redis;
  private chroma: ChromaClient;
  private toolsCollection: Collection | null = null;

  constructor() {
    // Initialize Redis connection
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    // Initialize Chroma client
    this.chroma = new ChromaClient({
      path: process.env.CHROMA_URL || 'http://localhost:8000'
    });

    // Initialize tools collection
    this.initializeChromaCollection();
  }

  private async initializeChromaCollection(): Promise<void> {
    try {
      // Get or create the tools collection
      this.toolsCollection = await this.chroma.getOrCreateCollection({
        name: 'tools',
        metadata: {
          description: 'Tool descriptions and capabilities for semantic search'
        }
      });
      console.log('✅ Chroma tools collection initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Chroma collection:', error);
      this.toolsCollection = null;
    }
  }

  // ===== REDIS METHODS (Fast Access) =====

  /**
   * Store tool schema in Redis for fast access
   */
  async setToolSchema(toolName: string, server: string, schema: any): Promise<void> {
    const key = `${REDIS_KEYS.TOOL_SCHEMA}${server}:${toolName}`;
    await this.redis.setex(key, CACHE_TTL.TOOL_SCHEMA, JSON.stringify(schema));
  }

  /**
   * Get tool schema from Redis
   */
  async getToolSchema(toolName: string, server: string): Promise<any | null> {
    const key = `${REDIS_KEYS.TOOL_SCHEMA}${server}:${toolName}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Store LLM analysis results
   */
  async setLLMAnalysis(cacheKey: string, analysis: any): Promise<void> {
    const key = `${REDIS_KEYS.LLM_ANALYSIS}${cacheKey}`;
    await this.redis.setex(key, CACHE_TTL.LLM_ANALYSIS, JSON.stringify(analysis));
  }

  /**
   * Get LLM analysis results
   */
  async getLLMAnalysis(cacheKey: string): Promise<any | null> {
    const key = `${REDIS_KEYS.LLM_ANALYSIS}${cacheKey}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Store server status
   */
  async setServerStatus(server: string, status: any): Promise<void> {
    const key = `${REDIS_KEYS.SERVER_STATUS}${server}`;
    await this.redis.setex(key, CACHE_TTL.SERVER_STATUS, JSON.stringify(status));
  }

  /**
   * Get server status
   */
  async getServerStatus(server: string): Promise<any | null> {
    const key = `${REDIS_KEYS.SERVER_STATUS}${server}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Store tool discovery results
   */
  async setToolDiscovery(server: string, tools: any[]): Promise<void> {
    const key = `${REDIS_KEYS.TOOL_DISCOVERY}${server}`;
    await this.redis.setex(key, CACHE_TTL.TOOL_DISCOVERY, JSON.stringify(tools));
  }

  /**
   * Get tool discovery results
   */
  async getToolDiscovery(server: string): Promise<any[] | null> {
    const key = `${REDIS_KEYS.TOOL_DISCOVERY}${server}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Clear cache for a specific server
   */
  async clearServerCache(server: string): Promise<void> {
    const pattern = `${REDIS_KEYS.TOOL_SCHEMA}${server}:*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
    
    // Also clear discovery cache
    await this.redis.del(`${REDIS_KEYS.TOOL_DISCOVERY}${server}`);
    await this.redis.del(`${REDIS_KEYS.SERVER_STATUS}${server}`);
  }

  /**
   * Set cache timestamp for version checking
   */
  async setCacheTimestamp(server: string, timestamp: number): Promise<void> {
    const key = `${REDIS_KEYS.CACHE_TIMESTAMP}${server}`;
    await this.redis.set(key, timestamp.toString());
  }

  /**
   * Get cache timestamp for version checking
   */
  async getCacheTimestamp(server: string): Promise<number | null> {
    const key = `${REDIS_KEYS.CACHE_TIMESTAMP}${server}`;
    const data = await this.redis.get(key);
    return data ? parseInt(data) : null;
  }

  // ===== CHROMA METHODS (Semantic Search) =====

  /**
   * Store tool embedding for semantic search
   */
  async storeToolEmbedding(tool: any): Promise<void> {
    if (!this.toolsCollection) {
      console.warn('Chroma collection not initialized, skipping embedding storage');
      return;
    }

    try {
      // Create a unique ID for the tool
      const toolId = `${tool.server}:${tool.name}`;
      
      // Create embedding from tool description and capabilities
      const embedding = await this.createToolEmbedding(tool);
      
      // Store in Chroma
      await this.toolsCollection.add({
        ids: [toolId],
        embeddings: [embedding],
        metadatas: [{
          name: tool.name,
          description: tool.description,
          server: tool.server,
          category: tool.category || 'general',
          capabilities: JSON.stringify(tool.capabilities || [])
        }],
        documents: [tool.description]
      });
    } catch (error) {
      console.error('Failed to store tool embedding:', error);
    }
  }

  /**
   * Find similar tools using semantic search
   */
  async findSimilarTools(query: string, limit: number = 10): Promise<any[]> {
    if (!this.toolsCollection) {
      console.warn('Chroma collection not initialized, returning empty results');
      return [];
    }

    try {
      // Create embedding for the query
      const queryEmbedding = await this.createQueryEmbedding(query);
      
      // Search in Chroma
      const results = await this.toolsCollection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit
      });

      // Transform results to usable format
      return results.metadatas?.[0]?.map((metadata: any, index: number) => ({
        name: metadata.name,
        description: metadata.description,
        server: metadata.server,
        category: metadata.category,
        capabilities: JSON.parse(metadata.capabilities || '[]'),
        distance: results.distances?.[0]?.[index] || 0
      })) || [];
    } catch (error) {
      console.error('Failed to find similar tools:', error);
      return [];
    }
  }

  /**
   * Store user request pattern for learning
   */
  async storeUserRequestPattern(request: string, selectedTool: string, success: boolean): Promise<void> {
    if (!this.toolsCollection) {
      return;
    }

    try {
      const requestId = `request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const embedding = await this.createQueryEmbedding(request);
      
      await this.toolsCollection.add({
        ids: [requestId],
        embeddings: [embedding],
        metadatas: [{
          type: 'user_request',
          request: request,
          selectedTool: selectedTool,
          success: success.toString(),
          timestamp: Date.now().toString()
        }],
        documents: [request]
      });
    } catch (error) {
      console.error('Failed to store user request pattern:', error);
    }
  }

  // ===== HELPER METHODS =====

  /**
   * Create embedding for tool description and capabilities
   * Note: This is a simplified embedding. In production, you'd use a proper embedding model
   */
  private async createToolEmbedding(tool: any): Promise<number[]> {
    // Simple hash-based embedding for now
    // In production, use OpenAI embeddings or similar
    const text = `${tool.name} ${tool.description} ${(tool.capabilities || []).join(' ')}`;
    return this.simpleHashEmbedding(text);
  }

  /**
   * Create embedding for user query
   */
  private async createQueryEmbedding(query: string): Promise<number[]> {
    // Simple hash-based embedding for now
    return this.simpleHashEmbedding(query);
  }

  /**
   * Simple hash-based embedding (placeholder for proper embedding model)
   */
  private simpleHashEmbedding(text: string): number[] {
    // This is a placeholder - in production, use proper embeddings
    const hash = text.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    // Create a simple 128-dimensional vector
    const embedding = new Array(128).fill(0);
    for (let i = 0; i < 128; i++) {
      embedding[i] = Math.sin(hash + i) * 0.1;
    }
    
    return embedding;
  }

  /**
   * Health check for both Redis and Chroma
   */
  async healthCheck(): Promise<{redis: boolean, chroma: boolean}> {
    const redisHealth = await this.redis.ping().then(() => true).catch(() => false);
    const chromaHealth = this.toolsCollection !== null;
    
    return { redis: redisHealth, chroma: chromaHealth };
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.redis.quit();
    // Chroma client doesn't need explicit closing
  }
}

// Export singleton instance
export const cacheService = new CacheService(); 