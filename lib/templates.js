#!/usr/bin/env node

/**
 * Changelog Templates for different output formats
 * Supports multiple changelog standards and custom formats
 */

class ChangelogTemplates {
  constructor() {
    this.templates = {
      standard: this.standardTemplate,
      'keep-a-changelog': this.keepAChangelogTemplate,
      simple: this.simpleTemplate,
      semantic: this.semanticTemplate,
      github: this.githubTemplate
    };
  }

  render(template, data) {
    if (typeof template === 'string') {
      template = this.templates[template] || this.templates.standard;
    }
    let content = template(data);
    
    // Add attribution footer unless disabled
    if (data.includeAttribution !== false) {
      content = this.addAttribution(content);
    }
    
    return content;
  }

  addAttribution(content) {
    const attribution = '\n---\n\n*Generated using [@idominikosgr/ai-changelog-generator](https://github.com/idominikosgr/AI-Git-Changelog-Generator) - AI-powered changelog generation for Git repositories*\n';
    return content + attribution;
  }

  standardTemplate(data) {
    const {
      title = '# AI-Generated Changelog',
      version,
      date = new Date().toISOString().split('T')[0],
      changes = {},
      metadata = {},
      aiProvider,
      summary
    } = data;

    let content = `${title}\n\n`;

    if (version) {
      content += `## Version ${version} - ${date}\n\n`;
    } else {
      content += `## Changes - ${date}\n\n`;
    }

    // Add AI provider info
    if (aiProvider) {
      content += `> 🤖 Generated using ${aiProvider}\n\n`;
    }

    // Add summary if available
    if (summary) {
      content += `### Summary\n${summary}\n\n`;
    }

    // Add changes by category
    const categoryOrder = [
      'feat', 'fix', 'docs', 'style', 'refactor',
      'perf', 'test', 'chore', 'ci', 'build'
    ];

    for (const category of categoryOrder) {
      if (changes[category] && changes[category].length > 0) {
        const categoryName = this.getCategoryName(category);
        content += `### ${categoryName}\n\n`;

        changes[category].forEach(change => {
          content += `- ${change.description}`;
          if (change.hash && metadata.includeCommitHash) {
            content += ` ([${change.hash.substring(0, 7)}](${change.commitUrl || '#'}))`;
          }
          if (change.author && metadata.includeAuthor) {
            content += ` - ${change.author}`;
          }
          content += '\n';

          if (change.details) {
            content += `  ${change.details}\n`;
          }
        });
        content += '\n';
      }
    }

    // Add metadata section
    if (metadata.totalCommits) {
      content += `---\n\n`;
      content += `*This changelog was generated from ${metadata.totalCommits} commits`;
      if (metadata.dateRange) {
        content += ` between ${metadata.dateRange}`;
      }
      content += '*\n';
    }

    return content;
  }

  keepAChangelogTemplate(data) {
    const {
      version = 'Unreleased',
      date = new Date().toISOString().split('T')[0],
      changes = {},
      metadata = {}
    } = data;

    let content = `# Changelog\n\n`;
    content += `All notable changes to this project will be documented in this file.\n\n`;
    content += `The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\n`;
    content += `and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n`;

    content += `## [${version}] - ${date}\n\n`;

    // Map our categories to Keep a Changelog format
    const keepAChangelogCategories = {
      'Added': ['feat'],
      'Changed': ['refactor', 'style'],
      'Deprecated': [],
      'Removed': [],
      'Fixed': ['fix'],
      'Security': []
    };

    for (const [sectionName, categories] of Object.entries(keepAChangelogCategories)) {
      const sectionChanges = categories.flatMap(cat => changes[cat] || []);

      if (sectionChanges.length > 0) {
        content += `### ${sectionName}\n\n`;
        sectionChanges.forEach(change => {
          content += `- ${change.description}\n`;
        });
        content += '\n';
      }
    }

    return content;
  }

  simpleTemplate(data) {
    const { changes = {}, date = new Date().toISOString().split('T')[0] } = data;

    let content = `# Changes - ${date}\n\n`;

    const allChanges = Object.values(changes).flat();
    allChanges.forEach(change => {
      content += `- ${change.description}\n`;
    });

    return content;
  }

  semanticTemplate(data) {
    const {
      version,
      date = new Date().toISOString().split('T')[0],
      changes = {},
      breaking = []
    } = data;

    let content = `# Release ${version || 'Next'} (${date})\n\n`;

    // Breaking changes first
    if (breaking.length > 0) {
      content += `## 💥 BREAKING CHANGES\n\n`;
      breaking.forEach(change => {
        content += `- ${change.description}\n`;
        if (change.migration) {
          content += `  **Migration:** ${change.migration}\n`;
        }
      });
      content += '\n';
    }

    // Features
    if (changes.feat && changes.feat.length > 0) {
      content += `## ✨ Features\n\n`;
      changes.feat.forEach(change => {
        content += `- ${change.description}\n`;
      });
      content += '\n';
    }

    // Bug fixes
    if (changes.fix && changes.fix.length > 0) {
      content += `## 🐛 Bug Fixes\n\n`;
      changes.fix.forEach(change => {
        content += `- ${change.description}\n`;
      });
      content += '\n';
    }

    return content;
  }

  githubTemplate(data) {
    const {
      version,
      date = new Date().toISOString().split('T')[0],
      changes = {},
      repository
    } = data;

    let content = `## ${version ? `v${version}` : 'Latest Changes'} - ${date}\n\n`;

    // Add GitHub-specific features
    const categoryEmojis = {
      feat: '🚀',
      fix: '🐛',
      docs: '📚',
      style: '💎',
      refactor: '♻️',
      perf: '⚡',
      test: '🧪',
      chore: '🔧'
    };

    Object.entries(changes).forEach(([category, categoryChanges]) => {
      if (categoryChanges.length > 0) {
        const emoji = categoryEmojis[category] || '📝';
        content += `### ${emoji} ${this.getCategoryName(category)}\n\n`;

        categoryChanges.forEach(change => {
          content += `- ${change.description}`;
          if (change.hash && repository) {
            content += ` ([${change.hash.substring(0, 7)}](${repository}/commit/${change.hash}))`;
          }
          if (change.pr) {
            content += ` #${change.pr}`;
          }
          content += '\n';
        });
        content += '\n';
      }
    });

    return content;
  }

  getCategoryName(category) {
    const categoryNames = {
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
      config: '⚙️ Configuration'
    };

    return categoryNames[category] || `📝 ${category.charAt(0).toUpperCase() + category.slice(1)}`;
  }

  getAvailableTemplates() {
    return Object.keys(this.templates);
  }

  addCustomTemplate(name, template) {
    this.templates[name] = template;
  }
}

module.exports = ChangelogTemplates;

// CLI usage for testing templates
if (require.main === module) {
  const templates = new ChangelogTemplates();

  // Sample data for testing
  const sampleData = {
    title: '# Sample Changelog',
    version: '1.2.0',
    date: '2025-06-01',
    changes: {
      feat: [
        { description: 'Add new AI-powered analysis mode', hash: 'abc1234', author: 'John Doe' },
        { description: 'Support for Azure OpenAI integration', hash: 'def5678' }
      ],
      fix: [
        { description: 'Fix git parsing edge cases', hash: 'ghi9012' },
        { description: 'Handle empty commits gracefully', hash: 'jkl3456' }
      ],
      docs: [
        { description: 'Update README with new examples', hash: 'mno7890' }
      ]
    },
    metadata: {
      totalCommits: 15,
      includeCommitHash: true,
      includeAuthor: true
    },
    aiProvider: 'Azure OpenAI (gpt-4.1)' // Fixed: was gpt-4o
  };

  const templateName = process.argv[2] || 'standard';

  if (templates.getAvailableTemplates().includes(templateName)) {
    console.log(`\n=== ${templateName.toUpperCase()} TEMPLATE ===\n`);
    console.log(templates.render(templateName, sampleData));
  } else {
    console.log('Available templates:', templates.getAvailableTemplates().join(', '));
    console.log('Usage: node templates.js [template-name]');
  }
}
