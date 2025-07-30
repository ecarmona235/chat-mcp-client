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
  
  // Local caching strategy (will be replaced with Redis when Redis is set up)
  private toolAnalysisCache: Map<string, {
    userExplanation: string;
    safetyAnalysis: string;
  }> = new Map();
  
  // TODO: Replace with Redis when Redis is set up
  private toolDiscoveryCache: Map<string, any[]> = new Map();
  private toolDiscoveryCacheTime: number = 0;
  
  // TODO: Replace with Redis when Redis is set up
  private toolSelectionCache: Map<string, {tool: string | null, reasoning: string}> = new Map();
  // TODO: Replace with Redis when Redis is set up
  private parameterExtractionCache: Map<string, {parameters: any, confidence: number}> = new Map();
  // TODO: Replace with Redis when Redis is set up
  private schemaCache: Map<string, any> = new Map();
  // TODO: Replace with Redis when Redis is set up
  private modificationCache: Map<string, {changes: any, reasoning: string}> = new Map();
  
  // Cache configuration
  private readonly CACHE_TTL = {
    TOOL_DISCOVERY: 5 * 60 * 1000,    // 5 minutes
    TOOL_SELECTION: 10 * 60 * 1000,   // 10 minutes
    PARAMETER_EXTRACTION: 15 * 60 * 1000, // 15 minutes
    SCHEMA: 60 * 60 * 1000,           // 1 hour
    MODIFICATION: 5 * 60 * 1000       // 5 minutes
  };

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

  private async getOrCreateToolAnalysis(toolName: string, parameters: any): Promise<{
    userExplanation: string;
    safetyAnalysis: string;
  }> {
    // Create cache key from tool name and parameters
    const cacheKey = `${toolName}:${JSON.stringify(parameters)}`;
    
    // Check if analysis is already cached
    if (this.toolAnalysisCache.has(cacheKey)) {
      return this.toolAnalysisCache.get(cacheKey)!;
    }
    
    // Get analysis from LLM
    try {
      const analysis = await this.llmFormatting.analyzeToolOutcome(toolName, parameters);
      
      // Cache the result
      this.toolAnalysisCache.set(cacheKey, analysis);
      
      return analysis;
    } catch (error) {
      // Fallback if LLM analysis fails
      const fallbackAnalysis = {
        userExplanation: `Expected to execute ${toolName} with provided parameters`,
        safetyAnalysis: 'Unable to analyze safety - blocking operation'
      };
      
      // Cache the fallback result
      this.toolAnalysisCache.set(cacheKey, fallbackAnalysis);
      
      return fallbackAnalysis;
    }
    
    // TODO: Replace in-memory cache with Redis when Redis is set up
  }

  // TODO: Replace with Redis when Redis is set up
  private async getOrCreateToolDiscovery(): Promise<any[]> {
    const now = Date.now();
    
    // Check if cache is still valid
    if (this.toolDiscoveryCache.has('tools') && 
        (now - this.toolDiscoveryCacheTime) < this.CACHE_TTL.TOOL_DISCOVERY) {
      return this.toolDiscoveryCache.get('tools')!;
    }
    
    // Get fresh tools
    const tools = await this.discovery.getAllTools();
    
    // Cache the result
    this.toolDiscoveryCache.set('tools', tools);
    this.toolDiscoveryCacheTime = now;
    
    return tools;
  }

  // TODO: Replace with Redis when Redis is set up
  private async getOrCreateToolSelection(userRequest: string, availableTools: any[]): Promise<{
    tool: string | null;
    reasoning: string;
  }> {
    // Create cache key from user request and tools hash
    const toolsHash = JSON.stringify(availableTools.map(t => ({name: t.name, description: t.description})));
    const cacheKey = `${userRequest}:${toolsHash}`;
    
    // Check if selection is already cached
    if (this.toolSelectionCache.has(cacheKey)) {
      return this.toolSelectionCache.get(cacheKey)!;
    }
    
    // Get selection from LLM
    try {
      const selection = await this.llmFormatting.selectTool(userRequest, availableTools);
      const result = {
        tool: selection.selectedTool,
        reasoning: selection.reasoning
      };
      
      // Cache the result
      this.toolSelectionCache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      const fallback = {
        tool: null,
        reasoning: 'Failed to select tool'
      };
      
      // Cache the fallback result
      this.toolSelectionCache.set(cacheKey, fallback);
      
      return fallback;
    }
  }

  // TODO: Replace with Redis when Redis is set up
  private async getOrCreateParameterExtraction(
    toolName: string, 
    userRequest: string, 
    toolReasoning: string
  ): Promise<{
    parameters: any;
    confidence: number;
  }> {
    // Create cache key
    const cacheKey = `${toolName}:${userRequest}:${toolReasoning}`;
    
    // Check if extraction is already cached
    if (this.parameterExtractionCache.has(cacheKey)) {
      return this.parameterExtractionCache.get(cacheKey)!;
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
      
      // Cache the result
      this.parameterExtractionCache.set(cacheKey, extraction);
      
      return extraction;
    } catch (error) {
      const fallback = {
        parameters: {},
        confidence: 0
      };
      
      // Cache the fallback result
      this.parameterExtractionCache.set(cacheKey, fallback);
      
      return fallback;
    }
  }

  // TODO: Replace with Redis when Redis is set up
  private async getOrCreateSchema(toolName: string): Promise<any> {
    // Check if schema is already cached
    if (this.schemaCache.has(toolName)) {
      return this.schemaCache.get(toolName)!;
    }
    
    // Get schema from API
    const schema = await this.schema.getToolSchema(toolName);
    
    // Cache the result
    this.schemaCache.set(toolName, schema);
    
    return schema;
  }

  // TODO: Replace with Redis when Redis is set up
  private async getOrCreateModificationAnalysis(
    userFeedback: string,
    originalTool: string,
    originalParameters: any
  ): Promise<{
    changes: any;
    reasoning: string;
  }> {
    // Create cache key
    const cacheKey = `${userFeedback}:${originalTool}:${JSON.stringify(originalParameters)}`;
    
    // Check if analysis is already cached
    if (this.modificationCache.has(cacheKey)) {
      return this.modificationCache.get(cacheKey)!;
    }
    
    // Get analysis from LLM
    try {
      const analysis = await this.llmFormatting.analyzeModifications(
        userFeedback,
        originalTool,
        originalParameters
      );
      
      // Cache the result
      this.modificationCache.set(cacheKey, analysis);
      
      return analysis;
    } catch (error) {
      const fallback = {
        changes: {},
        reasoning: 'Failed to analyze modifications'
      };
      
      // Cache the fallback result
      this.modificationCache.set(cacheKey, fallback);
      
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
    
    // Check if operation should be blocked
    if (riskAssessment.shouldBlock) {
      const blockReason = riskAssessment.risks.join(', ');
      await this.controlFlow.stopAllProcessing(`Operation blocked due to safety concerns: ${blockReason}`);
      return `❌ Operation blocked for safety reasons:\n${riskAssessment.risks.join('\n')}\n\nPlease contact an administrator if this operation is necessary.`;
    }
    
    const executionPlan = {
      tool: llmSelectedTool,
      parameters: llmExtractedParameters,
      expectedOutcome: expectedOutcome,
      risks: riskAssessment.risks,
      alternatives: []
    };
    
    // Step 3: Show Plan to User
    const planExplanation = await this.transparency.explainAction(
      `I'm about to execute ${llmSelectedTool}`,
      {
        tool: llmSelectedTool,
        parameters: llmExtractedParameters,
        whatItWillDo: expectedOutcome, // Use the already computed outcome
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