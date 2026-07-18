import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { db } from '@anvaya/shared/db';
import { createTenantDb } from '@anvaya/shared/db/tenant';
import { eq } from 'drizzle-orm';
import * as schema from '@anvaya/shared/db/schema';

const DEFAULT_BUSINESS_ID = 1;
const tenant = createTenantDb(DEFAULT_BUSINESS_ID);

const server = new McpServer({ name: 'anvaya-documents', version: '1.0.0' });

// ── Generate Invoice (Requires Confirmation) ──────
server.tool(
  'generate_invoice',
  'Generate an invoice for a completed sale transaction. Requires user confirmation.',
  {
    transactionId: z.number().describe('Transaction ID'),
    buyerId: z.number().describe('Buyer ID'),
    totalAmount: z.number().describe('Total amount before GST'),
    gstRate: z.number().describe('GST rate percentage (e.g., 18)'),
  },
  async (payload) => {
    return {
      content: [{ type: 'text', text: `Requires confirmation to generate invoice for transaction ${payload.transactionId}` }],
      structuredContent: {
        requires_confirmation: true,
        action: 'generate_invoice',
        summary: `Generate invoice for Transaction ${payload.transactionId} (Total: ₹${payload.totalAmount}, GST: ${payload.gstRate}%)`,
        payload,
      },
    };
  }
);

// ── Generate Purchase Order (Requires Conf) ───────
server.tool(
  'generate_purchase_order',
  'Generate a purchase order for buying raw materials. Requires user confirmation.',
  {
    supplierId: z.number().describe('Supplier ID'),
    productId: z.number().describe('Product ID to purchase'),
    quantity: z.number().describe('Quantity to purchase'),
    expectedPrice: z.number().describe('Expected total price'),
  },
  async (payload) => {
    return {
      content: [{ type: 'text', text: `Requires confirmation to generate PO for supplier ${payload.supplierId}` }],
      structuredContent: {
        requires_confirmation: true,
        action: 'generate_purchase_order',
        summary: `Generate PO for Supplier ${payload.supplierId} (Product: ${payload.productId}, Qty: ${payload.quantity})`,
        payload,
      },
    };
  }
);

// ── Generate Delivery Challan ────────────────────
server.tool(
  'generate_delivery_challan',
  'Generate a delivery challan for an existing transaction',
  { transactionId: z.number().describe('Transaction ID') },
  async ({ transactionId }) => {
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
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error generating challan: ${err.message}` }], isError: true };
    }
  }
);

// ── Generate GST Summary ─────────────────────────
server.tool(
  'generate_gst_summary',
  'Calculate GST components (CGST, SGST, IGST) based on location',
  {
    amount: z.number().describe('Base amount'),
    rate: z.number().describe('GST Rate %'),
    isInterstate: z.boolean().describe('True if buyer/seller are in different states'),
  },
  async ({ amount, rate, isInterstate }) => {
    const totalGst = amount * (rate / 100);
    const summary = isInterstate
      ? { igst: totalGst, cgst: 0, sgst: 0, total: totalGst }
      : { igst: 0, cgst: totalGst / 2, sgst: totalGst / 2, total: totalGst };
    
    return {
      content: [{ type: 'text', text: `GST Summary: IGST: ₹${summary.igst}, CGST: ₹${summary.cgst}, SGST: ₹${summary.sgst}` }],
      structuredContent: { success: true, data: summary, source: 'estimated' },
    };
  }
);

// ── Generate Transport Receipt ───────────────────
server.tool(
  'generate_transport_receipt',
  'Generate a transport booking receipt',
  { bookingId: z.number().describe('Transport booking ID') },
  async ({ bookingId }) => {
    return {
      content: [{ type: 'text', text: `Transport receipt generated for booking ${bookingId}` }],
      structuredContent: { success: true, data: { bookingId, receiptNo: `TR-${bookingId}` }, source: 'estimated' },
    };
  }
);

// ── Transaction History ──────────────────────────
server.tool(
  'get_transaction_history',
  'Get a list of past transactions',
  {},
  async () => {
    try {
      const transactions = await tenant.transactions.findAll();
      return {
        content: [{ type: 'text', text: `Found ${transactions.length} transactions.` }],
        structuredContent: { success: true, data: transactions, source: 'live' },
      };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error fetching history: ${err.message}` }], isError: true };
    }
  }
);

// ── HTTP Server Setup ────────────────────────────
const app = express();


let transport: SSEServerTransport;

app.get('/sse', async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: 'No active session' });
  }
});

const PORT = 3007;
app.listen(PORT, () => {
  console.log(`Documents MCP server listening on port ${PORT}`);
});
