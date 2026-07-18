import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { registerBusinessAgentTools } from "./tools/businessAgent.js";
import { registerBusinessDocumentTools } from "./tools/businessDocuments.js";
import { registerBuyerDiscoveryTools } from "./tools/buyerDiscovery.js";
import { registerCommunicationTools } from "./tools/communicationAgent.js";
import { registerInventoryManagementTools } from "./tools/inventoryManagement.js";
import { registerInventoryTools } from "./tools/inventoryMatching.js";
import { registerLogisticsTools } from "./tools/logisticsOptimization.js";
import { registerMarketIntelligenceTools } from "./tools/marketIntelligence.js";
import { registerNegotiationTools } from "./tools/negotiationAssistant.js";
// ── Server factory ──────────────────────────────────────────────────────────
// Each transport (stdio, or one per HTTP session) gets its OWN McpServer
// instance. Do not share a single McpServer across multiple transports/
// sessions — the SDK does not support that and you'll get cross-talk.
function buildServer() {
    const server = new McpServer({
        name: "anvaya-mcp",
        version: "1.0.0",
    });
    registerBusinessAgentTools(server);
    registerBusinessDocumentTools(server);
    registerBuyerDiscoveryTools(server);
    registerCommunicationTools(server);
    registerInventoryManagementTools(server);
    registerInventoryTools(server);
    registerLogisticsTools(server);
    registerMarketIntelligenceTools(server);
    registerNegotiationTools(server);
    return server;
}
// ── stdio transport (Claude Desktop / Claude Code) ──────────────────────────
async function startStdio() {
    const server = buildServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Anvaya MCP server running on stdio");
}
// ── Streamable HTTP transport (NitroChat / any HTTP-based MCP client) ───────
//
// One McpServer + one StreamableHTTPServerTransport per session, keyed by the
// Mcp-Session-Id header. This is the standard pattern from the MCP SDK docs
// for stateful HTTP servers that need to support multiple concurrent clients.
async function startHttp() {
    const port = Number(process.env.PORT ?? process.env.MCP_HTTP_PORT ?? 3000);
    const sessions = new Map();
    const httpServer = http.createServer(async (req, res) => {
        // CORS — required for browser-based MCP clients (like NitroChat's web UI)
        res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN ?? "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, mcp-protocol-version");
        res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
        if (req.method === "OPTIONS") {
            res.writeHead(204).end();
            return;
        }
        if (req.url !== "/mcp") {
            res.writeHead(404).end("Not found");
            return;
        }
        try {
            const sessionId = req.headers["mcp-session-id"];
            if (sessionId && sessions.has(sessionId)) {
                // Existing session — reuse its transport
                const { transport } = sessions.get(sessionId);
                await transport.handleRequest(req, res);
                return;
            }
            if (!sessionId && req.method === "POST") {
                // New session — create a fresh server + transport pair
                const server = buildServer();
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (newSessionId) => {
                        sessions.set(newSessionId, { server, transport });
                    },
                });
                transport.onclose = () => {
                    if (transport.sessionId)
                        sessions.delete(transport.sessionId);
                };
                await server.connect(transport);
                await transport.handleRequest(req, res);
                return;
            }
            res.writeHead(400).end(JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32000, message: "Bad Request: missing or unknown Mcp-Session-Id" },
                id: null,
            }));
        }
        catch (err) {
            console.error("MCP HTTP request error:", err);
            if (!res.headersSent) {
                res.writeHead(500).end(JSON.stringify({
                    jsonrpc: "2.0",
                    error: { code: -32603, message: "Internal server error" },
                    id: null,
                }));
            }
        }
    });
    httpServer.listen(port, () => {
        console.error(`Anvaya MCP server running on HTTP — http://localhost:${port}/mcp`);
    });
}
// ── Entry point ──────────────────────────────────────────────────────────────
// MCP_TRANSPORT=http  -> Streamable HTTP (for NitroChat, browser clients, remote hosting)
// (default / stdio)   -> stdio (for Claude Desktop, Claude Code)
const transportMode = (process.env.MCP_TRANSPORT ?? "stdio").toLowerCase();
if (transportMode === "http") {
    startHttp().catch((err) => {
        console.error("Fatal error starting HTTP transport:", err);
        process.exit(1);
    });
}
else {
    startStdio().catch((err) => {
        console.error("Fatal error starting stdio transport:", err);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map