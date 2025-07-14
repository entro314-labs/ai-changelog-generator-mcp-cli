#!/usr/bin/env node

/**
 * AI Changelog Generator CLI
 * Main command-line interface
 */

const { runCLI } = require('../lib/ai-changelog-generator');

console.log('Options:');
console.log('  --analyze, -a      Analyze current working directory changes');
console.log('  --interactive, -i  Interactive mode for commit selection');
console.log('  --detailed         Use detailed analysis mode for comprehensive documentation');
console.log('  --enterprise       Use enterprise mode for stakeholder communication');
console.log('  --validate         Validate configuration and show capabilities');
console.log('  --metrics          Show performance metrics');
console.log('  --model, -m        Override model selection (e.g., gpt-4.1, o3, o4, gpt-4.1-nano)');
console.log('  --version, -v      Specify version (default: auto-generated)');
console.log('  --since, -s        Generate since specific commit/tag');
console.log('  --help, -h         Show this help');
console.log('  --branches         Analyze all branches and unmerged commits');
console.log('  --comprehensive    Comprehensive analysis including dangling commits');
console.log('  --untracked        Include untracked files analysis');
console.log('  --no-attribution   Disable attribution footer');

// Run the CLI
runCLI().catch(console.error);
