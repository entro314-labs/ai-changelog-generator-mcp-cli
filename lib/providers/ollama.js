const { Ollama } = require('ollama');
const BaseProvider = require('./base-provider');

class OllamaProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.client = null;
    if (this.isAvailable()) {
      this.initializeClient();
    }
  }

  initializeClient() {
    const options = {
      host: this.config.OLLAMA_HOST,
      keepAlive: this.config.OLLAMA_KEEP_ALIVE !== 'false',
    };

    // Add optional parameters if provided
    if (this.config.OLLAMA_TIMEOUT) {
      options.timeout = parseInt(this.config.OLLAMA_TIMEOUT, 10);
    }

    if (this.config.OLLAMA_HEADERS) {
      try {
        options.headers = JSON.parse(this.config.OLLAMA_HEADERS);
      } catch (error) {
        console.warn('Failed to parse OLLAMA_HEADERS, using default headers');
      }
    }

    this.client = new Ollama(options);
  }

  getName() {
    return 'ollama';
  }

  isAvailable() {
    return !!this.config.OLLAMA_HOST;
  }

  async generateCompletion(messages, options) {
    if (!this.isAvailable()) {
      throw new Error('Ollama provider is not configured.');
    }

    const modelName = options.model || this.config.OLLAMA_MODEL || 'llama3';
    
    // Prepare parameters for the API call
    const params = {
      model: modelName,
      messages: messages,
      options: {
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.9,
        num_predict: options.max_tokens || 1024,
        stop: options.stop || [],
      }
    };

    // Add streaming if requested
    if (options.stream) {
      params.stream = true;
      const stream = await this.client.chat(params);
      return { stream, model: modelName };
    }

    // Add function calling if provided and the model supports it
    if (options.tools && this.getCapabilities(modelName).tool_use) {
      params.tools = options.tools;
      params.tool_choice = options.tool_choice || 'auto';
    }

    // Add format if requested (JSON mode)
    if (options.response_format?.type === 'json_object' && this.getCapabilities(modelName).json_mode) {
      params.format = 'json';
    }

    // Make the API call
    const response = await this.client.chat(params);

    // Extract tool calls if present
    let toolCalls = null;
    if (response.message.tool_calls && response.message.tool_calls.length > 0) {
      toolCalls = response.message.tool_calls;
    }

    return {
      content: response.message.content,
      model: response.model,
      tokens: response.eval_count || response.total_duration, // Newer versions provide eval_count
      finish_reason: response.done ? 'stop' : null,
      tool_calls: toolCalls
    };
  }

  async generateEmbedding(text, options = {}) {
    if (!this.isAvailable()) {
      throw new Error('Ollama provider is not configured.');
    }

    const modelName = options.model || this.config.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
    
    const response = await this.client.embeddings({
      model: modelName,
      prompt: text,
      options: {
        temperature: options.temperature || 0.0
      }
    });

    return {
      embedding: response.embedding,
      model: modelName,
      tokens: response.token_count || 0
    };
  }

  getModelRecommendation(commitDetails) {
    // Check if specific models are available locally
    const preferredModels = [
      { name: 'llama3:latest', reason: 'Latest Llama 3 model' },
      { name: 'mistral:latest', reason: 'Latest Mistral model' },
      { name: 'codellama:latest', reason: 'Specialized code model' },
      { name: 'llama2:latest', reason: 'Fallback model' }
    ];

    // Default to configured model or llama3
    return { 
      model: this.config.OLLAMA_MODEL || 'llama3', 
      reason: 'Using configured or default Ollama model' 
    };
  }

  async validateModelAvailability(modelName) {
    if (!this.isAvailable()) {
      return { available: false, error: 'Ollama host not provided' };
    }
    
    try {
      const models = await this.client.list();
      const model = models.models.find(m => m.name === modelName || m.name.startsWith(modelName + ':'));
      
      if (model) {
        return { 
          available: true, 
          capabilities: this.getCapabilities(modelName),
          details: {
            name: model.name,
            size: model.size,
            modified_at: model.modified_at,
            quantization: model.details?.quantization || 'unknown'
          }
        };
      } else {
        return { 
          available: false, 
          error: `Model ${modelName} is not available locally`,
          alternatives: await this.getSuggestedModels()
        };
      }
    } catch (error) {
      return { available: false, error: `Could not connect to Ollama host: ${error.message}` };
    }
  }

  async getSuggestedModels() {
    try {
      const models = await this.client.list();
      return models.models.map(m => m.name).slice(0, 5); // Return top 5 available models
    } catch (error) {
      return ['llama3', 'mistral', 'codellama', 'llama2'];
    }
  }

  async testConnection() {
    if (!this.isAvailable()) {
      return { success: false, error: 'Ollama host not provided.' };
    }
    try {
      // First check if we can connect and list models
      const models = await this.client.list();
      const availableModels = models.models.map(m => m.name);
      
      // Then try a simple completion with the default or first available model
      const modelToUse = this.config.OLLAMA_MODEL || 
                        (availableModels.length > 0 ? availableModels[0] : 'llama3');
      
      const response = await this.client.chat({
        model: modelToUse,
        messages: [{ role: 'user', content: 'Test connection' }],
      });
      
      return { 
        success: true, 
        response: response.message.content, 
        model: response.model,
        available_models: availableModels.slice(0, 5), // Show only first 5 models
        sdk_version: '0.3.0' // Latest as of July 2025
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to connect to Ollama at ${this.config.OLLAMA_HOST}. Is Ollama running? Error: ${error.message}` 
      };
    }
  }

  async pullModel(modelName) {
    if (!this.isAvailable()) {
      throw new Error('Ollama provider is not configured.');
    }
    
    try {
      const pullStream = await this.client.pull({ model: modelName, stream: true });
      return { stream: pullStream, model: modelName };
    } catch (error) {
      throw new Error(`Failed to pull model ${modelName}: ${error.message}`);
    }
  }

  getCapabilities(modelName) {
    const model = modelName || this.config.OLLAMA_MODEL || 'llama3';
    
    // Base capabilities - all models are local
    const capabilities = {
      vision: false,
      tool_use: false,
      json_mode: false,
      reasoning: false,
      local: true
    };
    
    // Llama 3 models
    if (model.includes('llama3')) {
      capabilities.json_mode = true;
      capabilities.tool_use = true; // Latest Llama 3 models support function calling
    }
    
    // CodeLlama models
    else if (model.includes('codellama')) {
      capabilities.json_mode = true;
      capabilities.tool_use = true;
    }
    
    // Mistral models
    else if (model.includes('mistral')) {
      capabilities.json_mode = true;
    }
    
    // Vision models
    if (model.includes('vision') || model.includes('llava')) {
      capabilities.vision = true;
    }
    
    return capabilities;
  }
}

module.exports = OllamaProvider;
