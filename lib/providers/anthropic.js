const { Anthropic, HUMAN_PROMPT, AI_PROMPT } = require('@anthropic-ai/sdk');
const BaseProvider = require('./base-provider');

class AnthropicProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.anthropic = null;
    if (this.isAvailable()) {
      this.initializeClient();
    }
  }

  initializeClient() {
    const options = { 
      apiKey: this.config.ANTHROPIC_API_KEY,
      // New options in SDK v0.56.0
      defaultHeaders: {
        'X-Client-Name': 'ai-changelog-generator',
        'X-Client-Version': '1.0.0'
      }
    };

    // Add optional parameters if provided
    if (this.config.ANTHROPIC_API_URL) {
      options.baseURL = this.config.ANTHROPIC_API_URL;
    }

    if (this.config.ANTHROPIC_TIMEOUT) {
      options.timeout = parseInt(this.config.ANTHROPIC_TIMEOUT, 10);
    }

    if (this.config.ANTHROPIC_MAX_RETRIES) {
      options.maxRetries = parseInt(this.config.ANTHROPIC_MAX_RETRIES, 10);
    }

    this.anthropic = new Anthropic(options);
  }

  getName() {
    return 'anthropic';
  }

  isAvailable() {
    return !!this.config.ANTHROPIC_API_KEY;
  }

  async generateCompletion(messages, options) {
    if (!this.isAvailable()) {
      throw new Error('Anthropic provider is not configured.');
    }

    // Anthropic API uses a slightly different message format
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');
    
    const params = {
      model: options.model || 'claude-4.0-sonnet',
      system: systemMessage ? systemMessage.content : undefined,
      messages: userMessages,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature || 0.3,
      metadata: options.metadata || {
        user_id: this.config.ANTHROPIC_USER_ID || 'anonymous',
        session_id: options.sessionId || Date.now().toString()
      }
    };

    // Add tool calling if provided
    if (options.tools) {
      params.tools = options.tools;
      params.tool_choice = options.tool_choice || 'auto';
    }

    // Add streaming if requested
    if (options.stream) {
      params.stream = true;
      const stream = await this.anthropic.messages.create(params);
      return { stream, model: params.model };
    }

    const response = await this.anthropic.messages.create(params);

    // Check if there are tool calls in the response
    const toolCalls = response.content.some(c => c.type === 'tool_use') 
      ? response.content.filter(c => c.type === 'tool_use').map(c => c.tool_use)
      : null;

    // Get the text content
    const textContent = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    return {
      content: textContent,
      model: response.model,
      tokens: response.usage.input_tokens + response.usage.output_tokens,
      tool_calls: toolCalls,
      stop_reason: response.stop_reason,
      stop_sequence: response.stop_sequence
    };
  }

  getModelRecommendation(commitDetails) {
    if (commitDetails.breaking || commitDetails.complex) {
      return { model: 'claude-4.0-opus', reason: 'Complex or breaking change detected' };
    }
    if (commitDetails.lines > 1000 || commitDetails.files > 30) {
      return { model: 'claude-4.0-sonnet', reason: 'Large commit size' };
    }
    if (commitDetails.lines > 500 || commitDetails.files > 15) {
      return { model: 'claude-3.5-sonnet', reason: 'Medium-large commit size' };
    }
    if (commitDetails.lines > 200 || commitDetails.files > 8) {
      return { model: 'claude-3.5-haiku', reason: 'Medium commit size' };
    }
    return { model: 'claude-3-haiku', reason: 'Standard commit size' };
  }

  async validateModelAvailability(modelName) {
    if (!this.isAvailable()) {
      return { available: false, error: 'Anthropic API key not provided' };
    }
    
    try {
      // Anthropic doesn't have a list models endpoint, so we'll do a simple test call
      const response = await this.anthropic.messages.create({
        model: modelName,
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
        error: error.message,
        alternatives: this.getSuggestedModels(modelName)
      };
    }
  }

  getSuggestedModels(modelName) {
    // Suggest alternative models based on capabilities
    if (modelName.includes('claude-4')) {
      return ['claude-3.5-sonnet', 'claude-3-opus', 'claude-3-sonnet'];
    }
    if (modelName.includes('claude-3.5')) {
      return ['claude-3-sonnet', 'claude-3-haiku'];
    }
    return ['claude-3-haiku', 'claude-instant-1.2'];
  }

  async testConnection() {
    if (!this.isAvailable()) {
      return { success: false, error: 'Anthropic API key not provided.' };
    }
    try {
      const response = await this.generateCompletion([
        { role: 'user', content: 'Test connection' }
      ], { max_tokens: 10, model: 'claude-3-haiku' });
      return { 
        success: true, 
        response: response.content, 
        model: response.model,
        sdk_version: '0.56.0' // Latest as of July 2025
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getCapabilities(modelName) {
    const model = modelName || 'claude-4.0-sonnet';
    
    // Base capabilities
    const capabilities = {
      vision: false,
      tool_use: false,
      json_mode: false,
      reasoning: false,
      large_context: false
    };
    
    // Claude 4.0 series
    if (model.includes('claude-4')) {
      capabilities.vision = true;
      capabilities.tool_use = true;
      capabilities.json_mode = true;
      capabilities.reasoning = true;
      capabilities.large_context = true;
      
      // Opus has enhanced capabilities
      if (model.includes('opus')) {
        capabilities.reasoning = true;
      }
    }
    
    // Claude 3.5 series
    else if (model.includes('claude-3.5')) {
      capabilities.vision = true;
      capabilities.tool_use = true;
      capabilities.json_mode = true;
      
      // Sonnet has larger context than Haiku
      if (model.includes('sonnet')) {
        capabilities.large_context = true;
      }
    }
    
    // Claude 3 series
    else if (model.includes('claude-3')) {
      capabilities.vision = true;
      
      // Only Opus and Sonnet support tool use
      if (model.includes('opus') || model.includes('sonnet')) {
        capabilities.tool_use = true;
        capabilities.json_mode = true;
      }
      
      // Opus has larger context
      if (model.includes('opus')) {
        capabilities.large_context = true;
      }
    }
    
    return capabilities;
  }
}

module.exports = AnthropicProvider;
