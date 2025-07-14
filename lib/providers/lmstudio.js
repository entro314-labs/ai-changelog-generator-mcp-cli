const { OpenAI } = require('openai');
const BaseProvider = require('./base-provider');

class LMStudioProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.client = null;
    if (this.isAvailable()) {
      this.initializeClient();
    }
  }

  initializeClient() {
    // LM Studio uses OpenAI-compatible API
    this.client = new OpenAI({
      baseURL: this.config.LMSTUDIO_API_BASE || 'http://localhost:1234/v1',
      apiKey: this.config.LMSTUDIO_API_KEY || 'lm-studio', // Default key for LM Studio
      dangerouslyAllowBrowser: true,
      timeout: this.config.LMSTUDIO_TIMEOUT ? parseInt(this.config.LMSTUDIO_TIMEOUT, 10) : 120000,
      maxRetries: this.config.LMSTUDIO_MAX_RETRIES ? parseInt(this.config.LMSTUDIO_MAX_RETRIES, 10) : 2
    });
  }

  getName() {
    return 'lmstudio';
  }

  isAvailable() {
    return !!this.config.LMSTUDIO_API_BASE;
  }

  async generateCompletion(messages, options) {
    if (!this.isAvailable()) {
      throw new Error('LM Studio provider is not configured.');
    }

    // Prepare parameters for the API call
    const params = {
      model: options.model || this.config.LMSTUDIO_MODEL || 'local-model',
      messages: messages,
      max_tokens: options.max_tokens || 2048,
      temperature: options.temperature || 0.7,
      top_p: options.top_p || 0.95,
      frequency_penalty: options.frequency_penalty || 0,
      presence_penalty: options.presence_penalty || 0,
      user: options.user || this.config.LMSTUDIO_USER_ID
    };

    // Add streaming if requested
    if (options.stream) {
      params.stream = true;
      const stream = await this.client.chat.completions.create(params);
      return { stream, model: params.model };
    }

    // Add function calling if provided and the model supports it
    if (options.tools && this.getCapabilities(params.model).tool_use) {
      params.tools = options.tools;
      params.tool_choice = options.tool_choice || 'auto';
    }

    // Add JSON mode if requested and the model supports it
    if (options.response_format?.type === 'json_object' && this.getCapabilities(params.model).json_mode) {
      params.response_format = { type: 'json_object' };
    }

    try {
      // Make the API call
      const response = await this.client.chat.completions.create(params);

      // Extract tool calls if present
      let toolCalls = null;
      if (response.choices[0]?.message?.tool_calls?.length > 0) {
        toolCalls = response.choices[0].message.tool_calls;
      }

      return {
        content: response.choices[0].message.content,
        model: response.model,
        tokens: response.usage?.total_tokens || 0,
        finish_reason: response.choices[0].finish_reason,
        tool_calls: toolCalls
      };
    } catch (error) {
      // Enhance error message with LM Studio specific context
      const errorMessage = error.message || 'Unknown error';
      throw new Error(`LM Studio API error: ${errorMessage}. Make sure LM Studio is running and the API is enabled.`);
    }
  }

  getModelRecommendation(commitDetails) {
    // LM Studio uses locally loaded models, so we just return the configured model
    return { 
      model: this.config.LMSTUDIO_MODEL || 'local-model', 
      reason: 'Using configured LM Studio model' 
    };
  }

  async validateModelAvailability(modelName) {
    if (!this.isAvailable()) {
      return { available: false, error: 'LM Studio API base URL not provided' };
    }
    
    try {
      // LM Studio doesn't have a standard way to list models, so we'll try a simple test call
      await this.client.chat.completions.create({
        model: modelName || this.config.LMSTUDIO_MODEL || 'local-model',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 1
      });
      
      return { 
        available: true, 
        capabilities: this.getCapabilities(modelName)
      };
    } catch (error) {
      return { 
        available: false, 
        error: `Model not available: ${error.message}`,
        alternatives: ['local-model', 'mistral', 'llama', 'phi']
      };
    }
  }

  async getAvailableModels() {
    if (!this.isAvailable()) {
      return [];
    }
    
    try {
      // LM Studio v0.2.8+ (July 2025) supports listing models
      const response = await this.client.models.list();
      return response.data.map(model => model.id);
    } catch (error) {
      // Older versions don't support model listing
      return [this.config.LMSTUDIO_MODEL || 'local-model'];
    }
  }

  async testConnection() {
    if (!this.isAvailable()) {
      return { success: false, error: 'LM Studio API base URL not provided.' };
    }
    
    try {
      // First try to list models if supported
      let availableModels = [];
      try {
        availableModels = await this.getAvailableModels();
      } catch (error) {
        // Ignore errors from model listing
      }
      
      // Then try a simple completion
      const modelToUse = this.config.LMSTUDIO_MODEL || 'local-model';
      
      const response = await this.client.chat.completions.create({
        model: modelToUse,
        messages: [{ role: 'user', content: 'Test connection' }],
        max_tokens: 10
      });
      
      return { 
        success: true, 
        response: response.choices[0].message.content, 
        model: response.model || modelToUse,
        available_models: availableModels,
        api_version: 'OpenAI-compatible v1',
        features: {
          streaming: true,
          function_calling: this.getCapabilities(modelToUse).tool_use,
          json_mode: this.getCapabilities(modelToUse).json_mode
        }
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to connect to LM Studio at ${this.config.LMSTUDIO_API_BASE}. Is LM Studio running with API server enabled? Error: ${error.message}` 
      };
    }
  }

  getCapabilities(modelName) {
    const model = modelName || this.config.LMSTUDIO_MODEL || 'local-model';
    
    // Base capabilities - all models are local
    const capabilities = {
      vision: false,
      tool_use: false,
      json_mode: false,
      reasoning: false,
      local: true
    };
    
    // Capabilities depend on the specific model loaded in LM Studio
    // These are general capabilities based on model family naming conventions
    
    // Llama models
    if (model.toLowerCase().includes('llama')) {
      capabilities.json_mode = true;
      
      // Llama 3 models likely support function calling
      if (model.includes('3')) {
        capabilities.tool_use = true;
      }
    }
    
    // Mistral models
    else if (model.toLowerCase().includes('mistral')) {
      capabilities.json_mode = true;
      
      // Mixtral models likely have better reasoning
      if (model.toLowerCase().includes('mixtral')) {
        capabilities.reasoning = true;
      }
    }
    
    // Vision models
    if (model.toLowerCase().includes('vision') || 
        model.toLowerCase().includes('llava') || 
        model.toLowerCase().includes('bakllava')) {
      capabilities.vision = true;
    }
    
    return capabilities;
  }
}

module.exports = LMStudioProvider;
