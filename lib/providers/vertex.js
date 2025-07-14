const { GoogleGenAI } = require('@google/genai');
const { GoogleAuth } = require('google-auth-library');
const BaseProvider = require('./base-provider');

// Cache for model instances to avoid recreating them
const modelCache = new Map();

class VertexAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.client = null;
    this.generativeModel = null;
    this.defaultModel = config.VERTEX_MODEL || 'gemini-2.5-flash';
    this.auth = null;
    this.authClient = null;
    
    if (this.isAvailable()) {
      this.initializeClient();
    }
  }

  async initializeClient() {
    try {
      // Initialize Google Auth if needed
      if (this.config.VERTEX_KEY_FILE || this.config.VERTEX_CREDENTIALS) {
        this.auth = new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          keyFile: this.config.VERTEX_KEY_FILE,
          credentials: this.config.VERTEX_CREDENTIALS ? JSON.parse(this.config.VERTEX_CREDENTIALS) : undefined
        });
        this.authClient = await this.auth.getClient();
      }
      
      // Initialize the GoogleGenAI client with Vertex AI configuration
      const clientOptions = {
        vertexai: true,
        project: this.config.VERTEX_PROJECT_ID,
        location: this.config.VERTEX_LOCATION || 'us-central1',
        apiVersion: this.config.VERTEX_API_VERSION || 'v1'
      };
      
      // Add API endpoint if specified
      if (this.config.VERTEX_API_ENDPOINT) {
        clientOptions.apiEndpoint = this.config.VERTEX_API_ENDPOINT;
      }
      
      // Add auth token if available
      if (this.authClient) {
        const accessToken = await this.authClient.getAccessToken();
        clientOptions.apiKey = accessToken.token;
      }
      
      this.client = new GoogleGenAI(clientOptions);

      // Get the default generative model
      this.generativeModel = this.getModelInstance(this.defaultModel);
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Vertex AI client:', error);
      this.client = null;
      this.generativeModel = null;
      return false;
    }
  }

  getModelInstance(modelName, options = {}) {
    if (!this.client) {
      throw new Error('Vertex AI client not initialized');
    }
    
    // Create a cache key based on model name and options
    const cacheKey = `${modelName}-${JSON.stringify(options)}`;
    
    // Check if we already have this model instance cached
    if (modelCache.has(cacheKey)) {
      return modelCache.get(cacheKey);
    }
    
    // Default generation config
    const generationConfig = {
      temperature: options.temperature || this.config.VERTEX_TEMPERATURE || 0.7,
      topP: options.top_p || this.config.VERTEX_TOP_P || 0.95,
      topK: options.top_k || this.config.VERTEX_TOP_K || 40,
      maxOutputTokens: options.max_tokens || this.config.VERTEX_MAX_TOKENS || 8192,
    };
    
    // Add stop sequences if provided
    if (options.stop && options.stop.length > 0) {
      generationConfig.stopSequences = options.stop;
    }
    
    // Create model instance
    const modelInstance = this.client.getGenerativeModel({
      model: modelName,
      generationConfig,
      safetySettings: this.getSafetySettings()
    });
    
    // Cache the model instance
    modelCache.set(cacheKey, modelInstance);
    
    return modelInstance;
  }
  
  getSafetySettings() {
    // Configure safety settings based on environment variables or defaults
    const safetySettings = [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: this.config.VERTEX_SAFETY_HATE_SPEECH || 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: this.config.VERTEX_SAFETY_DANGEROUS || 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: this.config.VERTEX_SAFETY_SEXUALLY_EXPLICIT || 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: this.config.VERTEX_SAFETY_HARASSMENT || 'BLOCK_MEDIUM_AND_ABOVE'
      }
    ];
    
    return safetySettings;
  }

  getName() {
    return 'vertex';
  }

  isAvailable() {
    // Check if we have the required configuration for Vertex AI
    return !!(this.config.VERTEX_PROJECT_ID && 
             (this.config.VERTEX_KEY_FILE || this.config.VERTEX_CREDENTIALS || 
              process.env.GOOGLE_APPLICATION_CREDENTIALS));
  }

  async generateCompletion(messages, options) {
    if (!this.isAvailable()) {
      throw new Error('Vertex AI provider is not configured.');
    }
    
    // Initialize client if not already done
    if (!this.client) {
      await this.initializeClient();
      if (!this.client) {
        throw new Error('Failed to initialize Vertex AI client.');
      }
    }

    // Get the model to use
    const modelName = options.model || this.defaultModel;
    
    try {
      // Get or create model instance with the specified options
      const model = this.getModelInstance(modelName, options);

      // Convert messages to Vertex AI format
      const formattedMessages = this.formatMessages(messages);

      // Add function calling if provided and the model supports it
      let tools = null;
      if (options.tools && Array.isArray(options.tools) && options.tools.length > 0) {
        const capabilities = this.getCapabilities(modelName);
        if (capabilities.function_calling) {
          tools = this.formatTools(options.tools);
        }
      }

      // Handle streaming if requested
      if (options.stream && typeof options.onUpdate === 'function') {
        // For streaming, we'll use the generateContentStream method
        const streamResult = await model.generateContentStream({
          contents: formattedMessages,
          tools: tools
        });
        
        let fullContent = '';
        for await (const chunk of streamResult.stream) {
          const chunkContent = chunk.text();
          fullContent += chunkContent;
          options.onUpdate({
            content: chunkContent,
            done: false
          });
        }
        
        // Signal completion
        options.onUpdate({
          content: '',
          done: true
        });
        
        // Return the full result
        return {
          content: fullContent,
          model: modelName
        };
      } else {
        // Non-streaming request
        const result = await model.generateContent({
          contents: formattedMessages,
          tools: tools
        });
        
        // Extract the response text
        const responseText = result.response?.text() || '';
        
        // Handle function calls if present
        let functionCalls = null;
        if (result.response?.functionCalls && result.response.functionCalls.length > 0) {
          functionCalls = result.response.functionCalls.map(call => ({
            name: call.name,
            arguments: JSON.parse(call.args)
          }));
        }
        
        return {
          content: responseText,
          model: modelName,
          function_call: functionCalls ? functionCalls[0] : undefined,
          function_calls: functionCalls
        };
      }
    } catch (error) {
      // Handle rate limiting with exponential backoff
      if (error.message && (error.message.includes('quota') || error.message.includes('rate') || error.message.includes('limit'))) {
        const retryCount = options.retryCount || 0;
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.warn(`Rate limit hit, retrying in ${delay}ms...`);
          
          return new Promise((resolve) => {
            setTimeout(async () => {
              const retryOptions = { ...options, retryCount: retryCount + 1 };
              const result = await this.generateCompletion(messages, retryOptions);
              resolve(result);
            }, delay);
          });
        }
      }
      
      // If model not found, try with a fallback model
      if (error.message && (error.message.includes('not found') || error.message.includes('invalid model'))) {
        const fallbackModels = this.getSuggestedModels(modelName);
        if (fallbackModels.length > 0 && !options.triedFallback) {
          console.warn(`Model ${modelName} not found, trying fallback model: ${fallbackModels[0]}`);
          return this.generateCompletion(messages, { 
            ...options, 
            model: fallbackModels[0],
            triedFallback: true 
          });
        }
      }
      
      // Rethrow other errors or if we've exceeded retry attempts
      throw error;
    }
  }

  formatMessages(messages) {
    // Convert messages to Vertex AI format for the new SDK
    const formattedMessages = [];
    
    for (const message of messages) {
      const role = message.role === 'assistant' ? 'model' : message.role;
      
      // Handle different content formats
      let parts = [];
      
      // If content is a string, convert to text part
      if (typeof message.content === 'string') {
        parts.push({ text: message.content });
      }
      // If content is an array (multimodal), convert each part
      else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          }
          else if (part.type === 'image_url') {
            // Handle inline image data
            if (part.image_url.url.startsWith('data:image/')) {
              const imageData = this.getImageData(part.image_url.url);
              parts.push({ inlineData: { data: imageData, mimeType: 'image/jpeg' } });
            }
            // Handle remote image URL
            else {
              parts.push({ fileData: { mimeType: 'image/jpeg', fileUri: part.image_url.url } });
            }
          }
        }
      }
      
      formattedMessages.push({
        role,
        parts
      });
    }
    
    return formattedMessages;
  }

  getImageData(imageUrl) {
    // For base64 data URLs
    if (imageUrl.startsWith('data:')) {
      return imageUrl.split(',')[1];
    }
    
    // For regular URLs, we'd need to fetch the image and convert to base64
    // This is a placeholder - in a real implementation, you'd fetch the image
    throw new Error('Remote image fetching not implemented');
  }

  formatTools(tools) {
    // Convert OpenAI-style function definitions to Google GenAI format
    const functionDeclarations = [];
    
    for (const tool of tools) {
      if (tool.type === 'function' && tool.function) {
        functionDeclarations.push({
          name: tool.function.name,
          description: tool.function.description || '',
          parameters: tool.function.parameters || {}
        });
      } else if (Array.isArray(tool.functions)) {
        // Handle legacy format
        for (const fn of tool.functions) {
          functionDeclarations.push({
            name: fn.name,
            description: fn.description || '',
            parameters: fn.parameters || {}
          });
        }
      }
    }
    
    return { functionDeclarations };
  }

  estimateTokenCount(text) {
    // Simple estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  getModelRecommendation(commitDetails) {
    if (commitDetails.breaking || commitDetails.complex) {
      return { model: 'gemini-2.5-pro', reason: 'Complex or breaking change detected' };
    }
    if (commitDetails.lines > 1500 || commitDetails.files > 30) {
      return { model: 'gemini-2.5-pro', reason: 'Large commit size' };
    }
    if (commitDetails.lines > 800 || commitDetails.files > 20) {
      return { model: 'gemini-2.0-pro', reason: 'Medium-large commit size' };
    }
    if (commitDetails.lines > 300 || commitDetails.files > 10) {
      return { model: 'gemini-2.0-flash', reason: 'Medium commit size' };
    }
    return { model: 'gemini-2.5-flash', reason: 'Standard commit size' };
  }

  async validateModelAvailability(modelName) {
    if (!this.isAvailable()) {
      return { available: false, error: 'Vertex AI provider is not configured.' };
    }
    
    // Initialize client if not already done
    if (!this.client) {
      await this.initializeClient();
      if (!this.client) {
        return { available: false, error: 'Failed to initialize Vertex AI client.' };
      }
    }
    
    try {
      // Try to create a model instance and make a minimal test call
      const model = this.getModelInstance(modelName, { maxOutputTokens: 10 });
      
      await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: {
          maxOutputTokens: 10,
          temperature: 0
        }
      });
      
      return { 
        available: true, 
        capabilities: this.getCapabilities(modelName)
      };
    } catch (error) {
      // Check if this is a model not found error
      const isModelNotFound = error.message.includes('not found') || 
                             error.message.includes('invalid model') || 
                             error.message.includes('not available');
      
      return { 
        available: false, 
        error: error.message,
        reason: isModelNotFound ? 'model_not_found' : 'api_error',
        alternatives: this.getSuggestedModels(modelName)
      };
    }
  }

  getSuggestedModels(modelName) {
    // Suggest alternative models based on capabilities and model series
    if (modelName.includes('gemini-2.5-pro')) {
      return ['gemini-2.5-flash', 'gemini-2.0-pro', 'gemini-2.0-flash'];
    }
    if (modelName.includes('gemini-2.5-flash')) {
      return ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-flash'];
    }
    if (modelName.includes('gemini-2.0-pro')) {
      return ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    }
    if (modelName.includes('gemini-2.0-flash')) {
      return ['gemini-1.5-flash', 'gemini-1.5-pro'];
    }
    if (modelName.includes('gemini-1.5-pro')) {
      return ['gemini-1.5-flash', 'gemini-1.0-pro'];
    }
    // Default fallback suggestions
    return ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  }

  async testConnection() {
    if (!this.isAvailable()) {
      return { success: false, error: 'Vertex AI credentials not provided.' };
    }
    
    // Initialize client if not already done
    if (!this.client) {
      await this.initializeClient();
      if (!this.client) {
        return { success: false, error: 'Failed to initialize Vertex AI client.' };
      }
    }
    
    try {
      const modelName = this.defaultModel;
      const model = this.getModelInstance(modelName, { maxOutputTokens: 20 });
      
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Test connection' }] }],
        generationConfig: {
          maxOutputTokens: 20,
          temperature: 0
        }
      });
      
      return { 
        success: true, 
        response: response.response.text(), 
        model: modelName,
        project: this.config.VERTEX_PROJECT_ID,
        location: this.config.VERTEX_LOCATION || 'us-central1',
        capabilities: this.getCapabilities(modelName),
        sdk_version: '1.9.0' // Latest as of July 2025
      };
    } catch (error) {
      // Try with fallback model if default model fails
      if (error.message.includes('not found') || error.message.includes('invalid model')) {
        try {
          const fallbackModel = 'gemini-1.5-flash';
          console.warn(`Default model not available, trying fallback model: ${fallbackModel}`);
          
          const model = this.getModelInstance(fallbackModel, { maxOutputTokens: 20 });
          const response = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'Test connection' }] }],
            generationConfig: {
              maxOutputTokens: 20,
              temperature: 0
            }
          });
          
          return { 
            success: true, 
            response: response.response.text(), 
            model: fallbackModel,
            warning: `Default model ${this.defaultModel} not available, used ${fallbackModel} instead`,
            project: this.config.VERTEX_PROJECT_ID,
            location: this.config.VERTEX_LOCATION || 'us-central1',
            capabilities: this.getCapabilities(fallbackModel),
            sdk_version: '1.9.0' // Latest as of July 2025
          };
        } catch (fallbackError) {
          return { 
            success: false, 
            error: `Failed to connect with default and fallback models: ${error.message}` 
          };
        }
      }
      
      return { 
        success: false, 
        error: `Failed to connect to Vertex AI: ${error.message}` 
      };
    }
  }

  getCapabilities(modelName) {
    const model = modelName || this.defaultModel || 'gemini-2.5-flash';
    
    // Base capabilities
    const capabilities = {
      vision: false,
      tool_use: false,
      json_mode: false,
      reasoning: false,
      large_context: false,
      streaming: false,
      function_calling: false
    };
    
    // Gemini 2.5 series (latest as of July 2025)
    if (model.includes('gemini-2.5')) {
      capabilities.vision = true;
      capabilities.tool_use = true;
      capabilities.json_mode = true;
      capabilities.streaming = true;
      capabilities.function_calling = true;
      capabilities.reasoning = true;
      
      // Pro has enhanced capabilities
      if (model.includes('pro')) {
        capabilities.large_context = true; // 1M tokens
      }
      
      // Flash has good capabilities with faster performance
      if (model.includes('flash')) {
        capabilities.large_context = true; // 128K tokens
      }
    }
    
    // Gemini 2.0 series
    else if (model.includes('gemini-2.0')) {
      capabilities.tool_use = true;
      capabilities.json_mode = true;
      capabilities.streaming = true;
      capabilities.function_calling = true;
      
      // Pro has enhanced capabilities
      if (model.includes('pro')) {
        capabilities.vision = true;
        capabilities.large_context = true; // 128K tokens
        capabilities.reasoning = true;
      }
      
      // Flash has good capabilities with faster performance
      if (model.includes('flash')) {
        capabilities.vision = true;
      }
    }
    
    // Gemini 1.5 series
    else if (model.includes('gemini-1.5')) {
      capabilities.vision = true;
      capabilities.tool_use = true;
      capabilities.streaming = true;
      
      // Pro has larger context
      if (model.includes('pro')) {
        capabilities.large_context = true; // 1M tokens in pro
        capabilities.json_mode = true;
        capabilities.function_calling = true;
        capabilities.reasoning = true;
      }
      
      // Flash models
      if (model.includes('flash')) {
        capabilities.json_mode = true;
        capabilities.function_calling = model.includes('flash-001') || model.includes('flash-002');
      }
    }
    
    // Gemini 1.0 series
    else if (model.includes('gemini-1.0')) {
      capabilities.json_mode = true;
      
      // Pro model has good capabilities
      if (model.includes('pro')) {
        capabilities.vision = true;
        capabilities.tool_use = true;
        capabilities.function_calling = true;
      }
    }
    
    return capabilities;
  }
}

module.exports = VertexAIProvider;
