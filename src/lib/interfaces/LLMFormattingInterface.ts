import { ProviderFactory } from '@/services/providerFactory';
import { cacheService } from '@/services/cache';
import { Logger } from '@/app/utils/logger';

const logger = new Logger("LLMFormatting");

interface LLMFormattingInterface {
  formatResponseWithLLM(rawResponse: any, context: any, model?: string): Promise<string>;
  analyzeToolOutcome(toolName: string, parameters: any, model?: string): Promise<{
    userExplanation: string;
    safetyAnalysis: string;
  }>;
  selectTool(userRequest: string, availableTools: any[], model?: string): Promise<{
    selectedTool: string | null;
    reasoning: string;
  }>;
  analyzeModifications(
    userFeedback: string,
    originalTool: string,
    originalParameters: any,
    model?: string
  ): Promise<{
    changes: any;
    reasoning: string;
    newParameters: any;
  }>;
  getConversationalResponse(userRequest: string, model?: string): Promise<string>;
  decideIfToolsNeeded(userRequest: string, model?: string): Promise<{
    needsTools: boolean;
    reasoning: string;
  }>;
  analyzeRequest(userRequest: string, model?: string): Promise<{
    needsTools: boolean;
    response?: string;
    reasoning?: string;
  }>;
}

class LLMFormatting implements LLMFormattingInterface {
  private defaultProvider: string = 'openai';
  private defaultModel: string = 'auto';
  
  constructor() {
    // Enable garbage collection for memory monitoring
    if (process.env.NODE_ENV === 'development') {
      console.log('Memory monitoring enabled in development mode');
    }
  }

  private async getCachedLLMResponse(cacheKey: string): Promise<any | null> {
    return await cacheService.getLLMAnalysis(cacheKey);
  }

  private async setCachedLLMResponse(cacheKey: string, response: any): Promise<void> {
    await cacheService.setLLMAnalysis(cacheKey, response);
  }

  private generateCacheKey(operation: string, ...args: any[]): string {
    const argsString = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(':');
    return `${operation}:${argsString}`;
  }

  private async callLLM(prompt: string, model?: string): Promise<string> {
    try {
      console.log('Memory usage before LLM call:', {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
      });

      const provider = ProviderFactory.getProvider(this.defaultProvider);
      if (!provider) {
        throw new Error(`Provider ${this.defaultProvider} not available`);
      }

      const messages = [
        { 
          role: 'system' as const, 
          content: [{ type: 'text' as const, content: 'You are a helpful AI assistant that can answer general questions conversationally and also has access to tools when they are available. You can provide informative responses on any topic and use tools when external access is needed.' }],
          timestamp: new Date()
        },
        { 
          role: 'user' as const, 
          content: [{ type: 'text' as const, content: prompt }],
          timestamp: new Date()
        }
      ];

      const selectedModel = model || this.defaultModel;
      const response = await provider.sendMessage(messages, selectedModel);
      
      console.log('Memory usage after LLM call:', {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
      });

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('Garbage collection performed');
      }

      return typeof response[0]?.content === 'string' ? response[0].content : 'No response from LLM';
    } catch (error) {
      logger.error('LLM call failed:', error);
      throw new Error(`LLM operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async formatResponseWithLLM(rawResponse: any, context: any, model?: string): Promise<string> {
    const cacheKey = this.generateCacheKey('format_response', JSON.stringify(rawResponse), JSON.stringify(context));
    
    // Check cache first
    const cached = await this.getCachedLLMResponse(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = `
          Format this tool response for the user in a clear, helpful way.

          Original user request: ${context.originalUserRequest || 'Unknown'}
          Tool used: ${context.toolUsed || 'Unknown tool'}

          Raw tool response:
          ${JSON.stringify(rawResponse, null, 2)}

          Please format this response to be user-friendly and informative. Focus on what the user wanted to know and present the information clearly.
          `;

    const formattedResponse = await this.callLLM(prompt, model);
    
    // Cache the result
    await this.setCachedLLMResponse(cacheKey, formattedResponse);
    
    return formattedResponse;
  }



  async analyzeToolOutcome(toolName: string, parameters: any, model?: string): Promise<{
    userExplanation: string;
    safetyAnalysis: string;
  }> {
    const cacheKey = this.generateCacheKey('analyze_tool_outcome', toolName, JSON.stringify(parameters));
    
    const cached = await this.getCachedLLMResponse(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = `
        Analyze this tool operation for both user explanation and safety assessment.

        Tool: ${toolName}
        Parameters: ${JSON.stringify(parameters, null, 2)}

        Please provide two separate analyses:

        1. USER EXPLANATION: Explain what this tool will do in simple terms that a user can understand.

        2. SAFETY ANALYSIS: Assess potential risks including:
          - Will this tool write, modify, or delete data?
          - Will this tool access sensitive information?
          - Will this tool have system-level impact?
          - Any other potential risks?

        Format your response as:
        USER EXPLANATION: [explanation]
        SAFETY ANALYSIS: [safety assessment]
        `;

    const analysis = await this.callLLM(prompt, model);
    
    // Parse the response
    const userExplanationMatch = analysis.match(/USER EXPLANATION:\s*([\s\S]*?)(?=\nSAFETY ANALYSIS:|$)/);
    const safetyAnalysisMatch = analysis.match(/SAFETY ANALYSIS:\s*([\s\S]*?)$/);
    
    const result = {
      userExplanation: userExplanationMatch?.[1]?.trim() || 'Unable to analyze tool outcome',
      safetyAnalysis: safetyAnalysisMatch?.[1]?.trim() || 'Unable to assess safety'
    };
    
    await this.setCachedLLMResponse(cacheKey, result);
    
    return result;
  }

  async selectTool(userRequest: string, availableTools: any[], model?: string): Promise<{
    selectedTool: string | null;
    reasoning: string;
  }> {
    const cacheKey = this.generateCacheKey('select_tool', userRequest, JSON.stringify(availableTools));
    
    const cached = await this.getCachedLLMResponse(cacheKey);
    if (cached) {
      return cached;
    }

    const toolsList = availableTools.map(tool => 
      `- ${tool.name}: ${tool.description}`
    ).join('\n');

    const prompt = `
        Determine if this user request needs tools or can be answered conversationally.

        User Request: "${userRequest}"

        Available Tools:
        ${toolsList}

        IMPORTANT: Only select a tool if the request clearly requires external access (files, system, data, etc.).
        For general questions, conversation, or things you can answer with knowledge, respond with "none".

        Format your response as:
        SELECTED TOOL: [tool name or "none"]
        REASONING: [explanation of your decision]
        `;

    const selection = await this.callLLM(prompt, model);
    
    const selectedToolMatch = selection.match(/SELECTED TOOL:\s*([\s\S]*?)(?=\nREASONING:|$)/);
    const reasoningMatch = selection.match(/REASONING:\s*([\s\S]*?)$/);
    
    const result = {
      selectedTool: selectedToolMatch?.[1]?.trim() || null,
      reasoning: reasoningMatch?.[1]?.trim() || 'Unable to determine reasoning'
    };
    
    await this.setCachedLLMResponse(cacheKey, result);
    
    return result;
  }



  async analyzeModifications(
    userFeedback: string,
    originalTool: string,
    originalParameters: any,
    model?: string
  ): Promise<{
    changes: any;
    reasoning: string;
    newParameters: any;
  }> {
    const cacheKey = this.generateCacheKey('analyze_modifications', userFeedback, originalTool, JSON.stringify(originalParameters));
    
    const cached = await this.getCachedLLMResponse(cacheKey);
    if (cached) {
      return cached;
    }

        const prompt = `
           Analyze this user feedback to understand what modifications they want to the original tool operation.

           Original Tool: ${originalTool}
           Original Parameters: ${JSON.stringify(originalParameters, null, 2)}
           User Feedback: ${userFeedback}

           Please analyze what changes the user wants and provide the updated parameters.

           Format your response as:
           CHANGES: [JSON object describing the modifications needed]
           REASONING: [explanation of what the user wants changed and why]
           NEW_PARAMETERS: [JSON object with the updated parameters that should be used]
           `;

    const analysis = await this.callLLM(prompt, model);
    
    const changesMatch = analysis.match(/CHANGES:\s*(\{[\s\S]*?\})/);
    const reasoningMatch = analysis.match(/REASONING:\s*([\s\S]*?)(?=\nNEW_PARAMETERS:|$)/);
    const newParametersMatch = analysis.match(/NEW_PARAMETERS:\s*(\{[\s\S]*?\})/);
    
    let changes = {};
    let newParameters = originalParameters; // Default to original parameters
    
    try {
      if (changesMatch?.[1]) {
        changes = JSON.parse(changesMatch[1]);
      }
      if (newParametersMatch?.[1]) {
        newParameters = JSON.parse(newParametersMatch[1]);
      }
    } catch (error) {
      logger.error('Failed to parse modification data:', error);
    }
    
    const result = {
      changes,
      reasoning: reasoningMatch?.[1]?.trim() || 'Unable to analyze modifications',
      newParameters
    };
    
    await this.setCachedLLMResponse(cacheKey, result);
    
    return result;
  }

  async getConversationalResponse(userRequest: string, model?: string): Promise<string> {
    const cacheKey = this.generateCacheKey('conversational_response', userRequest);
    
    const cached = await this.getCachedLLMResponse(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = `
      Provide a helpful, conversational response to this user request. 
      Be friendly, informative, and engaging. Don't mention tools or technical details unless relevant.

      User Request: "${userRequest}"

      Respond naturally as if you're having a conversation with a friend.
    `;

    const response = await this.callLLM(prompt, model);
    
    await this.setCachedLLMResponse(cacheKey, response);
    
    return response;
  }

  async decideIfToolsNeeded(userRequest: string, model?: string): Promise<{
    needsTools: boolean;
    reasoning: string;
  }> {
    const cacheKey = this.generateCacheKey('decide_tools_needed', userRequest);
    
    const cached = await this.getCachedLLMResponse(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = `
      Determine if this user request requires external tools or if you can respond conversationally.

      User Request: "${userRequest}"

      Consider:
      - Can you answer this with general knowledge?
      - Does this require accessing files, databases, or external systems?
      - Is this a simple question that doesn't need tools?
      - Does this require real-time data or system access?

      Format your response as:
      NEEDS_TOOLS: [true/false]
      REASONING: [explanation of your decision]
    `;

    const decision = await this.callLLM(prompt, model);
    
    const needsToolsMatch = decision.match(/NEEDS_TOOLS:\s*(true|false)/i);
    const reasoningMatch = decision.match(/REASONING:\s*([\s\S]*?)$/);
    
    const result = {
      needsTools: needsToolsMatch?.[1]?.toLowerCase() === 'true',
      reasoning: reasoningMatch?.[1]?.trim() || 'Unable to determine if tools are needed'
    };
    
    await this.setCachedLLMResponse(cacheKey, result);
    
    return result;
  }

  async analyzeRequest(userRequest: string, model?: string): Promise<{
    needsTools: boolean;
    response?: string;
    reasoning?: string;
  }> {
    const cacheKey = this.generateCacheKey('analyze_request', userRequest);
    
    // Temporarily disable caching to test for memory leaks
    // const cached = await this.getCachedLLMResponse(cacheKey);
    // if (cached) {
    //   return cached;
    // }

    console.log('Memory usage before analyzeRequest:', {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    });

    const prompt = `
      Analyze this user request and either provide a direct response or indicate if tools are needed.

      User Request: "${userRequest}"

      If this is a general question, conversation, or something you can answer with knowledge:
      - Provide a helpful, conversational response directly
      - Be friendly and informative
      - Don't mention tools unless relevant

      If this requires external access (files, system, data, etc.):
      - Indicate that tools are needed
      - Explain what kind of access is required

      Format your response as:
      NEEDS_TOOLS: [true/false]
      RESPONSE: [your conversational response if no tools needed]
      REASONING: [explanation if tools are needed]
    `;

    const analysis = await this.callLLM(prompt, model);
    
    const needsToolsMatch = analysis.match(/NEEDS_TOOLS:\s*(true|false)/i);
    const responseMatch = analysis.match(/RESPONSE:\s*([\s\S]*?)(?=\nREASONING:|$)/);
    const reasoningMatch = analysis.match(/REASONING:\s*([\s\S]*?)$/);
    
    const needsTools = needsToolsMatch?.[1]?.toLowerCase() === 'true';
    
    const result = {
      needsTools,
      response: needsTools ? undefined : responseMatch?.[1]?.trim() || 'I\'m here to help!',
      reasoning: needsTools ? reasoningMatch?.[1]?.trim() : undefined
    };
    
    // Temporarily disable caching
    // await this.setCachedLLMResponse(cacheKey, result);
    
    console.log('Memory usage after analyzeRequest:', {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    });
    
    return result;
  }
}

export default LLMFormattingInterface;
export { LLMFormatting }; 