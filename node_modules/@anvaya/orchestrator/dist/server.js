/**
 * Anvaya Orchestrator — HTTP API
 *
 * This is the single entry point for the frontend dashboard.
 * It boots up the MCP connection pool, initializes the Agent Loop,
 * and exposes REST endpoints for:
 *   - POST /api/execute    — Run a natural-language business request
 *   - POST /api/confirm    — Approve a pending confirmation gate
 *   - GET  /api/tools      — List all discovered MCP tools
 *   - GET  /api/health     — Health check
 */
import express from 'express';
import cors from 'cors';
import { McpPool, DEFAULT_MCP_SERVERS } from './mcp-pool.js';
import { AgentLoop } from './agent-loop.js';
const app = express();
app.use(cors());
app.use(express.json());
// ── State ────────────────────────────────────────
const pool = new McpPool();
let agentLoop = null;
// Store workflow history for the dashboard
const workflowHistory = [];
// Store pending confirmations by workflowId
const pendingConfirmationsByWorkflow = new Map();
// ── Boot Sequence ────────────────────────────────
async function boot() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('╔══════════════════════════════════════════════════════╗');
        console.error('║  GEMINI_API_KEY environment variable not set!       ║');
        console.error('║  Set it before starting the orchestrator:           ║');
        console.error('║  $env:GEMINI_API_KEY = "AIza..."                    ║');
        console.error('╚══════════════════════════════════════════════════════╝');
        console.warn('[Orchestrator] Starting in DEMO MODE (no LLM calls).');
    }
    // Connect to all MCP servers
    await pool.connectAll();
    if (apiKey) {
        agentLoop = new AgentLoop(pool, apiKey);
        console.log('[Orchestrator] ✓ Agent Loop initialized with Gemini.');
    }
}
// ── API Routes ───────────────────────────────────
/**
 * POST /api/execute
 * Body: { "message": "Sell 500 coconut oil soaps to Greenleaf Retail in Bangalore" }
 *
 * Runs the full LLM tool-calling loop and returns the execution trace.
 */
app.post('/api/execute', async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Missing "message" field in request body.' });
    }
    if (!agentLoop) {
        // Demo mode — return a structured mock response showing what WOULD happen
        const demoResponse = {
            workflowId: `wf-demo-${Date.now()}`,
            response: `[DEMO MODE] No GEMINI_API_KEY set. In production, the Business Agent would autonomously plan and execute this request: "${message}"\n\nDiscovered ${pool.getAllTools().length} tools across ${DEFAULT_MCP_SERVERS.length} MCP servers.`,
            steps: [
                {
                    type: 'thinking',
                    text: `Planning execution for: "${message}"`,
                    timestamp: new Date().toISOString(),
                },
            ],
            pendingConfirmations: [],
            status: 'completed',
        };
        workflowHistory.push(demoResponse);
        return res.json(demoResponse);
    }
    try {
        const result = await agentLoop.execute(message);
        workflowHistory.push(result);
        if (result.pendingConfirmations.length > 0) {
            pendingConfirmationsByWorkflow.set(result.workflowId, result.pendingConfirmations);
        }
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
/**
 * POST /api/confirm
 * Body: { "workflowId": "wf-...", "action": "reserve_stock", "approved": true }
 *
 * Approve or reject a pending confirmation gate.
 */
app.post('/api/confirm', async (req, res) => {
    const { workflowId, action, approved } = req.body;
    const confirmations = pendingConfirmationsByWorkflow.get(workflowId);
    if (!confirmations) {
        return res.status(404).json({ error: `No pending confirmations for workflow: ${workflowId}` });
    }
    const gate = confirmations.find(c => c.action === action);
    if (!gate) {
        return res.status(404).json({ error: `No pending confirmation for action: ${action}` });
    }
    if (approved) {
        // In a full system, this would execute the confirmed action via the MCP server
        // For now, we acknowledge the confirmation
        return res.json({
            status: 'confirmed',
            message: `Action "${gate.summary}" has been approved and would be executed.`,
            gate,
        });
    }
    else {
        return res.json({
            status: 'rejected',
            message: `Action "${gate.summary}" was rejected by the user.`,
        });
    }
});
/**
 * GET /api/tools
 * Returns all discovered tools across all MCP servers.
 */
app.get('/api/tools', (_req, res) => {
    const tools = pool.getAllTools().map(t => ({
        name: t.qualifiedName,
        server: t.serverName,
        description: t.description,
        inputSchema: t.inputSchema,
    }));
    const byServer = {};
    for (const tool of tools) {
        if (!byServer[tool.server])
            byServer[tool.server] = [];
        byServer[tool.server].push(tool);
    }
    return res.json({
        totalTools: tools.length,
        servers: Object.keys(byServer).length,
        byServer,
    });
});
/**
 * GET /api/workflows
 * Returns recent workflow execution history for the dashboard.
 */
app.get('/api/workflows', (_req, res) => {
    return res.json({
        count: workflowHistory.length,
        workflows: workflowHistory.slice(-20), // Last 20
    });
});
/**
 * GET /api/health
 */
app.get('/api/health', (_req, res) => {
    const connectedServers = DEFAULT_MCP_SERVERS
        .filter(s => pool.isConnected(s.name))
        .map(s => s.name);
    return res.json({
        status: 'ok',
        agentReady: !!agentLoop,
        connectedServers,
        totalTools: pool.getAllTools().length,
        timestamp: new Date().toISOString(),
    });
});
// ── Start ────────────────────────────────────────
const PORT = 3001;
boot().then(() => {
    app.listen(PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════════════════╗');
        console.log('║           🏢 ANVAYA ORCHESTRATOR v1.0               ║');
        console.log('║           AI Business Operating System               ║');
        console.log(`║           Listening on port ${PORT}                     ║`);
        console.log('╚══════════════════════════════════════════════════════╝');
        console.log('');
    });
}).catch(err => {
    console.error('[Orchestrator] Fatal boot error:', err);
    process.exit(1);
});
