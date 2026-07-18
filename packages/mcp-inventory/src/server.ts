import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { db } from '@anvaya/shared/db';
import { createTenantDb } from '@anvaya/shared/db/tenant';

// IMPORTANT: In a real system, the businessId would be injected via auth headers.
// For this single-tenant prototype, we hardcode to businessId = 1 (Kochi Naturals).
const DEFAULT_BUSINESS_ID = 1;
const tenant = createTenantDb(DEFAULT_BUSINESS_ID);

const server = new McpServer({ name: 'anvaya-inventory', version: '1.0.0' });

// ── Check Stock ─────────────────────────────────
server.tool(
  'check_stock',
  'Check current stock levels for a specific product or all products',
  {
    productId: z.number().optional().describe('Optional ID of a specific product'),
  },
  async ({ productId }) => {
    try {
      const inventory = productId ? [await tenant.inventory.findByProduct(productId)] : await tenant.inventory.findAll();
      return {
        content: [{ type: 'text', text: JSON.stringify(inventory, null, 2) }],
        structuredContent: { success: true, data: inventory, source: 'live' },
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error checking stock: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Reserve Stock (Requires Confirmation) ────────
server.tool(
  'reserve_stock',
  'Reserve units of a product for a pending transaction. Requires user confirmation.',
  {
    productId: z.number().describe('Product ID'),
    quantity: z.number().describe('Quantity to reserve'),
    transactionId: z.number().optional().describe('Optional associated transaction ID'),
  },
  async ({ productId, quantity, transactionId }) => {
    // Note: Instead of actually writing to DB here, we return a requires_confirmation payload.
    // The Business Agent orchestrator will handle the actual confirmation UI.
    return {
      content: [{ type: 'text', text: `Requires confirmation to reserve ${quantity} units of product ${productId}.` }],
      structuredContent: {
        requires_confirmation: true,
        action: 'reserve_stock',
        summary: `Reserve ${quantity} units of product ID ${productId}`,
        payload: { productId, quantity, transactionId }
      },
    };
  }
);

// ── Add Product (Requires Confirmation) ──────────
server.tool(
  'add_product',
  'Add a new product to the catalog with initial stock. Requires user confirmation.',
  {
    name: z.string().describe('Product name'),
    category: z.string().describe('Product category'),
    unit: z.string().describe('Unit of measurement (e.g., pieces, kg, liters)'),
    initialQuantity: z.number().describe('Initial stock quantity'),
    reorderLevel: z.number().optional().describe('Reorder alert threshold'),
  },
  async (payload) => {
    return {
      content: [{ type: 'text', text: `Requires confirmation to add product: ${payload.name}` }],
      structuredContent: {
        requires_confirmation: true,
        action: 'add_product',
        summary: `Add product '${payload.name}' (${payload.initialQuantity} ${payload.unit})`,
        payload,
      },
    };
  }
);

// ── Update Stock (Requires Confirmation) ─────────
server.tool(
  'update_stock',
  'Increase or decrease stock quantity (e.g. for a purchase or sale). Requires user confirmation.',
  {
    productId: z.number().describe('Product ID'),
    quantityChange: z.number().describe('Positive number to increase (purchase), negative to decrease (sale)'),
  },
  async (payload) => {
    return {
      content: [{ type: 'text', text: `Requires confirmation to update stock for product ${payload.productId} by ${payload.quantityChange}` }],
      structuredContent: {
        requires_confirmation: true,
        action: 'update_stock',
        summary: `Update product ${payload.productId} stock by ${payload.quantityChange}`,
        payload,
      },
    };
  }
);

// ── Low Stock Alerts ─────────────────────────────
server.tool(
  'get_low_stock_alerts',
  'Get a list of products whose stock is below the reorder level',
  {},
  async () => {
    try {
      const allInventory = await tenant.inventory.findAll();
      const lowStock = allInventory.filter(i => i.quantity <= (i.reorderLevel ?? 0));
      return {
        content: [{ type: 'text', text: `Found ${lowStock.length} products low on stock.` }],
        structuredContent: { success: true, data: lowStock, source: 'live' },
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error checking low stock: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Forecast Depletion ───────────────────────────
server.tool(
  'forecast_depletion',
  'Predict when stock will run out based on recent transaction velocity',
  { productId: z.number().describe('Product ID') },
  async ({ productId }) => {
    try {
      const inv = await tenant.inventory.findByProduct(productId);
      if (!inv) throw new Error('Product inventory not found');
      
      // Simple mock forecasting for now - in reality this would analyze the transaction history
      const currentStock = inv.quantity;
      const estimatedDailyVelocity = 50; // Mock: 50 units sold per day
      const daysRemaining = currentStock / estimatedDailyVelocity;
      
      return {
        content: [{ type: 'text', text: `Estimated to run out in ${daysRemaining.toFixed(1)} days (based on estimated daily velocity of ${estimatedDailyVelocity}).` }],
        structuredContent: { 
          success: true, 
          data: { productId, currentStock, daysRemaining, estimatedDailyVelocity }, 
          source: 'estimated' 
        },
      };
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error forecasting depletion: ${err.message}` }],
        isError: true,
      };
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

const PORT = 3004;
app.listen(PORT, () => {
  console.log(`Inventory MCP server listening on port ${PORT}`);
});
