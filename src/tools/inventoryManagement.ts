import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  productName: string;
  productType: string;
  category: string;
  sellerName: string;
  sellerLocation: string;
  quantityAvailable: number;
  unit: string;
  unitCost: number;
  reorderLevel: number;
  lastUpdated: string;
}

// ── Inventory Persistence ─────────────────────────────────────────────────────

function loadInventory(): InventoryItem[] {
  return JSON.parse(readFileSync(join(DATA_DIR, "inventory.json"), "utf-8"));
}

function saveInventory(items: InventoryItem[]): void {
  writeFileSync(join(DATA_DIR, "inventory.json"), JSON.stringify(items, null, 2), "utf-8");
}

// ── Core Logic (exported for orchestrator) ────────────────────────────────────

export function checkStockLevelLogic(productName?: string): {
  items: InventoryItem[];
  lowStockAlerts: Array<{ id: string; productName: string; quantityAvailable: number; reorderLevel: number; deficit: number }>;
} {
  const all = loadInventory();
  const filtered = productName
    ? all.filter(i =>
        i.productName.toLowerCase().includes(productName.toLowerCase()) ||
        productName.toLowerCase().includes(i.productName.toLowerCase())
      )
    : all;

  const lowStockAlerts = filtered
    .filter(i => i.quantityAvailable <= i.reorderLevel)
    .map(i => ({
      id: i.id,
      productName: i.productName,
      quantityAvailable: i.quantityAvailable,
      reorderLevel: i.reorderLevel,
      deficit: i.reorderLevel - i.quantityAvailable,
    }));

  return { items: filtered, lowStockAlerts };
}

export function updateInventoryLogic(
  productName: string,
  quantitySold: number,
  sellerLocation?: string
): {
  updated: boolean;
  item: InventoryItem | null;
  newQuantity: number;
  lowStockAlert: boolean;
  message: string;
} {
  const items = loadInventory();
  const idx = items.findIndex(i =>
    i.productName.toLowerCase().includes(productName.toLowerCase()) ||
    productName.toLowerCase().includes(i.productName.toLowerCase())
  );

  if (idx === -1) {
    return {
      updated: false,
      item: null,
      newQuantity: 0,
      lowStockAlert: false,
      message: `Product "${productName}" not found in inventory.`,
    };
  }

  const item = items[idx];
  if (item.quantityAvailable < quantitySold) {
    return {
      updated: false,
      item,
      newQuantity: item.quantityAvailable,
      lowStockAlert: item.quantityAvailable <= item.reorderLevel,
      message: `Insufficient stock. Available: ${item.quantityAvailable} ${item.unit}, requested: ${quantitySold} ${item.unit}.`,
    };
  }

  item.quantityAvailable -= quantitySold;
  item.lastUpdated = new Date().toISOString();
  if (sellerLocation) item.sellerLocation = sellerLocation;
  items[idx] = item;
  saveInventory(items);

  const lowStockAlert = item.quantityAvailable <= item.reorderLevel;

  return {
    updated: true,
    item,
    newQuantity: item.quantityAvailable,
    lowStockAlert,
    message: lowStockAlert
      ? `✅ Inventory updated. ⚠️ LOW STOCK ALERT: ${item.productName} is at ${item.quantityAvailable} ${item.unit} (reorder level: ${item.reorderLevel}).`
      : `✅ Inventory updated. ${item.productName}: ${item.quantityAvailable} ${item.unit} remaining.`,
  };
}

export function addInventoryItemLogic(
  productName: string,
  productType: string,
  category: string,
  sellerName: string,
  sellerLocation: string,
  quantity: number,
  unit: string,
  unitCost: number,
  reorderLevel: number
): { item: InventoryItem; message: string } {
  const items = loadInventory();
  const newId = `INV-${String(items.length + 1).padStart(3, "0")}`;
  const item: InventoryItem = {
    id: newId,
    productName,
    productType,
    category,
    sellerName,
    sellerLocation,
    quantityAvailable: quantity,
    unit,
    unitCost,
    reorderLevel,
    lastUpdated: new Date().toISOString(),
  };
  items.push(item);
  saveInventory(items);
  return { item, message: `✅ New inventory item "${productName}" added with ID ${newId}.` };
}

// ── MCP Tool Registrations ────────────────────────────────────────────────────

export function registerInventoryManagementTools(server: McpServer): void {
  server.tool(
    "checkStockLevel",
    "Check current inventory levels. Optionally filter by product name. Returns items and any low-stock alerts where quantity is at or below the reorder threshold.",
    {
      productName: z.string().optional().describe("Filter by product name (partial match)"),
    },
    async ({ productName }) => {
      const result = checkStockLevelLogic(productName);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "updateInventoryTracker",
    "Deduct sold quantity from inventory after a transaction. Automatically triggers low-stock alerts if quantity drops below the reorder level. Also updates the seller location.",
    {
      productName: z.string().describe("Product name to update"),
      quantitySold: z.number().describe("Quantity sold/shipped"),
      sellerLocation: z.string().optional().describe("Update the seller's current location if changed"),
    },
    async ({ productName, quantitySold, sellerLocation }) => {
      const result = updateInventoryLogic(productName, quantitySold, sellerLocation);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "addInventoryItem",
    "Add a new product to the inventory tracker with initial stock, reorder level, and seller details.",
    {
      productName: z.string().describe("Product name"),
      productType: z.enum(["standard", "perishable", "fragile", "hazardous"]).describe("Product type"),
      category: z.string().describe("Category (fmcg, agri, textiles, etc.)"),
      sellerName: z.string().describe("Seller/business name"),
      sellerLocation: z.string().describe("Seller's location/city"),
      quantity: z.number().describe("Initial stock quantity"),
      unit: z.string().describe("Unit of measurement (kg, pieces, rolls, etc.)"),
      unitCost: z.number().describe("Cost per unit in INR"),
      reorderLevel: z.number().describe("Minimum stock before triggering reorder alert"),
    },
    async ({ productName, productType, category, sellerName, sellerLocation, quantity, unit, unitCost, reorderLevel }) => {
      const result = addInventoryItemLogic(productName, productType, category, sellerName, sellerLocation, quantity, unit, unitCost, reorderLevel);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );
}
