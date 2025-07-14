const fs = require('fs');
const path = require('path');
const ConfigManager = require('./config');

class ProviderManager {
  constructor() {
    this.configManager = new ConfigManager();
    this.providers = this.loadProviders();
    this.activeProvider = this.determineActiveProvider();
    this.isAvailable = !!this.activeProvider;
  }

  loadProviders() {
    const providers = {};
    const providersPath = path.join(__dirname, 'providers');
    const providerFiles = fs.readdirSync(providersPath);

    for (const file of providerFiles) {
      if (file.endsWith('.js') && file !== 'base-provider.js') {
        try {
          const ProviderClass = require(path.join(providersPath, file));
          const providerInstance = new ProviderClass(this.configManager.config);
          const providerName = providerInstance.getName();
          if (providerName) {
            providers[providerName] = providerInstance;
          }
        } catch (error) {
          console.error(`Failed to load provider from ${file}:`, error);
        }
      }
    }
    return providers;
  }

  determineActiveProvider() {
    const preferredProvider = this.configManager.get('AI_PROVIDER');

    if (preferredProvider && this.providers[preferredProvider] && this.providers[preferredProvider].isAvailable()) {
      return this.providers[preferredProvider];
    }

    // Auto-detect best available provider
    for (const providerName in this.providers) {
      const provider = this.providers[providerName];
      if (provider.isAvailable()) {
        return provider;
      }
    }

    return null; // No provider is available
  }

  getProvider() {
    if (!this.isAvailable) {
      // Return a dummy provider that can handle rule-based logic gracefully
      return {
        isAvailable: () => false,
        getName: () => 'none',
        generateCompletion: () => { throw new Error('No AI provider configured.'); },
        getModelRecommendation: () => ({ model: 'rule-based', reason: 'No AI provider configured.' }),
        testConnection: () => ({ success: false, error: 'No AI provider configured.' }),
        getCapabilities: () => ({})
      };
    }
    return this.activeProvider;
  }

  getAvailableProviders() {
    return Object.keys(this.providers);
  }
}

module.exports = ProviderManager;
