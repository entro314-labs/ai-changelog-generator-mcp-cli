#!/usr/bin/env node

/**
 * AI Changelog Generator MCP Server
 *
 * Provides tools for generating AI-powered changelogs from git repositories
 * Supports both OpenAI and Azure OpenAI with error handling
 * Updated for GPT-4.1 series and latest Azure OpenAI v1 API
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

// Import our existing modules
const AIProvider = require('./ai-provider');
const GitManager = require('./git-manager');
const ConfigManager = require('./config');
const fs = require('fs');
const path = require('path');

class AIChangelogMCPServer {
  constructor() {
    // Read package version dynamically
    let packageJson;
    try {
      packageJson = require('../package.json');
    } catch (error) {
      console.warn('Could not read package.json, using default version');
      packageJson = { version: '1.0.0' };
    }

    this.server = new Server(
      {
        name: 'ai-changelog-generator',
        version: packageJson.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.config = new ConfigManager();
    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'generate_changelog',
            description: 'Generate an AI-powered changelog from git commits in a repository',
            inputSchema: {
              type: 'object',
              properties: {
                repositoryPath: {
                  type: 'string',
                  description: 'Path to the git repository (defaults to current directory)',
                },
                since: {
                  type: 'string',
                  description: 'Generate changelog since this tag/commit/date (e.g., "v1.0.0", "HEAD~10", "2024-01-01")',
                },
                analysisMode: {
                  type: 'string',
                  description: 'Analysis mode for changelog generation',
                  enum: ['standard', 'detailed', 'enterprise'],
                  default: 'standard',
                },
                outputFormat: {
                  type: 'string',
                  description: 'Output format for the changelog',
                  enum: ['markdown', 'json'],
                  default: 'markdown',
                },
                includeUnreleased: {
                  type: 'boolean',
                  description: 'Include unreleased changes',
                  default: true,
                },
                version: {
                  type: 'string',
                  description: 'Version number for the changelog entry',
                },
                model: {
                  type: 'string',
                  description: 'Override model selection (e.g., gpt-4.1, o3, o4, gpt-4.1-nano)',
                },
                includeAttribution: {
                  type: 'boolean',
                  description: 'Include attribution footer (defaults to true)',
                  default: true,
                },
              },
              required: [],
            },
          },
          {
            name: 'analyze_commits',
            description: 'Analyze git commits and categorize them without generating a full changelog',
            inputSchema: {
              type: 'object',
              properties: {
                repositoryPath: {
                  type: 'string',
                  description: 'Path to the git repository (defaults to current directory)',
                },
                since: {
                  type: 'string',
                  description: 'Analyze commits since this tag/commit/date',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of commits to analyze',
                  default: 50,
                  minimum: 1,
                  maximum: 1000,
                },
              },
              required: [],
            },
          },
          {
            name: 'get_git_info',
            description: 'Get information about a git repository',
            inputSchema: {
              type: 'object',
              properties: {
                repositoryPath: {
                  type: 'string',
                  description: 'Path to the git repository (defaults to current directory)',
                },
                includeStats: {
                  type: 'boolean',
                  description: 'Include repository statistics',
                  default: true,
                },
              },
              required: [],
            },
          },
          {
            name: 'configure_ai_provider',
            description: 'Configure or test AI provider settings',
            inputSchema: {
              type: 'object',
              properties: {
                provider: {
                  type: 'string',
                  description: 'AI provider to use',
                  enum: ['openai', 'azure', 'auto'],
                  default: 'auto',
                },
                testConnection: {
                  type: 'boolean',
                  description: 'Test the AI provider connection',
                  default: false,
                },
                showModels: {
                  type: 'boolean',
                  description: 'Show available model configuration',
                  default: true,
                },
              },
              required: [],
            },
          },
          {
            name: 'validate_models',
            description: 'Validate available AI models and their capabilities in the current deployment',
            inputSchema: {
              type: 'object',
              properties: {
                provider: {
                  type: 'string',
                  description: 'AI provider to validate (azure, openai, or auto)',
                  enum: ['azure', 'openai', 'auto'],
                  default: 'auto',
                },
                checkCapabilities: {
                  type: 'boolean',
                  description: 'Include detailed capability information for each model',
                  default: true,
                },
                testModels: {
                  type: 'boolean',
                  description: 'Test model availability with actual API calls',
                  default: false,
                },
              },
              required: [],
            },
          },
          {
            name: 'analyze_current_changes',
            description: 'Analyze current working directory changes (staged and unstaged)',
            inputSchema: {
              type: 'object',
              properties: {
                repositoryPath: {
                  type: 'string',
                  description: 'Path to the git repository (defaults to current directory)',
                },
                includeAIAnalysis: {
                  type: 'boolean',
                  description: 'Include AI-powered analysis of changes',
                  default: true,
                },
                includeAttribution: {
                  type: 'boolean',
                  description: 'Include attribution footer (defaults to true)',
                  default: true,
                },
              },
              required: [],
            },
          },
          {
            name: 'analyze_branches',
            description: 'Analyze git branches, unmerged commits, and dangling commits',
            inputSchema: {
              type: 'object',
              properties: {
                repositoryPath: {
                  type: 'string',
                  description: 'Path to the git repository (defaults to current directory)',
                },
                includeDangling: {
                  type: 'boolean',
                  description: 'Include dangling commits analysis',
                  default: true,
                },
              },
              required: [],
            },
          },
          {
            name: 'analyze_comprehensive',
            description: 'Comprehensive git repository analysis including branches, dangling commits, and untracked files',
            inputSchema: {
              type: 'object',
              properties: {
                repositoryPath: {
                  type: 'string',
                  description: 'Path to the git repository (defaults to current directory)',
                },
                includeUntracked: {
                  type: 'boolean',
                  description: 'Include untracked files analysis',
                  default: true,
                },
              },
              required: [],
            },
          },
          {
            name: 'generate_changelog_from_changes',
            description: 'Generate a full AI changelog from current working directory changes (staged and unstaged)',
            inputSchema: {
              type: 'object',
              properties: {
                repositoryPath: {
                  type: 'string',
                  description: 'Path to the git repository (defaults to current directory)',
                },
                analysisMode: {
                  type: 'string',
                  description: 'Analysis mode for changelog generation',
                  enum: ['standard', 'detailed', 'enterprise'],
                  default: 'standard',
                },
                outputFormat: {
                  type: 'string',
                  description: 'Output format for the changelog',
                  enum: ['markdown', 'json'],
                  default: 'markdown',
                },
                version: {
                  type: 'string',
                  description: 'Version number for the changelog entry',
                },
                model: {
                  type: 'string',
                  description: 'Override model selection (e.g., gpt-4.1, o3, o4, gpt-4.1-nano)',
                },
                includeAttribution: {
                  type: 'boolean',
                  description: 'Include attribution footer (defaults to true)',
                  default: true,
                },
              },
              required: [],
            },
          },
          {
            name: 'assess_repository_health',
            description: 'Assess repository health including commit message quality, working directory status, and activity metrics',
            inputSchema: {
              type: 'object',
              properties: {
                repositoryPath: {
                  type: 'string',
                  description: 'Path to the git repository (defaults to current directory)',
                },
                includeRecommendations: {
                  type: 'boolean',
                  description: 'Include improvement recommendations',
                  default: true,
                },
                analyzeRecentCommits: {
                  type: 'number',
                  description: 'Number of recent commits to analyze for quality (default: 50)',
                  default: 50,
                  minimum: 10,
                  maximum: 100,
                },
              },
              required: [],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'generate_changelog':
            return await this.generateChangelog(args);
          case 'analyze_commits':
            return await this.analyzeCommits(args);
          case 'get_git_info':
            return await this.getGitInfo(args);
          case 'configure_ai_provider':
            return await this.configureAIProvider(args);
          case 'validate_models':
            return await this.validateModels(args);
          case 'analyze_current_changes':
            return await this.analyzeCurrentChanges(args);
          case 'analyze_branches':
            return await this.analyzeBranches(args);
          case 'analyze_comprehensive':
            return await this.analyzeComprehensive(args);
          case 'generate_changelog_from_changes':
            return await this.generateChangelogFromChanges(args);
          case 'assess_repository_health':
            return await this.assessRepositoryHealth(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`MCP Tool Error [${name}]:`, error.message);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async generateChangelog(args) {
    const {
      repositoryPath = process.cwd(),
      since,
      analysisMode = 'standard',
      outputFormat = 'markdown',
      includeUnreleased = true,
      version,
      model,
      includeAttribution = true
    } = args;

    const originalCwd = process.cwd();

    try {
      // Validate and change to repository directory
      if (repositoryPath !== process.cwd()) {
        if (!fs.existsSync(repositoryPath)) {
          throw new Error(`Repository path does not exist: ${repositoryPath}`);
        }
        process.chdir(repositoryPath);
      }

      // Validate git repository
      let gitManager;
      try {
        gitManager = new GitManager();
      } catch (error) {
        throw new Error(`Not a git repository: ${error.message}`);
      }

      const aiProvider = new AIProvider();

      // Get commit options with validation
      const commitOptions = {
        count: 100, // Increased for better analysis
        format: 'full'
      };

      if (since) {
        // Validate since parameter
        if (gitManager.validateCommitHash(since) || gitManager.isValidGitDate(since)) {
          commitOptions.since = since;
        } else {
          console.warn(`⚠️  Invalid since parameter: ${since}, using default range`);
        }
      }

      console.log(`🔍 Retrieving commits with options:`, commitOptions);
      const commits = gitManager.getCommits(commitOptions);

      if (commits.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No commits found for the specified range. Please check your repository has commits or adjust the "since" parameter.'
          }]
        };
      }

      console.log(`📝 Found ${commits.length} commits to analyze`);

      let changelog;
      const metadata = {
        totalCommits: commits.length,
        analysisMode: analysisMode,
        generatedAt: new Date().toISOString(),
        aiProvider: aiProvider.isAvailable ? `${aiProvider.activeProvider} (${aiProvider.getProviderInfo()})` : 'rule-based',
        repository: gitManager.gitConfig?.repository?.name || path.basename(process.cwd())
      };

      if (aiProvider.isAvailable) {
        console.log(`🤖 Generating AI-powered changelog using ${aiProvider.activeProvider.toUpperCase()}...`);

        try {
          // Use the main generator for full AI analysis
          const AIChangelogGenerator = require('./ai-changelog-generator');
          const generator = new AIChangelogGenerator({ includeAttribution });
          generator.setAnalysisMode(analysisMode);
          
          // Set model override if provided
          if (model) {
            generator.setModelOverride(model);
          }

          // Generate changelog
          const changelogContent = await generator.generateChangelog(version, since);

          // Try to read the generated file
          const changelogPath = path.join(process.cwd(), 'AI_CHANGELOG.md');

          if (fs.existsSync(changelogPath)) {
            const content = fs.readFileSync(changelogPath, 'utf8');
            changelog = {
              content: content,
              filePath: changelogPath,
              metadata
            };
          } else {
            // Fallback if file generation failed
            changelog = {
              content: changelogContent || this.generateBasicChangelog(commits, version),
              metadata
            };
          }
        } catch (aiError) {
          console.warn(`⚠️  AI generation failed: ${aiError.message}, falling back to rule-based analysis`);
          changelog = {
            content: this.generateBasicChangelog(commits, version, includeAttribution),
            metadata: { ...metadata, aiProvider: 'rule-based (AI fallback)' }
          };
        }
      } else {
        console.log(`📝 Generating rule-based changelog...`);
        changelog = {
          content: this.generateBasicChangelog(commits, version, includeAttribution),
          metadata
        };
      }

      // Format output based on requested format
      if (outputFormat === 'json') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              changelog: changelog.content,
              metadata: changelog.metadata
            }, null, 2)
          }]
        };
      }

      // Write changelog file to project root (for feature parity with CLI)
      const changelogPath = path.join(process.cwd(), 'AI_CHANGELOG.md');
      try {
        fs.writeFileSync(changelogPath, changelog.content, 'utf8');
        console.log(`📝 Changelog written to: ${changelogPath}`);
      } catch (writeError) {
        console.warn(`⚠️  Could not write changelog file: ${writeError.message}`);
      }

      // Return markdown content
      return {
        content: [{
          type: 'text',
          text: changelog.content
        }],
        metadata: {
          ...changelog.metadata,
          filePath: changelogPath
        }
      };

    } catch (error) {
      console.error('Changelog generation error:', error);
      throw new Error(`Failed to generate changelog: ${error.message}`);
    } finally {
      process.chdir(originalCwd);
    }
  }

  async analyzeCommits(args) {
    const {
      repositoryPath = process.cwd(),
      since,
      limit = 50
    } = args;

    const originalCwd = process.cwd();

    try {
      if (repositoryPath !== process.cwd()) {
        if (!fs.existsSync(repositoryPath)) {
          throw new Error(`Repository path does not exist: ${repositoryPath}`);
        }
        process.chdir(repositoryPath);
      }

      const gitManager = new GitManager();

      // Get commits with validation
      const commitOptions = {
        count: Math.min(Math.max(limit, 1), 1000), // Clamp between 1 and 1000
        format: 'full'
      };

      if (since) {
        if (gitManager.validateCommitHash(since) || gitManager.isValidGitDate(since)) {
          commitOptions.since = since;
        } else {
          console.warn(`⚠️  Invalid since parameter: ${since}`);
        }
      }

      const commits = gitManager.getCommitsWithStats(commitOptions);

      // Analyze commit patterns
      const analysis = {
        totalCommits: commits.length,
        commitsByType: {},
        commitsByAuthor: {},
        commitsByDay: {},
        timeRange: {
          from: commits.length > 0 ? commits[commits.length - 1]?.authorDate || null : null,
          to: commits.length > 0 ? commits[0]?.authorDate || null : null,
        },
        complexity: this.analyzeComplexity(commits),
        patterns: this.identifyPatterns(commits),
        commits: commits.map(commit => ({
          hash: commit.hash?.substring(0, 8),
          shortHash: commit.shortHash,
          message: commit.subject || commit.message,
          author: commit.author,
          date: commit.authorDate,
          type: commit.type,
          scope: commit.scope,
          breaking: commit.breaking,
          stats: commit.stats || { files: 0, insertions: 0, deletions: 0 }
        })),
      };

      // Count by type and author
      commits.forEach(commit => {
        const type = commit.type || 'other';
        analysis.commitsByType[type] = (analysis.commitsByType[type] || 0) + 1;

        const author = commit.author || 'unknown';
        analysis.commitsByAuthor[author] = (analysis.commitsByAuthor[author] || 0) + 1;

        // Group by day for activity analysis
        if (commit.authorDate) {
          const day = commit.authorDate.split('T')[0]; // Extract YYYY-MM-DD
          analysis.commitsByDay[day] = (analysis.commitsByDay[day] || 0) + 1;
        }
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }]
      };

    } catch (error) {
      throw new Error(`Failed to analyze commits: ${error.message}`);
    } finally {
      process.chdir(originalCwd);
    }
  }

  async getGitInfo(args) {
    const {
      repositoryPath = process.cwd(),
      includeStats = true
    } = args;

    const originalCwd = process.cwd();

    try {
      if (repositoryPath !== process.cwd()) {
        if (!fs.existsSync(repositoryPath)) {
          throw new Error(`Repository path does not exist: ${repositoryPath}`);
        }
        process.chdir(repositoryPath);
      }

      const gitManager = new GitManager();

      const info = {
        isGitRepo: gitManager.isGitRepo,
        path: process.cwd(),
        config: gitManager.gitConfig,
        branch: gitManager.getBranchInfo(),
        status: gitManager.getStatus(),
        lastCommit: gitManager.getLastCommit(),
        tags: gitManager.getTags({ limit: 10 })
      };

      if (includeStats) {
        info.stats = gitManager.getRepositoryStats();
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(info, null, 2)
        }]
      };

    } catch (error) {
      if (error.message.includes('Not a git repository')) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              isGitRepo: false,
              error: 'Not a git repository',
              path: repositoryPath
            }, null, 2)
          }]
        };
      }
      throw new Error(`Failed to get git info: ${error.message}`);
    } finally {
      process.chdir(originalCwd);
    }
  }

  async configureAIProvider(args) {
    const {
      provider = 'auto',
      testConnection = false,
      showModels = true
    } = args;

    try {
      const aiProvider = new AIProvider();

      let result = `🤖 AI Provider Configuration\n\n`;
      result += `Current Provider: ${aiProvider.activeProvider}\n`;
      result += `Available: ${aiProvider.isAvailable}\n`;
      result += `Info: ${aiProvider.getProviderInfo()}\n\n`;

      if (showModels) {
        result += `📦 Model Configuration:\n`;
        Object.entries(aiProvider.modelConfig).forEach(([key, model]) => {
          result += `  ${key}: ${model}\n`;
        });
        result += '\n';
      }

      if (testConnection && aiProvider.isAvailable) {
        result += `🔍 Testing connection...\n`;
        const connectionTest = await aiProvider.testConnection();

        if (connectionTest.success) {
          result += `✅ Connection successful\n`;
          result += `Model: ${connectionTest.model}\n`;
          result += `Response: ${connectionTest.response?.substring(0, 50)}...\n`;
        } else {
          result += `❌ Connection failed: ${connectionTest.error}\n`;
        }
      } else if (testConnection && !aiProvider.isAvailable) {
        result += `❌ Cannot test connection - no AI provider configured\n`;
        result += `💡 Configure AZURE_OPENAI_* or OPENAI_API_KEY environment variables\n`;
      }

      return {
        content: [{
          type: 'text',
          text: result
        }]
      };

    } catch (error) {
      throw new Error(`Failed to configure AI provider: ${error.message}`);
    }
  }

  async validateModels(args) {
    const {
      provider = 'auto',
      checkCapabilities = true,
      testModels = false
    } = args;

    try {
      const aiProvider = new AIProvider();

      if (!aiProvider.isAvailable) {
        return {
          content: [{
            type: 'text',
            text: '❌ No AI provider is currently configured.\n\n💡 Please set up environment variables:\n• For Azure: AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY\n• For OpenAI: OPENAI_API_KEY'
          }]
        };
      }

      let result = `🤖 AI Provider: ${aiProvider.activeProvider.toUpperCase()}\n`;
      result += `📊 Configuration: ${aiProvider.getProviderInfo()}\n\n`;

      if (aiProvider.activeProvider === 'azure') {
        result += '🔍 Validating Azure OpenAI Models...\n\n';

        // Test common models
        const testModels = [
          'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
          'o4', 'o4-mini', 'o3', 'o3-mini', // reasoning models (both generations)
          'gpt-4o', 'gpt-4o-mini', // fallback models
          'gpt-4', 'gpt-35-turbo' // legacy models
        ];

        for (const model of testModels) {
          try {
            const validation = testModels ?
              await aiProvider.validateModelAvailability(model) :
              { available: 'unknown', capabilities: aiProvider.getModelCapabilities(model) };

            const status = validation.available === true ? '✅' :
                          validation.available === false ? '❌' : '❓';
            result += `${status} ${model}\n`;

            if (checkCapabilities && validation.capabilities) {
              const caps = validation.capabilities;
              const features = [];
              if (caps.reasoning) features.push('🧠 Reasoning');
              if (caps.largeContext) features.push('📚 1M Context');
              if (caps.promptCaching) features.push('💰 Caching');
              if (caps.codingOptimized) features.push('⚡ Coding');
              if (caps.vision) features.push('👁️ Vision');

              if (features.length > 0) {
                result += `   Features: ${features.join(', ')}\n`;
              }
            }
          } catch (error) {
            result += `❌ ${model} - Error: ${error.message}\n`;
          }
        }

        // Check API version
        result += `\n🌐 API Configuration:\n`;
        result += `   API Version: ${aiProvider.azureConfig.apiVersion}\n`;
        result += `   Using v1 API: ${aiProvider.shouldUseV1API() ? '✅' : '❌'}\n`;

        if (!aiProvider.shouldUseV1API()) {
          result += `   💡 Consider enabling v1 API for always up-to-date features\n`;
        }

      } else if (aiProvider.activeProvider === 'openai') {
        result += '🔍 OpenAI Model Configuration:\n\n';

        const models = ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini'];

        for (const model of models) {
          const validation = testModels ?
            await aiProvider.validateModelAvailability(model) :
            { available: true, capabilities: aiProvider.getModelCapabilities(model) };

          const status = validation.available ? '✅' : '❌';
          result += `${status} ${model}\n`;

          if (checkCapabilities && validation.capabilities) {
            const caps = validation.capabilities;
            const features = [];
            if (caps.largeContext) features.push('📚 Large Context');
            if (caps.promptCaching) features.push('💰 Caching');
            if (caps.codingOptimized) features.push('⚡ Coding');
            if (caps.vision) features.push('👁️ Vision');

            if (features.length > 0) {
              result += `   Features: ${features.join(', ')}\n`;
            }
          }
        }

        result += `\n💡 Note: Reasoning models (o3/o3-mini, o4/o4-mini) are Azure-only\n`;
      }

      // Test optimal model selection
      result += '\n🎯 Model Selection Test:\n';
      try {
        const optimalModel = await aiProvider.selectOptimalModel();
        result += `   Optimal model: ${optimalModel.model}\n`;

        if (optimalModel.capabilities) {
          const caps = optimalModel.capabilities;
          if (caps.reasoning) result += '   🧠 Advanced reasoning available\n';
          if (caps.largeContext) result += '   📚 Large context window (1M tokens)\n';
          if (caps.promptCaching) result += '   💰 Prompt caching enabled (75% savings)\n';
        }
      } catch (error) {
        result += `   ❌ Error selecting optimal model: ${error.message}\n`;
      }

      return {
        content: [{
          type: 'text',
          text: result
        }]
      };

    } catch (error) {
      throw new Error(`Failed to validate models: ${error.message}`);
    }
  }

  async analyzeCurrentChanges(args) {
    const {
      repositoryPath = process.cwd(),
      includeAIAnalysis = true,
      includeAttribution = true
    } = args;

    const originalCwd = process.cwd();

    try {
      if (repositoryPath !== process.cwd()) {
        if (!fs.existsSync(repositoryPath)) {
          throw new Error(`Repository path does not exist: ${repositoryPath}`);
        }
        process.chdir(repositoryPath);
      }

      const gitManager = new GitManager();
      const aiProvider = new AIProvider();

      // Get current changes
      const stagedChanges = gitManager.getStagedChanges();
      const unstagedChanges = gitManager.getUnstagedChanges();

      const analysis = {
        repository: path.basename(process.cwd()),
        timestamp: new Date().toISOString(),
        staged: {
          count: stagedChanges.length,
          files: stagedChanges
        },
        unstaged: {
          count: unstagedChanges.length,
          files: unstagedChanges
        },
        summary: {
          totalFiles: stagedChanges.length + unstagedChanges.length,
          hasChanges: stagedChanges.length > 0 || unstagedChanges.length > 0,
          readyToCommit: stagedChanges.length > 0
        }
      };

      // Add AI analysis if requested and available
      if (includeAIAnalysis && aiProvider.isAvailable && analysis.summary.hasChanges) {
        try {
          const allChanges = [...stagedChanges, ...unstagedChanges];
          const changesSummary = this.summarizeChanges(allChanges);

          const aiAnalysis = await this.generateAIChangeAnalysis(aiProvider, changesSummary);
          analysis.aiAnalysis = aiAnalysis;
        } catch (error) {
          console.warn(`⚠️  AI analysis failed: ${error.message}`);
          analysis.aiAnalysis = { error: 'AI analysis failed', fallback: true };
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }]
      };

    } catch (error) {
      throw new Error(`Failed to analyze current changes: ${error.message}`);
    } finally {
      process.chdir(originalCwd);
    }
  }

  async analyzeBranches(args) {
    const {
      repositoryPath = process.cwd(),
      includeDangling = true
    } = args;

    const originalCwd = process.cwd();

    try {
      if (repositoryPath !== process.cwd()) {
        if (!fs.existsSync(repositoryPath)) {
          throw new Error(`Repository path does not exist: ${repositoryPath}`);
        }
        process.chdir(repositoryPath);
      }

      const gitManager = new GitManager();

      const branches = gitManager.getAllBranches();
      const unmergedCommits = gitManager.getUnmergedCommits();
      const danglingCommits = includeDangling ? gitManager.getDanglingCommits() : [];

      const analysis = {
        repository: path.basename(process.cwd()),
        timestamp: new Date().toISOString(),
        branches: {
          local: branches.local,
          remote: branches.remote,
          current: branches.current
        },
        unmergedCommits: unmergedCommits.map(branch => ({
          branch: branch.branch,
          commitCount: branch.commits.length,
          commits: branch.commits.slice(0, 5) // Limit to first 5 for readability
        })),
        danglingCommits: danglingCommits.slice(0, 10), // Limit to 10
        summary: {
          totalLocalBranches: branches.local.length,
          totalRemoteBranches: branches.remote.length,
          unmergedBranches: unmergedCommits.length,
          danglingCommitCount: danglingCommits.length,
          hasUnmergedWork: unmergedCommits.length > 0,
          hasDanglingCommits: danglingCommits.length > 0
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }]
      };

    } catch (error) {
      throw new Error(`Failed to analyze branches: ${error.message}`);
    } finally {
      process.chdir(originalCwd);
    }
  }

  async analyzeComprehensive(args) {
    const {
      repositoryPath = process.cwd(),
      includeUntracked = true
    } = args;

    const originalCwd = process.cwd();

    try {
      if (repositoryPath !== process.cwd()) {
        if (!fs.existsSync(repositoryPath)) {
          throw new Error(`Repository path does not exist: ${repositoryPath}`);
        }
        process.chdir(repositoryPath);
      }

      const gitManager = new GitManager();

      // Get comprehensive analysis using the new method
      const comprehensiveData = gitManager.getComprehensiveAnalysis();
      
      // Add untracked files analysis if requested
      let untrackedFiles = [];
      if (includeUntracked) {
        try {
          const untrackedOutput = gitManager.execGitSafe('git ls-files --others --exclude-standard');
          untrackedFiles = untrackedOutput.trim().split('\n').filter(Boolean);
        } catch (error) {
          console.warn('Could not get untracked files:', error.message);
        }
      }

      const analysis = {
        repository: path.basename(process.cwd()),
        timestamp: new Date().toISOString(),
        ...comprehensiveData,
        untrackedFiles: untrackedFiles.map(file => ({
          path: file,
          category: gitManager.categorizeFile(file),
          type: gitManager.getFileType(file)
        })),
        summary: {
          totalCommits: comprehensiveData.statistics.totalCommits,
          totalBranches: comprehensiveData.branches.local.length + comprehensiveData.branches.remote.length,
          unmergedBranches: comprehensiveData.unmergedCommits.length,
          danglingCommits: comprehensiveData.danglingCommits.length,
          stagedFiles: comprehensiveData.workingDirectory.staged.length,
          unstagedFiles: comprehensiveData.workingDirectory.unstaged.length,
          untrackedFiles: untrackedFiles.length,
          hasUncommittedWork: comprehensiveData.workingDirectory.staged.length > 0 || 
                              comprehensiveData.workingDirectory.unstaged.length > 0,
          hasUntrackedFiles: untrackedFiles.length > 0,
          repositoryHealth: {
            clean: comprehensiveData.workingDirectory.status.clean,
            hasDanglingCommits: comprehensiveData.danglingCommits.length > 0,
            hasUnmergedBranches: comprehensiveData.unmergedCommits.length > 0
          }
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }]
      };

    } catch (error) {
      throw new Error(`Failed to analyze comprehensive data: ${error.message}`);
    } finally {
      process.chdir(originalCwd);
    }
  }

  async generateChangelogFromChanges(args) {
    const {
      repositoryPath = process.cwd(),
      analysisMode = 'standard',
      outputFormat = 'markdown',
      version,
      model,
      includeAttribution = true
    } = args;

    const originalCwd = process.cwd();

    try {
      // Validate and change to repository directory
      if (repositoryPath !== process.cwd()) {
        if (!fs.existsSync(repositoryPath)) {
          throw new Error(`Repository path does not exist: ${repositoryPath}`);
        }
        process.chdir(repositoryPath);
      }

      // Validate git repository
      let gitManager;
      try {
        gitManager = new GitManager();
      } catch (error) {
        throw new Error(`Not a git repository: ${error.message}`);
      }

      const aiProvider = new AIProvider();

      // Get current changes
      const stagedChanges = gitManager.getStagedChanges();
      const unstagedChanges = gitManager.getUnstagedChanges();
      const allChanges = [...stagedChanges, ...unstagedChanges];

      if (allChanges.length === 0) {
        return {
          content: [{
            type: 'text',
            text: 'No changes detected in working directory. Please stage or modify files to generate a changelog.'
          }]
        };
      }

      console.log(`📝 Found ${allChanges.length} changed files to analyze`);

      let changelog;
      const metadata = {
        totalFiles: allChanges.length,
        stagedFiles: stagedChanges.length,
        unstagedFiles: unstagedChanges.length,
        analysisMode: analysisMode,
        generatedAt: new Date().toISOString(),
        aiProvider: aiProvider.isAvailable ? `${aiProvider.activeProvider} (${aiProvider.getProviderInfo()})` : 'rule-based',
        repository: gitManager.gitConfig?.repository?.name || path.basename(process.cwd())
      };

      if (aiProvider.isAvailable) {
        console.log(`🤖 Generating AI-powered changelog from working directory changes using ${aiProvider.activeProvider.toUpperCase()}...`);

        try {
          // Generate AI-powered changelog from working directory changes
          const changelogContent = await this.generateWorkingDirChangelog(aiProvider, allChanges, version, analysisMode, includeAttribution, model);

          changelog = {
            content: changelogContent,
            metadata
          };
        } catch (aiError) {
          console.warn(`⚠️  AI generation failed: ${aiError.message}, falling back to rule-based analysis`);
          changelog = {
            content: this.generateBasicChangelogFromChanges(allChanges, version, includeAttribution),
            metadata: { ...metadata, aiProvider: 'rule-based (AI fallback)' }
          };
        }
      } else {
        console.log(`📝 Generating rule-based changelog from working directory changes...`);
        changelog = {
          content: this.generateBasicChangelogFromChanges(allChanges, version, includeAttribution),
          metadata
        };
      }

      // Format output based on requested format
      if (outputFormat === 'json') {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              changelog: changelog.content,
              metadata: changelog.metadata
            }, null, 2)
          }]
        };
      }

      // Write changelog file to project root (for feature parity with CLI)
      const changelogPath = path.join(process.cwd(), 'AI_CHANGELOG.md');
      try {
        fs.writeFileSync(changelogPath, changelog.content, 'utf8');
        console.log(`📝 Working directory changelog written to: ${changelogPath}`);
      } catch (writeError) {
        console.warn(`⚠️  Could not write changelog file: ${writeError.message}`);
      }

      // Return markdown content
      return {
        content: [{
          type: 'text',
          text: changelog.content
        }],
        metadata: {
          ...changelog.metadata,
          filePath: changelogPath
        }
      };

    } catch (error) {
      console.error('Changelog generation error:', error);
      throw new Error(`Failed to generate changelog from changes: ${error.message}`);
    } finally {
      process.chdir(originalCwd);
    }
  }

  // NEW: Assess repository health
  async assessRepositoryHealth(args) {
    const {
      repositoryPath = process.cwd(),
      includeRecommendations = true,
      analyzeRecentCommits = 50
    } = args;

    const originalCwd = process.cwd();

    try {
      // Validate and change to repository directory
      if (repositoryPath !== process.cwd()) {
        if (!fs.existsSync(repositoryPath)) {
          throw new Error(`Repository path does not exist: ${repositoryPath}`);
        }
        process.chdir(repositoryPath);
      }

      // Validate git repository
      let gitManager;
      try {
        gitManager = new GitManager();
      } catch (error) {
        throw new Error(`Not a git repository: ${error.message}`);
      }

      // Use the main generator for comprehensive health assessment
      const AIChangelogGenerator = require('./ai-changelog-generator');
      const generator = new AIChangelogGenerator();
      
      console.log(`🏥 Assessing repository health for ${path.basename(process.cwd())}...`);
      
      const health = await generator.assessRepositoryHealth();

      // Add MCP-specific metadata
      const analysis = {
        repository: gitManager.gitConfig?.repository?.name || path.basename(process.cwd()),
        timestamp: new Date().toISOString(),
        healthAssessment: health,
        summary: {
          overallHealth: health.overall,
          score: `${health.score}/${health.maxScore}`,
          totalIssues: health.issues.length,
          totalRecommendations: health.recommendations.length,
          commitQualityLevel: health.metrics.commitQuality.averageLevel,
          isWorkingDirectoryClean: health.metrics.workingDirectory.clean,
          recentActivity: health.metrics.commitFrequency.recent
        }
      };

      if (!includeRecommendations) {
        delete analysis.healthAssessment.recommendations;
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analysis, null, 2)
        }]
      };

    } catch (error) {
      throw new Error(`Failed to assess repository health: ${error.message}`);
    } finally {
      process.chdir(originalCwd);
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

  async generateAIChangeAnalysis(aiProvider, changesSummary) {
    const prompt = `Analyze these current git changes and provide insights:

Files changed: ${changesSummary.totalFiles}
Categories: ${Object.keys(changesSummary.categories).join(', ')}

Files by category:
${Object.entries(changesSummary.categories).map(([cat, files]) =>
  `${cat}: ${files.map(f => `${f.status} ${f.path}`).join(', ')}`
).join('\n')}

Provide a brief analysis of:
1. What type of work is being done
2. Recommended commit message format
3. Potential impact level

Respond in JSON format with: analysis, commitSuggestion, impactLevel.`;

    try {
      const response = await aiProvider.generateCompletion([{
        role: 'user',
        content: prompt
      }], { max_tokens: 300 });

      return {
        raw: response.content,
        model: response.model,
        provider: aiProvider.activeProvider
      };
    } catch (error) {
      throw new Error(`AI analysis failed: ${error.message}`);
    }
  }

  analyzeComplexity(commits) {
    if (commits.length === 0) return { level: 'none', score: 0 };

    let totalScore = 0;
    let maxFiles = 0;
    let maxLines = 0;

    commits.forEach(commit => {
      const stats = commit.stats || { files: 0, insertions: 0, deletions: 0 };
      const files = stats.files;
      const lines = stats.insertions + stats.deletions;

      maxFiles = Math.max(maxFiles, files);
      maxLines = Math.max(maxLines, lines);

      // Calculate complexity score
      let score = 0;
      if (files > 20) score += 3;
      else if (files > 10) score += 2;
      else if (files > 5) score += 1;

      if (lines > 1000) score += 3;
      else if (lines > 500) score += 2;
      else if (lines > 100) score += 1;

      if (commit.breaking) score += 2;
      if (commit.type === 'refactor') score += 1;

      totalScore += score;
    });

    const avgScore = totalScore / commits.length;

    let level = 'low';
    if (avgScore > 4) level = 'very high';
    else if (avgScore > 3) level = 'high';
    else if (avgScore > 2) level = 'medium';
    else if (avgScore > 1) level = 'low-medium';

    return {
      level,
      score: Math.round(avgScore * 10) / 10,
      maxFiles,
      maxLines,
      details: {
        averageFilesPerCommit: Math.round((commits.reduce((sum, c) => sum + (c.stats?.files || 0), 0) / commits.length) * 10) / 10,
        averageLinesPerCommit: Math.round((commits.reduce((sum, c) => sum + ((c.stats?.insertions || 0) + (c.stats?.deletions || 0)), 0) / commits.length) * 10) / 10
      }
    };
  }

  identifyPatterns(commits) {
    const patterns = {
      types: {},
      authors: {},
      timing: {},
      breaking: 0,
      scoped: 0
    };

    commits.forEach(commit => {
      // Type patterns
      patterns.types[commit.type] = (patterns.types[commit.type] || 0) + 1;

      // Author patterns
      patterns.authors[commit.author] = (patterns.authors[commit.author] || 0) + 1;

      // Breaking changes
      if (commit.breaking) patterns.breaking++;

      // Scoped commits
      if (commit.scope) patterns.scoped++;

      // Timing patterns (hour of day)
      if (commit.authorDate) {
        try {
          const hour = new Date(commit.authorDate).getHours();
          const timeSlot = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
          patterns.timing[timeSlot] = (patterns.timing[timeSlot] || 0) + 1;
        } catch (error) {
          // Ignore date parsing errors
        }
      }
    });

    return patterns;
  }

  categorizeCommit(message) {
    if (!message) return 'other';

    const msg = message.toLowerCase();

    if (msg.startsWith('feat')) return 'feat';
    if (msg.startsWith('fix')) return 'fix';
    if (msg.startsWith('docs')) return 'docs';
    if (msg.startsWith('style')) return 'style';
    if (msg.startsWith('refactor')) return 'refactor';
    if (msg.startsWith('perf')) return 'perf';
    if (msg.startsWith('test')) return 'test';
    if (msg.startsWith('chore')) return 'chore';
    if (msg.startsWith('ci')) return 'ci';
    if (msg.startsWith('build')) return 'build';

    return 'other';
  }

  generateBasicChangelog(commits, version = null, includeAttribution = true) {
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
      security: '🔐 Security',
      other: '📝 Other Changes',
    };

    const grouped = {};
    commits.forEach(commit => {
      const type = commit.type || 'other';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(commit);
    });

    const date = new Date().toISOString().split('T')[0];
    const versionStr = version || 'Unreleased';

    let changelog = `# Changelog\n\n## [${versionStr}] - ${date}\n\n`;

    // Add summary
    const totalCommits = commits.length;
    const features = grouped.feat?.length || 0;
    const fixes = grouped.fix?.length || 0;
    const breaking = commits.filter(c => c.breaking).length;

    changelog += `### Summary\n`;
    changelog += `- **${totalCommits}** commits analyzed\n`;
    if (features > 0) changelog += `- **${features}** new features\n`;
    if (fixes > 0) changelog += `- **${fixes}** bug fixes\n`;
    if (breaking > 0) changelog += `- **${breaking}** breaking changes ⚠️\n`;
    changelog += '\n';

    // Add sections by type
    Object.entries(grouped).forEach(([type, typeCommits]) => {
      if (typeCommits.length > 0) {
        changelog += `### ${COMMIT_TYPES[type] || type}\n\n`;
        typeCommits.forEach(commit => {
          const scope = commit.scope ? `**${commit.scope}**: ` : '';
          const breaking = commit.breaking ? ' ⚠️' : '';
          changelog += `- ${scope}${commit.subject || commit.message}${breaking} (${commit.shortHash})\n`;
        });
        changelog += '\n';
      }
    });

    changelog += `---\n\n`;
    changelog += `*This changelog was generated from ${totalCommits} commits*\n`;

    // Add attribution footer unless disabled
    if (includeAttribution) {
      changelog += `\n*Generated using [ai-github-changelog-generator-cli-mcp](https://github.com/idominikosgr/AI-github-changelog-generator-cli-mcp) - AI-powered changelog generation for Git repositories*\n`;
    }

    return changelog;
  }

  async generateWorkingDirChangelog(aiProvider, changes, version, analysisMode, includeAttribution, modelOverride) {
    const changesSummary = this.summarizeChanges(changes);
    
    const prompt = `Generate a comprehensive AI changelog for the following working directory changes:

**Analysis Mode**: ${analysisMode}
**Total Files**: ${changesSummary.totalFiles}
**Categories**: ${Object.keys(changesSummary.categories).join(', ')}

**Files by category**:
${Object.entries(changesSummary.categories).map(([cat, files]) =>
  `**${cat}**: ${files.map(f => `${f.status} ${f.path}`).join(', ')}`
).join('\n')}

Please generate a ${analysisMode === 'detailed' ? 'detailed' : analysisMode === 'enterprise' ? 'enterprise-ready' : 'standard'} changelog that includes:

1. **Change Summary** - Overview of what was changed
2. **New Features** - Features added (🚀)
3. **Bug Fixes** - Issues fixed (🐛)
4. **Improvements** - Code quality, performance, etc. (⚡)
5. **Documentation** - Doc updates (📚)
6. **Configuration** - Config changes (⚙️)
7. **Dependencies** - Package changes (📦)

Format as a professional markdown changelog with:
- Clear section headers with emojis
- Bullet points for each change
- Business impact if ${analysisMode === 'detailed' || analysisMode === 'enterprise' ? 'detailed analysis mode' : 'applicable'}
- Technical implementation details if complex changes detected

Make it comprehensive but concise. Focus on user and developer impact.`;

    const options = {
      max_tokens: analysisMode === 'enterprise' ? 2000 : analysisMode === 'detailed' ? 1500 : 1000
    };

    if (modelOverride) {
      options.model = modelOverride;
    }

    const response = await aiProvider.generateCompletion([{
      role: 'user',
      content: prompt
    }], options);

    let changelog = response.content;
    
    // Add metadata
    const date = new Date().toISOString().split('T')[0];
    const versionStr = version || 'Unreleased';
    
    // Ensure proper changelog format
    if (!changelog.includes('# ')) {
      changelog = `# Changelog\n\n## [${versionStr}] - ${date}\n\n${changelog}`;
    }
    
    // Add generation metadata
    changelog += `\n\n---\n\n*Generated from ${changesSummary.totalFiles} working directory changes*\n`;
    
    // Add attribution if enabled
    if (includeAttribution) {
      changelog += `\n*Generated using [ai-github-changelog-generator-cli-mcp](https://github.com/idominikosgr/AI-github-changelog-generator-cli-mcp) - AI-powered changelog generation for Git repositories*\n`;
    }

    return changelog;
  }

  generateBasicChangelogFromChanges(changes, version = null, includeAttribution = true) {
    const CHANGE_TYPES = {
      source: '💻 Source Code',
      docs: '📚 Documentation', 
      test: '🧪 Tests',
      config: '⚙️ Configuration',
      build: '📦 Build',
      style: '💎 Styling',
      other: '📝 Other Changes',
    };

    const grouped = {};
    changes.forEach(change => {
      const type = change.category || 'other';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(change);
    });

    const date = new Date().toISOString().split('T')[0];
    const versionStr = version || 'Unreleased';

    let changelog = `# Working Directory Changelog\n\n## [${versionStr}] - ${date}\n\n`;

    // Add summary
    const totalFiles = changes.length;
    const staged = changes.filter(c => c.status !== 'M' || c.staged).length;
    const modified = changes.filter(c => c.status === 'M').length;

    changelog += `### Summary\n`;
    changelog += `- **${totalFiles}** files changed\n`;
    if (staged > 0) changelog += `- **${staged}** staged for commit\n`;
    if (modified > 0) changelog += `- **${modified}** modified files\n`;
    changelog += '\n';

    // Add sections by type
    Object.entries(grouped).forEach(([type, typeChanges]) => {
      if (typeChanges.length > 0) {
        changelog += `### ${CHANGE_TYPES[type] || type}\n\n`;
        typeChanges.forEach(change => {
          const statusEmoji = change.status === 'A' ? '🆕' : change.status === 'M' ? '✏️' : change.status === 'D' ? '🗑️' : '📝';
          changelog += `- ${statusEmoji} \`${change.path}\` - ${this.getChangeDescription(change)}\n`;
        });
        changelog += '\n';
      }
    });

    changelog += `---\n\n`;
    changelog += `*This changelog was generated from ${totalFiles} working directory changes*\n`;

    // Add attribution footer unless disabled
    if (includeAttribution) {
      changelog += `\n*Generated using [ai-github-changelog-generator-cli-mcp](https://github.com/idominikosgr/AI-github-changelog-generator-cli-mcp) - AI-powered changelog generation for Git repositories*\n`;
    }

    return changelog;
  }

  getChangeDescription(change) {
    switch (change.status) {
      case 'A': return 'New file';
      case 'M': return 'Modified';
      case 'D': return 'Deleted';
      case 'R': return 'Renamed';
      case 'C': return 'Copied';
      default: return 'Changed';
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AI Changelog Generator MCP Server running on stdio');
  }
}

// Start the server
if (require.main === module) {
  const server = new AIChangelogMCPServer();
  server.run().catch(console.error);
}

module.exports = AIChangelogMCPServer;