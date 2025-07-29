import DynamicDiscoveryInterface from './DynamicDiscoveryInterface';
import DynamicSchemaInterface from './DynamicSchemaInterface';
import DynamicExecutionInterface from './DynamicExecutionInterface';
import DynamicResponseInterface from './DynamicResponseInterface';
import LLMFormattingInterface from './LLMFormattingInterface';
import ControlFlowInterface from './ControlFlowInterface';
import TransparencyInterface from './TransparencyInterface';
import ConsentInterface from './ConsentInterface';

class DynamicFlow {
  // Dependencies
  private discovery: DynamicDiscoveryInterface;
  private schema: DynamicSchemaInterface;
  private execution: DynamicExecutionInterface;
  private response: DynamicResponseInterface;
  private llmFormatting: LLMFormattingInterface;
  private controlFlow: ControlFlowInterface;
  private transparency: TransparencyInterface;
  private consent: ConsentInterface;

  constructor(
    discovery: DynamicDiscoveryInterface,
    schema: DynamicSchemaInterface,
    execution: DynamicExecutionInterface,
    response: DynamicResponseInterface,
    llmFormatting: LLMFormattingInterface,
    controlFlow: ControlFlowInterface,
    transparency: TransparencyInterface,
    consent: ConsentInterface
  ) {
    this.discovery = discovery;
    this.schema = schema;
    this.execution = execution;
    this.response = response;
    this.llmFormatting = llmFormatting;
    this.controlFlow = controlFlow;
    this.transparency = transparency;
    this.consent = consent;
  }

  // Helper methods
  private isStopCommand(userRequest: string): boolean {
    const stopCommands = ['stop', 'cancel', 'quit', 'exit'];
    return stopCommands.some(cmd => userRequest.toLowerCase().includes(cmd));
  }

  private predictOutcome(toolName: string, parameters: any): string {
    // TODO: Implement outcome prediction
    return `Expected to execute ${toolName} with provided parameters`;
  }

  private assessRisks(toolName: string, parameters: any): string[] {
    // TODO: Implement risk assessment
    return ['Low risk operation'];
  }

  private explainWhatToolWillDo(toolName: string, parameters: any): string {
    // TODO: Implement tool explanation
    return `This tool will perform operations related to ${toolName}`;
  }

  private async executeModifiedPlan(modifiedPlan: any): Promise<string> {
    // TODO: Implement modified plan execution
    return 'Executing modified plan...';
  }

    async executeDynamicFlow(
    llmSelectedTool: string,
    llmExtractedParameters: any,
    originalUserRequest: string
  ): Promise<string> {
    // Check for stop commands from the original human user
    if (this.isStopCommand(originalUserRequest)) {
      await this.controlFlow.stopAllProcessing("User requested stop");
      return "Stopped processing. How can I help you?";
    }
    
    // Step 1: Get Tool Schema (LLM already selected the tool)
    const toolSchema = await this.schema.getToolSchema(llmSelectedTool);
    
    // Step 2: Create Execution Plan
    const executionPlan = {
      tool: llmSelectedTool,
      parameters: llmExtractedParameters,
      expectedOutcome: this.predictOutcome(llmSelectedTool, llmExtractedParameters),
      risks: this.assessRisks(llmSelectedTool, llmExtractedParameters),
      alternatives: []
    };
    
    // Step 3: Show Plan to User
    const planExplanation = await this.transparency.explainAction(
      `I'm about to execute ${llmSelectedTool}`,
      {
        tool: llmSelectedTool,
        parameters: llmExtractedParameters,
        whatItWillDo: this.explainWhatToolWillDo(llmSelectedTool, llmExtractedParameters),
        whyThisTool: `Selected by LLM based on your request: "${originalUserRequest}"`
      }
    );
    
    // Step 4: Get User Consent
    const consentResult = await this.consent.getConsent(
      llmSelectedTool,
      {
        explanation: planExplanation,
        plan: executionPlan,
        alternatives: executionPlan.alternatives
      }
    );
    
    // Step 5: Handle User Response
    if (consentResult.approved) {
      // Execute the plan
      const result = await this.execution.executeTool(llmSelectedTool, llmExtractedParameters);
      const rawResponse = await this.response.getToolResponse(result.executionId);
      return await this.llmFormatting.formatResponseWithLLM(rawResponse, { originalUserRequest, toolUsed: llmSelectedTool });
      
    } else if (consentResult.modificationRequested) {
      // Handle modification request
      const modifiedPlan = await this.consent.handleModificationRequest(consentResult.userFeedback);
      return await this.executeModifiedPlan(modifiedPlan);
      
    } else {
      // Handle rejection
      return await this.consent.handleRejection(consentResult.reason);
    }
    }
  }