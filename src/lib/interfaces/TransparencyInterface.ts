interface TransparencyInterface {
  explainAction(action: string, details: any): Promise<string>;
  showReasoning(reasoning: string): Promise<void>;
  logDecision(decision: any): Promise<void>;
}

export default TransparencyInterface;
