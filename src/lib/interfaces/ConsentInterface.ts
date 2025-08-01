interface ConsentInterface {
  getConsent(toolName: string, plan: any): Promise<any>;
  handleModificationRequest(userFeedback: string): Promise<any>;
  handleRejection(reason: string): Promise<string>;
  
  // New methods for risk-based consent
  explainConsentRequest(operation: string, risks: string[]): string;
}

class Consent implements ConsentInterface {
  // Implementation for consent request
  async getConsent(toolName: string, plan: any): Promise<{
    approved: boolean;
    modificationRequested?: boolean;
    userFeedback?: string;
    reason?: string;
  }> {
    // TODO: Implement actual consent UI
    // This method should:
    // 1. Display the consent request to the user
    // 2. Wait for user response (Allow/Deny/Modify)
    // 3. Return the appropriate response object
    
    // Placeholder - replace with actual UI implementation
    throw new Error('Consent UI not implemented - replace with actual user interface');
  }

  // Implementation for handling modification requests
  async handleModificationRequest(userFeedback: string): Promise<{
    originalTool: string;
    originalParameters: any;
    userFeedback: string;
    originalRequest: string;
  }> {
    // Parse user feedback to understand what modifications are requested
    // This creates a structured modification plan that can be processed by executeModifiedPlan
    
    const modificationPlan = {
      originalTool: "unknown", // Will be set by DynamicFlow
      originalParameters: {}, // Will be set by DynamicFlow
      userFeedback: userFeedback,
      originalRequest: "unknown" // Will be set by DynamicFlow
    };
    
    return modificationPlan;
  }

  // Implementation for handling rejections
  async handleRejection(reason: string): Promise<string> {
    // Log the rejection for audit purposes
    console.log(`[CONSENT REJECTED] Reason: ${reason}`);
    
    // Provide simple, helpful response
    return "The action was cancelled. Let me know if there's anything else I can help you with!";
  }

  // Implementation for new risk-based consent methods
  explainConsentRequest(operation: string, risks: string[]): string {
    let explanation = `⚠️ **Operation Request**\n\n`;
    explanation += `**What will happen:**\n${operation}\n\n`;
    
    if (risks.length > 0) {
      explanation += `**Potential Risks:**\n`;
      risks.forEach(risk => {
        explanation += `• ${risk}\n`;
      });
      explanation += `\n`;
    }
    
    explanation += `**Your Options:**\n`;
    explanation += `• **Allow**: Proceed with the operation\n`;
    explanation += `• **Deny**: Cancel the operation\n\n`;
    explanation += `Please review the risks carefully before proceeding.`;
    
    return explanation;
  }


}

export default ConsentInterface;
export { Consent };
