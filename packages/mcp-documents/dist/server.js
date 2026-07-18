"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const zod_1 = require("zod");
const tenant_1 = require("@anvaya/shared/db/tenant");
const DEFAULT_BUSINESS_ID = 1;
const tenant = (0, tenant_1.createTenantDb)(DEFAULT_BUSINESS_ID);
const server = new mcp_js_1.McpServer({ name: 'anvaya-documents', version: '1.0.0' });
// ── Generate Invoice (Requires Confirmation) ──────
server.tool('generate_invoice', 'Generate an invoice for a completed sale transaction. Requires user confirmation.', {
    transactionId: zod_1.z.number().describe('Transaction ID'),
    buyerId: zod_1.z.number().describe('Buyer ID'),
    totalAmount: zod_1.z.number().describe('Total amount before GST'),
    gstRate: zod_1.z.number().describe('GST rate percentage (e.g., 18)'),
}, async (payload) => {
    return {
        content: [{ type: 'text', text: `Requires confirmation to generate invoice for transaction ${payload.transactionId}` }],
        structuredContent: {
            requires_confirmation: true,
            action: 'generate_invoice',
            summary: `Generate invoice for Transaction ${payload.transactionId} (Total: ₹${payload.totalAmount}, GST: ${payload.gstRate}%)`,
            payload,
        },
    };
});
// ── Generate Purchase Order (Requires Conf) ───────
server.tool('generate_purchase_order', 'Generate a purchase order for buying raw materials. Requires user confirmation.', {
    supplierId: zod_1.z.number().describe('Supplier ID'),
    productId: zod_1.z.number().describe('Product ID to purchase'),
    quantity: zod_1.z.number().describe('Quantity to purchase'),
    expectedPrice: zod_1.z.number().describe('Expected total price'),
}, async (payload) => {
    return {
        content: [{ type: 'text', text: `Requires confirmation to generate PO for supplier ${payload.supplierId}` }],
        structuredContent: {
            requires_confirmation: true,
            action: 'generate_purchase_order',
            summary: `Generate PO for Supplier ${payload.supplierId} (Product: ${payload.productId}, Qty: ${payload.quantity})`,
            payload,
        },
    };
});
// ── Generate Delivery Challan ────────────────────
server.tool('generate_delivery_challan', 'Generate a delivery challan for an existing transaction', { transactionId: zod_1.z.number().describe('Transaction ID') }, async ({ transactionId }) => {
    try {
        const doc = {
            challanNumber: `DC-${Date.now()}`,
            transactionId,
            date: new Date().toISOString(),
            status: 'Issued',
        };
        // In a real app, we'd save this to the DB documents table here
        return {
            content: [{ type: 'text', text: `Generated delivery challan ${doc.challanNumber}` }],
            structuredContent: { success: true, data: doc, source: 'estimated' },
        };
    }
    catch (err) {
        return { content: [{ type: 'text', text: `Error generating challan: ${err.message}` }], isError: true };
    }
});
// ── Generate GST Summary ─────────────────────────
server.tool('generate_gst_summary', 'Calculate GST components (CGST, SGST, IGST) based on location', {
    amount: zod_1.z.number().describe('Base amount'),
    rate: zod_1.z.number().describe('GST Rate %'),
    isInterstate: zod_1.z.boolean().describe('True if buyer/seller are in different states'),
}, async ({ amount, rate, isInterstate }) => {
    const totalGst = amount * (rate / 100);
    const summary = isInterstate
        ? { igst: totalGst, cgst: 0, sgst: 0, total: totalGst }
        : { igst: 0, cgst: totalGst / 2, sgst: totalGst / 2, total: totalGst };
    return {
        content: [{ type: 'text', text: `GST Summary: IGST: ₹${summary.igst}, CGST: ₹${summary.cgst}, SGST: ₹${summary.sgst}` }],
        structuredContent: { success: true, data: summary, source: 'estimated' },
    };
});
// ── Generate Transport Receipt ───────────────────
server.tool('generate_transport_receipt', 'Generate a transport booking receipt', { bookingId: zod_1.z.number().describe('Transport booking ID') }, async ({ bookingId }) => {
    return {
        content: [{ type: 'text', text: `Transport receipt generated for booking ${bookingId}` }],
        structuredContent: { success: true, data: { bookingId, receiptNo: `TR-${bookingId}` }, source: 'estimated' },
    };
});
// ── Transaction History ──────────────────────────
server.tool('get_transaction_history', 'Get a list of past transactions', {}, async () => {
    try {
        const transactions = await tenant.transactions.findAll();
        return {
            content: [{ type: 'text', text: `Found ${transactions.length} transactions.` }],
            structuredContent: { success: true, data: transactions, source: 'live' },
        };
    }
    catch (err) {
        return { content: [{ type: 'text', text: `Error fetching history: ${err.message}` }], isError: true };
    }
});
// ── HTTP Server Setup ────────────────────────────
const app = (0, express_1.default)();
let transport;
app.get('/sse', async (req, res) => {
    transport = new sse_js_1.SSEServerTransport("/messages", res);
    await server.connect(transport);
});
app.post('/messages', async (req, res) => {
    if (transport) {
        await transport.handlePostMessage(req, res);
    }
    else {
        res.status(400).json({ error: 'No active session' });
    }
});
const PORT = 3007;
app.listen(PORT, () => {
    console.log(`Documents MCP server listening on port ${PORT}`);
});
//# sourceMappingURL=server.js.map