import { z } from "zod";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ratesConfig = JSON.parse(readFileSync(join(__dirname, "../../config/rates.json"), "utf-8"));
const { openingOfferMultiplier, maxAcceptableMultiplier, floorMultiplier, incrementStep } = ratesConfig.negotiation;
export function generateNegotiationLogic(currentCost, averageMarketRate, vehicleType, buyerDetails) {
    const suggestedOffer = Math.round(averageMarketRate * openingOfferMultiplier * 100) / 100;
    const maxAcceptable = Math.round(currentCost * maxAcceptableMultiplier * 100) / 100;
    const floor = Math.round(averageMarketRate * floorMultiplier * 100) / 100;
    const expectedSavings = {
        amount: Math.round((currentCost - suggestedOffer) * 100) / 100,
        percentage: Math.round(((currentCost - suggestedOffer) / currentCost) * 100 * 10) / 10,
    };
    let strategy;
    if (suggestedOffer < maxAcceptable) {
        strategy = `Start at ₹${suggestedOffer} (${(openingOfferMultiplier * 100 - 100).toFixed(0)}% below market rate). Walk away if counter-offer exceeds ₹${maxAcceptable}. Increment in steps of ${(incrementStep * 100).toFixed(0)}%.`;
    }
    else {
        strategy = `Current cost (₹${currentCost}) is already near market rate. Open at ₹${suggestedOffer} and aim to hold firm.`;
    }
    const messageDraft = generateMessageLogic(suggestedOffer, {
        currentCost,
        averageMarketRate,
        vehicleType,
        buyerDetails,
    });
    return {
        strategy,
        suggestedOffer,
        maxAcceptable,
        floor,
        incrementStep,
        messageDraft,
        expectedSavings,
    };
}
export function generateMessageLogic(openingOffer, context) {
    return `Subject: Transport Rate Negotiation — ${context.vehicleType}

Namaste,

I am reaching out regarding the ${context.vehicleType} transport rate for our upcoming shipment.

I have reviewed the current market rates for this route and found an average of ₹${context.averageMarketRate} per trip. Based on this, I would like to propose an opening rate of ₹${openingOffer}.

This is a mutually beneficial arrangement — I can commit to regular shipments and prompt payment within 48 hours of delivery.

${context.buyerDetails ? `Additional context: ${context.buyerDetails}` : ""}

I am open to discussing and finalising this quickly. Please let me know your best rate so we can proceed.

Looking forward to your response.

With regards,
[Your Name / Business Name]
[Contact Number]`;
}
export function callSummaryLogic(outcome) {
    return `NEGOTIATION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Route:         ${outcome.route}
Vehicle Type:  ${outcome.vehicleType}
Agreed Rate:   ₹${outcome.agreedRate}
Travel Date:   ${outcome.date}
Notes:         ${outcome.notes || "None"}
Status:        ✅ Agreement Reached
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
export function priceSuggestionLogic(currentCost, averageMarketRate) {
    const offer = Math.round(averageMarketRate * openingOfferMultiplier * 100) / 100;
    const maxAcc = Math.round(currentCost * maxAcceptableMultiplier * 100) / 100;
    return {
        offer,
        maxAcceptable: maxAcc,
        expectedSavings: {
            amount: Math.round((currentCost - offer) * 100) / 100,
            percentage: Math.round(((currentCost - offer) / currentCost) * 100 * 10) / 10,
        },
    };
}
export function shouldNegotiateLogic(currentCost, averageMarketRate, dealerRating) {
    const diff = currentCost - averageMarketRate;
    const diffPercent = (diff / averageMarketRate) * 100;
    if (diffPercent > 15) {
        return {
            shouldNegotiate: true,
            reason: `The quoted price (₹${currentCost}) is ${Math.round(diffPercent)}% above market rate (₹${averageMarketRate}). Strong negotiation recommended.`,
            potentialSavings: Math.round(diff * 0.6 * 100) / 100,
            confidence: "high",
        };
    }
    else if (diffPercent > 5) {
        return {
            shouldNegotiate: true,
            reason: `The quoted price is ${Math.round(diffPercent)}% above market rate. Moderate negotiation may yield savings.`,
            potentialSavings: Math.round(diff * 0.4 * 100) / 100,
            confidence: "medium",
        };
    }
    else if (diffPercent > -5) {
        return {
            shouldNegotiate: false,
            reason: `The quoted price is within 5% of market rate. The deal is already fair.${dealerRating >= 4.5 ? " The dealer has a high rating — consider accepting." : ""}`,
            potentialSavings: 0,
            confidence: "high",
        };
    }
    else {
        return {
            shouldNegotiate: false,
            reason: `The quoted price is ${Math.abs(Math.round(diffPercent))}% BELOW market rate — this is an excellent deal. Accept it.`,
            potentialSavings: 0,
            confidence: "high",
        };
    }
}
export function draftContractLogic(params) {
    const months = params.contractType === "1-year" ? 12 : 6;
    const discountPercent = params.contractType === "1-year" ? 8 : 5;
    const contractPrice = Math.round(params.basePrice * (1 - discountPercent / 100) * 100) / 100;
    const totalContractValue = Math.round(contractPrice * params.monthlyQuantity * months * 100) / 100;
    const terms = [
        `Duration: ${months} months from the date of signing.`,
        `Monthly supply: ${params.monthlyQuantity} ${params.unit} of ${params.product}.`,
        `Locked price: ₹${contractPrice} per ${params.unit} (${discountPercent}% discount on base price ₹${params.basePrice}).`,
        `Payment terms: Within 15 days of each monthly delivery.`,
        `Early termination: 30 days written notice required. Penalty of 5% of remaining contract value.`,
        `Quality assurance: Seller guarantees consistent quality as per initial sample.`,
        `Force majeure: Neither party liable for delays due to natural disasters, strikes, or government actions.`,
    ];
    const contractText = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              LONG-TERM SUPPLY CONTRACT
                  ${params.contractType.toUpperCase()} AGREEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Parties:
  SELLER: ${params.sellerName}
  BUYER:  ${params.buyerName}

Product: ${params.product}
Duration: ${months} months

──────────────────────────────────────────────────────
PRICING
──────────────────────────────────────────────────────
  Base Market Price:    ₹${params.basePrice} / ${params.unit}
  Contract Price:       ₹${contractPrice} / ${params.unit}
  Discount:             ${discountPercent}%
  Monthly Volume:       ${params.monthlyQuantity} ${params.unit}
  Total Contract Value: ₹${totalContractValue.toLocaleString("en-IN")}

──────────────────────────────────────────────────────
TERMS & CONDITIONS
──────────────────────────────────────────────────────
${terms.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}

──────────────────────────────────────────────────────
SIGNATURES
──────────────────────────────────────────────────────
  Seller: ________________________  Date: __________
  Buyer:  ________________________  Date: __________

  Generated by Anvaya Business Platform
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`.trim();
    return {
        contractType: params.contractType,
        parties: { seller: params.sellerName, buyer: params.buyerName },
        product: params.product,
        monthlyQuantity: params.monthlyQuantity,
        unit: params.unit,
        basePrice: params.basePrice,
        contractPrice,
        discountPercent,
        totalContractValue,
        terms,
        contractText,
    };
}
// ── MCP Tool Registrations ────────────────────────────────────────────────────
export function registerNegotiationTools(server) {
    server.tool("generateNegotiation", "Generate a full negotiation strategy: opening offer, max acceptable price, floor, and expected savings. All logic is rule-based using constants from config/rates.json.", {
        currentCost: z.number().describe("Current or quoted cost in INR"),
        averageMarketRate: z.number().describe("Average market rate for this service/product in INR"),
        vehicleType: z.string().optional().default("transport").describe("Vehicle or service type (for context)"),
        buyerDetails: z.string().optional().default("").describe("Extra context about the counterparty"),
    }, async ({ currentCost, averageMarketRate, vehicleType, buyerDetails }) => {
        const plan = generateNegotiationLogic(currentCost, averageMarketRate, vehicleType ?? "transport", buyerDetails ?? "");
        return { content: [{ type: "text", text: JSON.stringify(plan, null, 2) }] };
    });
    server.tool("generateMessage", "Generate a ready-to-send negotiation message from a template using your opening offer and context.", {
        openingOffer: z.number().describe("Your opening offer amount in INR"),
        currentCost: z.number().describe("Current quoted cost"),
        averageMarketRate: z.number().describe("Average market rate"),
        vehicleType: z.string().optional().default("transport").describe("Transport/service type"),
        buyerDetails: z.string().optional().default("").describe("Context about the counterparty"),
    }, async ({ openingOffer, currentCost, averageMarketRate, vehicleType, buyerDetails }) => {
        const msg = generateMessageLogic(openingOffer, {
            currentCost,
            averageMarketRate,
            vehicleType: vehicleType ?? "transport",
            buyerDetails: buyerDetails ?? "",
        });
        return { content: [{ type: "text", text: msg }] };
    });
    server.tool("callSummary", "Generate a structured summary of a completed negotiation for logging and records.", {
        agreedRate: z.number().describe("Final agreed rate in INR"),
        vehicleType: z.string().describe("Vehicle or service type"),
        route: z.string().describe("Route (e.g. 'Hyderabad → Mumbai')"),
        date: z.string().describe("Travel or service date"),
        notes: z.string().optional().default("").describe("Any additional notes"),
    }, async ({ agreedRate, vehicleType, route, date, notes }) => {
        const summary = callSummaryLogic({ agreedRate, vehicleType, route, date, notes: notes ?? "" });
        return { content: [{ type: "text", text: summary }] };
    });
    server.tool("priceSuggestion", "Quick price suggestion: returns suggested opening offer, max acceptable price, and expected savings.", {
        currentCost: z.number().describe("Current or quoted cost in INR"),
        averageMarketRate: z.number().describe("Average market rate in INR"),
    }, async ({ currentCost, averageMarketRate }) => {
        const result = priceSuggestionLogic(currentCost, averageMarketRate);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
    server.tool("shouldNegotiate", "Analyzes whether you should negotiate a deal or accept it. Compares the quoted price against market rate and dealer rating to recommend action.", {
        currentCost: z.number().describe("Quoted/current cost in INR"),
        averageMarketRate: z.number().describe("Average market rate in INR"),
        dealerRating: z.number().optional().default(4.0).describe("Dealer's rating (1–5)"),
    }, async ({ currentCost, averageMarketRate, dealerRating }) => {
        const result = shouldNegotiateLogic(currentCost, averageMarketRate, dealerRating ?? 4.0);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
    server.tool("draftContract", "Draft a long-term supply contract (6-month or 1-year) with lock-in pricing discounts. Generates a ready-to-sign contract document.", {
        contractType: z.enum(["6-month", "1-year"]).describe("Contract duration"),
        sellerName: z.string().describe("Seller's business name"),
        buyerName: z.string().describe("Buyer's business name"),
        product: z.string().describe("Product being contracted"),
        monthlyQuantity: z.number().describe("Monthly supply quantity"),
        unit: z.string().describe("Unit of measurement"),
        basePrice: z.number().describe("Current market price per unit in INR"),
    }, async (params) => {
        const result = draftContractLogic(params);
        return { content: [{ type: "text", text: result.contractText + "\n\n" + JSON.stringify(result, null, 2) }] };
    });
}
//# sourceMappingURL=negotiationAssistant.js.map