/**
 * Agent Loop — The Heart of Anvaya
 *
 * This is the Business Agent. It is NOT a custom module with hardcoded rules.
 * It is the LLM itself (Gemini), operating in a standard tool-calling loop
 * against the live MCP tool schemas discovered at runtime.
 */
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
// ── System Prompt ────────────────────────────────
const SYSTEM_PROMPT = `You are the Anvaya Business Agent — an AI Business Operating System for Indian MSMEs, manufacturers, wholesalers, retailers, farmers, and entrepreneurs.

You are NOT a chatbot. You are an autonomous business workflow executor.

RULES:
1. Every user request must be converted into an EXECUTION PLAN. Think step-by-step about which tools you need, in what order.
2. Use the tools available to you to execute complete business workflows. Chain multiple tool calls as needed.
3. For any state-changing action (selling, buying, updating stock, booking transport, generating documents), the tool will return a "requires_confirmation" flag. You MUST present these to the user for approval before proceeding.
4. Always report the SOURCE of your data: "live" (from database), "estimated" (calculated/mock), or "seed_data".
5. When you present results, format them as structured business reports, not casual conversation.
6. Think about the COMPLETE workflow. For example, "sell 500 soaps to Greenleaf Retail" requires:
   a. Check stock availability
   b. Find buyer details
   c. Reserve stock (confirmation needed)
   d. Estimate transport cost
   e. Generate invoice (confirmation needed)
   f. Book transport (confirmation needed)
7. Use INR (₹) for all currency values.
8. If you don't have enough information to execute a step, state what's missing clearly.

BUSINESS CONTEXT:
- Default business: Kochi Naturals (manufacturer, Kochi, Kerala)
- Products: Coconut Oil Soap, Herbal Shampoo Bar
- This is a single-tenant prototype for demonstration.`;
// ── Helper ────────────────────────────────────────
function convertSchemaToGemini(schema) {
    if (!schema)
        return { type: SchemaType.OBJECT, properties: {} };
    const mapped = { type: SchemaType.OBJECT };
    if (schema.type === 'object')
        mapped.type = SchemaType.OBJECT;
    else if (schema.type === 'string')
        mapped.type = SchemaType.STRING;
    else if (schema.type === 'number')
        mapped.type = SchemaType.NUMBER;
    else if (schema.type === 'integer')
        mapped.type = SchemaType.INTEGER;
    else if (schema.type === 'boolean')
        mapped.type = SchemaType.BOOLEAN;
    else if (schema.type === 'array')
        mapped.type = SchemaType.ARRAY;
    if (schema.description)
        mapped.description = schema.description;
    if (schema.properties) {
        mapped.properties = {};
        for (const [key, val] of Object.entries(schema.properties)) {
            mapped.properties[key] = convertSchemaToGemini(val);
        }
    }
    if (schema.items) {
        mapped.items = convertSchemaToGemini(schema.items);
    }
    if (schema.required) {
        mapped.required = schema.required;
    }
    return mapped;
}
// ── Agent Loop Implementation ────────────────────
export class AgentLoop {
    genAI;
    pool;
    modelName;
    constructor(pool, apiKey, modelName = 'gemini-2.0-flash') {
        this.pool = pool;
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.modelName = modelName;
    }
    buildToolDefinitions() {
        return this.pool.getAllTools().map(tool => {
            // Create a valid function name (letters, numbers, underscores, max 64 chars)
            const safeName = tool.qualifiedName.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 64);
            return {
                name: safeName,
                description: `[${tool.serverName}] ${tool.description}`,
                parameters: convertSchemaToGemini(tool.inputSchema),
            };
        });
    }
    async execute(userMessage) {
        const workflowId = `wf-${Date.now()}`;
        const steps = [];
        const pendingConfirmations = [];
        const functionDeclarations = this.buildToolDefinitions();
        // Create a mapping from safe names back to actual tool names
        const toolNameMap = new Map();
        this.pool.getAllTools().forEach(t => {
            const safeName = t.qualifiedName.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 64);
            toolNameMap.set(safeName, t.qualifiedName);
        });
        const model = this.genAI.getGenerativeModel({
            model: this.modelName,
            systemInstruction: SYSTEM_PROMPT,
            tools: [{ functionDeclarations }],
        });
        const history = [];
        let currentMessage = [{ text: userMessage }];
        let iterationCount = 0;
        const MAX_ITERATIONS = 15;
        while (iterationCount < MAX_ITERATIONS) {
            iterationCount++;
            let response;
            try {
                const result = await model.generateContent({
                    contents: [...history, { role: 'user', parts: currentMessage }],
                });
                response = result.response;
                // Push the user message we just sent into history
                history.push({ role: 'user', parts: currentMessage });
                // Push the model's response into history
                if (response.candidates && response.candidates[0]?.content) {
                    history.push(response.candidates[0].content);
                }
            }
            catch (err) {
                steps.push({
                    type: 'response',
                    text: `LLM error: ${err.message}`,
                    timestamp: new Date().toISOString(),
                });
                return { workflowId, response: `Error communicating with AI: ${err.message}`, steps, pendingConfirmations, status: 'error' };
            }
            const text = response.text();
            if (text) {
                steps.push({
                    type: 'thinking',
                    text: text,
                    timestamp: new Date().toISOString(),
                });
            }
            const functionCalls = response.functionCalls();
            if (!functionCalls || functionCalls.length === 0) {
                // No tools called, the LLM is done.
                const status = pendingConfirmations.length > 0 ? 'awaiting_confirmation' : 'completed';
                return { workflowId, response: text || 'Workflow complete.', steps, pendingConfirmations, status };
            }
            // Execute tool calls
            const toolResults = [];
            for (const call of functionCalls) {
                const actualToolName = toolNameMap.get(call.name) || call.name;
                steps.push({
                    type: 'tool_call',
                    toolName: actualToolName,
                    toolArgs: call.args,
                    timestamp: new Date().toISOString(),
                });
                try {
                    const result = await this.pool.callTool(actualToolName, call.args);
                    const mcpResult = result;
                    const structured = mcpResult?.structuredContent ?? mcpResult;
                    if (structured?.requires_confirmation) {
                        const gate = {
                            action: structured.action,
                            summary: structured.summary,
                            payload: structured.payload,
                            toolQualifiedName: actualToolName,
                        };
                        pendingConfirmations.push(gate);
                        steps.push({
                            type: 'confirmation_gate',
                            toolName: actualToolName,
                            confirmationData: gate,
                            timestamp: new Date().toISOString(),
                        });
                    }
                    steps.push({
                        type: 'tool_result',
                        toolName: actualToolName,
                        result: mcpResult,
                        timestamp: new Date().toISOString(),
                    });
                    // Simplify result for Gemini (it expects an object for function responses)
                    const simplifyContent = Array.isArray(mcpResult?.content)
                        ? { text: mcpResult.content.map((c) => c.text ?? JSON.stringify(c)).join('\n') }
                        : mcpResult;
                    toolResults.push({
                        functionResponse: {
                            name: call.name,
                            response: { result: simplifyContent },
                        }
                    });
                }
                catch (err) {
                    steps.push({
                        type: 'tool_result',
                        toolName: actualToolName,
                        result: { error: err.message },
                        timestamp: new Date().toISOString(),
                    });
                    toolResults.push({
                        functionResponse: {
                            name: call.name,
                            response: { error: err.message },
                        }
                    });
                }
            }
            // Prepare next message containing tool results
            currentMessage = toolResults;
        }
        return {
            workflowId,
            response: 'Workflow reached maximum iterations. Partial results are available in the execution trace.',
            steps,
            pendingConfirmations,
            status: pendingConfirmations.length > 0 ? 'awaiting_confirmation' : 'completed',
        };
    }
}
