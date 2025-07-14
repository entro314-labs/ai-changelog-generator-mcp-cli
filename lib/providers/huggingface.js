const { HfInference, HfMcpClient } = require('@huggingface/inference');
const { HfEndpoint } = require('@huggingface/hub');
const BaseProvider = require('./base-provider');

class HuggingFaceProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.hf = null;
    this.hfEndpoint = null;
    this.mcpClient = null;
    if (this.isAvailable()) {
      this.initializeClient();
    }
  }

  initializeClient() {
    // Initialize the standard inference client
    this.hf = new HfInference(this.config.HUGGINGFACE_API_KEY, {
      timeout: this.config.HUGGINGFACE_TIMEOUT ? parseInt(this.config.HUGGINGFACE_TIMEOUT, 10) : 120000,
      useCache: this.config.HUGGINGFACE_USE_CACHE !== 'false',
      retry: this.config.HUGGINGFACE_MAX_RETRIES ? parseInt(this.config.HUGGINGFACE_MAX_RETRIES, 10) : 2
    });

    // Initialize the Hugging Face Endpoint client for hosted inference endpoints
    if (this.config.HUGGINGFACE_ENDPOINT_URL) {
      this.hfEndpoint = new HfEndpoint(this.config.HUGGINGFACE_ENDPOINT_URL, {
        accessToken: this.config.HUGGINGFACE_API_KEY
      });
    }

    // Initialize the MCP client for advanced features
    if (this.config.HUGGINGFACE_USE_MCP === 'true') {
      this.mcpClient = new HfMcpClient({
        apiKey: this.config.HUGGINGFACE_API_KEY,
        timeout: this.config.HUGGINGFACE_TIMEOUT ? parseInt(this.config.HUGGINGFACE_TIMEOUT, 10) : 120000
      });
    }
  }

  getName() {
    return 'huggingface';
  }

  isAvailable() {
    return !!this.config.HUGGINGFACE_API_KEY;
  }

  async generateCompletion(messages, options) {
    if (!this.isAvailable()) {
      throw new Error('Hugging Face provider is not configured.');
    }

    const modelId = options.model || 'mistralai/Mixtral-8x22B-Instruct-v0.1';
    
    // Check if we should use a hosted endpoint
    if (this.hfEndpoint && options.useEndpoint) {
      return this.generateWithEndpoint(messages, modelId, options);
    }
    
    // Check if we should use MCP client
    if (this.mcpClient && options.useMcp) {
      return this.generateWithMcp(messages, modelId, options);
    }

    // Prepare parameters for the API call
    const params = {
      model: modelId,
      messages,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature || 0.5,
      top_p: options.top_p || 0.95,
      repetition_penalty: options.repetition_penalty || 1.1,
      user: options.user || this.config.HUGGINGFACE_USER_ID
    };

    // Add streaming if requested
    if (options.stream) {
      params.stream = true;
      const stream = await this.hf.chatCompletionStream(params);
      return { stream, model: modelId };
    }

    // Add tool calling if provided and the model supports it
    if (options.tools && this.getCapabilities(modelId).tool_use) {
      params.tools = options.tools;
      params.tool_choice = options.tool_choice || 'auto';
    }

    // Add JSON mode if requested and the model supports it
    if (options.response_format?.type === 'json_object' && this.getCapabilities(modelId).json_mode) {
      params.response_format = { type: 'json_object' };
    }

    // Make the API call
    const response = await this.hf.chatCompletion(params);

    return {
      content: response.choices[0].message.content,
      model: modelId,
      tokens: response.usage.total_tokens,
      finish_reason: response.choices[0].finish_reason,
      tool_calls: response.choices[0].message.tool_calls
    };
  }

  async generateWithEndpoint(messages, modelId, options) {
    // Hosted endpoints may have a custom API format
    const payload = {
      inputs: {
        messages: messages
      },
      parameters: {
        max_new_tokens: options.max_tokens || 4096,
        temperature: options.temperature || 0.5,
        top_p: options.top_p || 0.95,
        do_sample: true
      }
    };

    const response = await this.hfEndpoint.predict(payload);

    return {
      content: response.generated_text || response.outputs || response.text,
      model: modelId,
      tokens: response.usage?.total_tokens || 0
    };
  }

  async generateWithMcp(messages, modelId, options) {
    // Use the MCP client for advanced features like function calling and multi-provider support
    const response = await this.mcpClient.generate({
      model: modelId,
      messages: messages,
      max_tokens: options.max_tokens || 4096,
      temperature: options.temperature || 0.5,
      tools: options.tools,
      stream: options.stream || false
    });

    if (options.stream) {
      return { stream: response, model: modelId };
    }

    return {
      content: response.content,
      model: modelId,
      tokens: response.usage?.total_tokens || 0,
      tool_calls: response.tool_calls
    };
  }

  getModelRecommendation(commitDetails) {
    if (commitDetails.breaking || commitDetails.complex) {
      return { model: 'meta-llama/Meta-Llama-3.1-70B-Instruct', reason: 'Complex or breaking change detected' };
    }
    if (commitDetails.lines > 1000 || commitDetails.files > 25) {
      return { model: 'mistralai/Mixtral-8x22B-Instruct-v0.1', reason: 'Large commit size' };
    }
    if (commitDetails.lines > 500 || commitDetails.files > 15) {
      return { model: 'meta-llama/Meta-Llama-3.1-8B-Instruct', reason: 'Medium-large commit size' };
    }
    if (commitDetails.lines > 200 || commitDetails.files > 8) {
      return { model: 'mistralai/Mistral-7B-Instruct-v0.3', reason: 'Medium commit size' };
    }
    return { model: 'HuggingFaceH4/zephyr-7b-beta', reason: 'Standard commit size' };
  }

  async validateModelAvailability(modelName) {
    if (!this.isAvailable()) {
      return { available: false, error: 'Hugging Face API key not provided' };
    }
    
    try {
      // Check if the model exists and is available for chat completion
      const models = await this.hf.listAvailableModels();
      const isAvailable = models.some(model => model.id === modelName && model.task === 'text-generation');
      
      if (isAvailable) {
        return { 
          available: true, 
          capabilities: this.getCapabilities(modelName)
        };
      } else {
        return { 
          available: false, 
          error: `Model ${modelName} is not available for chat completion`,
          alternatives: this.getSuggestedModels(modelName)
        };
      }
    } catch (error) {
      // If the API doesn't support listing models, we'll try a simple test call
      try {
        await this.hf.chatCompletion({
          model: modelName,
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 1
        });
        
        return { 
          available: true, 
          capabilities: this.getCapabilities(modelName)
        };
      } catch (testError) {
        return { 
          available: false, 
          error: testError.message,
          alternatives: this.getSuggestedModels(modelName)
        };
      }
    }
  }

  getSuggestedModels(modelName) {
    // Suggest alternative models based on capabilities and size
    if (modelName.includes('Llama-3.1-70B')) {
      return ['mistralai/Mixtral-8x22B-Instruct-v0.1', 'meta-llama/Meta-Llama-3.1-8B-Instruct'];
    }
    if (modelName.includes('Mixtral-8x22B')) {
      return ['meta-llama/Meta-Llama-3.1-8B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3'];
    }
    return ['mistralai/Mistral-7B-Instruct-v0.3', 'HuggingFaceH4/zephyr-7b-beta'];
  }

  async testConnection() {
    if (!this.isAvailable()) {
      return { success: false, error: 'Hugging Face API key not provided.' };
    }
    try {
      const response = await this.generateCompletion([
        { role: 'user', content: 'Test connection' }
      ], { max_tokens: 10, model: 'HuggingFaceH4/zephyr-7b-beta' });
      
      return { 
        success: true, 
        response: response.content, 
        model: response.model,
        sdk_version: '2.6.1', // Latest as of July 2025
        features: {
          mcp_support: !!this.mcpClient,
          endpoint_support: !!this.hfEndpoint
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getCapabilities(modelName) {
    const model = modelName || 'mistralai/Mixtral-8x22B-Instruct-v0.1';
    
    // Base capabilities
    const capabilities = {
      vision: false,
      tool_use: false,
      json_mode: false,
      reasoning: false,
      large_context: false
    };
    
    // Meta Llama 3.1 series
    if (model.includes('Llama-3.1')) {
      capabilities.json_mode = true;
      capabilities.tool_use = true;
      
      // 70B model has enhanced capabilities
      if (model.includes('70B')) {
        capabilities.vision = true;
        capabilities.reasoning = true;
        capabilities.large_context = true;
      }
      
      // 8B model has some advanced features
      if (model.includes('8B')) {
        capabilities.large_context = true;
      }
    }
    
    // Mixtral models
    else if (model.includes('Mixtral')) {
      capabilities.json_mode = true;
      capabilities.tool_use = model.includes('8x22B'); // Only the larger model supports tool use
      capabilities.large_context = true;
    }
    
    // Mistral models
    else if (model.includes('Mistral')) {
      capabilities.json_mode = true;
    }
    
    // Zephyr and other models
    else if (model.includes('zephyr')) {
      capabilities.json_mode = true;
    }
    
    return capabilities;
  }
}

module.exports = HuggingFaceProvider;
