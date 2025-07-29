interface LLMFormattingInterface {
  formatResponseWithLLM(rawResponse: any, context: any): Promise<string>;
  enhanceResponse(response: string): Promise<string>;
  translateResponse(response: string, targetLanguage: string): Promise<string>;
}

export default LLMFormattingInterface; 