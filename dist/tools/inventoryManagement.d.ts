import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
export declare function checkStockLevelLogic(productName?: string): {
    items: InventoryItem[];
    lowStockAlerts: Array<{
        id: string;
        productName: string;
        quantityAvailable: number;
        reorderLevel: number;
        deficit: number;
    }>;
};
export declare function updateInventoryLogic(productName: string, quantitySold: number, sellerLocation?: string): {
    updated: boolean;
    item: InventoryItem | null;
    newQuantity: number;
    lowStockAlert: boolean;
    message: string;
};
export declare function addInventoryItemLogic(productName: string, productType: string, category: string, sellerName: string, sellerLocation: string, quantity: number, unit: string, unitCost: number, reorderLevel: number): {
    item: InventoryItem;
    message: string;
};
export declare function registerInventoryManagementTools(server: McpServer): void;
//# sourceMappingURL=inventoryManagement.d.ts.map