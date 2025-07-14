const { AzureOpenAI } = require('openai');
const { DefaultAzureCredential, getBearerTokenProvider } = require('@azure/identity');
const BaseProvider = require('./base-provider');

class AzureOpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.azureClient = null;
    if (this.isAvailable()) {
      this.initializeClient();
    }
  }

  initializeClient() {
    // Check if using API key or Azure AD authentication
    if (this.config.AZURE_USE_AD_AUTH === 'true') {
      try {
        const credential = new DefaultAzureCredential();
        const azureADTokenProvider = getBearerTokenProvider(
          credential, 
          'https://cognitiveservices.azure.com/.default'
        );
        
        this.azureClient = new AzureOpenAI({
          azureADTokenProvider,
          apiVersion: this.config.AZURE_API_VERSION || '2025-04-01-preview',
          azureEndpoint: this.config.AZURE_OPENAI_ENDPOINT
        });
      } catch (error) {
        console.error('Failed to initialize Azure AD authentication:', error.message);
        // Fallback to API key if AD auth fails
        this.initializeWithApiKey();
      }
    } else {
      this.initializeWithApiKey();
    }
  }

  initializeWithApiKey() {
    this.azureClient = new AzureOpenAI({
      apiKey: this.config.AZURE_OPENAI_KEY,
      apiVersion: this.config.AZURE_API_VERSION || '2025-04-01-preview',
      azureEndpoint: this.config.AZURE_OPENAI_ENDPOINT
    });
  }

  getName() {
    return 'azure';
  }

  isAvailable() {
    return !!(this.config.AZURE_OPENAI_ENDPOINT && 
      (this.config.AZURE_OPENAI_KEY || this.config.AZURE_USE_AD_AUTH === 'true'));
  }

  async generateCompletion(messages, options) {
    if (!this.isAvailable()) {
      throw new Error('Azure OpenAI provider is not configured.');
    }

    // In Azure, the model is the deployment name.
    const deploymentName = options.model || this.config.AZURE_OPENAI_DEPLOYMENT_NAME;

    const params = {
      model: deploymentName,
      messages,
      max_tokens: options.max_tokens || 1000,
      temperature: options.temperature || 0.3,
      user: options.user || this.config.AZURE_USER_ID,
    };

    // Add tool calling if provided
    if (options.tools) {
      params.tools = options.tools;
      params.tool_choice = options.tool_choice || 'auto';
    }

    // Add data sources for Azure-specific features like "On Your Data"
    if (options.dataSources) {
      params.data_sources = options.dataSources;
    }

    // Add streaming if requested
    if (options.stream) {
      params.stream = true;
      const stream = await this.azureClient.chat.completions.create(params);
      return { stream, model: params.model };
    }

    const completion = await this.azureClient.chat.completions.create(params);

    // Extract Azure-specific content filter results if present
    let contentFilters = null;
    if (completion.choices[0].content_filter_results) {
      contentFilters = completion.choices[0].content_filter_results;
    }

    return {
      content: completion.choices[0].message.content,
      model: completion.model,
      tokens: completion.usage.total_tokens,
      finish_reason: completion.choices[0].finish_reason,
      tool_calls: completion.choices[0].message.tool_calls,
      content_filters: contentFilters
    };
  }

  getModelRecommendation(commitDetails) {
    // Note: In Azure, these model names correspond to deployment names.
    if (commitDetails.breaking || commitDetails.complex) {
      return { model: 'o4', reason: 'Breaking or complex change detected, using o4 model' };
    }
    if (commitDetails.lines > 1000 || commitDetails.files > 25) {
      return { model: 'o3', reason: 'Large and complex commit, using o3 model' };
    }
    if (commitDetails.lines > 500 || commitDetails.files > 15) {
      return { model: 'gpt-4o', reason: 'Medium-large commit size' };
    }
    if (commitDetails.lines > 200 || commitDetails.files > 8) {
      return { model: 'gpt-4.1-standard', reason: 'Medium commit size' };
    }
    return { model: 'gpt-4.1-mini', reason: 'Standard commit size' };
  }

  async validateModelAvailability(modelName) {
    if (!this.isAvailable()) {
      return { available: false, error: 'Azure OpenAI credentials not provided' };
    }
    
    try {
      // For Azure, we'll do a simple test call to check if the deployment is available
      const response = await this.azureClient.chat.completions.create({
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
        alternatives: this.getSuggestedDeployments(modelName)
      };
    }
  }

  getSuggestedDeployments(modelName) {
    // Suggest alternative deployments based on capabilities
    if (modelName.includes('o4')) {
      return ['o3', 'gpt-4o', 'gpt-4.1-standard'];
    }
    if (modelName.includes('gpt-4o')) {
      return ['gpt-4.1-standard', 'gpt-4.1-mini'];
    }
    return ['gpt-4.1-mini', 'gpt-35-turbo'];
  }

  async testConnection() {
    if (!this.isAvailable()) {
      return { success: false, error: 'Azure OpenAI credentials not provided.' };
    }
    try {
      const response = await this.generateCompletion([
        { role: 'user', content: 'Test connection' }
      ], { max_tokens: 5 });
      return { 
        success: true, 
        response: response.content, 
        model: this.config.AZURE_OPENAI_DEPLOYMENT_NAME,
        auth_type: this.config.AZURE_USE_AD_AUTH === 'true' ? 'Azure AD' : 'API Key'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getCapabilities(modelName) {
    const model = modelName || this.config.AZURE_OPENAI_DEPLOYMENT_NAME;
    
    // Base capabilities
    const capabilities = {
      vision: false,
      tool_use: false,
      json_mode: false,
      reasoning: false,
      large_context: false,
      content_filtering: true, // Azure always has content filtering
      on_your_data: true // Azure supports On Your Data feature
    };
    
    // o3/o4 reasoning models (Azure-only)
    if (model.includes('o3') || model.includes('o4')) {
      capabilities.reasoning = true;
      capabilities.tool_use = true;
      capabilities.json_mode = true;
      capabilities.vision = true;
      capabilities.large_context = true;
    }
    
    // GPT-4o capabilities
    if (model.includes('gpt-4o')) {
      capabilities.vision = true;
      capabilities.tool_use = true;
      capabilities.json_mode = true;
      capabilities.large_context = true;
    }
    
    // GPT-4.1 series
    if (model.includes('gpt-4.1')) {
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

module.exports = AzureOpenAIProvider;
