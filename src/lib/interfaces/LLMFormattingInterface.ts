import { ProviderFactory } from '@/services/providerFactory';
import { cacheService } from '@/services/cache';
import { Logger } from '@/app/utils/logger';

const logger = new Logger("LLMFormatting");

interface LLMFormattingInterface {
  formatResponseWithLLM(rawResponse: any, context: any): Promise<string>;
  analyzeToolOutcome(toolName: string, parameters: any): Promise<{
    userExplanation: string;
    safetyAnalysis: string;
  }>;
  selectTool(userRequest: string, availableTools: any[]): Promise<{
    selectedTool: string | null;
    reasoning: string;
  }>;
  analyzeModifications(
    userFeedback: string,
    originalTool: string,
    originalParameters: any
  ): Promise<{
    changes: any;
    reasoning: string;
    newParameters: any;
  }>;
}

class LLMFormatting implements LLMFormattingInterface {
  private defaultProvider: string = 'openai';
  private defaultModel: string = 'auto';

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

  private async callLLM(prompt: string): Promise<string> {
    try {
      const provider = ProviderFactory.getProvider(this.defaultProvider);
      if (!provider) {
        throw new Error(`Provider ${this.defaultProvider} not available`);
      }

      const messages = [
        { 
          role: 'system' as const, 
          content: [{ type: 'text' as const, content: 'You are a helpful AI assistant that formats responses and analyzes tools.' }],
          timestamp: new Date()
        },
        { 
          role: 'user' as const, 
          content: [{ type: 'text' as const, content: prompt }],
          timestamp: new Date()
        }
      ];

      const response = await provider.sendMessage(messages, this.defaultModel);
      return typeof response[0]?.content === 'string' ? response[0].content : 'No response from LLM';
    } catch (error) {
      logger.error('LLM call failed:', error);
      throw new Error(`LLM operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async formatResponseWithLLM(rawResponse: any, context: any): Promise<string> {
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

    const formattedResponse = await this.callLLM(prompt);
    
    // Cache the result
    await this.setCachedLLMResponse(cacheKey, formattedResponse);
    
    return formattedResponse;
  }



  async analyzeToolOutcome(toolName: string, parameters: any): Promise<{
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

    const analysis = await this.callLLM(prompt);
    
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

  async selectTool(userRequest: string, availableTools: any[]): Promise<{
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
        Select the best tool for this user request from the available options.

        User Request: ${userRequest}

        Available Tools:
        ${toolsList}

        Please select the most appropriate tool and explain your reasoning. If no tool is suitable, respond with "none".

        Format your response as:
        SELECTED TOOL: [tool name or "none"]
        REASONING: [explanation of why this tool was chosen]
        `;

    const selection = await this.callLLM(prompt);
    
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
    originalParameters: any
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

    const analysis = await this.callLLM(prompt);
    
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
}

export default LLMFormattingInterface;
export { LLMFormatting }; 