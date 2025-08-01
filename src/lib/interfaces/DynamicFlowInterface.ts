import DynamicDiscoveryInterface from './DynamicDiscoveryInterface';
import DynamicExecutionInterface from './DynamicExecutionInterface';
import LLMFormattingInterface from './LLMFormattingInterface';
import ControlFlowInterface from './ControlFlowInterface';
import TransparencyInterface from './TransparencyInterface';
import ConsentInterface from './ConsentInterface';
import { cacheService } from '@/services/cache';

class DynamicFlow {
  // Dependencies
  private discovery: DynamicDiscoveryInterface;
  private execution: DynamicExecutionInterface;
  private llmFormatting: LLMFormattingInterface;
  private controlFlow: ControlFlowInterface;
  private transparency: TransparencyInterface;
  private consent: ConsentInterface;
  
  // Cache service is now handled by the dedicated CacheService

  constructor(
    discovery: DynamicDiscoveryInterface,
    execution: DynamicExecutionInterface,
    llmFormatting: LLMFormattingInterface,
    controlFlow: ControlFlowInterface,
    transparency: TransparencyInterface,
    consent: ConsentInterface
  ) {
    this.discovery = discovery;
    this.execution = execution;
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

  private async getOrCreateToolAnalysis(toolName: string, parameters: any): Promise<{
    userExplanation: string;
    safetyAnalysis: string;
  }> {
    // Create cache key from tool name and parameters
    const cacheKey = `${toolName}:${JSON.stringify(parameters)}`;
    
    // Check if analysis is already cached in Redis
    const cachedAnalysis = await cacheService.getLLMAnalysis(cacheKey);
    if (cachedAnalysis) {
      return cachedAnalysis;
    }
    
    // Get analysis from LLM
    try {
      const analysis = await this.llmFormatting.analyzeToolOutcome(toolName, parameters);
      
      // Cache the result in Redis
      await cacheService.setLLMAnalysis(cacheKey, analysis);
      
      return analysis;
    } catch (error) {
      // Fallback if LLM analysis fails
      const fallbackAnalysis = {
        userExplanation: `Expected to execute ${toolName} with provided parameters`,
        safetyAnalysis: 'Unable to analyze safety - blocking operation'
      };
      
      // Cache the fallback result in Redis
      await cacheService.setLLMAnalysis(cacheKey, fallbackAnalysis);
      
      return fallbackAnalysis;
    }
  }

  private async getOrCreateToolDiscovery(): Promise<any[]> {
    // Get fresh tools (already cached by DynamicDiscovery)
    return await this.discovery.getAllTools();
  }

  private async getOrCreateToolSelection(userRequest: string, availableTools: any[]): Promise<{
    tool: string | null;
    reasoning: string;
  }> {
    // Create cache key from user request and tools hash
    const toolsHash = JSON.stringify(availableTools.map(t => ({name: t.name, description: t.description})));
    const cacheKey = `tool_selection:${userRequest}:${toolsHash}`;
    
    // Check if selection is already cached in Redis
    const cachedSelection = await cacheService.getLLMAnalysis(cacheKey);
    if (cachedSelection) {
      return cachedSelection;
    }
    
    // Get selection from LLM
    try {
      const selection = await this.llmFormatting.selectTool(userRequest, availableTools);
      const result = {
        tool: selection.selectedTool,
        reasoning: selection.reasoning
      };
      
      // Cache the result in Redis
      await cacheService.setLLMAnalysis(cacheKey, result);
      
      return result;
    } catch (error) {
      const fallback = {
        tool: null,
        reasoning: 'Failed to select tool'
      };
      
      // Cache the fallback result in Redis
      await cacheService.setLLMAnalysis(cacheKey, fallback);
      
      return fallback;
    }
  }

  private async getOrCreateParameterExtraction(
    toolName: string, 
    userRequest: string, 
    toolReasoning: string
  ): Promise<{
    parameters: any;
    confidence: number;
  }> {
    // Create cache key
    const cacheKey = `parameter_extraction:${toolName}:${userRequest}:${toolReasoning}`;
    
    // Check if extraction is already cached in Redis
    const cachedExtraction = await cacheService.getLLMAnalysis(cacheKey);
    if (cachedExtraction) {
      return cachedExtraction;
    }
    
    // Get schema (cached)
    const toolSchema = await this.getOrCreateSchema(toolName);
    
    // Get extraction from LLM
    try {
      const extraction = await this.llmFormatting.extractParameters(
        toolName,
        toolSchema,
        userRequest,
        toolReasoning
      );
      
      // Cache the result in Redis
      await cacheService.setLLMAnalysis(cacheKey, extraction);
      
      return extraction;
    } catch (error) {
      const fallback = {
        parameters: {},
        confidence: 0
      };
      
      // Cache the fallback result in Redis
      await cacheService.setLLMAnalysis(cacheKey, fallback);
      
      return fallback;
    }
  }

  private async getOrCreateSchema(toolName: string): Promise<any> {
    // Get all tools and find the schema for the specific tool
    const allTools = await this.discovery.getAllTools();
    const tool = allTools.find(t => t.name === toolName);
    
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    
    return tool.schema;
  }

  private async getOrCreateModificationAnalysis(
    userFeedback: string,
    originalTool: string,
    originalParameters: any
  ): Promise<{
    changes: any;
    reasoning: string;
  }> {
    // Create cache key
    const cacheKey = `modification:${userFeedback}:${originalTool}:${JSON.stringify(originalParameters)}`;
    
    // Check if analysis is already cached in Redis
    const cachedAnalysis = await cacheService.getLLMAnalysis(cacheKey);
    if (cachedAnalysis) {
      return cachedAnalysis;
    }
    
    // Get analysis from LLM
    try {
      const analysis = await this.llmFormatting.analyzeModifications(
        userFeedback,
        originalTool,
        originalParameters
      );
      
      // Cache the result in Redis
      await cacheService.setLLMAnalysis(cacheKey, analysis);
      
      return analysis;
    } catch (error) {
      const fallback = {
        changes: {},
        reasoning: 'Failed to analyze modifications'
      };
      
      // Cache the fallback result in Redis
      await cacheService.setLLMAnalysis(cacheKey, fallback);
      
      return fallback;
    }
  }

  private async predictOutcome(toolName: string, parameters: any): Promise<string> {
    try {
      const analysis = await this.getOrCreateToolAnalysis(toolName, parameters);
      return analysis.userExplanation;
    } catch (error) {
      // Fallback if analysis fails
      return `Expected to execute ${toolName} with provided parameters`;
    }
  }

  private async assessRisks(toolName: string, parameters: any): Promise<{risks: string[], shouldBlock: boolean}> {
    const analysis = await this.getOrCreateToolAnalysis(toolName, parameters);
    
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
  }



  private async executeModifiedPlan(modifiedPlan: any): Promise<string> {
    try {
      // 1. Analyze user feedback to understand what they want changed (cached)
      const modificationAnalysis = await this.getOrCreateModificationAnalysis(
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
      await this.controlFlow.stopAllProcessing("User requested stop");
      return "Stopped processing. How can I help you?";
    }

    // Step 1: Discover available tools (cached)
    const availableTools = await this.getOrCreateToolDiscovery();
    
    // Step 2: Select best tool using LLM (cached)
    const toolSelection = await this.getOrCreateToolSelection(originalUserRequest, availableTools);
    
    if (!toolSelection.tool) {
      return "I couldn't find a suitable tool for your request. Please try rephrasing your request.";
    }

    // Step 3: Extract parameters using LLM (cached)
    const parameterExtraction = await this.getOrCreateParameterExtraction(
      toolSelection.tool, 
      originalUserRequest, 
      toolSelection.reasoning
    );

    // Step 4: Execute the dynamic flow with selected tool and parameters
    return await this.executeDynamicFlow(
      toolSelection.tool,
      parameterExtraction.parameters,
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
      await this.controlFlow.stopAllProcessing("User requested stop");
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
        return await this.llmFormatting.formatResponseWithLLM(result.result, { originalUserRequest, toolUsed: llmSelectedTool });
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
      return await this.llmFormatting.formatResponseWithLLM(result.result, { originalUserRequest, toolUsed: llmSelectedTool });
    }
  }
  }