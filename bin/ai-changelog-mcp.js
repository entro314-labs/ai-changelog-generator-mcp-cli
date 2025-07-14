#!/usr/bin/env node

/**
 * AI Changelog Generator MCP Server
 * Model Context Protocol server for AI changelog generation
 */

const path = require('path');
const AIChangelogMCPServer = require('../lib/mcp-server');

// Start the MCP server
if (require.main === module) {
  const server = new AIChangelogMCPServer();
  server.run().catch(console.error);
}
