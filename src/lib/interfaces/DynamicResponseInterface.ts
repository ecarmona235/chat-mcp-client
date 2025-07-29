interface DynamicResponseInterface {
  getToolResponse(executionId: string): Promise<any>;
  formatResponse(response: any): Promise<string>;
  handleError(error: any): Promise<string>;
}

export default DynamicResponseInterface;
