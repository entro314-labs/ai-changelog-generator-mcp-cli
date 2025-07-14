#!/usr/bin/env node

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { OpenAI } = require('openai');

/**
 * AI Provider for Changelog Generation
 * Supports both OpenAI and Azure OpenAI with intelligent fallback
 * Updated for GPT-4.1 series and latest Azure OpenAI v1 API
 */
class AIProvider {
  constructor() {
    this.provider = process.env.AI_PROVIDER || 'auto';
    this.openaiKey = process.env.OPENAI_API_KEY;

    // Model configuration with latest models from OpenAI API docs (June 2025)
    this.modelConfig = {
      default: process.env.AI_MODEL || 'gpt-4.1',
      simple: process.env.AI_MODEL_SIMPLE || 'gpt-4.1-mini',
      complex: process.env.AI_MODEL_COMPLEX || 'gpt-4.1',
      reasoning: process.env.AI_MODEL_REASONING || 'o4-mini', // Latest compact reasoning model (Azure-only)
      advanced_reasoning: process.env.AI_MODEL_ADVANCED_REASONING || 'o4', // Latest advanced reasoning model (Azure-only)
      // Legacy reasoning models (still supported)
      reasoning_legacy: process.env.AI_MODEL_REASONING_LEGACY || 'o3-mini', // Previous generation compact reasoning
      advanced_reasoning_legacy: process.env.AI_MODEL_ADVANCED_REASONING_LEGACY || 'o3', // Previous generation advanced reasoning
      nano: process.env.AI_MODEL_NANO || 'gpt-4.1-nano'
    };

    this.azureConfig = {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      key: process.env.AZURE_OPENAI_KEY,
      deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || this.modelConfig.default,
      // Current preview API for latest features
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview',
      // Latest GA API version
      gaApiVersion: process.env.AZURE_OPENAI_GA_API_VERSION || '2024-10-21',
      // Use v1 API by default (recommended per Microsoft docs)
      useV1API: process.env.AZURE_OPENAI_USE_V1_API !== 'false'
    };

    this.activeProvider = this.determineActiveProvider();
    this.isAvailable = this.activeProvider !== 'none';

    // Initialize OpenAI clients based on provider
    this.initializeClients();

    if (this.isAvailable) {
      console.log(`🤖 AI Provider: ${this.activeProvider.toUpperCase()} (${this.getProviderInfo()})`);
    } else {
      console.log('⚠️  No AI provider configured. Using rule-based analysis...');
    }
  }

  initializeClients() {
    try {
      // Initialize Azure OpenAI client
      if (this.isAzureConfigured()) {
        if (this.azureConfig.useV1API) {
          console.log('🚀 Using Azure OpenAI v1 API (recommended)');
          // v1 API uses standard OpenAI client with Azure base URL
          // Format: https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1/
          this.azureClient = new OpenAI({
            apiKey: this.azureConfig.key,
            baseURL: `${this.azureConfig.endpoint}/openai/v1/`,
            defaultQuery: { 'api-version': 'preview' } // Use 'preview' for latest features
          });
        } else {
          console.log('📦 Using Azure OpenAI traditional API');
          // Traditional API for compatibility
          this.azureClient = new OpenAI({
            apiKey: this.azureConfig.key,
            baseURL: `${this.azureConfig.endpoint}/openai/deployments/${this.azureConfig.deploymentName}/`,
            defaultQuery: { 'api-version': this.azureConfig.apiVersion }
          });
        }
      }

      // Initialize standard OpenAI client
      if (this.isOpenAIConfigured()) {
        this.openaiClient = new OpenAI({
          apiKey: this.openaiKey
        });
      }

    } catch (error) {
      console.error('Failed to initialize AI clients:', error);
      throw error;
    }
  }

  shouldUseV1API() {
    // Use v1 API by default as recommended by Microsoft (May 2025+)
    return this.azureConfig.useV1API;
  }

  determineActiveProvider() {
    // Auto mode: try Azure first, then OpenAI
    if (this.provider === 'auto') {
      if (this.isAzureConfigured()) return 'azure';
      if (this.isOpenAIConfigured()) return 'openai';
      return 'none';
    }

    // Explicit provider selection
    if (this.provider === 'azure' && this.isAzureConfigured()) return 'azure';
    if (this.provider === 'openai' && this.isOpenAIConfigured()) return 'openai';

    // Fallback
    if (this.isAzureConfigured()) return 'azure';
    if (this.isOpenAIConfigured()) return 'openai';

    return 'none';
  }

  isAzureConfigured() {
    return !!(this.azureConfig.endpoint && this.azureConfig.key);
  }

  isOpenAIConfigured() {
    return !!this.openaiKey;
  }

  getProviderInfo() {
    if (this.activeProvider === 'azure') {
      const resourceName = this.azureConfig.endpoint?.match(/https:\/\/([^.]+)\.openai\.azure\.com/)?.[1] || 'unknown';
      return `${resourceName} / ${this.azureConfig.deploymentName}`;
    }
    if (this.activeProvider === 'openai') {
      return `api.openai.com`;
    }
    return 'none';
  }

  async generateCompletion(messages, options = {}) {
    if (!this.isAvailable) {
      throw new Error('No AI provider available');
    }

    const defaultOptions = {
      temperature: 0.3,
      max_tokens: 1000,
      model: 'gpt-4'
    };

    const settings = { ...defaultOptions, ...options };

    try {
      if (this.activeProvider === 'azure') {
        return await this.callAzureOpenAI(messages, settings);
      } else {
        return await this.callOpenAI(messages, settings);
      }
    } catch (error) {
      console.error(`❌ ${this.activeProvider.toUpperCase()} API error:`, error.message);

      // Try fallback provider if auto mode
      if (this.provider === 'auto') {
        const fallbackProvider = this.activeProvider === 'azure' ? 'openai' : 'azure';
        if (fallbackProvider === 'openai' && this.isOpenAIConfigured()) {
          console.log('🔄 Falling back to OpenAI...');
          return await this.callOpenAI(messages, settings);
        }
        if (fallbackProvider === 'azure' && this.isAzureConfigured()) {
          console.log('🔄 Falling back to Azure OpenAI...');
          return await this.callAzureOpenAI(messages, settings);
        }
      }

      throw error;
    }
  }

  async callAzureOpenAI(messages, settings) {
    if (!this.azureClient) {
      throw new Error('Azure OpenAI client not initialized');
    }

    // Build request body optimized for GPT-4.1 series
    const requestBody = {
      model: this.azureConfig.deploymentName,
      messages,
      temperature: settings.temperature
    };

    // Use max_completion_tokens for newer API versions and o-series models
    const useMaxCompletionTokens = this.shouldUseV1API() ||
      this.azureConfig.apiVersion >= '2024-08-01-preview' ||
      this.azureConfig.apiVersion.includes('2025-');

    if (useMaxCompletionTokens) {
      requestBody.max_completion_tokens = settings.max_tokens;
    } else {
      requestBody.max_tokens = settings.max_tokens;
    }

    // Handle model-specific settings based on your document
    const modelName = this.azureConfig.deploymentName.toLowerCase();
    if (modelName.includes('o3') || modelName.includes('o4')) {
      // Reasoning models (o-series) don't support temperature
      delete requestBody.temperature;
      console.log(`🧠 Using reasoning model ${this.azureConfig.deploymentName} - temperature disabled`);

      // o3 and o4-mini include reasoning summaries and enhanced safety features 
      console.log(`🛡️ Model ${this.azureConfig.deploymentName} includes reasoning summaries and enhanced safety`);
    }

    // Enable prompt caching for GPT-4.1 series (75% cost reduction on repeated prefixes)
    if (modelName.includes('gpt-4.1') && settings.enableCaching !== false) {
      console.log(`💰 Enabling prompt caching for GPT-4.1 (75% cost reduction on repeated content)`);
      // Prompt caching is automatically handled by the API for GPT-4.1 series
    }

    // Set appropriate context length for GPT-4.1 series (1M tokens)
    if (modelName.includes('gpt-4.1')) {
      console.log(`🚀 Using GPT-4.1 with 1M token context window`);
    }

    const apiType = this.shouldUseV1API() ? 'v1 API' : 'Traditional API';
    console.log(`🌐 Using ${apiType} Azure OpenAI API`);
    console.log(`🎯 Model: ${this.azureConfig.deploymentName}`);

    try {
      const completion = await this.azureClient.chat.completions.create(requestBody);

      return {
        content: completion.choices[0]?.message?.content,
        usage: completion.usage,
        model: completion.model || this.azureConfig.deploymentName
      };
    } catch (error) {
      console.error('Azure OpenAI API error details:', {
        message: error.message,
        code: error.code,
        type: error.type,
        status: error.status
      });

      // Better error handling for common issues
      if (error.status === 404) {
        throw new Error(`Model ${this.azureConfig.deploymentName} not found in deployment. Please check your deployment name.`);
      }
      if (error.status === 429) {
        throw new Error(`Rate limit exceeded. Please wait and try again.`);
      }
      if (error.status === 401) {
        throw new Error(`Authentication failed. Please check your API key.`);
      }

      throw error;
    }
  }

  async callOpenAI(messages, settings) {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const requestBody = {
      model: settings.model,
      messages,
      temperature: settings.temperature
    };

    // OpenAI doesn't have o-series models (those are Azure-only per your document)
    const modelName = settings.model.toLowerCase();

    // Use max_completion_tokens for GPT-4.1 series (per your document)
    if (modelName.includes('gpt-4.1')) {
      requestBody.max_completion_tokens = settings.max_tokens;

      // Enable prompt caching for GPT-4.1
      if (modelName.includes('gpt-4.1')) {
        console.log(`💰 Enabling prompt caching for GPT-4.1 (75% cost reduction on repeated content)`);
      }
    } else {
      requestBody.max_tokens = settings.max_tokens;
    }

    try {
      const completion = await this.openaiClient.chat.completions.create(requestBody);

      return {
        content: completion.choices[0]?.message?.content,
        usage: completion.usage,
        model: completion.model
      };
    } catch (error) {
      console.error('OpenAI API error details:', {
        message: error.message,
        code: error.code,
        type: error.type,
        status: error.status
      });
      throw error;
    }
  }

  /**
   * Select the optimal model based on commit complexity
   * Updated for GPT-4.1 series with improved thresholds
   */
  selectModelForCommit(commitInfo) {
    const filesChanged = commitInfo.files?.length || 0;
    const linesChanged = (commitInfo.additions || 0) + (commitInfo.deletions || 0);
    const hasBreakingChanges = commitInfo.message?.includes('BREAKING') || commitInfo.message?.includes('!:');
    const hasComplexLogic = commitInfo.message?.toLowerCase().includes('refactor') ||
                           commitInfo.message?.toLowerCase().includes('algorithm') ||
                           commitInfo.message?.toLowerCase().includes('architecture');

    // Very large or complex changes requiring advanced reasoning
    // Note: o-series models are Azure-only
    if (filesChanged > 100 || linesChanged > 5000 || hasBreakingChanges || hasComplexLogic) {
      if (this.activeProvider === 'azure') {
        // Use Azure reasoning models for complex analysis
        if (filesChanged > 200 || linesChanged > 10000) {
          return this.modelConfig.advanced_reasoning; // o4 for maximum reasoning
        }
        return this.modelConfig.reasoning; // o4-mini for advanced reasoning
      } else {
        // OpenAI fallback to GPT-4.1 for complex analysis
        return this.modelConfig.complex; // gpt-4.1 for complex analysis
      }
    }

    // Complex commit criteria - use flagship GPT-4.1 model
    if (filesChanged > 20 || linesChanged > 1000) {
      return this.modelConfig.complex; // gpt-4.1 for complex analysis with 1M token context
    }

    // Very simple commits - use ultra-efficient nano model
    if (filesChanged < 3 && linesChanged < 50) {
      return this.modelConfig.nano; // gpt-4.1-nano for minimal changes
    }

    // Simple commit criteria - use efficient mini model
    if (filesChanged < 10 && linesChanged < 200) {
      return this.modelConfig.simple; // gpt-4.1-mini for quick analysis
    }

    // Default for most commits - balanced GPT-4.1 performance
    return this.modelConfig.default; // gpt-4.1 for balanced analysis
  }

  /**
   * Check if model supports specific capabilities
   * Based on actual model documentation, not hallucinated features
   */
  getModelCapabilities(modelName) {
    const model = modelName.toLowerCase();

    return {
      // Reasoning models (Azure-only: o3 series, o4 series)
      reasoning: model.includes('o3') || model.includes('o4'),

      // Vision capabilities (not needed for changelog generation)
      vision: false,

      // Context windows
      largeContext: model.includes('gpt-4.1'), // 1M tokens
      mediumContext: model.includes('o3') || model.includes('o4'), // 200K tokens for reasoning models
      standardContext: model.includes('gpt-4o'), // 128K tokens

      // Prompt caching (GPT-4.1 series only, 75% discount)
      promptCaching: model.includes('gpt-4.1'),

      // Text-only capabilities (relevant for changelog generation)
      textGeneration: true,

      // Function calling (available on modern models)
      tools: model.includes('o3') || model.includes('o4') || model.includes('gpt-4'),

      // Azure-specific reasoning features
      parallelToolCalling: model.includes('o3') || model.includes('o4'),
      reasoningSummary: model.includes('o3') || model.includes('o4'),
      
      // Latest generation features (o4 series only)
      latestReasoning: model.includes('o4'),

      // Cost efficiency indicators
      ultraEfficient: model.includes('nano'),
      costEfficient: model.includes('mini'),

      // Coding optimization (GPT-4.1 series specialization)
      codingOptimized: model.includes('gpt-4.1')
    };
  }

  /**
   * Validate model availability for the current provider
   * with actual deployment checking for Azure
   */
  async validateModelAvailability(modelName) {
    if (this.activeProvider === 'azure') {
      try {
        // Check if model exists in Azure deployment by attempting a minimal completion
        const testResponse = await this.azureClient.chat.completions.create({
          model: modelName,
          messages: [{ role: 'user', content: 'test' }],
          max_completion_tokens: 1,
          temperature: 0
        });

        const capabilities = this.getModelCapabilities(modelName);

        // Log capabilities for user awareness
        if (capabilities.reasoning) {
          console.log(`🧠 Model ${modelName} supports advanced reasoning`);
        }
        if (capabilities.largeContext) {
          console.log(`📚 Model ${modelName} supports 1M token context window`);
        }
        if (capabilities.promptCaching) {
          console.log(`💰 Model ${modelName} supports prompt caching (75% cost reduction)`);
        }

        return { available: true, model: testResponse.model, capabilities };
      } catch (error) {
        // Only log model availability errors once per session to avoid spam
        if (!this.modelErrorsLogged) {
          this.modelErrorsLogged = new Set();
        }
        
        if (!this.modelErrorsLogged.has(modelName)) {
          // Clean up error message for better UX
          const cleanError = error.message.includes('400') ? 
            `Model not available in deployment` : 
            'Connection failed';
          console.warn(`⚠️  Model ${modelName} not available in Azure deployment: ${cleanError}`);
          this.modelErrorsLogged.add(modelName);
        }
        
        return { available: false, error: error.message, capabilities: null };
      }
    }

    if (this.activeProvider === 'openai') {
      // For OpenAI, exclude Azure-only models (o-series, audio, image gen)
      const supportedModels = [
        'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
        'gpt-4o', 'gpt-4o-mini',
        'gpt-4', 'gpt-3.5-turbo'
      ];

      const available = supportedModels.includes(modelName);
      const capabilities = available ? this.getModelCapabilities(modelName) : null;

      return { available, capabilities };
    }

    return { available: false, error: 'No provider configured' };
  }

  /**
   * Get available models in Azure deployment
   */
  async getAvailableAzureModels() {
    if (!this.isAzureConfigured()) {
      return { success: false, error: 'Azure not configured' };
    }

    try {
      // Try common model names for changelog generation
      const commonModels = [
        // GPT-4.1 series (available on both platforms)
        'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
        // GPT-4o series (available on both platforms)
        'gpt-4o', 'gpt-4o-mini',
        // o-series reasoning models (Azure-only)
        'o4', 'o4-mini', // Latest generation
        'o3', 'o3-mini', // Previous generation
        // Legacy models for fallback
        'gpt-4', 'gpt-35-turbo'
      ];

      const availableModels = [];

      for (const model of commonModels) {
        const validation = await this.validateModelAvailability(model);
        if (validation.available) {
          availableModels.push({
            name: model,
            capabilities: validation.capabilities
          });
        }
      }

      return { success: true, models: availableModels };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Select optimal model with availability fallback
   */
  async selectOptimalModel(commitInfo = null) {
    const preferredModel = commitInfo ? this.selectModelForCommit(commitInfo) : this.modelConfig.default;

    // Validate preferred model availability
    const validation = await this.validateModelAvailability(preferredModel);

    if (validation.available) {
      return { model: preferredModel, capabilities: validation.capabilities };
    }

    // Fallback logic based on provider
    if (this.activeProvider === 'azure') {
      // Only show fallback message once to avoid spam
      if (!this.fallbackMessageShown) {
        console.warn(`⚠️  Preferred model ${preferredModel} not available, finding fallback...`);
        this.fallbackMessageShown = true;
      }

      // Try fallback models in order of preference
      const fallbackModels = [
        this.modelConfig.default,
        this.modelConfig.simple,
        'gpt-4o',
        'gpt-4',
        'gpt-35-turbo'
      ];

      for (const fallback of fallbackModels) {
        if (fallback !== preferredModel) {
          const fallbackValidation = await this.validateModelAvailability(fallback);
          if (fallbackValidation.available) {
            if (!this.fallbackSuccessShown) {
              console.log(`✅ Using fallback model: ${fallback}`);
              this.fallbackSuccessShown = true;
            }
            return { model: fallback, capabilities: fallbackValidation.capabilities };
          }
        }
      }

      throw new Error('No available models found in Azure deployment');
    }

    // For OpenAI, use the preferred model (assume available)
    return { model: preferredModel, capabilities: this.getModelCapabilities(preferredModel) };
  }

  // Test the AI provider connection
  async testConnection() {
    if (!this.isAvailable) {
      return { success: false, error: 'No provider available' };
    }

    try {
      const response = await this.generateCompletion([{
        role: 'user',
        content: "Test connection - please respond with 'OK'"
      }], { max_tokens: 10 });

      if (response && response.content && response.content.length > 0) {
        return {
          success: true,
          response: response.content,
          model: response.model
        };
      } else {
        return { success: false, error: 'Empty response' };
      }
    } catch (error) {
      console.error('AI Provider test failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = AIProvider;