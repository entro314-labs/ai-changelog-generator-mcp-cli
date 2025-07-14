#!/usr/bin/env node

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// AI Provider (supports OpenAI and Azure OpenAI)
const ProviderManager = require('./provider-manager');
const GitManager = require('./git-manager');
const ConfigManager = require('./config');
const colors = require('./colors');

// Dynamic import for inquirer since it's an ES module
let inquirer;
async function getInquirer() {
  if (!inquirer) {
    inquirer = await import('inquirer');
  }
  return inquirer.default;
}

// Configuration
const CHANGELOG_FILE = 'AI_CHANGELOG.md';
const COMMIT_TYPES = {
  feat: '🚀 Features',
  fix: '🐛 Bug Fixes',
  docs: '📚 Documentation',
  style: '💎 Styling',
  refactor: '♻️ Code Refactoring',
  perf: '⚡ Performance Improvements',
  test: '🧪 Tests',
  chore: '🔧 Maintenance',
  ci: '👷 CI/CD',
  build: '📦 Build System',
  db: '🗄️ Database',
  api: '🔌 API Changes',
  ui: '🎨 UI/UX',
  auth: '🔐 Authentication',
  config: '⚙️ Configuration',
  security: '🔐 Security',
  deps: '📦 Dependencies'
};

async function promptForConfig() {
  const inquirer = await getInquirer();
  console.log(colors.header('Welcome to AI Changelog Generator!'));
  console.log(colors.secondary('It looks like this is your first time. Let\'s set up your configuration.'));

  // Get all available providers from the ProviderManager
  const providerManager = new ProviderManager();
  const availableProviders = providerManager.getAvailableProviders();
  
  // Map provider IDs to display names
  const providerDisplayNames = {
    'openai': 'OpenAI',
    'azure': 'Azure OpenAI',
    'anthropic': 'Anthropic Claude',
    'google': 'Google AI (Gemini)',
    'vertex': 'Google Vertex AI',
    'huggingface': 'Hugging Face',
    'ollama': 'Ollama (Local)',
    'lmstudio': 'LM Studio (Local)',
    'none': 'None (Rule-based only)'
  };
  
  // Create provider choices for the prompt
  const providerChoices = availableProviders.map(p => ({
    name: providerDisplayNames[p] || p,
    value: p
  }));
  
  // Add None option
  providerChoices.push({
    name: 'None (Rule-based only)',
    value: 'none'
  });

  // Step 1: Select provider
  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Which AI provider would you like to configure?',
      choices: providerChoices,
      default: 'openai',
    }
  ]);
  
  // Step 2: Get provider-specific configuration
  let providerConfig = {};
  
  if (provider !== 'none') {
    // Get the provider instance to access its configuration requirements
    const providerInstance = providerManager.providers[provider];
    if (!providerInstance) {
      console.error(colors.error(`Provider ${provider} not found!`));
      return;
    }
    
    // Get required configuration fields from the provider
    const configFields = [];
    
    // OpenAI configuration
    if (provider === 'openai') {
      configFields.push(
        {
          type: 'password',
          name: 'OPENAI_API_KEY',
          message: 'Enter your OpenAI API Key:',
          mask: '*',
          validate: input => input ? true : 'API Key is required'
        },
        {
          type: 'input',
          name: 'OPENAI_ORGANIZATION',
          message: 'Enter your OpenAI Organization ID (optional):',
        },
        {
          type: 'list',
          name: 'OPENAI_DEFAULT_MODEL',
          message: 'Select your default model:',
          choices: ['gpt-4o', 'gpt-4.1-standard', 'gpt-4.1-mini', 'gpt-4.1-nano', 'o1'],
          default: 'gpt-4o'
        },
        {
          type: 'confirm',
          name: 'OPENAI_ADVANCED_CONFIG',
          message: 'Would you like to configure advanced settings?',
          default: false
        },
        {
          type: 'input',
          name: 'OPENAI_TIMEOUT',
          message: 'API request timeout (ms):',
          default: '60000',
          when: answers => answers.OPENAI_ADVANCED_CONFIG,
          validate: input => !isNaN(parseInt(input)) ? true : 'Must be a number'
        },
        {
          type: 'input',
          name: 'OPENAI_MAX_RETRIES',
          message: 'Maximum retry attempts:',
          default: '2',
          when: answers => answers.OPENAI_ADVANCED_CONFIG,
          validate: input => !isNaN(parseInt(input)) ? true : 'Must be a number'
        }
      );
    }
    
    // Azure OpenAI configuration
    else if (provider === 'azure') {
      configFields.push(
        {
          type: 'input',
          name: 'AZURE_OPENAI_ENDPOINT',
          message: 'Enter your Azure OpenAI Endpoint:',
          validate: input => input.startsWith('https://') ? true : 'Endpoint must start with https://'
        },
        {
          type: 'password',
          name: 'AZURE_OPENAI_KEY',
          message: 'Enter your Azure OpenAI API Key:',
          mask: '*',
          validate: input => input ? true : 'API Key is required'
        },
        {
          type: 'input',
          name: 'AZURE_OPENAI_DEPLOYMENT_NAME',
          message: 'Enter your Azure OpenAI Deployment Name:',
          default: 'gpt-4o',
          validate: input => input ? true : 'Deployment name is required'
        },
        {
          type: 'list',
          name: 'AZURE_OPENAI_API_VERSION',
          message: 'Select Azure OpenAI API Version:',
          choices: ['2025-04-01-preview', '2024-10-21', 'v1'],
          default: '2025-04-01-preview'
        },
        {
          type: 'confirm',
          name: 'AZURE_USE_ACTIVE_DIRECTORY',
          message: 'Use Azure Active Directory authentication?',
          default: false
        }
      );
    }
    
    // Anthropic configuration
    else if (provider === 'anthropic') {
      configFields.push(
        {
          type: 'password',
          name: 'ANTHROPIC_API_KEY',
          message: 'Enter your Anthropic API Key:',
          mask: '*',
          validate: input => input ? true : 'API Key is required'
        },
        {
          type: 'list',
          name: 'ANTHROPIC_DEFAULT_MODEL',
          message: 'Select your default model:',
          choices: [
            'claude-sonnet-4-20250514',
            'claude-opus-4-20250617',
            'claude-3.7-sonnet-20240620',
            'claude-3.5-sonnet-20240620',
            'claude-3.5-haiku-20240307'
          ],
          default: 'claude-sonnet-4-20250514'
        },
        {
          type: 'confirm',
          name: 'ANTHROPIC_ADVANCED_CONFIG',
          message: 'Would you like to configure advanced settings?',
          default: false
        },
        {
          type: 'input',
          name: 'ANTHROPIC_API_URL',
          message: 'Custom API URL (optional):',
          when: answers => answers.ANTHROPIC_ADVANCED_CONFIG
        },
        {
          type: 'input',
          name: 'ANTHROPIC_TIMEOUT',
          message: 'API request timeout (ms):',
          default: '120000',
          when: answers => answers.ANTHROPIC_ADVANCED_CONFIG,
          validate: input => !isNaN(parseInt(input)) ? true : 'Must be a number'
        }
      );
    }
    
    // Google AI (Gemini) configuration
    else if (provider === 'google') {
      configFields.push(
        {
          type: 'password',
          name: 'GOOGLE_API_KEY',
          message: 'Enter your Google AI API Key:',
          mask: '*',
          validate: input => input ? true : 'API Key is required'
        },
        {
          type: 'list',
          name: 'GOOGLE_DEFAULT_MODEL',
          message: 'Select your default model:',
          choices: [
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-2.0-flash',
            'gemini-2.0-pro',
            'gemini-1.5-pro',
            'gemini-1.5-flash'
          ],
          default: 'gemini-2.5-flash'
        },
        {
          type: 'input',
          name: 'GOOGLE_API_VERSION',
          message: 'API Version:',
          default: 'v1'
        }
      );
    }
    
    // Google Vertex AI configuration
    else if (provider === 'vertex') {
      configFields.push(
        {
          type: 'input',
          name: 'GOOGLE_CLOUD_PROJECT',
          message: 'Enter your Google Cloud Project ID:',
          validate: input => input ? true : 'Project ID is required'
        },
        {
          type: 'input',
          name: 'GOOGLE_CLOUD_LOCATION',
          message: 'Enter your Google Cloud Location:',
          default: 'us-central1',
          validate: input => input ? true : 'Location is required'
        },
        {
          type: 'list',
          name: 'VERTEX_DEFAULT_MODEL',
          message: 'Select your default model:',
          choices: [
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-2.0-flash',
            'gemini-2.0-pro'
          ],
          default: 'gemini-2.5-flash'
        },
        {
          type: 'confirm',
          name: 'VERTEX_USE_OPENAI_COMPAT',
          message: 'Use OpenAI-compatible endpoint?',
          default: false
        }
      );
    }
    
    // Hugging Face configuration
    else if (provider === 'huggingface') {
      configFields.push(
        {
          type: 'password',
          name: 'HUGGINGFACE_API_KEY',
          message: 'Enter your Hugging Face API Key:',
          mask: '*',
          validate: input => input ? true : 'API Key is required'
        },
        {
          type: 'list',
          name: 'HUGGINGFACE_PROVIDER',
          message: 'Select your preferred provider:',
          choices: ['auto', 'huggingface', 'replicate', 'together', 'sambanova', 'fal'],
          default: 'auto'
        },
        {
          type: 'input',
          name: 'HUGGINGFACE_DEFAULT_MODEL',
          message: 'Enter your default model (e.g., meta-llama/Llama-3.1-8B-Instruct):',
          default: 'meta-llama/Llama-3.1-8B-Instruct'
        },
        {
          type: 'input',
          name: 'HUGGINGFACE_ENDPOINT_URL',
          message: 'Enter custom endpoint URL (optional for dedicated endpoints):'
        }
      );
    }
    
    // Ollama configuration
    else if (provider === 'ollama') {
      configFields.push(
        {
          type: 'input',
          name: 'OLLAMA_HOST',
          message: 'Enter your Ollama host URL:',
          default: 'http://localhost:11434',
          validate: input => input.startsWith('http://') || input.startsWith('https://') ? true : 'URL must start with http:// or https://'
        },
        {
          type: 'input',
          name: 'OLLAMA_MODEL',
          message: 'Enter your default Ollama model:',
          default: 'llama3.1',
          validate: input => input ? true : 'Model name is required'
        },
        {
          type: 'confirm',
          name: 'OLLAMA_PULL_IF_MISSING',
          message: 'Automatically pull models if missing?',
          default: true
        },
        {
          type: 'input',
          name: 'OLLAMA_TIMEOUT',
          message: 'Request timeout in milliseconds:',
          default: '60000',
          validate: input => !isNaN(parseInt(input)) ? true : 'Must be a number'
        }
      );
    }
    
    // LM Studio configuration
    else if (provider === 'lmstudio') {
      configFields.push(
        {
          type: 'input',
          name: 'LMSTUDIO_HOST',
          message: 'Enter your LM Studio host URL:',
          default: 'http://localhost:1234',
          validate: input => input.startsWith('http://') || input.startsWith('https://') ? true : 'URL must start with http:// or https://'
        },
        {
          type: 'input',
          name: 'LMSTUDIO_MODEL',
          message: 'Enter your default LM Studio model:',
          default: 'llama-3.2-1b-instruct',
          validate: input => input ? true : 'Model name is required'
        },
        {
          type: 'confirm',
          name: 'LMSTUDIO_USE_OPENAI_COMPAT',
          message: 'Use OpenAI-compatible API?',
          default: true
        }
      );
    }
    
    // Prompt for the provider-specific configuration
    providerConfig = await inquirer.prompt(configFields);
  }
  
  // Step 3: Generate configuration file
  let configContent = '# AI Changelog Generator Configuration\n';
  configContent += `# Generated on ${new Date().toISOString()}\n`;
  configContent += `AI_PROVIDER=${provider}\n\n`;
  
  // Add provider-specific configuration
  if (provider !== 'none') {
    configContent += `# ${providerDisplayNames[provider] || provider} Configuration\n`;
    
    for (const [key, value] of Object.entries(providerConfig)) {
      // Skip advanced config flags and null/undefined values
      if (key.includes('ADVANCED_CONFIG') || value === null || value === undefined) {
        continue;
      }
      configContent += `${key}=${value}\n`;
    }
  }
  
  // Add common configuration
  configContent += '\n# Common Configuration\n';
  configContent += 'CHANGELOG_FILE=AI_CHANGELOG.md\n';
  configContent += 'DETAILED_MODE=false\n';
  configContent += 'INCLUDE_ATTRIBUTION=true\n';
  
  // Write configuration to file
  fs.writeFileSync('.env.local', configContent);
  
  console.log(colors.success('\n✅ Configuration saved to .env.local!'));
  console.log(colors.secondary('You can edit this file directly to make changes in the future.'));
  
  // Test the configuration if a provider was selected
  if (provider !== 'none') {
    console.log(colors.info('\nTesting provider connection...'));
    
    // Reload dotenv to pick up new config
    require('dotenv').config({ path: '.env.local', override: true });
    
    // Create a new provider manager with the updated configuration
    const newProviderManager = new ProviderManager();
    const selectedProvider = newProviderManager.getProvider();
    
    try {
      const testResult = await selectedProvider.testConnection();
      if (testResult.success) {
        console.log(colors.success(`✅ Successfully connected to ${providerDisplayNames[provider] || provider}!`));
        console.log(colors.info(`Model: ${testResult.model || 'Unknown'}`));
        if (testResult.capabilities) {
          console.log(colors.info('Capabilities:', JSON.stringify(testResult.capabilities, null, 2)));
        }
      } else {
        console.log(colors.error(`❌ Connection failed: ${testResult.error}`));
        console.log(colors.secondary('You may need to edit .env.local to fix the configuration.'));
      }
    } catch (error) {
      console.log(colors.error(`❌ Connection test error: ${error.message}`));
      console.log(colors.secondary('You may need to edit .env.local to fix the configuration.'));
    }
  }
  
  console.log(colors.secondary('\nRe-running the generator...\n'));
  
  // Reload dotenv to pick up new config
  require('dotenv').config({ path: '.env.local', override: true });
}

class AIChangelogGenerator {
  constructor(options = {}) {
    this.analysisMode = 'standard';
    this.modelOverride = null; // New: Allow model override
    this.dryRun = options.dryRun || false; // Add dry-run mode
    this.noColor = options.noColor || false; // Add option to disable colors
    this.includeAttribution = options.includeAttribution !== false; // Add attribution option (enabled by default)
    this.configManager = new ConfigManager();
    this.metrics = {
      startTime: Date.now(),
      commitsProcessed: 0,
      apiCalls: 0,
      errors: 0,
      batchesProcessed: 0,
      totalTokens: 0,
      cacheHits: 0
    };

    // Configure colors
    if (this.noColor || process.env.NO_COLOR) {
      colors.disable();
    }

    // Initialize components
    this.initializeComponents();
  }

  initializeComponents() {
    try {
      // Initialize git manager
      this.gitManager = new GitManager();
      this.gitExists = this.gitManager.isGitRepo;

      // Initialize AI provider
      this.providerManager = new ProviderManager();
    this.aiProvider = this.providerManager.getProvider();
      this.hasAI = this.aiProvider.isAvailable;

      if (!this.hasAI) {
        console.log(colors.warningMessage('No AI provider configured. Using rule-based analysis...'));
        console.log(colors.infoMessage('Configure AZURE_OPENAI_* or OPENAI_API_KEY in .env.local for AI-powered analysis'));
      } else {
        console.log(colors.aiMessage(`AI Provider: ${colors.highlight(this.aiProvider.activeProvider.toUpperCase())} (${this.aiProvider.getProviderInfo()})`));

        // Enhanced: Log model capabilities
        this.logModelCapabilities();
      }
    } catch (error) {
      console.error(colors.errorMessage(`Initialization failed: ${error.message}`));
      this.gitExists = false;
      this.hasAI = false;
      this.metrics.errors++;
    }
  }

  // Enhanced: Log available model capabilities
  logModelCapabilities() {
    if (!this.hasAI) return;

    const defaultModel = this.aiProvider.modelConfig.default;
    const capabilities = this.aiProvider.getModelCapabilities(defaultModel);

    const features = [];
    if (capabilities.reasoning) features.push('🧠 Advanced Reasoning');
    if (capabilities.largeContext) features.push('📚 1M Token Context');
    if (capabilities.promptCaching) features.push('💰 75% Cost Reduction');
    if (capabilities.codingOptimized) features.push('⚡ Coding Optimized');

    if (features.length > 0) {
      console.log(colors.infoMessage(`Model Features: ${colors.highlight(features.join(', '))}`));
    }
  }

  setAnalysisMode(mode) {
    const validModes = ['standard', 'detailed', 'enterprise'];
    if (validModes.includes(mode)) {
      this.analysisMode = mode;
      console.log(colors.metricsMessage(`Analysis mode set to: ${colors.highlight(mode)}`));
    } else {
      console.warn(colors.warningMessage(`Invalid analysis mode: ${mode}. Using standard mode.`));
      this.analysisMode = 'standard';
    }
  }

  // Enhanced: Smart model selection based on commit complexity
  async selectOptimalModel(commitAnalysis) {
    if (!this.hasAI) return null;

    // Check for model override first
    if (this.modelOverride) {
      console.log(`🎯 Using model override: ${this.modelOverride}`);
      return this.modelOverride;
    }

    const { files, diffStats, breaking, semanticAnalysis } = commitAnalysis;
    const filesCount = files?.length || 0;
    const linesChanged = (diffStats?.insertions || 0) + (diffStats?.deletions || 0);

    // Detect complex patterns
    const hasArchitecturalChanges = semanticAnalysis?.patterns?.includes('refactor') ||
                                   semanticAnalysis?.patterns?.includes('architecture') ||
                                   semanticAnalysis?.frameworks?.length > 2;

    try {
      // Enhanced: Use AI provider's intelligent model selection
      const commitInfo = {
        files: files?.map(f => f.filePath) || [],
        additions: diffStats?.insertions || 0,
        deletions: diffStats?.deletions || 0,
        message: commitAnalysis.subject,
        breaking,
        complex: hasArchitecturalChanges
      };

      const optimalModel = await this.aiProvider.selectOptimalModel(commitInfo);

      if (optimalModel?.model) {
        console.log(colors.infoMessage(`Selected model: ${colors.highlight(optimalModel.model)} for commit (${colors.number(filesCount)} files, ${colors.number(linesChanged)} lines)`));

        if (optimalModel.capabilities?.reasoning) {
          console.log(colors.aiMessage('Using reasoning model for complex analysis'));
        }

        return optimalModel.model;
      }
    } catch (error) {
      console.warn(colors.warningMessage(`Model selection failed: ${error.message}, using default`));
    }

    return this.aiProvider.modelConfig.default;
  }

  // commit analysis with comprehensive diff understanding
  async getCommitAnalysis(commitHash) {
    try {
      // Validate commit hash first
      if (!this.gitManager.validateCommitHash(commitHash)) {
        console.warn(colors.warningMessage(`Invalid commit hash: ${colors.hash(commitHash)}`));
        return null;
      }

      // Get comprehensive commit information
      const commitInfo = this.gitManager.execGit(`git show --pretty=format:"%H|%s|%an|%ad|%B" --no-patch ${commitHash}`);
      const lines = commitInfo.split('\n');
      const [hash, subject, author, date] = lines[0].split('|');
      const body = lines.slice(1).join('\n').trim();

      // Get files with detailed analysis
      const filesCommand = `git show --name-status --pretty=format: ${commitHash}`;
      const filesOutput = this.gitManager.execGitSafe(filesCommand);

      const files = await Promise.all(
        filesOutput.split('\n')
          .filter(Boolean)
          .map(async (line) => {
            const parts = line.split('\t');
            if (parts.length < 2) return null;
            const [status, filePath] = parts;
            return await this.analyzeFileChange(commitHash, status, filePath);
          })
      );

      // Filter out null entries
      const validFiles = files.filter(Boolean);

      // Get overall diff statistics
      const diffStats = this.getCommitDiffStats(commitHash);

      const analysis = {
        hash: hash.substring(0, 7),
        fullHash: hash,
        subject,
        author,
        date,
        body,
        files: validFiles,
        diffStats,
        type: this.extractCommitType(subject),
        scope: this.extractCommitScope(subject),
        breaking: this.isBreakingChange(subject, body),
        semanticAnalysis: this.performSemanticAnalysis(validFiles, subject, body),
        complexity: this.assessOverallComplexity(validFiles, diffStats),
        riskAssessment: this.assessRisk(validFiles, diffStats, subject, body),
        messageQuality: this.assessCommitMessageQuality(subject, body)
      };

      this.metrics.commitsProcessed++;
      return analysis;
    } catch (error) {
      console.error(colors.errorMessage(`Error analyzing commit ${colors.hash(commitHash)}: ${error.message}`));
      this.metrics.errors++;
      return null;
    }
  }

  // Assess overall complexity
  assessOverallComplexity(files, diffStats) {
    const filesCount = files.length;
    const linesChanged = (diffStats.insertions || 0) + (diffStats.deletions || 0);

    let complexityScore = 0;

    // File count impact
    if (filesCount > 50) complexityScore += 5;
    else if (filesCount > 20) complexityScore += 3;
    else if (filesCount > 10) complexityScore += 2;
    else if (filesCount > 5) complexityScore += 1;

    // Lines changed impact
    if (linesChanged > 5000) complexityScore += 5;
    else if (linesChanged > 1000) complexityScore += 3;
    else if (linesChanged > 500) complexityScore += 2;
    else if (linesChanged > 100) complexityScore += 1;

    // File type diversity
    const categories = new Set(files.map(f => f.category));
    if (categories.size > 4) complexityScore += 2;
    else if (categories.size > 2) complexityScore += 1;

    // Determine complexity level
    let level = 'minimal';
    if (complexityScore >= 8) level = 'very high';
    else if (complexityScore >= 6) level = 'high';
    else if (complexityScore >= 4) level = 'medium';
    else if (complexityScore >= 2) level = 'low';

    return {
      level,
      score: complexityScore,
      factors: {
        filesCount,
        linesChanged,
        categoriesCount: categories.size
      }
    };
  }

  // Risk assessment
  assessRisk(files, diffStats, subject, body) {
    let riskScore = 0;
    const riskFactors = [];

    // Breaking changes
    if (this.isBreakingChange(subject, body)) {
      riskScore += 5;
      riskFactors.push('Breaking changes detected');
    }

    // Database changes
    if (files.some(f => f.category === 'database')) {
      riskScore += 3;
      riskFactors.push('Database schema changes');
    }

    // Configuration changes
    if (files.some(f => f.category === 'config')) {
      riskScore += 2;
      riskFactors.push('Configuration changes');
    }

    // Large scale changes
    if (files.length > 50 || (diffStats.insertions + diffStats.deletions) > 2000) {
      riskScore += 2;
      riskFactors.push('Large scale changes');
    }

    // Security-related changes
    const securityKeywords = ['auth', 'security', 'password', 'token', 'permission'];
    if (securityKeywords.some(keyword =>
      subject.toLowerCase().includes(keyword) || body.toLowerCase().includes(keyword))) {
      riskScore += 3;
      riskFactors.push('Security-related changes');
    }

    let level = 'low';
    if (riskScore >= 8) level = 'critical';
    else if (riskScore >= 6) level = 'high';
    else if (riskScore >= 4) level = 'medium';
    else if (riskScore >= 2) level = 'low-medium';

    return {
      level,
      score: riskScore,
      factors: riskFactors
    };
  }

  // Deep file change analysis
  async analyzeFileChange(commitHash, status, filePath) {
    try {
      // Get file diff with context - improved error handling
      const diffCommand = `git show ${commitHash} --pretty=format: -U5 -- "${filePath}"`;
      let diff = '';

      // Use the safer git show method that suppresses stderr
      diff = this.gitManager.execGitShow(diffCommand);
      
      if (diff === null) {
        // File doesn't exist or other git error occurred
        if (status === 'D') {
          diff = 'File deleted in this commit';
        } else {
          // For missing files, provide a clean user message without git details
          console.warn(colors.warningMessage(`⚠️  File ${colors.file(filePath)} not available (renamed, moved, or binary)`));
          diff = 'File content unavailable (renamed, moved, or binary)';
        }
      } else if (!diff || diff.trim() === '') {
        // Empty diff handling
        if (status === 'A') {
          diff = 'New file created';
        } else {
          diff = 'No changes detected (binary or empty file)';
        }
      }

      // Get file content context with better error handling
      let beforeContent = '';
      let afterContent = '';

      if (status !== 'A' && !diff.includes('not available')) {
        const beforeResult = this.gitManager.execGitShow(`git show ${commitHash}~1:"${filePath}"`);
        beforeContent = beforeResult ? beforeResult.slice(0, 1000) : '';
      }

      if (status !== 'D' && !diff.includes('not available')) {
        const afterResult = this.gitManager.execGitShow(`git show ${commitHash}:"${filePath}"`);
        afterContent = afterResult ? afterResult.slice(0, 1000) : '';
      }

      return {
        status,
        filePath,
        diff,
        beforeContent,
        afterContent,
        category: this.categorizeFile(filePath),
        language: this.detectLanguage(filePath),
        importance: this.assessFileImportance(filePath, status),
        complexity: this.assessChangeComplexity(diff),
        semanticChanges: this.analyzeSemanticChanges(diff, filePath),
        functionalImpact: this.analyzeFunctionalImpact(diff, filePath, status),
        businessRelevance: this.assessBusinessRelevance(filePath, diff),
        fileExists: !diff.includes('not found') && !diff.includes('does not exist')
      };
    } catch (error) {
      console.error(colors.errorMessage(`Error analyzing file ${colors.file(filePath)}: ${error.message}`));
      this.metrics.errors++;
      
      // Return minimal file info even on error
      return {
        status,
        filePath,
        diff: 'Analysis failed',
        beforeContent: '',
        afterContent: '',
        category: this.categorizeFile(filePath),
        language: this.detectLanguage(filePath),
        importance: 1,
        complexity: 1,
        semanticChanges: { patterns: [], frameworks: [], codeElements: [] },
        functionalImpact: null,
        businessRelevance: 1,
        fileExists: false,
        error: error.message
      };
    }
  }

  // Extract commit type from conventional commit format
  extractCommitType(subject) {
    if (!subject) return 'other';

    const match = subject.match(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|security|deps|config|ui|api|db|wip)(\(.+\))?!?:/i);
    return match ? match[1].toLowerCase() : this.inferTypeFromMessage(subject);
  }

  inferTypeFromMessage(message) {
    if (!message) return 'other';

    const lowerMessage = message.toLowerCase();

    // Common patterns for type inference
    if (lowerMessage.includes('add') || lowerMessage.includes('new') || lowerMessage.includes('implement')) return 'feat';
    if (lowerMessage.includes('fix') || lowerMessage.includes('bug') || lowerMessage.includes('resolve')) return 'fix';
    if (lowerMessage.includes('update') || lowerMessage.includes('upgrade') || lowerMessage.includes('improve')) return 'refactor';
    if (lowerMessage.includes('remove') || lowerMessage.includes('delete') || lowerMessage.includes('clean')) return 'chore';
    if (lowerMessage.includes('test') || lowerMessage.includes('spec')) return 'test';
    if (lowerMessage.includes('doc') || lowerMessage.includes('readme')) return 'docs';
    if (lowerMessage.includes('style') || lowerMessage.includes('format') || lowerMessage.includes('lint')) return 'style';
    if (lowerMessage.includes('performance') || lowerMessage.includes('perf') || lowerMessage.includes('optimize')) return 'perf';
    if (lowerMessage.includes('security') || lowerMessage.includes('vulnerability')) return 'security';
    if (lowerMessage.includes('config') || lowerMessage.includes('setting')) return 'config';
    if (lowerMessage.includes('build') || lowerMessage.includes('deploy') || lowerMessage.includes('release')) return 'build';
    if (lowerMessage.includes('ci') || lowerMessage.includes('workflow') || lowerMessage.includes('action')) return 'ci';
    if (lowerMessage.includes('depend') || lowerMessage.includes('package') || lowerMessage.includes('version')) return 'deps';

    return 'other';
  }

  // Extract scope from conventional commit format
  extractCommitScope(subject) {
    if (!subject) return null;

    const match = subject.match(/^[a-z]+\((.+)\)!?:/i);
    return match ? match[1] : null;
  }

  // Check if commit represents a breaking change
  isBreakingChange(subject, body) {
    if (!subject) return false;

    return subject.includes('!:') ||
           subject.toUpperCase().includes('BREAKING') ||
           body.includes('BREAKING CHANGE:') ||
           body.includes('BREAKING-CHANGE:') ||
           body.toUpperCase().includes('BREAKING CHANGE');
  }

  // Categorize file by type
  categorizeFile(filePath) {
    if (!filePath) return 'other';

    const pathLower = filePath.toLowerCase();

    if (pathLower.match(/\.(ts|tsx|js|jsx)$/)) return 'source';
    if (pathLower.match(/\.(css|scss|sass|less|styl)$/)) return 'style';
    if (pathLower.match(/\.(json|yaml|yml|toml|ini|xml)$/)) return 'config';
    if (pathLower.match(/\.(md|txt|rst|adoc)$/)) return 'docs';
    if (pathLower.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) return 'test';
    if (pathLower.match(/\.(sql|prisma)$/) || pathLower.includes('migration')) return 'database';
    if (pathLower.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)) return 'asset';
    if (pathLower.match(/\.(sh|bash|ps1|bat)$/)) return 'script';
    return 'other';
  }

  // Detect programming language
  detectLanguage(filePath) {
    if (!filePath) return 'Unknown';

    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap = {
      'ts': 'TypeScript',
      'tsx': 'TypeScript React',
      'js': 'JavaScript',
      'jsx': 'JavaScript React',
      'py': 'Python',
      'java': 'Java',
      'c': 'C',
      'cpp': 'C++',
      'go': 'Go',
      'rs': 'Rust',
      'php': 'PHP',
      'rb': 'Ruby',
      'swift': 'Swift',
      'kt': 'Kotlin',
      'css': 'CSS',
      'scss': 'SCSS',
      'sass': 'Sass',
      'html': 'HTML',
      'json': 'JSON',
      'md': 'Markdown',
      'sql': 'SQL',
      'yml': 'YAML',
      'yaml': 'YAML',
      'toml': 'TOML',
      'sh': 'Shell',
      'bash': 'Bash'
    };
    return languageMap[ext] || 'Unknown';
  }

  // Assess file importance
  assessFileImportance(filePath, status) {
    if (!filePath) return 1;

    let score = 0;

    // Core application files
    if (filePath.match(/\/(pages|app|src|components)\//)) score += 3;
    if (filePath.match(/\/(api|server|backend)\//)) score += 3;
    if (filePath.match(/\/(utils|lib|helpers)\//)) score += 2;

    // Configuration files
    if (filePath.match(/^(package\.json|tsconfig|webpack\.config|babel\.config)/)) score += 3;
    if (filePath.match(/\.env|dockerfile|docker-compose/i)) score += 2;

    // Database/Schema files
    if (filePath.match(/\/(migrations|schema|database)\//)) score += 3;

    // Status impact
    if (status === 'A') score += 2; // New files are important
    if (status === 'D') score += 1; // Deleted files are notable

    return Math.min(score, 5); // Cap at 5
  }

  // Assess change complexity
  assessChangeComplexity(diff) {
    if (!diff || diff === 'Binary file or diff unavailable') return 1;

    const lines = diff.split('\n');
    const additions = lines.filter(line => line.startsWith('+')).length;
    const deletions = lines.filter(line => line.startsWith('-')).length;
    const total = additions + deletions;

    if (total < 10) return 1;
    if (total < 50) return 2;
    if (total < 100) return 3;
    if (total < 200) return 4;
    return 5;
  }

  // semantic analysis
  analyzeSemanticChanges(diff, filePath) {
    const analysis = {
      changeType: 'modification',
      patterns: new Set(),
      frameworks: new Set(),
      keywords: new Set(),
      codeElements: new Set(),
      apiChanges: [],
      dataChanges: []
    };

    if (!diff || diff === 'Binary file or diff unavailable') {
      return this.convertSetsToArrays(analysis);
    }

    const addedLines = diff.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'));
    const removedLines = diff.split('\n').filter(line => line.startsWith('-') && !line.startsWith('---'));

    // Framework detection
    if (filePath.includes('database/') || filePath.includes('sql/') || filePath.includes('migrations/')) {
      analysis.frameworks.add('Database');
      if (diff.includes('CREATE TABLE') || diff.includes('ALTER TABLE')) {
        analysis.changeType = 'schema_change';
        analysis.patterns.add('database_schema');
      }
      if (diff.includes('CREATE POLICY') || diff.includes('ALTER POLICY')) {
        analysis.patterns.add('security_policy');
      }
    }

    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      analysis.frameworks.add('React');
      if (diff.includes('useState') || diff.includes('useEffect')) {
        analysis.patterns.add('react_hooks');
      }
      if (diff.includes('useCallback') || diff.includes('useMemo')) {
        analysis.patterns.add('performance_optimization');
      }
    }

    if (filePath.includes('/api/') || filePath.includes('route.')) {
      analysis.frameworks.add('API');
      analysis.changeType = 'api_change';

      ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].forEach(method => {
        if (diff.includes(`export async function ${method}`) ||
            diff.includes(`app.${method.toLowerCase()}`)) {
          analysis.apiChanges.push(`${method} endpoint`);
          analysis.patterns.add('api_endpoint');
        }
      });
    }

    // Code element detection
    const codePatterns = {
      'function_definition': /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
      'component_definition': /(?:export\s+)?(?:const|function)\s+(\w+Component|\w+Page|\w+Layout)/g,
      'hook_definition': /(?:export\s+)?(?:const|function)\s+(use\w+)/g,
      'type_definition': /(?:export\s+)?(?:type|interface)\s+(\w+)/g,
      'constant_definition': /(?:export\s+)?const\s+(\w+)/g
    };

    Object.entries(codePatterns).forEach(([pattern, regex]) => {
      const matches = [...diff.matchAll(regex)];
      if (matches.length > 0) {
        analysis.patterns.add(pattern);
        matches.forEach(match => analysis.codeElements.add(match[1]));
      }
    });

    // Advanced pattern detection
    const advancedPatterns = {
      'error_handling': [/try\s*{/, /catch\s*\(/, /throw\s+/, /Error\(/],
      'async_operations': [/async\s+/, /await\s+/, /Promise\./, /\.then\(/],
      'data_validation': [/validate/, /schema/, /validation/, /validator/i],
      'authentication': [/auth/, /login/, /logout/, /token/, /jwt/, /session/i],
      'authorization': [/permission/, /role/, /access/, /policy/, /guard/i],
      'caching': [/cache/, /memo/, /useMemo/, /useCallback/i],
      'testing': [/test/, /spec/, /mock/, /describe/, /it\(/],
      'styling': [/className/, /css/, /styled/, /style/],
      'state_management': [/useState/, /useReducer/, /store/, /state/i],
      'routing': [/router/, /navigate/, /redirect/, /route/, /Link/],
      'data_fetching': [/fetch/, /axios/, /useQuery/, /useMutation/, /api/i]
    };

    Object.entries(advancedPatterns).forEach(([pattern, regexes]) => {
      if (regexes.some(regex => regex.test(diff))) {
        analysis.patterns.add(pattern);
      }
    });

    return this.convertSetsToArrays(analysis);
  }

  convertSetsToArrays(analysis) {
    return {
      ...analysis,
      patterns: Array.from(analysis.patterns),
      frameworks: Array.from(analysis.frameworks),
      keywords: Array.from(analysis.keywords),
      codeElements: Array.from(analysis.codeElements)
    };
  }

  // Analyze functional impact
  analyzeFunctionalImpact(diff, filePath, status) {
    const impact = {
      scope: this.determineChangeScope(filePath),
      breaking: false,
      userFacing: false,
      apiChanges: false,
      dataChanges: false,
      securityRelated: false,
      performanceImpact: false,
      migrationRequired: false,
      deploymentImpact: 'low'
    };

    if (!diff || diff === 'Binary file or diff unavailable') {
      return impact;
    }

    // Breaking change detection
    const breakingPatterns = [
      /BREAKING\s*CHANGE/i,
      /export\s+(?:interface|type)\s+\w+.*{/,
      /export\s+(?:const|function)\s+\w+/,
      /DROP\s+TABLE/i,
      /ALTER\s+TABLE.*DROP/i,
      /removeField/i,
      /deleteColumn/i
    ];

    impact.breaking = breakingPatterns.some(pattern => pattern.test(diff));

    // User-facing detection
    const userFacingPaths = [
      '/pages/', '/app/', '/src/', '/components/', '/views/', '/templates/',
      '/public/', '.css', '.scss', '.html'
    ];
    impact.userFacing = userFacingPaths.some(path => filePath.includes(path));

    // API changes detection
    impact.apiChanges = filePath.includes('/api/') ||
                       filePath.includes('route.') ||
                       diff.includes('export async function') ||
                       diff.includes('app.get') ||
                       diff.includes('app.post');

    // Database changes detection
    impact.dataChanges = filePath.includes('database/') ||
                        filePath.includes('migration') ||
                        filePath.includes('schema') ||
                        diff.includes('CREATE TABLE') ||
                        diff.includes('ALTER TABLE');

    // Security-related detection
    const securityPatterns = [
      /auth/i, /security/i, /password/i, /token/i, /jwt/i,
      /encrypt/i, /decrypt/i, /hash/i, /validate/i, /sanitize/i,
      /policy/i, /permission/i, /role/i, /access/i, /cors/i
    ];
    impact.securityRelated = securityPatterns.some(pattern => pattern.test(diff));

    // Performance impact detection
    const performancePatterns = [
      /lazy/i, /memo/i, /callback/i, /optimize/i, /cache/i,
      /index/i, /query/i, /batch/i, /concurrent/i, /async/i
    ];
    impact.performanceImpact = performancePatterns.some(pattern => pattern.test(diff));

    // Migration requirement detection
    impact.migrationRequired = impact.breaking ||
                              impact.dataChanges ||
                              filePath.includes('package.json') ||
                              filePath.includes('.env');

    // Deployment impact assessment
    if (impact.breaking || impact.dataChanges) {
      impact.deploymentImpact = 'high';
    } else if (impact.apiChanges || impact.securityRelated || filePath.includes('config')) {
      impact.deploymentImpact = 'medium';
    }

    return impact;
  }

  // Business relevance assessment
  assessBusinessRelevance(filePath, diff) {
    const relevance = {
      priority: 'low',
      userImpact: 'minimal',
      businessValue: 'technical',
      customerFacing: false,
      revenueImpact: false
    };

    if (!filePath) return relevance;

    // High priority paths
    const highPriorityPaths = [
      '/dashboard', '/billing', '/auth', '/onboarding',
      '/checkout', '/payment', '/subscription', '/profile'
    ];

    const mediumPriorityPaths = [
      '/app/', '/components/ui', '/components/forms', '/api/auth', '/api/users'
    ];

    if (highPriorityPaths.some(path => filePath.includes(path))) {
      relevance.priority = 'high';
      relevance.customerFacing = true;
      relevance.businessValue = 'direct';
    } else if (mediumPriorityPaths.some(path => filePath.includes(path))) {
      relevance.priority = 'medium';
      relevance.customerFacing = true;
      relevance.businessValue = 'indirect';
    }

    // Revenue impact detection
    if (diff) {
      const revenueKeywords = [
        /payment/i, /billing/i, /subscription/i, /checkout/i, /revenue/i,
        /pricing/i, /plan/i, /upgrade/i, /downgrade/i
      ];
      relevance.revenueImpact = revenueKeywords.some(pattern => pattern.test(diff));
    }

    return relevance;
  }

  // Perform semantic analysis
  performSemanticAnalysis(files, subject, body) {
    const analysis = {
      hasApiChanges: false,
      hasDbChanges: false,
      hasUiChanges: false,
      hasConfigChanges: false,
      affectedFeatures: [],
      riskLevel: 'low',
      patterns: new Set(),
      frameworks: [],
      codeElements: new Set()
    };

    // Analyze each file for deeper semantic understanding
    files.forEach(file => {
      if (file.filePath.includes('/api/')) {
        analysis.hasApiChanges = true;
        analysis.frameworks.push('API');
      }
      if (file.filePath.includes('migration') || file.filePath.includes('schema')) {
        analysis.hasDbChanges = true;
        analysis.frameworks.push('Database');
      }
      if (file.filePath.match(/\.(tsx|jsx|css|scss)$/)) {
        analysis.hasUiChanges = true;
        analysis.frameworks.push('React');
      }
      if (file.filePath.match(/config|\.env/)) {
        analysis.hasConfigChanges = true;
        analysis.patterns.add('configuration');
      }

      // Merge file semantic changes
      if (file.semanticChanges) {
        if (file.semanticChanges.frameworks) {
          file.semanticChanges.frameworks.forEach(fw => {
            if (!analysis.frameworks.includes(fw)) {
              analysis.frameworks.push(fw);
            }
          });
        }
        if (file.semanticChanges.patterns) {
          file.semanticChanges.patterns.forEach(pattern => {
            analysis.patterns.add(pattern);
          });
        }
        if (file.semanticChanges.codeElements) {
          file.semanticChanges.codeElements.forEach(element => {
            analysis.codeElements.add(element);
          });
        }
      }
    });

    // Analyze commit message patterns
    const message = (subject + ' ' + body).toLowerCase();
    if (message.includes('feat') || message.includes('add') || message.includes('new')) {
      analysis.patterns.add('new_feature');
    }
    if (message.includes('fix') || message.includes('bug') || message.includes('resolve')) {
      analysis.patterns.add('bug_fix');
    }
    if (message.includes('perf') || message.includes('optim') || message.includes('speed')) {
      analysis.patterns.add('performance_optimization');
    }
    if (message.includes('security') || message.includes('auth') || message.includes('permission')) {
      analysis.patterns.add('security_policy');
    }

    // Convert sets to arrays
    analysis.codeElements = Array.from(analysis.codeElements);
    analysis.patterns = Array.from(analysis.patterns);

    // Determine risk level
    if (analysis.hasApiChanges || analysis.hasDbChanges) {
      analysis.riskLevel = 'high';
    } else if (analysis.hasUiChanges || analysis.hasConfigChanges) {
      analysis.riskLevel = 'medium';
    }

    return analysis;
  }

  // Generate release insights
  async generateReleaseInsights(analyzedCommits, version) {
    const insights = {
      summary: '',
      totalCommits: analyzedCommits.length,
      commitTypes: {},
      riskLevel: 'low',
      affectedAreas: new Set(),
      breaking: false,
      complexity: 'low',
      businessImpact: 'minor',
      deploymentRequirements: []
    };

    // Count commit types and assess risk
    analyzedCommits.forEach(commit => {
      insights.commitTypes[commit.type] = (insights.commitTypes[commit.type] || 0) + 1;
      if (commit.breaking) insights.breaking = true;
      if (commit.semanticAnalysis?.riskLevel === 'high') insights.riskLevel = 'high';

      commit.files.forEach(file => {
        insights.affectedAreas.add(file.category);
      });

      // Check for deployment requirements
      if (commit.semanticAnalysis?.hasDbChanges) {
        insights.deploymentRequirements.push('Database migration required');
      }
      if (commit.breaking) {
        insights.deploymentRequirements.push('Breaking changes - review migration notes above.');
      }
    });

    insights.affectedAreas = Array.from(insights.affectedAreas);

    // Assess overall complexity
    const totalFiles = analyzedCommits.reduce((sum, commit) => sum + commit.files.length, 0);
    const avgFilesPerCommit = totalFiles / analyzedCommits.length;

    if (avgFilesPerCommit > 20 || insights.breaking) {
      insights.complexity = 'high';
    } else if (avgFilesPerCommit > 10) {
      insights.complexity = 'medium';
    }

    // Assess business impact
    const hasUserFacingChanges = analyzedCommits.some(commit =>
      commit.files.some(file => file.functionalImpact?.userFacing));
    const hasRevenueImpact = analyzedCommits.some(commit =>
      commit.files.some(file => file.businessRelevance?.revenueImpact));

    if (hasRevenueImpact || insights.breaking) {
      insights.businessImpact = 'major';
    } else if (hasUserFacingChanges) {
      insights.businessImpact = 'moderate';
    }

    // Generate summary
    const features = insights.commitTypes.feat || 0;
    const fixes = insights.commitTypes.fix || 0;
    const breaking = insights.breaking ? ' with breaking changes' : '';

    insights.summary = `Release includes ${features} new features, ${fixes} bug fixes${breaking}`;

    return insights;
  }

  // Batch processing for large repositories
  async generateChangelogBatch(commitHashes) {
    const batchSize = 10; // Process in batches to avoid rate limits
    const results = [];

    for (let i = 0; i < commitHashes.length; i += batchSize) {
      const batch = commitHashes.slice(i, i + batchSize);
      const batchNum = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(commitHashes.length/batchSize);
      console.log(colors.processingMessage(`Processing batch ${colors.highlight(`${batchNum}/${totalBatches}`)} (${colors.number(batch.length)} commits)`));
      
      // Show progress bar
      console.log(colors.progress(batchNum, totalBatches, 'batches processed'));

      const batchPromises = batch.map(hash => this.getCommitAnalysis(hash));
      const batchResults = await Promise.allSettled(batchPromises);

      const successfulResults = batchResults
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);

      results.push(...successfulResults);
      this.metrics.batchesProcessed++;

      // Rate limiting between batches
      if (i + batchSize < commitHashes.length && this.hasAI) {
        await this.sleep(1000); // 1 second between batches
      }
    }

    return results.filter(Boolean);
  }

  // AI integration with better error handling and retry logic
  async generateAISummary(commitAnalysis) {
    if (!this.hasAI) {
      return this.generateRuleBasedSummary(commitAnalysis);
    }

    // Select optimal model for this commit
    const selectedModel = await this.selectOptimalModel(commitAnalysis);

    try {
      // Validate AI provider before generating
      const modelCheck = await this.aiProvider.validateModelAvailability(selectedModel || this.aiProvider.modelConfig.default);
      if (!modelCheck.available) {
        console.warn(colors.warningMessage('Selected model not available, falling back to rule-based analysis'));
        return this.generateRuleBasedSummary(commitAnalysis);
      }

      const prompt = this.buildEnhancedPrompt(commitAnalysis);

      const messages = [
        {
          role: "system",
          content: `You are an expert technical writer and software engineer specializing in changelog generation for modern web applications. You understand various frameworks, databases, and development practices.

Your task is to analyze git commits and generate clear, informative changelog entries that balance technical accuracy with user-friendly language.

IMPORTANT: Always respond with valid JSON in the exact format requested. Focus on user impact and business value while maintaining technical precision.`
        },
        {
          role: "user",
          content: prompt
        }
      ];

      const settings = {
        temperature: 0.3,
        max_tokens: 1000,
        model: selectedModel
      };

      // Add reasoning effort for reasoning models
      if (selectedModel && (selectedModel.includes('o3') || selectedModel.includes('o4'))) {
        settings.reasoning_effort = this.analysisMode === 'enterprise' ? 'high' : 'medium';
      }

      const response = await this.aiProvider.generateCompletion(messages, settings);
      this.metrics.apiCalls++;

      if (response.usage) {
        this.metrics.totalTokens += response.usage.total_tokens || 0;
      }

      if (!response.content) {
        throw new Error('Empty response from AI provider');
      }

      return this.parseAIResponse(response.content, commitAnalysis);
    } catch (error) {
      console.error(colors.errorMessage(`AI API error: ${error.message}`));
      this.metrics.errors++;
      return this.generateRuleBasedSummary(commitAnalysis);
    }
  }

  // Build prompt optimized for GPT-4.1 series
  buildEnhancedPrompt(commitAnalysis) {
    const { subject, files, semanticAnalysis, diffStats, complexity, riskAssessment } = commitAnalysis;

    // Build comprehensive context
    const filesContext = files.map(file => ({
      path: file.filePath,
      status: file.status,
      category: file.category,
      language: file.language,
      complexity: file.complexity,
      semanticChanges: file.semanticChanges,
      functionalImpact: file.functionalImpact,
      businessRelevance: file.businessRelevance,
      keyChanges: this.extractKeyDiffLines(file.diff)
    })).slice(0, 15); // Limit for token efficiency but increased for GPT-4.1

    // prompt leveraging GPT-4.1's improved instruction following
    return `<task>
Analyze this git commit for changelog generation using your reasoning capabilities.

<commit_context>
Subject: ${subject}
Files changed: ${files.length}
Lines: +${diffStats.insertions} -${diffStats.deletions}
Frameworks: ${semanticAnalysis.frameworks.join(', ')}
Patterns: ${semanticAnalysis.patterns.join(', ')}
Complexity: ${complexity.level} (score: ${complexity.score})
Risk Level: ${riskAssessment.level}
Risk Factors: ${riskAssessment.factors.join(', ')}
</commit_context>

<files_analysis>
${JSON.stringify(filesContext, null, 2)}
</files_analysis>

<analysis_requirements>
1. **Primary Impact**: What does this change do for end users?
2. **Technical Scope**: How does this affect the codebase architecture?
3. **Business Value**: What problem does this solve or feature does this enable?
4. **Risk Assessment**: What are the potential impacts of this change?
5. **Migration Needs**: Are there any breaking changes or upgrade requirements?
6. **Performance Impact**: How might this affect system performance?
</analysis_requirements>

<response_format>
Return ONLY valid JSON in this exact structure:
{
  "summary": "Clear, user-friendly description (1-2 sentences)",
  "technicalSummary": "Detailed technical description for developers",
  "category": "feature|fix|improvement|refactor|docs|chore|breaking|security",
  "impact": "critical|high|medium|low",
  "scope": "major|minor|patch",
  "userFacing": true|false,
  "breaking": true|false,
  "businessImpact": "How this affects users, business goals, or product value",
  "technicalImpact": "How this affects codebase, architecture, or development",
  "highlights": ["key point 1", "key point 2", "key point 3"],
  "migrationNotes": "Steps needed for upgrade/deployment" or null,
  "tags": ["tag1", "tag2", "tag3"],
  "relatedAreas": ["area1", "area2"],
  "riskLevel": "low|medium|high",
  "confidence": 0.9
}
</response_format>
</task>`;
  }

  parseAIResponse(content, originalCommit) {
    try {
      // Clean the response
      let jsonStr = content.trim();

      // Remove markdown code blocks
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(jsonStr);

      // Validate and enhance the response
      const baseResponse = {
        summary: parsed.summary || originalCommit.subject,
        technicalSummary: parsed.technicalSummary || '',
        category: parsed.category || originalCommit.type || 'other',
        impact: parsed.impact || 'low',
        scope: parsed.scope || 'patch',
        userFacing: Boolean(parsed.userFacing),
        breaking: Boolean(parsed.breaking),
        businessImpact: parsed.businessImpact || '',
        technicalImpact: parsed.technicalImpact || '',
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        migrationNotes: parsed.migrationNotes || null,
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        relatedAreas: Array.isArray(parsed.relatedAreas) ? parsed.relatedAreas : [],
        riskLevel: parsed.riskLevel || 'low',
        confidence: parsed.confidence || 0.8
      };

      return baseResponse;
    } catch (error) {
      console.error(colors.errorMessage(`Error parsing AI response: ${error.message}`));
      this.metrics.errors++;
      return this.generateRuleBasedSummary(originalCommit);
    }
  }

  // rule-based analysis as fallback
  generateRuleBasedSummary(commitAnalysis) {
    const { subject, files, semanticAnalysis, diffStats, complexity, riskAssessment, messageQuality } = commitAnalysis;

    // Check for poor commit message quality and warn users
    if (messageQuality && messageQuality.level === 'very_poor' || messageQuality.level === 'poor') {
      console.warn(colors.warningMessage(`⚠️  Poor commit message quality detected: "${subject}"`));
      console.warn(colors.warningMessage(`   Quality: ${messageQuality.level} (score: ${messageQuality.score}/8)`));
      if (messageQuality.issues.length > 0) {
        console.warn(colors.warningMessage(`   Issues: ${messageQuality.issues.join(', ')}`));
      }
      if (messageQuality.suggestions.length > 0) {
        console.warn(colors.infoMessage(`   💡 Suggestions: ${messageQuality.suggestions.join(', ')}`));
      }
    }

    // Determine category and impact
    let category = commitAnalysis.type || 'other';
    let impact = 'low';
    let userFacing = false;

    // Enhanced analysis using complexity and risk assessment
    if (riskAssessment.level === 'critical' || riskAssessment.level === 'high') {
      impact = riskAssessment.level;
      category = 'breaking';
    } else if (complexity.level === 'high' || complexity.level === 'very high') {
      impact = 'medium';
    }

    // Analyze file changes for better categorization
    const hasUIChanges = files.some(f => f.category === 'source' && f.filePath.match(/\.(tsx|jsx)$/));
    const hasDBChanges = files.some(f => f.category === 'database');
    const hasAPIChanges = files.some(f => f.functionalImpact?.apiChanges);
    const hasSecurityChanges = files.some(f => f.functionalImpact?.securityRelated);

    if (hasSecurityChanges) {
      impact = 'high';
      category = 'security';
    } else if (commitAnalysis.breaking) {
      impact = 'critical';
      category = 'breaking';
    } else if (hasDBChanges || hasAPIChanges) {
      impact = 'medium';
    } else if (hasUIChanges) {
      impact = 'medium';
      userFacing = true;
    }

    // Generate intelligent summary based on message quality
    let summary = subject;
    const insights = [];

    // Use semantic analysis for better insights
    if (semanticAnalysis.patterns.includes('new_feature')) {
      insights.push('introduces new functionality');
    }
    if (semanticAnalysis.patterns.includes('bug_fix')) {
      insights.push('resolves issues');
    }
    if (semanticAnalysis.patterns.includes('performance_optimization')) {
      insights.push('improves performance');
    }
    if (semanticAnalysis.patterns.includes('security_policy')) {
      insights.push('enhances security');
    }

    // Framework-specific insights
    if (semanticAnalysis.frameworks.includes('React')) {
      insights.push('updates React components');
    }
    if (semanticAnalysis.frameworks.includes('Database')) {
      insights.push('modifies database layer');
    }

    // Enhance summary if commit message quality is poor
    if (messageQuality && (messageQuality.level === 'very_poor' || messageQuality.level === 'poor')) {
      if (insights.length > 0) {
        summary = `${subject} (${insights.slice(0, 2).join(', ')})`;
      } else if (files.length > 0) {
        // Fallback to file-based description when commit message is poor
        const mainCategory = files[0].category;
        const fileTypes = [...new Set(files.map(f => f.category))];
        if (fileTypes.length === 1) {
          summary = `${subject} (updates ${mainCategory} files)`;
        } else {
          summary = `${subject} (affects ${fileTypes.join(', ')})`;
        }
      }
    } else if (insights.length > 0) {
      summary = insights.length > 1 ? `${subject} (${insights.slice(0, 2).join(', ')})` : subject;
    }

    const highlights = [];
    if (diffStats.insertions > 100) highlights.push('Significant code additions');
    if (files.length > 10) highlights.push('Wide-ranging changes');
    if (hasUIChanges) highlights.push('User interface updates');
    if (hasDBChanges) highlights.push('Database modifications');
    if (complexity.level !== 'minimal') highlights.push(`${complexity.level} complexity changes`);

    // Add message quality warning to highlights if poor
    if (messageQuality && (messageQuality.level === 'very_poor' || messageQuality.level === 'poor')) {
      highlights.unshift(`⚠️ Poor commit message quality (${messageQuality.level})`);
    }

    return {
      summary,
      technicalSummary: `Modified ${files.length} files with +${diffStats.insertions}/-${diffStats.deletions} lines. Complexity: ${complexity.level}`,
      category,
      impact,
      scope: impact === 'critical' ? 'major' : impact === 'high' ? 'minor' : 'patch',
      userFacing,
      breaking: commitAnalysis.breaking,
      businessImpact: userFacing ? 'Affects user experience' : 'Internal improvements',
      technicalImpact: `Changes in ${[...new Set(files.map(f => f.category))].join(', ')}`,
      highlights: highlights.slice(0, 4),
      migrationNotes: commitAnalysis.breaking ? 'Review breaking changes before deployment' : null,
      tags: semanticAnalysis.frameworks.concat(semanticAnalysis.patterns.slice(0, 3)),
      relatedAreas: [...new Set(files.map(f => f.category))].slice(0, 3),
      riskLevel: riskAssessment.level,
      confidence: messageQuality ? Math.max(0.3, 0.7 - (8 - messageQuality.score) * 0.05) : 0.7,
      messageQuality: messageQuality
    };
  }

  // Build comprehensive changelog from analyzed commits
  buildChangelog(analyzedCommits, releaseInsights, version) {
    const currentDate = new Date().toISOString().split('T')[0];
    const versionHeader = version || 'Unreleased';

    let changelog = `# Changelog\n\n## [${versionHeader}] - ${currentDate}\n\n`;

    // Add release summary with business impact
    if (releaseInsights.summary) {
      changelog += `### 📋 Release Summary\n${releaseInsights.summary}\n\n`;
      changelog += `**Business Impact**: ${releaseInsights.businessImpact}\n`;
      changelog += `**Complexity**: ${releaseInsights.complexity}\n`;
      if (releaseInsights.deploymentRequirements.length > 0) {
        changelog += `**Deployment Requirements**: ${releaseInsights.deploymentRequirements.join(', ')}\n`;
      }
      changelog += '\n';
    }

    // Group commits by type
    const commitsByType = {
      feat: [],
      fix: [],
      security: [],
      breaking: [],
      docs: [],
      style: [],
      refactor: [],
      perf: [],
      test: [],
      chore: [],
      deps: [],
      other: []
    };

    analyzedCommits.forEach(commit => {
      const type = commit.breaking ? 'breaking' : (commit.type || 'other');
      if (commitsByType[type]) {
        commitsByType[type].push(commit);
      } else {
        commitsByType.other.push(commit);
      }
    });

    // Add sections for each commit type
    Object.entries(commitsByType).forEach(([type, commits]) => {
      if (commits.length > 0) {
        changelog += `${COMMIT_TYPES[type] || type}\n\n`;

        commits.forEach(commit => {
          const summary = commit.aiSummary?.summary || commit.subject;
          const confidence = commit.aiSummary?.confidence ? ` (${Math.round(commit.aiSummary.confidence * 100)}%)` : '';

          changelog += `- **${commit.scope ? `${commit.scope}: ` : ''}${summary}**`;

          if (commit.breaking || commit.aiSummary?.breaking) {
            changelog += ` ⚠️ BREAKING CHANGE`;
          }

          if (commit.aiSummary?.impact === 'critical' || commit.aiSummary?.impact === 'high') {
            changelog += ` 🔥`;
          }

          changelog += ` (${commit.hash})${confidence}\n`;

          if (commit.aiSummary?.technicalSummary) {
            changelog += `  - ${commit.aiSummary.technicalSummary}\n`;
          }

          if (commit.aiSummary?.highlights?.length > 0) {
            commit.aiSummary.highlights.forEach(highlight => {
              changelog += `  - ${highlight}\n`;
            });
          }

          if (commit.aiSummary?.migrationNotes) {
            changelog += `  - **Migration**: ${commit.aiSummary.migrationNotes}\n`;
          }

          changelog += '\n';
        });
      }
    });

    // Add detailed risk assessment if needed
    if (releaseInsights.riskLevel !== 'low' || releaseInsights.breaking) {
      changelog += `### ⚠️ Risk Assessment\n`;
      changelog += `**Risk Level:** ${releaseInsights.riskLevel.toUpperCase()}\n\n`;

      if (releaseInsights.breaking) {
        changelog += `🚨 **Breaking Changes**: This release contains breaking changes. Please review migration notes above.\n\n`;
      }

      if (releaseInsights.deploymentRequirements.length > 0) {
        changelog += `📋 **Deployment Requirements**:\n`;
        releaseInsights.deploymentRequirements.forEach(req => {
          changelog += `- ${req}\n`;
        });
        changelog += '\n';
      }
    }

    // Add affected areas
    if (releaseInsights.affectedAreas?.length > 0) {
      changelog += `### 🎯 Affected Areas\n`;
      releaseInsights.affectedAreas.forEach(area => {
        changelog += `- ${area}\n`;
      });
      changelog += '\n';
    }

    // Add performance metrics
    changelog += `### 📊 Generation Metrics\n`;
    changelog += `- **Total Commits**: ${analyzedCommits.length}\n`;
    changelog += `- **Processing Time**: ${this.formatDuration(Date.now() - this.metrics.startTime)}\n`;
    changelog += `- **AI Calls**: ${this.metrics.apiCalls}\n`;
    if (this.metrics.totalTokens > 0) {
      changelog += `- **Tokens Used**: ${this.metrics.totalTokens.toLocaleString()}\n`;
    }
    changelog += `- **Batches Processed**: ${this.metrics.batchesProcessed}\n`;
    if (this.metrics.errors > 0) {
      changelog += `- **Errors**: ${this.metrics.errors}\n`;
    }
    changelog += '\n';

    // Add attribution footer unless disabled
    if (this.includeAttribution !== false) {
      changelog += `---\n\n*Generated using [ai-github-changelog-generator-cli-mcp](https://github.com/entro314-labs/AI-github-changelog-generator-cli-mcp) - AI-powered changelog generation for Git repositories*\n`;
    }

    return changelog;
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  // Configuration validation
  validateConfiguration() {
    const issues = [];
    const recommendations = [];

    if (!this.gitExists) {
      issues.push('Not a git repository');
    }

    if (!this.hasAI) {
      issues.push('No AI provider configured - using rule-based analysis');
      recommendations.push('Configure AZURE_OPENAI_* or OPENAI_API_KEY for AI-powered analysis');
    }

    if (this.aiProvider?.activeProvider === 'azure' && !this.aiProvider.shouldUseV1API()) {
      recommendations.push('Consider enabling Azure v1 API for latest features (AZURE_OPENAI_USE_V1_API=true)');
    }

    if (this.hasAI) {
      const defaultModel = this.aiProvider.modelConfig.default;
      const capabilities = this.aiProvider.getModelCapabilities(defaultModel);

      if (!capabilities.promptCaching) {
        recommendations.push('Use GPT-4.1 series for 75% cost reduction with prompt caching');
      }

      if (this.aiProvider.activeProvider === 'azure' && !capabilities.reasoning) {
        recommendations.push('Consider using o4-mini or o3 models for complex reasoning tasks');
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      recommendations,
      capabilities: this.hasAI ? this.aiProvider.getModelCapabilities(this.aiProvider.modelConfig.default) : null
    };
  }

  // Main changelog generation method
  async generateChangelog(version = null, since = null) {
    if (!this.gitExists) {
      console.error(colors.errorMessage('Not a git repository'));
      return;
    }

    if (this.dryRun) {
      console.log(colors.processingMessage('Starting AI-powered changelog generation (DRY RUN)...'));
    } else {
      console.log(colors.processingMessage('Starting AI-powered changelog generation...'));
    }

    // Validate configuration
    const configValidation = this.validateConfiguration();
    if (configValidation.recommendations.length > 0) {
      console.log(colors.infoMessage('Configuration recommendations:'));
      configValidation.recommendations.forEach(rec => console.log(`   ${colors.dim('-')} ${rec}`));
    }

    const commitHashes = await this.getCommitsSince(since);
    if (commitHashes.length === 0) {
      console.log(colors.infoMessage('No commits found.'));
      return;
    }

    console.log(colors.processingMessage(`Analyzing ${colors.number(commitHashes.length)} commits with ${colors.highlight(this.hasAI ? 'AI' : 'rule-based')} analysis...`));

    // Use batch processing for large commit sets
    let analyzedCommits;
    if (commitHashes.length > 20) {
      console.log(colors.infoMessage('Using batch processing for large commit set...'));
      analyzedCommits = await this.generateChangelogBatch(commitHashes);
    } else {
      // Process smaller sets normally
      analyzedCommits = [];
      for (let i = 0; i < commitHashes.length; i++) {
        const commitHash = commitHashes[i];
        console.log(colors.processingMessage(`Processing commit ${colors.highlight(`${i + 1}/${commitHashes.length}`)}: ${colors.hash(commitHash.substring(0, 7))}`));

        const commitAnalysis = await this.getCommitAnalysis(commitHash);
        if (commitAnalysis) {
          const aiSummary = await this.generateAISummary(commitAnalysis);

          analyzedCommits.push({
            ...commitAnalysis,
            aiSummary
          });

          // Rate limiting for API calls
          if (this.hasAI && i < commitHashes.length - 1) {
            await this.sleep(200);
          }
        }
      }
    }

    // Generate release insights
    const releaseInsights = await this.generateReleaseInsights(analyzedCommits, version);

    // Build comprehensive changelog
    const changelog = this.buildChangelog(analyzedCommits, releaseInsights, version);

    // Write to file or display for dry-run
    if (this.dryRun) {
      console.log(colors.header('\n📋 DRY RUN - Changelog Preview'));
      console.log(colors.dim('='.repeat(80)));
      console.log(changelog);
      console.log(colors.dim('='.repeat(80)));
      console.log(colors.infoMessage(`Preview generated (${CHANGELOG_FILE} not modified)`));
    } else {
      fs.writeFileSync(CHANGELOG_FILE, changelog);
      console.log(colors.successMessage(`AI changelog generated: ${colors.file(CHANGELOG_FILE)}`));
    }

    // Show completion summary
    console.log(colors.aiMessage(`Processed ${colors.number(analyzedCommits.length)} commits with ${colors.highlight(this.hasAI ? this.aiProvider.activeProvider : 'rule-based')} analysis`));
    console.log(colors.metricsMessage(`Metrics: ${colors.number(this.metrics.apiCalls)} API calls, ${colors.number(this.metrics.totalTokens)} tokens, ${colors.number(this.metrics.errors)} errors`));
    console.log(colors.infoMessage(`Total time: ${colors.value(this.formatDuration(Date.now() - this.metrics.startTime))}`));

    if (releaseInsights.breaking) {
      console.log(colors.warningMessage('WARNING: This release contains breaking changes!'));
    }

    return changelog;
  }

  // commit message validation and suggestions
  async validateCommitMessage(message) {
    const conventionalCommitRegex = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .{1,50}/;

    const validation = {
      isValid: conventionalCommitRegex.test(message),
      issues: [],
      suggestions: [],
      type: null,
      scope: null,
      breaking: false
    };

    // Extract type and scope
    const match = message.match(/^(\w+)(\((.+)\))?(!)?:/);
    if (match) {
      validation.type = match[1];
      validation.scope = match[3] || null;
      validation.breaking = !!match[4];
    }

    if (!validation.isValid) {
      validation.issues.push('Does not follow conventional commit format');

      if (this.hasAI) {
        try {
          const suggestion = await this.generateCommitSuggestion(message);
          validation.suggestions.push(suggestion);
        } catch (error) {
          console.warn('Failed to generate AI suggestion:', error.message);
        }
      }

      validation.suggestions.push('Use format: type(scope): description');
      validation.suggestions.push('Valid types: feat, fix, docs, style, refactor, perf, test, build, ci, chore');
    }

    if (message.length > 72) {
      validation.issues.push('Subject line too long (max 72 characters)');
    }

    return validation;
  }

  async generateCommitSuggestion(message) {
    const prompt = `Convert this commit message to conventional commit format:
Original: "${message}"

Requirements:
- Use appropriate type (feat, fix, docs, style, refactor, perf, test, build, ci, chore)
- Add scope if relevant
- Keep under 50 characters for subject
- Use imperative mood

Return only the improved commit message.`;

    try {
      const response = await this.aiProvider.generateCompletion([{
        role: 'user', content: prompt
      }], { max_tokens: 100 });

      return response.content?.trim() || message;
    } catch (error) {
      console.warn('Failed to generate commit suggestion:', error.message);
      return message;
    }
  }

  // Utility methods
  async getCommitsSince(since) {
    try {
      const options = { count: 100, format: 'full' }; // Use 'full' format to get hash
      if (since) {
        if (this.gitManager.validateCommitHash(since) || this.gitManager.isValidGitDate(since)) {
          options.since = since;
        } else {
          console.warn(`⚠️  Invalid since parameter: ${since}, using default range`);
        }
      }

      const commits = this.gitManager.getCommits(options);
      return commits.map(commit => commit.hash).filter(Boolean);
    } catch (error) {
      console.error(colors.errorMessage(`Error getting commits: ${error.message}`));
      this.metrics.errors++;
      return [];
    }
  }

  getCommitDiffStats(commitHash) {
    try {
      const command = `git show --stat --pretty=format: ${commitHash}`;
      const output = this.gitManager.execGitSafe(command);

      const lines = output.split('\n').filter(Boolean);
      const summary = lines[lines.length - 1];

      if (summary && summary.includes('changed')) {
        const match = summary.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
        if (match) {
          return {
            files: parseInt(match[1]),
            insertions: parseInt(match[2] || 0),
            deletions: parseInt(match[3] || 0)
          };
        }
      }

      return { files: 0, insertions: 0, deletions: 0 };
    } catch {
      return { files: 0, insertions: 0, deletions: 0 };
    }
  }

  extractKeyDiffLines(diff) {
    if (!diff || diff === 'Binary file or diff unavailable') {
      return [];
    }

    return diff.split('\n')
      .filter(line =>
        (line.startsWith('+') || line.startsWith('-')) &&
        !line.startsWith('+++') &&
        !line.startsWith('---') &&
        line.trim().length > 10
      )
      .slice(0, 5)
      .map(line => line.substring(1).trim());
  }

  determineChangeScope(filePath) {
    if (!filePath) return 'local';

    if (filePath.includes('/lib/') || filePath.includes('/utils/') || filePath.includes('shared/')) {
      return 'wide';
    } else if (filePath.includes('/components/') || filePath.includes('/hooks/')) {
      return 'moderate';
    }
    return 'local';
  }

  async analyzeCurrentChanges() {
    if (!this.gitExists) {
      console.log(colors.errorMessage('Not a git repository'));
      return;
    }

    console.log(colors.processingMessage('Analyzing current working directory changes...'));

    try {
      const stagedFiles = this.gitManager.getStagedChanges();
      const unstagedFiles = this.gitManager.getUnstagedChanges();

      if (stagedFiles.length === 0 && unstagedFiles.length === 0) {
        console.log(colors.infoMessage('No changes detected in working directory'));
        return;
      }

      console.log(colors.header('\n📊 Change Analysis:'));

              if (stagedFiles.length > 0) {
          console.log(colors.subheader(`\n🟢 Staged files (${colors.number(stagedFiles.length)}):`));
          stagedFiles.forEach(file => {
            const statusColor = file.status === 'A' ? colors.feature : file.status === 'M' ? colors.warning : colors.error;
            console.log(`  - ${statusColor(file.status)}: ${colors.file(file.path)} [${colors.secondary(file.category)}]`);
          });

          if (this.hasAI) {
            console.log(colors.aiMessage('\n🤖 AI Analysis of staged changes:'));
            await this.analyzeChangesWithAI(stagedFiles, 'staged');
          }
        }

              if (unstagedFiles.length > 0) {
          console.log(colors.subheader(`\n🟡 Unstaged files (${colors.number(unstagedFiles.length)}):`));
          unstagedFiles.forEach(file => {
            const statusColor = file.status === 'A' ? colors.feature : file.status === 'M' ? colors.warning : colors.error;
            console.log(`  - ${statusColor(file.status)}: ${colors.file(file.path)} [${colors.secondary(file.category)}]`);
          });

          if (this.hasAI) {
            console.log(colors.aiMessage('\n🤖 AI Analysis of unstaged changes:'));
            await this.analyzeChangesWithAI(unstagedFiles, 'unstaged');
          }
        }

    } catch (error) {
      console.error(colors.errorMessage(`Error analyzing changes: ${error.message}`));
      this.metrics.errors++;
    }
  }

  async analyzeChangesWithAI(changes, type) {
    try {
      const changesSummary = this.summarizeChanges(changes);

      const prompt = `Analyze these git changes and provide a summary suitable for a changelog entry.

**CHANGE TYPE:** ${type}
**FILES:** ${changes.length} files changed
**CATEGORIES:** ${Object.keys(changesSummary.categories).join(', ')}

**CHANGES BY CATEGORY:**
${Object.entries(changesSummary.categories).map(([cat, files]) =>
  `${cat}: ${files.map(f => `${f.status} ${f.path}`).join(', ')}`
).join('\n')}

**ANALYSIS REQUIREMENTS:**
1. What is the primary purpose of these changes?
2. What category do they fall into (feature, fix, improvement, etc.)?
3. How would you describe the impact (critical, high, medium, low)?
4. Are these user-facing changes?
5. Any potential breaking changes?

**RESPONSE FORMAT:**
Provide a concise analysis in this format:
- **Summary**: Brief description of changes
- **Category**: feature|fix|improvement|refactor|docs|chore|security
- **Impact**: critical|high|medium|low
- **User-facing**: yes|no
- **Breaking**: yes|no
- **Recommended commit message**: Suggested commit message`;

      const response = await this.aiProvider.generateCompletion([{
        role: 'user',
        content: prompt
      }], { max_tokens: 400 });

      console.log(response.content);
      this.metrics.apiCalls++;
    } catch (error) {
      console.error(colors.errorMessage(`AI analysis failed: ${error.message}`));
      console.log(colors.infoMessage('Manual review recommended for these changes'));
      this.metrics.errors++;
    }
  }

  summarizeChanges(changes) {
    const categories = {};
    changes.forEach(change => {
      if (!categories[change.category]) {
        categories[change.category] = [];
      }
      categories[change.category].push(change);
    });

    return {
      totalFiles: changes.length,
      categories,
      summary: `${changes.length} files changed across ${Object.keys(categories).length} categories`
    };
  }

  // Interactive mode for commit selection
  async runInteractiveMode() {
    console.log(colors.header('🔍 Interactive Mode - Select commits to analyze'));
    console.log('');

    // Show current repository status
    if (this.gitExists) {
      try {
        const status = this.gitManager.getStatus();
        const stagedCount = this.gitManager.getStagedChanges().length;
        const unstagedCount = this.gitManager.getUnstagedChanges().length;
        
        console.log(colors.metricsMessage('Current Repository Status:'));
        console.log(`   ${colors.label('Staged files')}: ${colors.number(stagedCount)}`);
        console.log(`   ${colors.label('Unstaged files')}: ${colors.number(unstagedCount)}`);
        console.log(`   ${colors.label('Branch')}: ${colors.highlight(this.gitManager.getCurrentBranch())}`);
        console.log(`   ${colors.label('Status')}: ${status.clean ? colors.success('✅ Clean') : colors.warning('⚠️  Has changes')}\n`);
      } catch (error) {
        // Silent fail - don't break interactive mode
      }
    }

    const inquirer = await getInquirer();

    const choices = [
      { name: 'Analyze staged changes', value: 'staged' },
      { name: 'Analyze unstaged changes', value: 'unstaged' },
      { name: 'Select specific commits', value: 'select' },
      { name: 'Analyze recent commits', value: 'recent' },
      { name: 'Analyze all commits', value: 'all' },
      { name: 'Validate commit message', value: 'validate' },
      { name: 'Generate commit suggestion', value: 'suggest' }
    ];

    const { mode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'mode',
        message: 'What would you like to analyze?',
        choices
      }
    ]);

    switch (mode) {
      case 'staged':
      case 'unstaged':
        await this.analyzeCurrentChanges();
        return;

      case 'recent':
        const { count } = await inquirer.prompt([
          {
            type: 'input',
            name: 'count',
            message: 'How many recent commits?',
            default: '10',
            validate: (input) => !isNaN(parseInt(input)) || 'Please enter a number'
          }
        ]);
        return await this.generateChangelogForRecentCommits(parseInt(count));

      case 'all':
        const { confirmAll } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmAll',
            message: 'This will analyze ALL commits in the repository. Continue?',
            default: false
          }
        ]);
        if (confirmAll) {
          return await this.generateChangelog();
        }
        return;

      case 'select':
        return await this.selectSpecificCommits();

      case 'validate':
        const { message } = await inquirer.prompt([
          {
            type: 'input',
            name: 'message',
            message: 'Enter commit message to validate:',
            validate: (input) => input.length > 0 || 'Please enter a commit message'
          }
        ]);
                  const validation = await this.validateCommitMessage(message);
          console.log(colors.header('\n📋 Validation Results:'));
          console.log(`${colors.label('Valid')}: ${validation.isValid ? colors.success('✅') : colors.error('❌')}`);
          if (validation.issues.length > 0) {
            console.log(`${colors.label('Issues')}: ${colors.error(validation.issues.join(', '))}`);
          }
          if (validation.suggestions.length > 0) {
            console.log(`${colors.label('Suggestions')}: ${colors.info(validation.suggestions.join(', '))}`);
          }
        return;

      case 'suggest':
        try {
          const stagedFiles = this.gitManager.getStagedChanges();
          if (stagedFiles.length === 0) {
            console.log(colors.errorMessage('No staged changes found. Stage some files first.'));
            return;
          }

          const suggestion = await this.analyzeChangesForCommitMessage(stagedFiles, true);
          console.log(colors.infoMessage('\n💡 Suggested commit message:'));
          console.log(`"${colors.highlight(suggestion.suggested_message)}"`);
          console.log(`\n${colors.label('Analysis')}: ${colors.value(JSON.stringify(suggestion.analysis, null, 2))}`);
                  } catch (error) {
            console.error(colors.errorMessage(`Error generating suggestion: ${error.message}`));
          }
        return;

      default:
        return;
    }
  }

  analyzeChangesForCommitMessage(changes, includeScope) {
    const categories = {};
    changes.forEach(change => {
      if (!categories[change.category]) {
        categories[change.category] = [];
      }
      categories[change.category].push(change);
    });

    // Determine primary type
    let type = 'chore';
    let scope = null;

    if (categories.source && categories.source.length > 0) {
      const hasNewFiles = changes.some(c => c.status === 'added');
      type = hasNewFiles ? 'feat' : 'refactor';
    }

    if (categories.test && categories.test.length > 0) {
      type = 'test';
    }

    if (categories.docs && categories.docs.length > 0) {
      type = 'docs';
    }

    if (categories.style && categories.style.length > 0) {
      type = 'style';
    }

    if (categories.config && categories.config.length > 0) {
      type = 'config';
    }

    // Determine scope
    if (includeScope && categories.source) {
      const sourcePaths = categories.source.map(c => c.path);
      const commonPath = this.findCommonPath(sourcePaths);
      if (commonPath) {
        scope = path.basename(commonPath);
      }
    }

    // Generate description
    const totalFiles = changes.length;
    const description = this.generateCommitDescription(type, categories, totalFiles);

    const message = `${type}${scope ? `(${scope})` : ''}: ${description}`;

    return {
      suggested_message: message,
      type,
      scope,
      description,
      files_changed: totalFiles,
      categories: Object.keys(categories),
      analysis: {
        primary_category: Object.keys(categories)[0],
        file_breakdown: Object.entries(categories).map(([cat, files]) => ({
          category: cat,
          count: files.length,
          files: files.map(f => f.path)
        }))
      }
    };
  }

  findCommonPath(paths) {
    if (paths.length === 0) return null;
    if (paths.length === 1) return path.dirname(paths[0]);

    const parts = paths[0].split(path.sep);
    let commonParts = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (paths.every(p => p.split(path.sep)[i] === part)) {
        commonParts.push(part);
      } else {
        break;
      }
    }

    return commonParts.length > 1 ? commonParts.join(path.sep) : null;
  }

  generateCommitDescription(type, categories, totalFiles) {
    const descriptions = {
      feat: `add new functionality`,
      fix: `resolve issues`,
      docs: `update documentation`,
      style: `improve code formatting`,
      refactor: `restructure code`,
      test: `add/update tests`,
      config: `update configuration`,
      chore: `general maintenance`
    };

    let base = descriptions[type] || 'update files';

    if (totalFiles === 1) {
      const file = Object.values(categories)[0][0];
      base += ` in ${path.basename(file.path)}`;
    } else if (totalFiles > 1) {
      base += ` across ${totalFiles} files`;
    }

    return base;
  }

  async selectSpecificCommits() {
    console.log(colors.processingMessage('Fetching recent commits...'));

    try {
      const commits = this.gitManager.getCommits({ count: 20, format: 'simple' });

      const commitChoices = commits.map(commit => ({
        name: `${commit.shortHash} - ${commit.message} (${commit.author})`,
        value: commit.hash
      }));

      if (commitChoices.length === 0) {
        console.log(colors.errorMessage('No commits found'));
        return;
      }

      const inquirer = await getInquirer();
      const { selectedCommits } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedCommits',
          message: 'Select commits to analyze (use spacebar to select):',
          choices: commitChoices,
          pageSize: 10,
          validate: (input) => input.length > 0 || 'Please select at least one commit'
        }
      ]);

      if (selectedCommits.length === 0) {
        console.log(colors.infoMessage('No commits selected.'));
        return;
      }

      console.log(colors.processingMessage(`\nGenerating changelog for ${colors.number(selectedCommits.length)} selected commits...`));
      await this.generateChangelogForCommits(selectedCommits);

    } catch (error) {
      console.error(colors.errorMessage(`Error selecting commits: ${error.message}`));
      this.metrics.errors++;
    }
  }

  async generateChangelogForRecentCommits(count) {
    try {
      const commits = this.gitManager.getCommits({ count, format: 'simple' });
      const commitHashes = commits.map(commit => commit.hash).filter(Boolean);

      if (commitHashes.length === 0) {
        console.log(colors.errorMessage('No commits found'));
        return;
      }

      console.log(colors.processingMessage(`\nGenerating changelog for last ${colors.number(commitHashes.length)} commits...`));
      await this.generateChangelogForCommits(commitHashes);

    } catch (error) {
      console.error(colors.errorMessage(`Error generating changelog for recent commits: ${error.message}`));
      this.metrics.errors++;
    }
  }

  async generateChangelogForCommits(commitHashes) {
    console.log(colors.processingMessage(`Processing ${colors.number(commitHashes.length)} commits with ${colors.highlight(this.hasAI ? 'AI' : 'rule-based')} analysis...`));

    let changelog = `# Changelog\n\n*Generated on ${new Date().toLocaleDateString()}*\n\n`;

    for (let i = 0; i < commitHashes.length; i++) {
      const commitHash = commitHashes[i];
      console.log(colors.processingMessage(`Processing commit ${colors.highlight(`${i + 1}/${commitHashes.length}`)}: ${colors.hash(commitHash.substring(0, 7))}`));

      try {
        const analysis = await this.getCommitAnalysis(commitHash);
        if (analysis) {
          const aiSummary = await this.generateAISummary(analysis);

          changelog += `## ${commitHash.substring(0, 7)} - ${analysis.subject}\n\n`;
          changelog += `**Author:** ${analysis.author}  \n`;
          changelog += `**Date:** ${analysis.date}  \n`;
          changelog += `**Type:** ${analysis.type}  \n`;
          changelog += `**Complexity:** ${analysis.complexity?.level || 'unknown'}  \n`;
          changelog += `**Risk:** ${analysis.riskAssessment?.level || 'unknown'}  \n\n`;

          if (aiSummary && aiSummary.summary) {
            changelog += `**Summary:** ${aiSummary.summary}\n\n`;

            if (aiSummary.businessImpact) {
              changelog += `**Business Impact:** ${aiSummary.businessImpact}\n\n`;
            }

            if (aiSummary.highlights && aiSummary.highlights.length > 0) {
              changelog += `**Key Changes:**\n`;
              aiSummary.highlights.forEach(highlight => {
                changelog += `- ${highlight}\n`;
              });
              changelog += '\n';
            }

            if (aiSummary.migrationNotes) {
              changelog += `**Migration Notes:** ${aiSummary.migrationNotes}\n\n`;
            }
          } else {
            changelog += `**Changes:** ${analysis.subject}\n\n`;
          }

          // Add file statistics
          changelog += `**Files Changed:** ${analysis.files.length} files (+${analysis.diffStats.insertions}/-${analysis.diffStats.deletions} lines)\n\n`;

          changelog += `---\n\n`;

          // Rate limiting for API calls
          if (this.hasAI && i < commitHashes.length - 1) {
            await this.sleep(200);
          }
        }
              } catch (error) {
          console.error(colors.errorMessage(`Error processing commit ${colors.hash(commitHash)}: ${error.message}`));
          this.metrics.errors++;
        }
    }

    // Write to file
    fs.writeFileSync(CHANGELOG_FILE, changelog);
    console.log(colors.successMessage(`Interactive changelog saved to: ${colors.file(CHANGELOG_FILE)}`));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get performance metrics
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime,
      avgTokensPerCall: this.metrics.apiCalls > 0 ?
        Math.round(this.metrics.totalTokens / this.metrics.apiCalls) : 0,
      errorRate: this.metrics.commitsProcessed > 0 ?
        Math.round((this.metrics.errors / this.metrics.commitsProcessed) * 100) : 0,
      successRate: this.metrics.commitsProcessed > 0 ?
        Math.round(((this.metrics.commitsProcessed - this.metrics.errors) / this.metrics.commitsProcessed) * 100) : 0
    };
  }

  // Reset metrics
  resetMetrics() {
    this.metrics = {
      startTime: Date.now(),
      commitsProcessed: 0,
      apiCalls: 0,
      errors: 0,
      batchesProcessed: 0,
      totalTokens: 0,
      cacheHits: 0
    };
  }

  // Analyze branches and unmerged commits
  async analyzeBranches() {
    if (!this.gitExists) {
      console.log(colors.errorMessage('Not a git repository'));
      return;
    }

    console.log(colors.processingMessage('Analyzing git branches and unmerged commits...'));

    try {
      const branches = this.gitManager.getAllBranches();
      const unmergedCommits = this.gitManager.getUnmergedCommits();
      const danglingCommits = this.gitManager.getDanglingCommits();

      console.log(colors.header('\n📊 Branch Analysis:'));
      console.log(colors.subheader(`🌿 Local branches (${colors.number(branches.local.length)}):`));
      branches.local.forEach(branch => {
        const indicator = branch === branches.current ? '* ' : '  ';
        const branchColor = branch === branches.current ? colors.highlight : colors.secondary;
        console.log(`${indicator}${branchColor(branch)}`);
      });

      if (branches.remote.length > 0) {
        console.log(colors.subheader(`\n🌐 Remote branches (${colors.number(branches.remote.length)}):`));
        branches.remote.slice(0, 10).forEach(branch => console.log(`  - ${colors.secondary(branch)}`));
        if (branches.remote.length > 10) {
          console.log(colors.dim(`  ... and ${branches.remote.length - 10} more`));
        }
      }

      if (unmergedCommits.length > 0) {
        console.log(colors.subheader(`\n🔄 Unmerged commits in other branches:`));
        unmergedCommits.forEach(branch => {
          console.log(`\n  ${colors.label(branch.branch)} (${colors.number(branch.commits.length)} commits):`);
          branch.commits.slice(0, 3).forEach(commit => {
            console.log(`    - ${colors.hash(commit.shortHash)}: ${colors.value(commit.subject)} (${colors.secondary(commit.author)})`);
          });
          if (branch.commits.length > 3) {
            console.log(colors.dim(`    ... and ${branch.commits.length - 3} more commits`));
          }
        });
      } else {
        console.log(colors.successMessage('\n✅ No unmerged commits found'));
      }

      if (danglingCommits.length > 0) {
        console.log(colors.warningMessage(`\n🗑️  Dangling commits (${colors.number(danglingCommits.length)}):`));
        danglingCommits.slice(0, 5).forEach(commit => {
          console.log(`  - ${colors.hash(commit.shortHash)}: ${colors.value(commit.subject)} (${colors.secondary(commit.author)})`);
        });
        if (danglingCommits.length > 5) {
          console.log(colors.dim(`  ... and ${danglingCommits.length - 5} more`));
        }
        console.log(colors.infoMessage('\n💡 These commits are unreachable from any branch. Consider creating a branch or removing them.'));
      }

      if (this.hasAI && (unmergedCommits.length > 0 || danglingCommits.length > 0)) {
        console.log(colors.aiMessage('\n🤖 AI Analysis of branch situation:'));
        await this.analyzeBranchesWithAI(branches, unmergedCommits, danglingCommits);
      }

    } catch (error) {
      console.error(colors.errorMessage(`Error analyzing branches: ${error.message}`));
      this.metrics.errors++;
    }
  }

  // Comprehensive repository analysis
  async analyzeComprehensive() {
    if (!this.gitExists) {
      console.log(colors.errorMessage('Not a git repository'));
      return;
    }

    console.log(colors.processingMessage('Comprehensive repository analysis...'));

    try {
      const comprehensiveData = this.gitManager.getComprehensiveAnalysis();
      
      if (!comprehensiveData) {
        console.log(colors.errorMessage('Failed to get comprehensive analysis'));
        return;
      }

      console.log(colors.header('\n📊 Repository Overview:'));
      console.log(`${colors.label('Repository')}: ${colors.highlight(path.basename(process.cwd()))}`);
      console.log(`${colors.label('Total commits')}: ${colors.number(comprehensiveData.statistics.totalCommits)}`);
      console.log(`${colors.label('Contributors')}: ${colors.number(comprehensiveData.statistics.contributors)}`);
      console.log(`${colors.label('Age')}: ${colors.value(comprehensiveData.statistics.age)}`);

      // Branch summary
      console.log(colors.subheader('\n🌿 Branch Summary:'));
      console.log(`  ${colors.label('Local')}: ${colors.number(comprehensiveData.branches.local.length)}`);
      console.log(`  ${colors.label('Remote')}: ${colors.number(comprehensiveData.branches.remote.length)}`);
      console.log(`  ${colors.label('Current')}: ${colors.highlight(comprehensiveData.branches.current)}`);

      // Working directory status
      const { workingDirectory } = comprehensiveData;
      console.log(colors.subheader('\n📝 Working Directory:'));
      console.log(`  ${colors.label('Staged')}: ${colors.number(workingDirectory.staged.length)} files`);
      console.log(`  ${colors.label('Unstaged')}: ${colors.number(workingDirectory.unstaged.length)} files`);
      console.log(`  ${colors.label('Status')}: ${workingDirectory.status.clean ? colors.success('✅ Clean') : colors.warning('⚠️ Has changes')}`);

      // Unmerged work
      if (comprehensiveData.unmergedCommits.length > 0) {
        console.log(colors.subheader('\n🔄 Unmerged Work:'));
        comprehensiveData.unmergedCommits.forEach(branch => {
          console.log(`  ${colors.label(branch.branch)}: ${colors.number(branch.commits.length)} commits`);
        });
      }

      // Dangling commits
      if (comprehensiveData.danglingCommits.length > 0) {
        console.log(colors.warningMessage('\n🗑️  Repository Health:'));
        console.log(`  ${colors.label('Dangling commits')}: ${colors.number(comprehensiveData.danglingCommits.length)}`);
        console.log(colors.infoMessage('  💡 Consider cleaning up unreachable commits'));
      }

      // Get untracked files
      try {
        const untrackedOutput = this.gitManager.execGitSafe('git ls-files --others --exclude-standard');
        const untrackedFiles = untrackedOutput.trim().split('\n').filter(Boolean);
        
        if (untrackedFiles.length > 0) {
          console.log(colors.subheader(`\n📄 Untracked files: ${colors.number(untrackedFiles.length)}`));
          if (untrackedFiles.length <= 10) {
            untrackedFiles.forEach(file => console.log(`  - ${colors.file(file)}`));
          } else {
            untrackedFiles.slice(0, 5).forEach(file => console.log(`  - ${colors.file(file)}`));
            console.log(colors.dim(`  ... and ${untrackedFiles.length - 5} more`));
          }
        }
      } catch (error) {
        console.warn(colors.warningMessage('Could not get untracked files'));
      }

      if (this.hasAI) {
        console.log(colors.aiMessage('\n🤖 AI Analysis of repository state:'));
        await this.analyzeRepositoryWithAI(comprehensiveData);
      }

    } catch (error) {
      console.error(colors.errorMessage(`Error in comprehensive analysis: ${error.message}`));
      this.metrics.errors++;
    }
  }

  // Analyze untracked files
  async analyzeUntrackedFiles() {
    if (!this.gitExists) {
      console.log(colors.errorMessage('Not a git repository'));
      return;
    }

    console.log(colors.processingMessage('Analyzing untracked files...'));

    try {
      const untrackedOutput = this.gitManager.execGitSafe('git ls-files --others --exclude-standard');
      const untrackedFiles = untrackedOutput.trim().split('\n').filter(Boolean);

      if (untrackedFiles.length === 0) {
        console.log(colors.successMessage('✅ No untracked files found'));
        return;
      }

      console.log(colors.header(`\n📊 Found ${colors.number(untrackedFiles.length)} untracked files:`));

      // Categorize untracked files
      const categories = {};
      untrackedFiles.forEach(file => {
        const category = this.categorizeFile(file);
        if (!categories[category]) categories[category] = [];
        categories[category].push(file);
      });

      Object.entries(categories).forEach(([category, files]) => {
        console.log(colors.subheader(`\n📁 ${category} (${colors.number(files.length)} files):`));
        files.slice(0, 10).forEach(file => console.log(`  - ${colors.file(file)}`));
        if (files.length > 10) {
          console.log(colors.dim(`  ... and ${files.length - 10} more`));
        }
      });

      // Provide recommendations
      console.log(colors.infoMessage('\n💡 Recommendations:'));
      if (categories.source?.length > 0) {
        console.log(colors.info('  - Review source files for inclusion in version control'));
      }
      if (categories.config?.length > 0) {
        console.log(colors.warning('  - Check if config files should be tracked (avoid sensitive data)'));
      }
      if (categories.test?.length > 0) {
        console.log(colors.info('  - Consider adding test files to the repository'));
      }
      if (categories.other?.length > 0) {
        console.log(colors.info('  - Review miscellaneous files and update .gitignore if needed'));
      }

      if (this.hasAI && untrackedFiles.length > 0) {
        console.log(colors.aiMessage('\n🤖 AI Analysis of untracked files:'));
        await this.analyzeUntrackedWithAI(categories);
      }

    } catch (error) {
      console.error('❌ Error analyzing untracked files:', error.message);
      this.metrics.errors++;
    }
  }

  // Set model override
  setModelOverride(model) {
    if (model) {
      this.modelOverride = model;
      console.log(colors.infoMessage(`Model override set: ${colors.highlight(model)}`));
      
      // Validate model if AI provider is available
      if (this.hasAI && this.aiProvider) {
        const capabilities = this.aiProvider.getModelCapabilities(model);
        const features = [];
        if (capabilities.reasoning) features.push('🧠 Reasoning');
        if (capabilities.largeContext) features.push('📚 Large Context');
        if (capabilities.promptCaching) features.push('💰 Caching');
        if (capabilities.codingOptimized) features.push('⚡ Coding');
        
        if (features.length > 0) {
          console.log(colors.infoMessage(`Model capabilities: ${colors.highlight(features.join(', '))}`));
        }
      }
    }
  }

  async analyzeUntrackedWithAI(categories) {
    try {
      const commitInfo = {
        files: Object.values(categories).flat(),
        additions: 0,
        deletions: 0,
        message: `Untracked files analysis`,
        breaking: false,
        complex: false
      };

      const model = await this.selectOptimalModel({ 
        files: commitInfo.files,
        diffStats: { insertions: 0, deletions: 0 },
        breaking: false,
        semanticAnalysis: { patterns: [], frameworks: [] }
      });

      if (!model) {
        console.log('   AI analysis unavailable - using rule-based categorization');
        return;
      }

      console.log(colors.infoMessage(`Using ${colors.highlight(model)} for untracked files analysis...`));

      //  AI analysis for untracked files
      const prompt = `Analyze these untracked files and provide recommendations:

Files by category:
${Object.entries(categories).map(([cat, files]) => 
  `${cat}: ${files.map(f => f.path).join(', ')}`
).join('\n')}

Provide:
1. Risk assessment (high/medium/low)
2. Recommended actions for each category
3. Files that should likely be in .gitignore

Be concise and practical.`;

      const response = await this.aiProvider.generateCompletion([{
        role: 'user',
        content: prompt
      }], { model, max_tokens: 300 });
      
      console.log(colors.aiMessage('\n🤖 AI Recommendations:'));
      console.log(response.content);

    } catch (error) {
      console.warn(colors.warningMessage(`AI analysis failed: ${error.message}`));
    }
  }

  async analyzeRepositoryWithAI() {
    try {
      if (!this.hasAI) {
        console.log('   AI analysis unavailable - using rule-based analysis');
        return null;
      }

      const model = await this.selectOptimalModel({ 
        files: [],
        diffStats: { insertions: 0, deletions: 0 },
        breaking: false,
        semanticAnalysis: { patterns: [], frameworks: [] }
      });

      if (!model) {
        console.log('   AI analysis unavailable');
        return null;
      }

      console.log(colors.infoMessage(`Using ${colors.highlight(model)} for repository health analysis...`));

      // Get repository stats for AI analysis
      const stats = this.gitManager.getRepositoryStats();
      const status = this.gitManager.getStatus();
      const branches = this.gitManager.getAllBranches();

      const prompt = `Analyze this git repository health:

Repository Stats:
- Total commits: ${stats.totalCommits}
- Contributors: ${stats.contributors}
- Age: ${stats.age}
- Active branches: ${branches.local.length}
- Current branch: ${branches.current}

Status:
- Clean: ${status.clean}
- Staged files: ${status.staged}
- Modified files: ${status.modified}
- Untracked files: ${status.untracked}

Provide:
1. Overall repository health score (1-10)
2. Key areas needing attention
3. Recommended maintenance actions
4. Risk assessment

Be concise and actionable.`;

      const response = await this.aiProvider.generateCompletion([{
        role: 'user',
        content: prompt
      }], { model, max_tokens: 500 });
      
      console.log(colors.aiMessage('\n🤖 AI Repository Health Analysis:'));
      console.log(response.content);
      
      return response.content;

    } catch (error) {
      console.warn(colors.warningMessage(`AI repository analysis failed: ${error.message}`));
      return null;
    }
  }

  // NEW: Assess commit message quality and provide scoring
  assessCommitMessageQuality(subject, body = '') {
    const quality = {
      score: 0,
      level: 'very_poor',
      issues: [],
      suggestions: [],
      isConventional: false,
      hasDescription: false,
      isInformative: false
    };

    if (!subject || subject.trim().length === 0) {
      quality.issues.push('Empty commit message');
      quality.suggestions.push('Add a descriptive commit message');
      return quality;
    }

    const message = subject.trim();

    // Check for very poor quality indicators
    const poorQualityPatterns = [
      /^(wip|temp|tmp|test|fix|update|change|stuff|things)$/i,
      /^[0-9]+$/,  // Just numbers
      /^[a-z]$/,   // Single letters
      /^(fuck|shit|damn|wtf|fml|omg)/i,  // Profanity
      /^\.+$/,     // Just dots
      /^-+$/,      // Just dashes
      /^[^a-zA-Z0-9]*$/  // Only special characters
    ];

    const isPoorQuality = poorQualityPatterns.some(pattern => pattern.test(message));
    
    if (isPoorQuality) {
      quality.issues.push('Non-descriptive commit message');
      quality.suggestions.push('Use descriptive language that explains what changed');
      quality.score = 1;
    } else {
      quality.score = 3; // Start with base score for non-poor messages
    }

    // Check conventional commit format
    const conventionalMatch = message.match(/^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert|security|deps|config|ui|api|db)(\(.+\))?!?:\s+.+/i);
    if (conventionalMatch) {
      quality.isConventional = true;
      quality.score += 2;
    } else {
      quality.suggestions.push('Consider using conventional commit format: type(scope): description');
    }

    // Check for descriptive content
    if (message.length >= 10) {
      quality.hasDescription = true;
      quality.score += 1;
    } else {
      quality.issues.push('Message too short');
      quality.suggestions.push('Add more descriptive details (minimum 10 characters)');
    }

    // Check for informative content
    const informativeKeywords = /\b(add|remove|update|fix|implement|refactor|improve|optimize|enhance|create|delete|modify|configure|setup|integrate|migrate|upgrade|downgrade)\b/i;
    if (informativeKeywords.test(message)) {
      quality.isInformative = true;
      quality.score += 1;
    }

    // Check length appropriateness
    if (message.length > 72) {
      quality.issues.push('Subject line too long (recommended: max 72 characters)');
      quality.suggestions.push('Keep subject line under 72 characters, add details in body');
    } else if (message.length > 50) {
      quality.score += 1; // Good length
    }

    // Check for body content
    if (body && body.trim().length > 0) {
      quality.score += 1;
    }

    // Determine quality level
    if (quality.score >= 7) quality.level = 'excellent';
    else if (quality.score >= 5) quality.level = 'good';
    else if (quality.score >= 3) quality.level = 'fair';
    else if (quality.score >= 2) quality.level = 'poor';
    else quality.level = 'very_poor';

    return quality;
  }

  // NEW: Assess overall repository health
  async assessRepositoryHealth() {
    try {
      const commits = this.gitManager.getCommits({ count: 50, format: 'full' });
      const status = this.gitManager.getStatus();
      const stats = this.gitManager.getRepositoryStats();
      
      const health = {
        overall: 'good',
        score: 0,
        maxScore: 100,
        issues: [],
        recommendations: [],
        metrics: {
          commitQuality: { score: 0, total: 0 },
          workingDirectory: { clean: status.clean },
          commitFrequency: { recent: 0, total: stats.totalCommits },
          diversityScore: 0
        }
      };

      // 1. Commit Message Quality Assessment (40 points)
      let totalQualityScore = 0;
      let poorQualityCount = 0;
      
      commits.forEach(commit => {
        const quality = this.assessCommitMessageQuality(commit.subject, commit.body);
        totalQualityScore += quality.score;
        
        if (quality.level === 'very_poor' || quality.level === 'poor') {
          poorQualityCount++;
        }
      });

      const avgQualityScore = commits.length > 0 ? totalQualityScore / commits.length : 0;
      const commitQualityPoints = Math.round((avgQualityScore / 8) * 40);
      health.score += commitQualityPoints;
      health.metrics.commitQuality = {
        score: avgQualityScore,
        total: commits.length,
        averageLevel: avgQualityScore >= 6 ? 'good' : avgQualityScore >= 4 ? 'fair' : 'poor'
      };

      if (poorQualityCount > commits.length * 0.3) {
        health.issues.push(`${poorQualityCount}/${commits.length} commits have poor message quality`);
        health.recommendations.push('Improve commit message quality using conventional commit format');
      }

      // 2. Working Directory Cleanliness (20 points)
      if (status.clean) {
        health.score += 20;
      } else {
        health.issues.push('Working directory has uncommitted changes');
        health.recommendations.push('Commit or stash pending changes');
        const untracked = status.untracked || 0;
        const modified = status.modified || 0;
        if (untracked > 10) {
          health.recommendations.push('Review and add untracked files to .gitignore if needed');
        }
        health.score += Math.max(0, 20 - (untracked + modified));
      }

      // 3. Commit Frequency & Activity (20 points)
      const now = new Date();
      const recentCommits = commits.filter(commit => {
        const commitDate = new Date(commit.authorDate);
        const daysDiff = (now - commitDate) / (1000 * 60 * 60 * 24);
        return daysDiff <= 30; // Last 30 days
      });

      health.metrics.commitFrequency.recent = recentCommits.length;
      
      if (recentCommits.length >= 10) {
        health.score += 20;
      } else if (recentCommits.length >= 5) {
        health.score += 15;
      } else if (recentCommits.length >= 1) {
        health.score += 10;
      } else {
        health.issues.push('No recent commit activity (last 30 days)');
        health.recommendations.push('Maintain regular commit activity');
      }

      // 4. Code Diversity & Structure (20 points)
      const fileCategories = new Set();
      commits.forEach(commit => {
        // Simulate file analysis for diversity
        if (commit.subject.match(/\.(ts|tsx|js|jsx)/)) fileCategories.add('source');
        if (commit.subject.match(/test|spec/)) fileCategories.add('test');
        if (commit.subject.match(/doc|readme/i)) fileCategories.add('docs');
        if (commit.subject.match(/config|env/i)) fileCategories.add('config');
        if (commit.subject.match(/style|css/i)) fileCategories.add('style');
      });

      const diversityScore = Math.min(fileCategories.size * 4, 20);
      health.score += diversityScore;
      health.metrics.diversityScore = fileCategories.size;

      if (fileCategories.size < 3) {
        health.recommendations.push('Consider adding tests, documentation, or configuration management');
      }

      // Determine overall health level
      if (health.score >= 80) health.overall = 'excellent';
      else if (health.score >= 65) health.overall = 'good';  
      else if (health.score >= 50) health.overall = 'fair';
      else if (health.score >= 35) health.overall = 'poor';
      else health.overall = 'critical';

      return health;
    } catch (error) {
      console.error(colors.errorMessage(`Error assessing repository health: ${error.message}`));
      return {
        overall: 'unknown',
        score: 0,
        maxScore: 100,
        issues: ['Health assessment failed'],
        recommendations: ['Fix repository issues and try again'],
        error: error.message
      };
    }
  }
}

// CLI Interface
async function runCLI() {
  const configPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(configPath)) {
    await promptForConfig();
  }
  const args = process.argv.slice(2);
  
  // Parse CLI options
  const options = {
    dryRun: args.includes('--dry-run') || args.includes('--preview'),
    noColor: args.includes('--no-color') || process.env.NO_COLOR,
    includeAttribution: !args.includes('--no-attribution')
  };
  
  const generator = new AIChangelogGenerator(options);

  // Add performance monitoring
  const startTime = Date.now();

  // Set analysis mode based on flags
  if (args.includes('--detailed')) {
    generator.setAnalysisMode('detailed');
  } else if (args.includes('--enterprise')) {
    generator.setAnalysisMode('enterprise');
  }

  // Set model override if specified
  const modelArg = args.find(arg => arg.startsWith('--model='))?.split('=')[1] ||
                   (args.includes('--model') || args.includes('-m') ? args[args.indexOf('--model') + 1] || args[args.indexOf('-m') + 1] : null);
  if (modelArg) {
    generator.setModelOverride(modelArg);
  }

  try {
    if (args.includes('--analyze') || args.includes('-a')) {
      await generator.analyzeCurrentChanges();
    } else if (args.includes('--interactive') || args.includes('-i')) {
      await generator.runInteractiveMode();
    } else if (args.includes('--validate')) {
      const configValidation = generator.validateConfiguration();
      console.log(colors.header('🔍 Configuration Validation:'));
      console.log(`${colors.label('Valid')}: ${configValidation.valid ? colors.success('✅') : colors.error('❌')}`);

      if (configValidation.issues.length > 0) {
        console.log(colors.subheader('Issues:'));
        configValidation.issues.forEach(issue => console.log(`  - ${colors.error(issue)}`));
      }

      if (configValidation.recommendations.length > 0) {
        console.log(colors.subheader('Recommendations:'));
        configValidation.recommendations.forEach(rec => console.log(`  - ${colors.info(rec)}`));
      }

      if (configValidation.capabilities) {
        console.log(colors.subheader('\n🤖 Model Capabilities:'));
        Object.entries(configValidation.capabilities).forEach(([key, value]) => {
          if (value) console.log(`  - ${colors.label(key)}: ${colors.success('✅')}`);
        });
      }
    } else if (args.includes('--metrics')) {
      const metrics = generator.getMetrics();
      console.log(colors.header('📊 Performance Metrics:'));
      console.log(colors.value(JSON.stringify(metrics, null, 2)));
    } else if (args.includes('--branches')) {
      await generator.analyzeBranches();
    } else if (args.includes('--comprehensive')) {
      await generator.analyzeComprehensive();
    } else if (args.includes('--untracked')) {
      await generator.analyzeUntrackedFiles();
    } else if (args.includes('--health')) {
      const health = await generator.assessRepositoryHealth();
      console.log(colors.header('\n🏥 Repository Health Assessment'));
      console.log(colors.dim('='.repeat(50)));
      
      // Overall Score
      const scoreColor = health.score >= 80 ? colors.success : health.score >= 65 ? colors.highlight : health.score >= 50 ? colors.warning : colors.error;
      console.log(`${colors.label('Overall Health')}: ${scoreColor(health.overall.toUpperCase())} (${scoreColor(health.score + '/' + health.maxScore)})`);
      
      // Metrics breakdown
      console.log(colors.subheader('\n📊 Health Metrics:'));
      console.log(`  ${colors.label('Commit Quality')}: ${colors.value(health.metrics.commitQuality.averageLevel)} (${health.metrics.commitQuality.score.toFixed(1)}/8.0)`);
      console.log(`  ${colors.label('Working Directory')}: ${health.metrics.workingDirectory.clean ? colors.success('Clean') : colors.warning('Has Changes')}`);
      console.log(`  ${colors.label('Recent Activity')}: ${colors.number(health.metrics.commitFrequency.recent)} commits (last 30 days)`);
      console.log(`  ${colors.label('Code Diversity')}: ${colors.number(health.metrics.diversityScore)} categories`);
      
      // Issues
      if (health.issues.length > 0) {
        console.log(colors.subheader('\n⚠️  Issues Found:'));
        health.issues.forEach(issue => console.log(`  ${colors.error('•')} ${issue}`));
      }
      
      // Recommendations
      if (health.recommendations.length > 0) {
        console.log(colors.subheader('\n💡 Recommendations:'));
        health.recommendations.forEach(rec => console.log(`  ${colors.info('•')} ${rec}`));
      }
      
      console.log(colors.dim('\n' + '='.repeat(50)));
    } else if (args.includes('--help') || args.includes('-h')) {
      console.log(colors.header('\n🚀 AI Changelog Generator\n'));
      
      console.log(colors.subheader('Usage:'));
      console.log(`  ${colors.highlight('ai-changelog')} [options]\n`);
      
      console.log(colors.subheader('Options:'));
      console.log(`  ${colors.label('--analyze, -a')}      Analyze current working directory changes`);
      console.log(`  ${colors.label('--interactive, -i')}  Interactive mode for commit selection`);
      console.log(`  ${colors.label('--detailed')}         Use detailed analysis mode for comprehensive documentation`);
      console.log(`  ${colors.label('--enterprise')}       Use enterprise mode for stakeholder communication`);
      console.log(`  ${colors.label('--validate')}         Validate configuration and show capabilities`);
      console.log(`  ${colors.label('--metrics')}          Show performance metrics`);
      console.log(`  ${colors.label('--model, -m')}        Override model selection (e.g., gpt-4.1, o3, gpt-4.1-nano)`);
      console.log(`  ${colors.label('--version, -v')}      Specify version (default: auto-generated)`);
      console.log(`  ${colors.label('--since, -s')}        Generate since specific commit/tag`);
      console.log(`  ${colors.label('--branches')}         Analyze all branches and unmerged commits`);
      console.log(`  ${colors.label('--comprehensive')}    Comprehensive analysis including dangling commits`);
      console.log(`  ${colors.label('--untracked')}        Include untracked files analysis`);
      console.log(`  ${colors.label('--health')}           Assess repository health and commit quality`);
      console.log(`  ${colors.label('--dry-run, --preview')} ${colors.feature('Preview changelog without writing to file')}`);
      console.log(`  ${colors.label('--no-color')}         ${colors.secondary('Disable colored output')}`);
      console.log(`  ${colors.label('--no-attribution')}   ${colors.secondary('Disable attribution footer')}`);
      console.log(`  ${colors.label('--help, -h')}         Show this help\n`);
      
      console.log(colors.subheader('Analysis Modes:'));
      console.log(`  ${colors.value('standard')}           Basic changelog with core information (default)`);
      console.log(`  ${colors.value('--detailed')}         Comprehensive analysis with business impact`);
      console.log(`  ${colors.value('--enterprise')}       Enterprise-ready with security and performance analysis\n`);
      
      console.log(colors.subheader('Environment Variables:'));
      console.log(`  ${colors.code('OPENAI_API_KEY')}              Required for OpenAI`);
      console.log(`  ${colors.code('AZURE_OPENAI_ENDPOINT')}       Required for Azure OpenAI`);
      console.log(`  ${colors.code('AZURE_OPENAI_KEY')}           Required for Azure OpenAI`);
      console.log(`  ${colors.code('AZURE_OPENAI_USE_V1_API')}    Enable next-gen v1 API (recommended)\n`);
      
      console.log(colors.subheader('Features:'));
      console.log(`  🤖 Smart model selection based on commit complexity`);
      console.log(`  📊 Performance metrics and monitoring`);
      console.log(`  🔍 Configuration validation and recommendations`);
      console.log(`  💰 Automatic prompt caching for cost reduction`);
      console.log(`  🧠 Advanced reasoning for complex changes (Azure)`);
      console.log(`  📦 Batch processing for large repositories`);
      console.log(`  🎨 ${colors.feature('Colorized output with syntax highlighting')}`);
      console.log(`  👁️  ${colors.feature('Dry-run mode for safe previewing')}`);
      console.log(`  🛡️ Robust error handling and retry logic\n`);
      
      console.log(colors.subheader('Examples:'));
      console.log(`  ${colors.highlight('ai-changelog')}                    # Generate standard AI changelog`);
      console.log(`  ${colors.highlight('ai-changelog --detailed')}         # Detailed business + technical analysis`);
      console.log(`  ${colors.highlight('ai-changelog --enterprise')}       # Enterprise-ready documentation`);
      console.log(`  ${colors.highlight('ai-changelog --dry-run')}          # ${colors.feature('Preview without writing file')}`);
      console.log(`  ${colors.highlight('ai-changelog --analyze')}          # Analyze current changes`);
      console.log(`  ${colors.highlight('ai-changelog --interactive')}      # Interactive commit selection`);
      console.log(`  ${colors.highlight('ai-changelog --validate')}         # Check configuration`);
      console.log(`  ${colors.highlight('ai-changelog --model gpt-4.1')}    # Force use of specific model`);
      console.log(`  ${colors.highlight('ai-changelog --no-color')}         # ${colors.secondary('Disable colors for scripting')}`);
      console.log('');
    } else {
      const version = args.find(arg => arg.startsWith('--version='))?.split('=')[1] ||
                     (args.includes('--version') || args.includes('-v') ? args[args.indexOf('--version') + 1] || args[args.indexOf('-v') + 1] : null);

      const since = args.find(arg => arg.startsWith('--since='))?.split('=')[1] ||
                   (args.includes('--since') || args.includes('-s') ? args[args.indexOf('--since') + 1] || args[args.indexOf('-s') + 1] : null);

      await generator.generateChangelog(version, since);
    }

    // Show completion metrics
    const endTime = Date.now();
    const metrics = generator.getMetrics();

    console.log(colors.header('\n📊 Session Summary:'));
    console.log(`   ${colors.label('Total time')}: ${colors.value(generator.formatDuration(endTime - startTime))}`);
    console.log(`   ${colors.label('Commits processed')}: ${colors.number(metrics.commitsProcessed)}`);
    if (metrics.apiCalls > 0) {
      console.log(`   ${colors.label('AI calls')}: ${colors.number(metrics.apiCalls)}`);
      console.log(`   ${colors.label('Success rate')}: ${colors.percentage(metrics.successRate + '%')}`);
    }
    if (metrics.errors > 0) {
      console.log(`   ${colors.label('Errors')}: ${colors.error(metrics.errors)}`);
    }

      } catch (error) {
      console.error(colors.errorMessage(`CLI Error: ${error.message}`));
      generator.metrics.errors++;
      process.exit(1);
    }
}

// Export the class for use as a module
module.exports = AIChangelogGenerator;

// Export the CLI function
module.exports.runCLI = runCLI;

// Auto-run CLI if this file is executed directly
if (require.main === module) {
  runCLI().catch(console.error);
}