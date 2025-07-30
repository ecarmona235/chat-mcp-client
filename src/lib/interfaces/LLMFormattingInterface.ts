interface LLMFormattingInterface {
  formatResponseWithLLM(rawResponse: any, context: any): Promise<string>;
  enhanceResponse(response: string): Promise<string>;
  translateResponse(response: string, targetLanguage: string): Promise<string>;
  analyzeToolOutcome(toolName: string, parameters: any): Promise<{
    userExplanation: string;
    safetyAnalysis: string;
  }>;
  selectTool(userRequest: string, availableTools: any[]): Promise<{
    selectedTool: string | null;
    reasoning: string;
  }>;
  extractParameters(
    toolName: string, 
    toolSchema: any, 
    userRequest: string, 
    toolReasoning: string
  ): Promise<{
    parameters: any;
    confidence: number;
  }>;
  analyzeModifications(
    userFeedback: string,
    originalTool: string,
    originalParameters: any
  ): Promise<{
    changes: any;
    reasoning: string;
  }>;
}

export default LLMFormattingInterface; 