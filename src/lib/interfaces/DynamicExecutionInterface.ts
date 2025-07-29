interface DynamicExecutionInterface {
  executeTool(toolName: string, parameters: any): Promise<any>;
  cancelExecution(executionId: string): Promise<void>;
  getExecutionStatus(executionId: string): Promise<any>;
}

export default DynamicExecutionInterface;
