interface ControlFlowInterface {
  stopAllProcessing(reason: string): Promise<void>;
  pauseExecution(): Promise<void>;
  resumeExecution(): Promise<void>;
  getFlowStatus(): Promise<any>;
}

export default ControlFlowInterface;
