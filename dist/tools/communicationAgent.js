import { z } from "zod";
export function contactDealerLogic(params) {
    const { dealerName, dealerPhone, dealerType, productName, quantity, unit, proposedPrice, yourBusinessName, yourLocation, channel, additionalNotes } = params;
    let subject;
    let body;
    if (dealerType === "buyer") {
        subject = `Business Proposal: ${productName} Supply from ${yourBusinessName}`;
        body = `Namaste ${dealerName},

I am ${yourBusinessName} based in ${yourLocation}. I am reaching out to propose a business arrangement for the supply of ${productName}.

We can supply ${quantity} ${unit} at a proposed rate of ₹${proposedPrice} per ${unit}. We ensure quality packaging and timely delivery.

${additionalNotes ? `Note: ${additionalNotes}\n` : ""}
I would be happy to discuss further details, including bulk pricing and long-term supply arrangements.

Looking forward to your response.

Regards,
${yourBusinessName}
${yourLocation}`;
    }
    else if (dealerType === "supplier") {
        subject = `Procurement Inquiry: ${productName} — ${yourBusinessName}`;
        body = `Namaste ${dealerName},

I am ${yourBusinessName} from ${yourLocation}. We are looking to procure ${quantity} ${unit} of ${productName}.

Our proposed rate is ₹${proposedPrice} per ${unit}. We are open to discussion and are also interested in exploring long-term contracts (6 months / 1 year) for a stable supply chain.

${additionalNotes ? `Note: ${additionalNotes}\n` : ""}
Please share your best price and availability at the earliest.

Regards,
${yourBusinessName}
${yourLocation}`;
    }
    else {
        subject = `Transport Inquiry: ${productName} Shipment — ${yourBusinessName}`;
        body = `Namaste ${dealerName},

I am ${yourBusinessName} based in ${yourLocation}. I have a shipment of ${quantity} ${unit} of ${productName} that needs to be transported.

Our proposed transport rate is ₹${proposedPrice}. We are looking for reliable and timely delivery.

${additionalNotes ? `Note: ${additionalNotes}\n` : ""}
Please confirm availability and your best rate so we can finalize.

Regards,
${yourBusinessName}
${yourLocation}`;
    }
    return {
        to: dealerName,
        toPhone: dealerPhone,
        subject,
        body,
        channel,
        sentAt: new Date().toISOString(),
        status: "simulated",
    };
}
// ── MCP Tool Registrations ────────────────────────────────────────────────────
export function registerCommunicationTools(server) {
    server.tool("contactDealer", "Generate and simulate sending a business message (email/SMS/WhatsApp) to a buyer, supplier, or transporter. Produces a ready-to-send professional message with your proposal.", {
        dealerName: z.string().describe("Dealer's business name"),
        dealerPhone: z.string().describe("Dealer's phone number or email"),
        dealerType: z.enum(["buyer", "supplier", "transporter"]).describe("Type of dealer"),
        productName: z.string().describe("Product being discussed"),
        quantity: z.number().describe("Quantity involved"),
        unit: z.string().describe("Unit of measurement"),
        proposedPrice: z.number().describe("Your proposed price per unit in INR"),
        yourBusinessName: z.string().describe("Your business name"),
        yourLocation: z.string().describe("Your city/location"),
        channel: z.enum(["email", "sms", "whatsapp"]).optional().default("email").describe("Communication channel"),
        additionalNotes: z.string().optional().describe("Any additional context or notes"),
    }, async (params) => {
        const message = contactDealerLogic({
            dealerName: params.dealerName,
            dealerPhone: params.dealerPhone,
            dealerType: params.dealerType,
            productName: params.productName,
            quantity: params.quantity,
            unit: params.unit,
            proposedPrice: params.proposedPrice,
            yourBusinessName: params.yourBusinessName,
            yourLocation: params.yourLocation,
            channel: params.channel ?? "email",
            additionalNotes: params.additionalNotes,
        });
        return {
            content: [{
                    type: "text",
                    text: `📤 Message ${message.status.toUpperCase()} via ${message.channel.toUpperCase()}\n\nTo: ${message.to} (${message.toPhone})\nSubject: ${message.subject}\nSent at: ${message.sentAt}\n\n${message.body}\n\n${JSON.stringify(message, null, 2)}`,
                }],
        };
    });
}
//# sourceMappingURL=communicationAgent.js.map