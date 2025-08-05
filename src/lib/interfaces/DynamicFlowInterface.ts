import DynamicDiscoveryInterface from './DynamicDiscoveryInterface';
import DynamicExecutionInterface from './DynamicExecutionInterface';
import LLMFormattingInterface from './LLMFormattingInterface';
import TransparencyInterface from './TransparencyInterface';
import ConsentInterface from './ConsentInterface';
import { cacheService } from '@/services/cache';

class DynamicFlow {
  // Dependencies
  private discovery: DynamicDiscoveryInterface;
  private execution: DynamicExecutionInterface;
  private llmFormatting: LLMFormattingInterface;
  private transparency: TransparencyInterface;
  private consent: ConsentInterface;
  
  // Execution tracking
  private currentExecutionId: string | null = null;
  
  // TODO: Support multiple parallel executions
  // private activeExecutionIds: Set<string> = new Set();
  
  // Cache service is now handled by the dedicated CacheService

  constructor(
    discovery: DynamicDiscoveryInterface,
    execution: DynamicExecutionInterface,
    llmFormatting: LLMFormattingInterface,
    transparency: TransparencyInterface,
    consent: ConsentInterface
  ) {
    this.discovery = discovery;
    this.execution = execution;
    this.llmFormatting = llmFormatting;
    this.transparency = transparency;
    this.consent = consent;
  }

  // Helper methods
  private isStopCommand(userRequest: string): boolean {
    const stopCommands = ['stop', 'cancel', 'quit', 'exit'];
    return stopCommands.some(cmd => userRequest.toLowerCase().includes(cmd));
  }





  private async predictOutcome(toolName: string, parameters: any): Promise<string> {
    try {
      const analysis = await this.llmFormatting.analyzeToolOutcome(toolName, parameters);
      return analysis.userExplanation;
    } catch (error) {
      // Fallback if analysis fails
      return `Expected to execute ${toolName} with provided parameters`;
    }
  }

  private async assessRisks(toolName: string, parameters: any): Promise<{risks: string[], shouldBlock: boolean}> {
    try {
      const analysis = await this.llmFormatting.analyzeToolOutcome(toolName, parameters);
      
      const risks = [];
      let shouldBlock = false;
      
      if (analysis.safetyAnalysis.toLowerCase().includes('write') || 
          analysis.safetyAnalysis.toLowerCase().includes('modify')) {
        risks.push('This operation may modify your data');
        shouldBlock = true; // Block write/modify operations
      }
      
      if (analysis.safetyAnalysis.toLowerCase().includes('delete')) {
        risks.push('This operation may delete data');
        shouldBlock = true; // Block delete operations
      }
      
      if (analysis.safetyAnalysis.toLowerCase().includes('sensitive')) {
        risks.push('This operation may access sensitive information');
        shouldBlock = true; // Block sensitive data access
      }
      
      if (analysis.safetyAnalysis.toLowerCase().includes('system')) {
        risks.push('This operation may affect system settings');
        shouldBlock = true; // Block system settings changes
      }
      
      return {
        risks: risks.length > 0 ? risks : ['Low risk operation'],
        shouldBlock
      };
    } catch (error) {
      // Default to blocking if analysis fails
      return { risks: ['Unable to assess safety'], shouldBlock: true };
    }
  }



  private async executeModifiedPlan(modifiedPlan: any): Promise<string> {
    try {
      // 1. Analyze user feedback to understand what they want changed
      const modificationAnalysis = await this.llmFormatting.analyzeModifications(
        modifiedPlan.userFeedback,
        modifiedPlan.originalTool,
        modifiedPlan.originalParameters
      );
      
      // 2. Create new plan with modifications
      const newParameters = {
        ...modifiedPlan.originalParameters,
        ...modificationAnalysis.changes
      };
      
      // 3. Show user the modified plan with actual parameters
      const modificationExplanation = await this.transparency.explainAction(
        "Plan modified based on your feedback",
        {
          originalTool: modifiedPlan.originalTool,
          originalParameters: modifiedPlan.originalParameters,
          newParameters: newParameters,
          changes: modificationAnalysis.changes,
          reasoning: modificationAnalysis.reasoning
        }
      );
      
      // 4. Re-run safety checks on modified plan
      const riskAssessment = await this.assessRisks(
        modifiedPlan.originalTool, 
        newParameters
      );
      
      if (riskAssessment.shouldBlock) {
        return `❌ Modified plan blocked for safety reasons:\n${riskAssessment.risks.join('\n')}`;
      }
      
      // 5. Get consent for modified plan
      const consentResult = await this.consent.getConsent(
        modifiedPlan.originalTool,
        {
          explanation: modificationExplanation,
          plan: {
            tool: modifiedPlan.originalTool,
            parameters: newParameters,
            expectedOutcome: await this.predictOutcome(modifiedPlan.originalTool, newParameters),
            risks: riskAssessment.risks,
            alternatives: []
          },
          alternatives: []
        }
      );
      
      // 6. Handle user response to modified plan
      if (consentResult.approved) {
        return await this.executeDynamicFlow(
          modifiedPlan.originalTool,
          newParameters,
          modifiedPlan.originalRequest
        );
      } else if (consentResult.modificationRequested) {
        // Recursive modification - user wants further changes
        return await this.executeModifiedPlan({
          ...modifiedPlan,
          userFeedback: consentResult.userFeedback,
          originalParameters: newParameters // Use current as new original
        });
      } else {
        return await this.consent.handleRejection(consentResult.reason);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return `Failed to modify plan: ${errorMessage}. Please try rephrasing your request.`;
    }
  }

  async processUserRequest(originalUserRequest: string): Promise<string> {
    // Check for stop commands from the original human user
    if (this.isStopCommand(originalUserRequest)) {
      // Cancel current execution if one is running
      if (this.currentExecutionId) {
        await this.execution.cancelExecution(this.currentExecutionId);
        this.currentExecutionId = null;
      }
      return "Stopped processing. How can I help you?";
    }

    // Step 1: Discover relevant tools using semantic search
    const availableTools = await this.discovery.findToolsByCapability(originalUserRequest);
    
    // Step 2: Select best tool using LLM
    const toolSelection = await this.llmFormatting.selectTool(originalUserRequest, availableTools);
    
    if (!toolSelection.selectedTool) {
      return "I couldn't find a suitable tool for your request. Please try rephrasing your request.";
    }

    // Note: Parameter extraction is handled by the LLM that calls this method
    // The parameters are passed in as llmExtractedParameters

    // Step 4: Execute the dynamic flow with selected tool and parameters
    return await this.executeDynamicFlow(
      toolSelection.selectedTool,
      {}, // Parameters will be extracted by the calling LLM
      originalUserRequest
    );
  }



  async executeDynamicFlow(
    llmSelectedTool: string,
    llmExtractedParameters: any,
    originalUserRequest: string
  ): Promise<string> {
    // Check for stop commands from the original human user
    if (this.isStopCommand(originalUserRequest)) {
      // Cancel current execution if one is running
      if (this.currentExecutionId) {
        await this.execution.cancelExecution(this.currentExecutionId);
        this.currentExecutionId = null;
      }
      return "Stopped processing. How can I help you?";
    }
    
    // Step 1: Create Execution Plan
    const expectedOutcome = await this.predictOutcome(llmSelectedTool, llmExtractedParameters);
    const riskAssessment = await this.assessRisks(llmSelectedTool, llmExtractedParameters);
    
    // Step 2: Handle Consent Based on Risk Level
    if (riskAssessment.shouldBlock) {
      // High risk operation - require consent
      const consentExplanation = this.consent.explainConsentRequest(
        expectedOutcome,
        riskAssessment.risks
      );
      
      const consentResult = await this.consent.getConsent(
        llmSelectedTool,
        {
          explanation: consentExplanation,
          plan: {
            tool: llmSelectedTool,
            parameters: llmExtractedParameters,
            expectedOutcome: expectedOutcome,
            risks: riskAssessment.risks
          }
        }
      );
      
      // Handle consent response
      if (consentResult.approved) {
        // User approved - proceed with execution
        const result = await this.execution.executeTool(llmSelectedTool, llmExtractedParameters);
        this.currentExecutionId = result.executionId;
        const response = await this.llmFormatting.formatResponseWithLLM(result.result, { originalUserRequest, toolUsed: llmSelectedTool });
        this.currentExecutionId = null; // Clear after completion
        return response;
      } else if (consentResult.modificationRequested) {
        // User wants modifications
        const modifiedPlan = await this.consent.handleModificationRequest(consentResult.userFeedback);
        return await this.executeModifiedPlan(modifiedPlan);
      } else {
        // User rejected
        return await this.consent.handleRejection(consentResult.reason);
      }
    } else {
      // Low risk operation - proceed directly without consent
      const result = await this.execution.executeTool(llmSelectedTool, llmExtractedParameters);
      this.currentExecutionId = result.executionId;
      const response = await this.llmFormatting.formatResponseWithLLM(result.result, { originalUserRequest, toolUsed: llmSelectedTool });
      this.currentExecutionId = null; // Clear after completion
      return response;
    }
  }
  }