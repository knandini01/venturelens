/**
 * MCP Connection Pool
 *
 * Manages persistent connections to all MCP servers in the Anvaya ecosystem.
 * On startup, connects to each server, runs the MCP initialize handshake,
 * and discovers all available tools. The unified tool registry is then
 * presented to the LLM as its available tool set.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
// ── Default MCP server registry ──────────────────
export const DEFAULT_MCP_SERVERS = [
    { name: 'inventory', url: 'http://localhost:3004' },
    { name: 'documents', url: 'http://localhost:3007' },
    { name: 'logistics', url: 'http://localhost:3008' },
    { name: 'market', url: 'http://localhost:3009' },
    { name: 'discovery', url: 'http://localhost:3010' },
    { name: 'negotiation', url: 'http://localhost:3011' },
];
export class McpPool {
    connections = new Map();
    toolRegistry = new Map();
    /**
     * Connect to all configured MCP servers and discover their tools.
     * Failures for individual servers are logged but don't block the pool.
     */
    async connectAll(servers = DEFAULT_MCP_SERVERS) {
        console.log(`[McpPool] Connecting to ${servers.length} MCP servers...`);
        const results = await Promise.allSettled(servers.map(s => this.connectOne(s)));
        let successCount = 0;
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') {
                successCount++;
            }
            else {
                console.warn(`[McpPool] ⚠ Failed to connect to ${servers[i].name}: ${r.reason}`);
            }
        });
        console.log(`[McpPool] ✓ Connected to ${successCount}/${servers.length} servers. ${this.toolRegistry.size} tools discovered.`);
    }
    async connectOne(config) {
        const transport = new SSEClientTransport(new URL(config.url + '/sse'));
        const client = new Client({ name: `anvaya-orchestrator`, version: '1.0.0' }, { capabilities: {} });
        await client.connect(transport);
        // Discover tools from this server
        const { tools } = await client.listTools();
        for (const tool of tools) {
            const qualifiedName = `${config.name}__${tool.name}`;
            this.toolRegistry.set(qualifiedName, {
                qualifiedName,
                originalName: tool.name,
                serverName: config.name,
                description: tool.description ?? '',
                inputSchema: (tool.inputSchema ?? {}),
            });
        }
        this.connections.set(config.name, { config, client, transport });
        console.log(`[McpPool]   ✓ ${config.name} — ${tools.length} tools`);
    }
    /**
     * Call a tool on the appropriate MCP server.
     * @param qualifiedName  e.g. "inventory__check_stock"
     * @param args           Tool arguments object
     */
    async callTool(qualifiedName, args) {
        const tool = this.toolRegistry.get(qualifiedName);
        if (!tool)
            throw new Error(`Unknown tool: ${qualifiedName}`);
        const conn = this.connections.get(tool.serverName);
        if (!conn)
            throw new Error(`No connection to server: ${tool.serverName}`);
        const result = await conn.client.callTool({
            name: tool.originalName,
            arguments: args,
        });
        return result;
    }
    /** Get all discovered tools for the LLM tool schema */
    getAllTools() {
        return Array.from(this.toolRegistry.values());
    }
    /** Check if a specific server is connected */
    isConnected(serverName) {
        return this.connections.has(serverName);
    }
    /** Gracefully close all connections */
    async disconnectAll() {
        for (const [name, conn] of this.connections) {
            try {
                await conn.client.close();
            }
            catch {
                // Ignore close errors
            }
        }
        this.connections.clear();
        this.toolRegistry.clear();
    }
}
