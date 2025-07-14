#!/usr/bin/env node

/**
 * Configuration Management for AI Changelog Generator
 * Handles configuration loading, validation, and defaults
 * Updated for GPT-4.1 series and Azure OpenAI v1 API
 */

const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor(configPath = null) {
    this.configPath = configPath || this.findConfigFile();
    this.config = this.loadConfig();
    this.validate();
  }

  findConfigFile() {
    const possiblePaths = [
      '.env.local',
      '.changelog.config.js',
      'changelog.config.json',
      path.join(process.cwd(), '.env.local')
    ];

    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }

    return '.env.local'; // Default
  }

  loadConfig() {
    const defaults = {
      // AI Provider Settings
      AI_PROVIDER: process.env.AI_PROVIDER || 'auto',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY,
      OLLAMA_HOST: process.env.OLLAMA_HOST || 'http://localhost:11434',
      OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3',

      // Azure OpenAI Settings 
      AZURE_OPENAI_ENDPOINT: process.env.AZURE_OPENAI_ENDPOINT,
      AZURE_OPENAI_KEY: process.env.AZURE_OPENAI_KEY,
      AZURE_OPENAI_DEPLOYMENT_NAME: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1',
      // Updated to current API version 
      AZURE_OPENAI_API_VERSION: process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview',
      AZURE_OPENAI_USE_V1_API: process.env.AZURE_OPENAI_USE_V1_API !== 'false',
      // Legacy API version for backward compatibility
      AZURE_OPENAI_LEGACY_API_VERSION: process.env.AZURE_OPENAI_LEGACY_API_VERSION || '2024-10-21',

      // Model Configuration - Updated GPT-4.1 Series 
      AI_MODEL: process.env.AI_MODEL || 'gpt-4.1',
      AI_MODEL_SIMPLE: process.env.AI_MODEL_SIMPLE || 'gpt-4.1-mini',
      AI_MODEL_COMPLEX: process.env.AI_MODEL_COMPLEX || 'gpt-4.1',
      AI_MODEL_REASONING: process.env.AI_MODEL_REASONING || 'o4-mini', // Latest compact reasoning model
      AI_MODEL_ADVANCED_REASONING: process.env.AI_MODEL_ADVANCED_REASONING || 'o4', // Latest advanced reasoning model
      AI_MODEL_REASONING_LEGACY: process.env.AI_MODEL_REASONING_LEGACY || 'o3-mini', // Previous generation compact
      AI_MODEL_ADVANCED_REASONING_LEGACY: process.env.AI_MODEL_ADVANCED_REASONING_LEGACY || 'o3', // Previous generation advanced
      AI_MODEL_NANO: process.env.AI_MODEL_NANO || 'gpt-4.1-nano',



      // Changelog Settings
      CHANGELOG_FILE: process.env.CHANGELOG_FILE || 'AI_CHANGELOG.md',
      CHANGELOG_FORMAT: process.env.CHANGELOG_FORMAT || 'standard',
      DEFAULT_COMMIT_COUNT: parseInt(process.env.DEFAULT_COMMIT_COUNT || '20'),

      // Output Settings
      INCLUDE_COMMIT_HASH: process.env.INCLUDE_COMMIT_HASH !== 'false',
      INCLUDE_AUTHOR: process.env.INCLUDE_AUTHOR !== 'false',
      INCLUDE_DATE: process.env.INCLUDE_DATE !== 'false',
      GROUP_BY_TYPE: process.env.GROUP_BY_TYPE !== 'false',

      // Git Settings
      EXCLUDE_MERGE_COMMITS: process.env.EXCLUDE_MERGE_COMMITS !== 'false',
      EXCLUDE_WIP_COMMITS: process.env.EXCLUDE_WIP_COMMITS !== 'false',

      // AI Settings
      AI_TEMPERATURE: parseFloat(process.env.AI_TEMPERATURE || '0.3'),
      AI_MAX_TOKENS: parseInt(process.env.AI_MAX_TOKENS || '1000'),
      AI_TIMEOUT: parseInt(process.env.AI_TIMEOUT || '30000'),

      // Performance Settings
      ENABLE_PROMPT_CACHING: process.env.ENABLE_PROMPT_CACHING !== 'false',
      AI_MODEL_SELECTION_STRATEGY: process.env.AI_MODEL_SELECTION_STRATEGY || 'adaptive',

      // MCP Server Settings
      MCP_SERVER_PORT: parseInt(process.env.MCP_SERVER_PORT || '3000'),
      MCP_SERVER_TIMEOUT: parseInt(process.env.MCP_SERVER_TIMEOUT || '30000')
    };

    // Load from config file if it exists
    if (this.configPath && fs.existsSync(this.configPath)) {
      if (this.configPath.endsWith('.json')) {
        try {
          const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
          return { ...defaults, ...fileConfig };
        } catch (error) {
          console.warn(`⚠️  Failed to parse JSON config file: ${error.message}`);
        }
      } else if (this.configPath.endsWith('.js')) {
        try {
          const fileConfig = require(path.resolve(this.configPath));
          return { ...defaults, ...fileConfig };
        } catch (error) {
          console.warn(`⚠️  Failed to load JS config file: ${error.message}`);
        }
      }
    }

    return defaults;
  }

  validate() {
    const errors = [];
    const warnings = [];

    // Validate AI provider configuration
    if (this.config.AI_PROVIDER === 'openai' && !this.config.OPENAI_API_KEY) {
      errors.push('OPENAI_API_KEY is required when AI_PROVIDER is set to "openai"');
    }

    if (this.config.AI_PROVIDER === 'azure') {
      if (!this.config.AZURE_OPENAI_ENDPOINT) {
        errors.push('AZURE_OPENAI_ENDPOINT is required when AI_PROVIDER is set to "azure"');
      }
      if (!this.config.AZURE_OPENAI_KEY) {
        errors.push('AZURE_OPENAI_KEY is required when AI_PROVIDER is set to "azure"');
      }
    }

    // Validate numeric values
    if (this.config.DEFAULT_COMMIT_COUNT < 1) {
      errors.push('DEFAULT_COMMIT_COUNT must be a positive integer');
    }

    if (this.config.AI_TEMPERATURE < 0 || this.config.AI_TEMPERATURE > 2) {
      errors.push('AI_TEMPERATURE must be between 0 and 2');
    }

    if (this.config.AI_MAX_TOKENS < 1) {
      errors.push('AI_MAX_TOKENS must be a positive integer');
    }

    // Check for outdated API versions
    if (this.config.AZURE_OPENAI_API_VERSION &&
        this.config.AZURE_OPENAI_API_VERSION < '2025-04-01-preview') {
      warnings.push(`AZURE_OPENAI_API_VERSION is outdated. Current recommended: 2025-04-01-preview`);
    }

    // Check model availability warnings
    if (this.config.AI_MODEL && !this.config.AI_MODEL.includes('gpt-4.1')) {
      warnings.push('Consider using GPT-4.1 series for better coding performance and 75% cost reduction with prompt caching');
    }

    // Provide helpful suggestions
    if (this.config.AZURE_OPENAI_ENDPOINT && !this.config.AZURE_OPENAI_USE_V1_API) {
      warnings.push('Consider enabling AZURE_OPENAI_USE_V1_API=true for always up-to-date API features');
    }

    if (errors.length > 0) {
      console.error('❌ Configuration errors:');
      errors.forEach(error => console.error(`   - ${error}`));
      console.error('   Please fix these errors before continuing.\n');
    }

    if (warnings.length > 0) {
      console.warn('⚠️  Configuration suggestions:');
      warnings.forEach(warning => console.warn(`   - ${warning}`));
      console.warn('   Consider updating for better performance.\n');
    }

    return errors.length === 0;
  }

  get(key) {
    return this.config[key];
  }

  getAll() {
    return { ...this.config };
  }

  isAIAvailable() {
    return !!(this.config.OPENAI_API_KEY ||
             (this.config.AZURE_OPENAI_ENDPOINT && this.config.AZURE_OPENAI_KEY));
  }

  getOptimalModelConfig() {
    const provider = this.config.AI_PROVIDER;
    const hasAzure = !!(this.config.AZURE_OPENAI_ENDPOINT && this.config.AZURE_OPENAI_KEY);
    const hasOpenAI = !!this.config.OPENAI_API_KEY;

    if (provider === 'azure' || (provider === 'auto' && hasAzure)) {
      return {
        provider: 'azure',
        models: {
          nano: this.config.AI_MODEL_NANO,
          simple: this.config.AI_MODEL_SIMPLE,
          default: this.config.AI_MODEL,
          complex: this.config.AI_MODEL_COMPLEX,
          reasoning: this.config.AI_MODEL_REASONING,
          advanced_reasoning: this.config.AI_MODEL_ADVANCED_REASONING,
          reasoning_legacy: this.config.AI_MODEL_REASONING_LEGACY,
          advanced_reasoning_legacy: this.config.AI_MODEL_ADVANCED_REASONING_LEGACY
        },
        features: {
          reasoning: true,
          promptCaching: true,
          largeContext: true
        }
      };
    }

    if (provider === 'openai' || (provider === 'auto' && hasOpenAI)) {
      return {
        provider: 'openai',
        models: {
          nano: this.config.AI_MODEL_NANO,
          simple: this.config.AI_MODEL_SIMPLE,
          default: this.config.AI_MODEL,
          complex: this.config.AI_MODEL_COMPLEX
        },
        features: {
          reasoning: false, // o-series not available on OpenAI
          promptCaching: this.config.AI_MODEL.includes('gpt-4.1'),
          largeContext: this.config.AI_MODEL.includes('gpt-4.1')
        }
      };
    }

    return null;
  }

  createSampleConfig() {
    const sampleConfig = `# AI Changelog Generator Configuration
# Copy this to .env.local and fill in your values

# AI Provider (auto, openai, azure)
AI_PROVIDER=auto

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key-here

# Azure OpenAI Configuration - Updated June 2025
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_KEY=your-azure-openai-key-here
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4.1
AZURE_OPENAI_API_VERSION=2025-04-01-preview
AZURE_OPENAI_USE_V1_API=true

# Model Configuration - GPT-4.1 Series (June 2025)
# Default: GPT-4.1 (1M token context, 21% better coding, 26% cheaper)
AI_MODEL=gpt-4.1
# Simple: GPT-4.1 Mini (efficient for small changes)
AI_MODEL_SIMPLE=gpt-4.1-mini
# Complex: GPT-4.1 (best for large refactors)
AI_MODEL_COMPLEX=gpt-4.1
# Reasoning: o4-mini (latest compact reasoning, Azure-only)
AI_MODEL_REASONING=o4-mini
# Advanced Reasoning: o4 (latest advanced reasoning, Azure-only)
AI_MODEL_ADVANCED_REASONING=o4
# Legacy Reasoning: o3-mini (previous generation compact, Azure-only)
AI_MODEL_REASONING_LEGACY=o3-mini
# Legacy Advanced Reasoning: o3 (previous generation advanced, Azure-only)
AI_MODEL_ADVANCED_REASONING_LEGACY=o3
# Nano: GPT-4.1 Nano (ultra-efficient for minimal changes)
AI_MODEL_NANO=gpt-4.1-nano

# Changelog Settings
CHANGELOG_FILE=AI_CHANGELOG.md
CHANGELOG_FORMAT=standard
DEFAULT_COMMIT_COUNT=20

# Output Settings
INCLUDE_COMMIT_HASH=true
INCLUDE_AUTHOR=true
INCLUDE_DATE=true
GROUP_BY_TYPE=true

# Git Settings
EXCLUDE_MERGE_COMMITS=true
EXCLUDE_WIP_COMMITS=true

# AI Settings
AI_TEMPERATURE=0.3
AI_MAX_TOKENS=1000
AI_TIMEOUT=30000

# Performance Settings
ENABLE_PROMPT_CACHING=true
AI_MODEL_SELECTION_STRATEGY=adaptive

# MCP Server Settings
MCP_SERVER_PORT=3000
MCP_SERVER_TIMEOUT=30000
`;

    fs.writeFileSync('.env.local.example', sampleConfig);
    console.log('✅ Sample configuration created: .env.local.example');
    console.log('💡 Copy this file to .env.local and update with your values');
    console.log('🚀 Now using GPT-4.1 series with 1M token context and enhanced capabilities');
    console.log('💰 Enable prompt caching for 75% cost reduction on repeated content');
    console.log('🧠 Use Azure OpenAI for reasoning models (o3/o3-mini, o4/o4-mini) and advanced features');
  }

  // New method to get model recommendations based on commit characteristics
  getModelRecommendation(commitInfo = {}) {
    const config = this.getOptimalModelConfig();
    if (!config) return null;

    const { files = 0, lines = 0, breaking = false, complex = false } = commitInfo;

    // Very large architectural changes
    if (files > 100 || lines > 5000 || (breaking && files > 20)) {
      if (config.features.reasoning) {
        return {
          model: config.models.advanced_reasoning,
          reason: 'Large architectural change - using advanced reasoning model',
          features: ['reasoning', 'enhanced safety', 'architectural analysis']
        };
      }
      return {
        model: config.models.complex,
        reason: 'Large change - using complex model',
        features: ['large context', 'detailed analysis']
      };
    }

    // Complex changes
    if (files > 20 || lines > 1000 || complex) {
      if (config.features.reasoning && (breaking || complex)) {
        return {
          model: config.models.reasoning,
          reason: 'Complex change with breaking/architectural elements',
          features: ['reasoning', 'pattern analysis']
        };
      }
      return {
        model: config.models.complex,
        reason: 'Complex change requiring detailed analysis',
        features: ['full capabilities', 'context understanding']
      };
    }

    // Simple changes
    if (files < 5 && lines < 200) {
      return {
        model: config.models.simple,
        reason: 'Simple change - using efficient model',
        features: ['cost effective', 'fast processing']
      };
    }

    // Minimal changes
    if (files < 3 && lines < 50) {
      return {
        model: config.models.nano,
        reason: 'Minimal change - using ultra-efficient model',
        features: ['ultra efficient', '90% cost savings']
      };
    }

    // Default
    return {
      model: config.models.default,
      reason: 'Standard change analysis',
      features: ['balanced performance', 'optimal for most cases']
    };
  }
}

module.exports = ConfigManager;

// CLI usage
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'create-sample') {
    const config = new ConfigManager();
    config.createSampleConfig();
  } else if (command === 'validate') {
    const config = new ConfigManager();
    console.log('🔍 Validating configuration...');
    if (config.validate()) {
      console.log('✅ Configuration is valid');

      // Show optimal configuration
      const optimal = config.getOptimalModelConfig();
      if (optimal) {
        console.log(`\n🎯 Optimal Configuration:`);
        console.log(`   Provider: ${optimal.provider.toUpperCase()}`);
        console.log(`   Features: ${Object.entries(optimal.features).filter(([k,v]) => v).map(([k]) => k).join(', ')}`);
      }
    } else {
      console.log('❌ Configuration has issues (see errors above)');
    }
  } else if (command === 'model-test') {
    const config = new ConfigManager();
    const testCases = [
      { files: 1, lines: 20, description: 'Minor fix' },
      { files: 8, lines: 150, description: 'Feature addition' },
      { files: 25, lines: 800, description: 'Major refactor' },
      { files: 120, lines: 5000, breaking: true, description: 'Breaking architecture change' }
    ];

    console.log('🎯 Model Recommendations:');
    testCases.forEach(testCase => {
      const rec = config.getModelRecommendation(testCase);
      console.log(`\n📝 ${testCase.description}:`);
      console.log(`   Model: ${rec?.model || 'none'}`);
      console.log(`   Reason: ${rec?.reason || 'no recommendation'}`);
      if (rec?.features) {
        console.log(`   Features: ${rec.features.join(', ')}`);
      }
    });
  } else {
    console.log('Usage:');
    console.log('  node config.js create-sample  # Create sample config file');
    console.log('  node config.js validate       # Validate current config');
    console.log('  node config.js model-test     # Test model selection logic');
  }
}