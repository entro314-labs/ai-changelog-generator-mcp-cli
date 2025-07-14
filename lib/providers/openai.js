const { OpenAI } = require('openai');
const BaseProvider = require('./base-provider');

class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.openai = null;
    if (this.isAvailable()) {
      this.openai = new OpenAI({
        apiKey: this.config.OPENAI_API_KEY,
        organization: this.config.OPENAI_ORGANIZATION,
        project: this.config.OPENAI_PROJECT_ID,
        timeout: this.config.OPENAI_TIMEOUT || 60000,
        maxRetries: this.config.OPENAI_MAX_RETRIES || 2
      });
    }
  }

  getName() {
    return 'openai';
  }

  isAvailable() {
    return !!this.config.OPENAI_API_KEY;
  }

  async generateCompletion(messages, options) {
    if (!this.isAvailable()) {
      throw new Error('OpenAI provider is not configured.');
    }

    const params = {
      model: options.model || 'gpt-4o', // Default to latest flagship model
      messages,
      max_tokens: options.max_tokens || 1000,
      temperature: options.temperature || 0.3,
    };

    // Add tool calling if provided
    if (options.tools) {
      params.tools = options.tools;
      params.tool_choice = options.tool_choice || 'auto';
    }

    // Add streaming if requested
    if (options.stream) {
      params.stream = true;
      const stream = await this.openai.chat.completions.create(params);
      return { stream, model: params.model };
    }

    const completion = await this.openai.chat.completions.create(params);

    return {
      content: completion.choices[0].message.content,
      model: completion.model,
      tokens: completion.usage.total_tokens,
      finish_reason: completion.choices[0].finish_reason,
      tool_calls: completion.choices[0].message.tool_calls
    };
  }

  getModelRecommendation(commitDetails) {
    // Updated model selection logic based on 2025 models
    if (commitDetails.breaking || commitDetails.complex || commitDetails.files > 20) {
      return { model: 'gpt-4o', reason: 'Complex or breaking change requiring advanced reasoning' };
    } 
    if (commitDetails.lines > 1000 || commitDetails.files > 10) {
      return { model: 'gpt-4.1-standard', reason: 'Large change requiring standard capabilities' };
    }
    if (commitDetails.lines < 200) {
      return { model: 'gpt-4.1-nano', reason: 'Small change, optimized for efficiency' };
    }
    return { model: 'gpt-4.1-mini', reason: 'Medium-sized change' };
  }

  async validateModelAvailability(modelName) {
    if (!this.isAvailable()) {
      return { available: false, error: 'OpenAI API key not provided' };
    }
    
    try {
      // List available models
      const models = await this.openai.models.list();
      const available = models.data.some(m => m.id === modelName || m.id.includes(modelName));
      
      return { 
        available, 
        capabilities: this.getCapabilities(modelName),
        alternatives: available ? [] : this.getSimilarModels(modelName, models.data)
      };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  getSimilarModels(modelName, availableModels) {
    // Suggest alternative models if requested one isn't available
    if (modelName.includes('gpt-4o')) {
      return availableModels
        .filter(m => m.id.includes('gpt-4'))
        .map(m => m.id)
        .slice(0, 3);
    }
    return availableModels
      .map(m => m.id)
      .slice(0, 3);
  }

  async testConnection() {
    if (!this.isAvailable()) {
      return { success: false, error: 'OpenAI API key not provided.' };
    }
    try {
      const response = await this.generateCompletion([
        { role: 'user', content: 'Test connection' }
      ], { max_tokens: 5, model: 'gpt-4o' });
      return { success: true, response: response.content, model: response.model };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getCapabilities(modelName) {
    const model = modelName || 'gpt-4o';
    
    // Base capabilities
    const capabilities = {
      vision: false,
      tool_use: false,
      json_mode: false,
      prompt_caching: false,
      reasoning: false,
      large_context: false
    };
    
    // GPT-4o capabilities
    if (model.includes('gpt-4o')) {
      capabilities.vision = true;
      capabilities.tool_use = true;
      capabilities.json_mode = true;
      capabilities.reasoning = true;
      capabilities.large_context = true;
    }
    
    // o1 advanced reasoning model
    if (model.includes('o1')) {
      capabilities.reasoning = true;
      capabilities.tool_use = true;
      capabilities.large_context = true;
    }
    
    // GPT-4.1 series
    if (model.includes('gpt-4.1')) {
      capabilities.prompt_caching = true;
      capabilities.tool_use = true;
      capabilities.json_mode = true;
      
      // Different sizes have different capabilities
      if (model.includes('standard')) {
        capabilities.vision = true;
        capabilities.large_context = true;
      }
    }
    
    return capabilities;
  }
}

module.exports = OpenAIProvider;
