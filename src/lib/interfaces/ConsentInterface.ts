interface ConsentInterface {
  getConsent(toolName: string, plan: any): Promise<any>;
  handleModificationRequest(userFeedback: string): Promise<any>;
  handleRejection(reason: string): Promise<string>;
}

export default ConsentInterface;
