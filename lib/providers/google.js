/**
 * Google AI Provider for AI Changelog Generator
 * Uses Google Generative AI SDK v0.3.2 (July 2025)
 * Supports Gemini 2.5, 2.0 and 1.5 models
 */

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig } = require('@google/generative-ai');
const BaseProvider = require('./base-provider');

class GoogleProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.genAI = null;
    this.defaultModel = this.config.GOOGLE_DEFAULT_MODEL || 'gemini-2.5-flash';
    this.apiVersion = this.config.GOOGLE_API_VERSION || 'v1';
    this.modelCache = new Map(); // Cache model instances for reuse
    
    if (this.isAvailable()) {
      this.initializeClient();
    }
  }

  initializeClient() {
    const options = {
      apiVersion: this.apiVersion
    };
    
    // Add API endpoint if specified (for enterprise or custom deployments)
    if (this.config.GOOGLE_API_ENDPOINT) {
      options.apiEndpoint = this.config.GOOGLE_API_ENDPOINT;
    }
    
    // Add timeout if specified
    if (this.config.GOOGLE_TIMEOUT) {
      options.timeout = parseInt(this.config.GOOGLE_TIMEOUT, 10);
    }
    
    // Add retry options if specified
    if (this.config.GOOGLE_MAX_RETRIES) {
      options.retry = {
        retries: parseInt(this.config.GOOGLE_MAX_RETRIES, 10),
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 60000
      };
    }
    
    this.genAI = new GoogleGenerativeAI(this.config.GOOGLE_API_KEY, options);
  }

  getName() {
    return 'google';
  }

  isAvailable() {
    return !!this.config.GOOGLE_API_KEY;
  }

  async generateCompletion(messages, options) {
    if (!this.isAvailable()) {
      throw new Error('Google provider is not configured.');
    }

    const systemInstruction = messages.find(m => m.role === 'system')?.content;
    
    // Convert messages to Google's format
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        // Handle text messages
        if (typeof m.content === 'string') {
          return { role: m.role === 'assistant' ? 'model' : m.role, parts: [{ text: m.content }] };
        }
        // Handle multimodal messages (with images)
        else if (Array.isArray(m.content)) {
          const parts = m.content.map(part => {
            if (typeof part === 'string') {
              return { text: part };
            } else if (part.type === 'image_url') {
              return { 
                inlineData: {
                  mimeType: part.image_url.mime_type || 'image/jpeg',
                  data: part.image_url.url.startsWith('data:') 
                    ? part.image_url.url.split(',')[1] 
                    : Buffer.from(part.image_url.url).toString('base64')
                }
              };
            }
            return { text: JSON.stringify(part) };
          });
          return { role: m.role === 'assistant' ? 'model' : m.role, parts };
        }
        return { role: m.role === 'assistant' ? 'model' : m.role, parts: [{ text: JSON.stringify(m.content) }] };
      });

    // Use the model specified in options, or the default model from config, or fall back to gemini-2.5-flash
    const modelName = options.model || this.defaultModel || 'gemini-2.5-flash';
    
    // Configure generation config
    const generationConfig = new GenerationConfig({
      temperature: options.temperature || 0.4,
      maxOutputTokens: options.max_tokens || 8192,
      topP: options.top_p || 0.95,
      topK: options.top_k || 64,
      candidateCount: options.n || 1,
      stopSequences: options.stop || [],
      responseMimeType: options.response_format?.type === 'json_object' ? 'application/json' : undefined
    });

    // Configure safety settings
    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      }
    ];

    // Configure model options
    const modelOptions = {
      model: modelName,
      generationConfig,
      safetySettings
    };

    // Add system instruction if provided
    if (systemInstruction) {
      modelOptions.systemInstruction = { text: systemInstruction };
    }

    // Get or create the model instance
    let model;
    const modelCacheKey = `${modelName}-${JSON.stringify(modelOptions)}`;
    
    if (this.modelCache.has(modelCacheKey)) {
      model = this.modelCache.get(modelCacheKey);
    } else {
      model = this.genAI.getGenerativeModel(modelOptions);
      this.modelCache.set(modelCacheKey, model);
    }

    // Handle streaming if requested
    if (options.stream === true && typeof options.onStreamData === 'function') {
      try {
        // Create a streaming chat session
        const streamingChat = model.startChat({
          history: contents.slice(0, -1), // All but the last message
          systemInstruction: systemInstruction ? { text: systemInstruction } : undefined
        });
        
        // Send the last message with streaming
        const lastMessage = contents[contents.length - 1];
        const stream = await streamingChat.sendMessageStream(lastMessage.parts);
        
        let accumulatedText = '';
        let tokenCount = 0;
        
        // Process the stream
        for await (const chunk of stream) {
          const chunkText = chunk.text();
          accumulatedText += chunkText;
          tokenCount += chunk.usageMetadata?.totalTokenCount || 0;
          
          // Call the streaming callback with the chunk
          options.onStreamData({
            content: chunkText,
            model: modelName,
            tokens: chunk.usageMetadata?.totalTokenCount || 0,
            finish_reason: null
          });
        }
        
        // Final callback with complete response
        options.onStreamData({
          content: accumulatedText,
          model: modelName,
          tokens: tokenCount,
          finish_reason: 'stop',
          done: true
        });
        
        return {
          content: accumulatedText,
          model: modelName,
          tokens: tokenCount,
          finish_reason: 'stop'
        };
      } catch (error) {
        options.onStreamData({ error: error.message, done: true });
        throw error;
      }
    }

    // Add tools/functions if provided
    if (options.tools && options.tools.length > 0) {
      try {
        const tools = options.tools.map(tool => ({
          functionDeclarations: [{
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters
          }]
        }));
        
        // Create a chat session with tools
        const chat = model.startChat({
          tools,
          history: contents.slice(0, -1), // All but the last message
          systemInstruction: systemInstruction ? { text: systemInstruction } : undefined
        });
        
        // Generate response with tool calling
        const lastMessage = contents[contents.length - 1];
        const result = await chat.sendMessage(lastMessage.parts);
        const response = result.response;
        
        // Process function calls if present
        const functionCalls = response.functionCalls();
        
        return {
          content: response.text(),
          model: modelName,
          tool_calls: functionCalls.length > 0 ? functionCalls.map(call => ({
            id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            type: 'function',
            function: {
              name: call.name,
              arguments: call.args ? JSON.stringify(call.args) : '{}'
            }
          })) : undefined,
          tokens: response.usageMetadata?.totalTokenCount || 0,
          finish_reason: functionCalls.length > 0 ? 'tool_calls' : 'stop'
        };
      } catch (error) {
        console.error('Error in tool calling:', error);
        throw new Error(`Tool calling error: ${error.message}`);
      }
    }

    // Standard completion without tools
    try {
      const result = await model.generateContent({
        contents,
      });

      const response = result.response;

      return {
        content: response.text(),
        model: modelName,
        tokens: response.usageMetadata?.totalTokenCount || 0,
        finish_reason: response.finishReason || 'stop'
      };
    } catch (error) {
      // Handle rate limits and retries
      if (error.message.includes('rate limit') || error.message.includes('quota')) {
        const retryDelay = this.getRetryDelay();
        console.warn(`Rate limit hit, retrying in ${retryDelay}ms...`);
        await this.sleep(retryDelay);
        return this.generateCompletion(messages, options);
      }
      throw error;
    }
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
      return { available: false, error: 'Google API key not provided' };
    }
    
    try {
      // Google doesn't have a list models endpoint in the SDK, so we'll do a simple test call
      const model = this.genAI.getGenerativeModel({
        model: modelName,
      });
      
      // Use a minimal prompt to test model availability
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
      return { success: false, error: 'Google API key not provided.' };
    }
    try {
      const response = await this.generateCompletion([
        { role: 'user', content: 'Test connection' }
      ], { model: this.defaultModel || 'gemini-2.5-flash' });
      
      return { 
        success: true, 
        response: response.content, 
        model: response.model,
        capabilities: this.getCapabilities(response.model),
        sdk_version: '0.3.2' // Latest as of July 2025
      };
    } catch (error) {
      // Check if this is a model not found error
      if (error.message.includes('not found') || error.message.includes('invalid model')) {
        // Try with fallback model
        try {
          const fallbackModel = 'gemini-1.5-flash';
          console.warn(`Default model not available, trying fallback model: ${fallbackModel}`);
          
          const response = await this.generateCompletion([
            { role: 'user', content: 'Test connection' }
          ], { model: fallbackModel });
          
          return { 
            success: true, 
            response: response.content, 
            model: response.model,
            warning: `Default model not available, used ${fallbackModel} instead`,
            capabilities: this.getCapabilities(response.model),
            sdk_version: '0.3.2' // Latest as of July 2025
          };
        } catch (fallbackError) {
          return { 
            success: false, 
            error: `Failed to connect with default and fallback models: ${error.message}`,
            sdk_version: '0.3.2'
          };
        }
      }
      
      return { success: false, error: error.message };
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
      
      // Pro has enhanced capabilities
      if (model.includes('pro')) {
        capabilities.reasoning = true;
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
      }
      
      // Flash models
      if (model.includes('flash')) {
        capabilities.json_mode = true;
        capabilities.function_calling = model.includes('flash-001') || model.includes('flash-002');
      }
    }
    
    return capabilities;
  }
}

module.exports = GoogleProvider;
