import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export interface Transaction {
    id: string;
    type: "sale" | "purchase";
    productName: string;
    productType: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalAmount: number;
    gstPercent: number;
    gstAmount: number;
    grandTotal: number;
    sellerName: string;
    sellerLocation: string;
    buyerName: string;
    buyerLocation: string;
    transportProvider: string;
    transportCost: number;
    invoiceNumber: string;
    date: string;
    status: "completed" | "pending" | "cancelled";
}
export declare function generateInvoiceLogic(params: {
    type: "sale" | "purchase";
    productName: string;
    productType: string;
    category: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    sellerName: string;
    sellerLocation: string;
    buyerName: string;
    buyerLocation: string;
    transportProvider: string;
    transportCost: number;
}): {
    invoice: Transaction;
    invoiceText: string;
};
export declare function logTransactionLogic(invoice: Transaction): {
    logged: boolean;
    message: string;
};
export declare function getTransactionHistoryLogic(filters?: {
    type?: "sale" | "purchase";
    productName?: string;
    sellerLocation?: string;
}): {
    transactions: Transaction[];
    summary: {
        totalSales: number;
        totalPurchases: number;
        netRevenue: number;
    };
};
export declare function registerBusinessDocumentTools(server: McpServer): void;
//# sourceMappingURL=businessDocuments.d.ts.map