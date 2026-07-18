import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export interface ContactMessage {
    to: string;
    toPhone: string;
    subject: string;
    body: string;
    channel: "email" | "sms" | "whatsapp";
    sentAt: string;
    status: "simulated";
}
export declare function contactDealerLogic(params: {
    dealerName: string;
    dealerPhone: string;
    dealerType: "buyer" | "supplier" | "transporter";
    productName: string;
    quantity: number;
    unit: string;
    proposedPrice: number;
    yourBusinessName: string;
    yourLocation: string;
    channel: "email" | "sms" | "whatsapp";
    additionalNotes?: string;
}): ContactMessage;
export declare function registerCommunicationTools(server: McpServer): void;
//# sourceMappingURL=communicationAgent.d.ts.map