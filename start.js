const { spawn } = require('child_process');

const mcpServers = [
  'packages/mcp-inventory/dist/server.js',
  'packages/mcp-documents/dist/server.js',
  'packages/mcp-logistics/dist/server.js',
  'packages/mcp-market/dist/server.js',
  'packages/mcp-discovery/dist/server.js',
  'packages/mcp-negotiation/dist/server.js',
];

const coreServers = [
  'packages/orchestrator/dist/server.js',
  'packages/dashboard/dist/server.js'
];

console.log('Starting MCP servers...');
mcpServers.forEach(server => {
  spawn('node', [server], { stdio: 'inherit' });
});

// Give MCP servers a few seconds to bind to their ports before starting the orchestrator
setTimeout(() => {
  console.log('Starting Orchestrator and Dashboard...');
  coreServers.forEach(server => {
    spawn('node', [server], { stdio: 'inherit' });
  });
}, 5000);
