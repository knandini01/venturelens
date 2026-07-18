import { z } from "zod";
import { compareAndRecommend } from "./decisionSupport.js";
import { searchMarketLogic } from "./marketIntelligence.js";
import { findRetailersLogic, findWholesalersLogic, findDistributorsLogic, rankBuyersLogic, } from "./buyerDiscovery.js";
import { findTransportLogic, findSharedShipmentLogic, } from "./logisticsOptimization.js";
import { generateNegotiationLogic, shouldNegotiateLogic, draftContractLogic, } from "./negotiationAssistant.js";
import { findSupplierLogic, findRareProductLogic, comparePricesLogic, estimateDeliveryLogic, } from "./inventoryMatching.js";
import { checkStockLevelLogic, updateInventoryLogic } from "./inventoryManagement.js";
import { generateInvoiceLogic, logTransactionLogic } from "./businessDocuments.js";
import { contactDealerLogic } from "./communicationAgent.js";
import { renderDashboard } from "../widgets/dashboardRenderer.js";
import { renderNegotiationCard } from "../widgets/negotiationCard.js";
function classifyIntent(prompt) {
    const lower = prompt.toLowerCase();
    // Intent classification
    let intent = "general_query";
    if (/sell|market|wholesal|distribut|retail|buyer|customer|export/i.test(lower)) {
        intent = "sell_product";
    }
    else if (/source|find|rare|import|buy|purchase|procure|supplier|where.*get|can.*get|need.*material|raw.*material/i.test(lower)) {
        intent = "find_rare_item";
    }
    else if (/transport|logistic|freight|shipping|cost|reduce|cheaper|save.*transport|delivery cost/i.test(lower)) {
        intent = "reduce_transport_cost";
    }
    // Extract product name
    const productPatterns = [
        /(?:manufactur|sell|produce|make|grow)\s+(.+?)(?:\s+and|\s+in|\s+at|\s+for|$)/i,
        /(?:source|find|buy|get|need)\s+(?:some\s+)?(.+?)(?:\s+from|\s+in|\s+urgently|\s+fast|$)/i,
        /(.+?)\s+(?:market|price|demand|buyer|supplier)/i,
    ];
    let productName = "product";
    for (const pattern of productPatterns) {
        const match = prompt.match(pattern);
        if (match?.[1] && match[1].length < 40) {
            productName = match[1].trim().replace(/[.,!?]$/, "");
            break;
        }
    }
    // Extract location
    const locationPatterns = [
        /(?:in|at|to|from|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:market|city|region)/i,
    ];
    let location = "Hyderabad";
    for (const pattern of locationPatterns) {
        const match = prompt.match(pattern);
        if (match?.[1]) {
            location = match[1].trim();
            break;
        }
    }
    // Extract quantity
    const qtyMatch = prompt.match(/(\d[\d,]*)\s*(?:kg|units?|pieces?|liters?|tons?|rolls?|packs?)/i);
    const quantity = qtyMatch ? parseInt(qtyMatch[1].replace(",", ""), 10) : 100;
    // Product type inference
    let productType = "standard";
    if (/food|vegetable|fruit|dairy|meat|fish|milk|perishable/i.test(lower))
        productType = "perishable";
    else if (/glass|ceramic|fragile|marble|crystal/i.test(lower))
        productType = "fragile";
    else if (/chemical|acid|hazardous|flammable|explosive/i.test(lower))
        productType = "hazardous";
    // Business type
    const businessType = /farmer|farm/i.test(lower)
        ? "farmer"
        : /manufactur/i.test(lower)
            ? "manufacturer"
            : /wholesal/i.test(lower)
                ? "wholesaler"
                : "vendor";
    // Seller name
    const sellerMatch = prompt.match(/(?:my\s+(?:company|business|shop|store)\s+(?:is\s+)?|i\s+am\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    const sellerName = sellerMatch?.[1] ?? "My Business";
    // Budget
    const budgetMatch = prompt.match(/budget\s+(?:of\s+)?(?:rs\.?\s*|₹\s*)?(\d[\d,]*)/i);
    const budget = budgetMatch ? parseInt(budgetMatch[1].replace(",", ""), 10) : 0;
    return { intent, productName, location, quantity, productType, budget, businessType, sellerName };
}
// ── Flow: Sell Product (Full E2E) ─────────────────────────────────────────────
async function runSellProductFlow(parsed) {
    const { productName, location, quantity, productType, budget, businessType, sellerName } = parsed;
    // Step 1: Check inventory
    const inventoryCheck = checkStockLevelLogic(productName);
    const inventoryItem = inventoryCheck.items[0];
    const hasStock = inventoryItem && inventoryItem.quantityAvailable >= quantity;
    // Step 2: Market Intelligence
    const marketResult = await searchMarketLogic(productName, businessType, location, budget);
    // Step 3: Buyer Discovery (parallel)
    const [retailers, wholesalers, distributors] = await Promise.all([
        findRetailersLogic(productName, location, 50),
        findWholesalersLogic(productName, location, 100),
        findDistributorsLogic(productName, location, 200),
    ]);
    const allBuyers = [...retailers, ...wholesalers, ...distributors];
    const rankedBuyers = rankBuyersLogic(allBuyers, quantity, productName);
    const topBuyers = rankedBuyers.slice(0, 5);
    // Step 4: Logistics
    const destinationCity = topBuyers[0]?.location ?? location;
    const [transportOptions, sharedOptions] = await Promise.all([
        findTransportLogic(location, destinationCity, quantity, productType),
        findSharedShipmentLogic(location, destinationCity, quantity, productType),
    ]);
    // Step 5: Should Negotiate?
    let negotiationPlan = null;
    let negotiationAdvice = null;
    if (transportOptions.length > 0) {
        const topTransport = transportOptions[0];
        const avgRate = transportOptions.length > 1
            ? transportOptions.slice(0, 3).reduce((s, t) => s + t.estimatedCost, 0) / Math.min(3, transportOptions.length)
            : topTransport.estimatedCost;
        negotiationAdvice = shouldNegotiateLogic(topTransport.estimatedCost, avgRate, topTransport.rating ?? 4.0);
        if (negotiationAdvice.shouldNegotiate) {
            negotiationPlan = generateNegotiationLogic(topTransport.estimatedCost, avgRate, topTransport.vehicleType, `Route to ${destinationCity}`);
        }
    }
    // Step 6: Generate invoice for best buyer
    let invoice = null;
    let transactionLog = null;
    if (topBuyers[0] && marketResult.estimatedSellingPrice) {
        const sellingPrice = marketResult.estimatedSellingPrice.max ?? 100;
        const invoiceResult = generateInvoiceLogic({
            type: "sale",
            productName,
            productType,
            category: inventoryItem?.category ?? "general",
            quantity,
            unit: inventoryItem?.unit ?? "units",
            unitPrice: sellingPrice,
            sellerName: sellerName,
            sellerLocation: location,
            buyerName: topBuyers[0].name,
            buyerLocation: topBuyers[0].location,
            transportProvider: transportOptions[0]?.provider ?? "Self",
            transportCost: transportOptions[0]?.estimatedCost ?? 0,
        });
        invoice = invoiceResult;
        // Step 7: Log transaction automatically
        transactionLog = logTransactionLogic(invoiceResult.invoice);
        // Step 8: Update inventory automatically
        if (hasStock) {
            updateInventoryLogic(productName, quantity, location);
        }
    }
    // Step 9: Contact message for top buyer
    let contactMessage = null;
    if (topBuyers[0]) {
        contactMessage = contactDealerLogic({
            dealerName: topBuyers[0].name,
            dealerPhone: topBuyers[0].contact ?? "+91-XXXXXXXXXX",
            dealerType: "buyer",
            productName,
            quantity,
            unit: inventoryItem?.unit ?? "units",
            proposedPrice: marketResult.estimatedSellingPrice?.max ?? 100,
            yourBusinessName: sellerName,
            yourLocation: location,
            channel: "email",
        });
    }
    // Step 10: Build merged dashboard
    const dashboard = renderDashboard({
        title: `Sell "${productName}" in ${location}`,
        intent: "sell_product",
        market: marketResult,
        buyers: topBuyers,
        transport: transportOptions.slice(0, 3),
        sharedTransport: sharedOptions.slice(0, 2),
        negotiation: negotiationPlan ?? undefined,
    });
    const negCard = negotiationPlan ? renderNegotiationCard(negotiationPlan) : "";
    return JSON.stringify({
        intent: "sell_product",
        productName,
        sellerName,
        sellerLocation: location,
        workflow: {
            step1_inventory: {
                status: hasStock ? "✅ Stock available" : "⚠️ Insufficient stock or product not in inventory",
                currentStock: inventoryItem?.quantityAvailable ?? 0,
                requested: quantity,
            },
            step2_market: {
                status: "✅ Market analyzed",
                recommendation: marketResult.recommendation,
            },
            step3_buyers: {
                status: `✅ ${allBuyers.length} buyers found, top ${topBuyers.length} ranked`,
                topBuyer: topBuyers[0]
                    ? `${topBuyers[0].name} (${topBuyers[0].businessType})`
                    : "No buyers found",
            },
            step4_logistics: {
                status: `✅ ${transportOptions.length} transport options found`,
                bestOption: transportOptions[0]
                    ? `${transportOptions[0].provider} — ₹${transportOptions[0].estimatedCost}`
                    : "No transport found",
                sharedSaving: sharedOptions[0]
                    ? `₹${sharedOptions[0].sharedCost} (shared)`
                    : "None",
            },
            step5_negotiation: {
                status: negotiationAdvice
                    ? (negotiationAdvice.shouldNegotiate ? "✅ Negotiation recommended" : "✅ Deal is fair — accept")
                    : "⏭ Skipped",
                advice: negotiationAdvice,
            },
            step6_invoice: {
                status: invoice ? "✅ Invoice generated" : "⏭ Skipped",
                invoiceNumber: invoice?.invoice.invoiceNumber ?? null,
                grandTotal: invoice?.invoice.grandTotal ?? null,
            },
            step7_transaction: {
                status: transactionLog ? "✅ Logged to ledger" : "⏭ Skipped",
            },
            step8_inventory_updated: {
                status: hasStock ? "✅ Inventory deducted" : "⏭ Skipped",
            },
            step9_contact: {
                status: contactMessage ? "✅ Message drafted" : "⏭ Skipped",
                channel: contactMessage?.channel ?? null,
            },
        },
        market: marketResult,
        topBuyers,
        transport: transportOptions.slice(0, 3),
        sharedTransport: sharedOptions.slice(0, 2),
        negotiation: negotiationPlan,
        invoice: invoice ? { invoiceNumber: invoice.invoice.invoiceNumber, grandTotal: invoice.invoice.grandTotal, invoiceText: invoice.invoiceText } : null,
        contactMessage: contactMessage ? { to: contactMessage.to, subject: contactMessage.subject, body: contactMessage.body } : null,
        dashboard,
        negotiationCard: negCard,
    }, null, 2);
}
// ── Flow: Find Rare Item / Raw Materials ──────────────────────────────────────
async function runFindRareItemFlow(parsed) {
    const { productName, location, quantity, productType, sellerName } = parsed;
    // Step 1: Local supplier search
    let suppliers = await findSupplierLogic(productName, quantity, location, 300);
    // Step 2: Fallback to nationwide if no local match
    let usedFallback = false;
    if (!suppliers.length) {
        suppliers = await findRareProductLogic(productName);
        usedFallback = true;
    }
    // Step 3: Compare and rank
    const priceComparison = suppliers.length ? comparePricesLogic(suppliers) : null;
    const topSupplier = priceComparison?.sorted[0] ?? suppliers[0];
    // Step 4: Delivery estimate for top supplier
    let deliveryEstimate = null;
    if (topSupplier) {
        deliveryEstimate = await estimateDeliveryLogic(topSupplier.location, location, quantity, productType, topSupplier.leadTimeDays);
    }
    // Step 5: Should negotiate with supplier?
    let negotiationAdvice = null;
    if (topSupplier && suppliers.length > 1) {
        const avgPrice = suppliers.reduce((s, sup) => s + sup.unitPrice, 0) / suppliers.length;
        negotiationAdvice = shouldNegotiateLogic(topSupplier.unitPrice, avgPrice, topSupplier.rating);
    }
    // Step 6: Draft a long-term contract if supplier found
    let contract = null;
    if (topSupplier) {
        contract = draftContractLogic({
            contractType: "6-month",
            sellerName: topSupplier.name,
            buyerName: sellerName,
            product: productName,
            monthlyQuantity: Math.ceil(quantity / 6),
            unit: topSupplier.unit,
            basePrice: topSupplier.unitPrice,
        });
    }
    // Step 7: Contact the supplier
    let contactMessage = null;
    if (topSupplier) {
        contactMessage = contactDealerLogic({
            dealerName: topSupplier.name,
            dealerPhone: "+91-XXXXXXXXXX",
            dealerType: "supplier",
            productName,
            quantity,
            unit: topSupplier.unit,
            proposedPrice: topSupplier.unitPrice,
            yourBusinessName: sellerName,
            yourLocation: location,
            channel: "email",
            additionalNotes: "Interested in a 6-month supply contract.",
        });
    }
    return JSON.stringify({
        intent: "find_rare_item",
        productName,
        yourLocation: location,
        usedNationwideFallback: usedFallback,
        workflow: {
            step1_search: {
                status: `✅ ${suppliers.length} suppliers found${usedFallback ? " (nationwide fallback)" : ""}`,
            },
            step2_compare: {
                status: priceComparison ? "✅ Prices compared" : "⏭ Skipped",
            },
            step3_delivery: {
                status: deliveryEstimate ? `✅ ETA: ${deliveryEstimate.totalDays} days, Cost: ₹${deliveryEstimate.deliveryCost}` : "⏭ Skipped",
            },
            step4_negotiation: {
                status: negotiationAdvice
                    ? (negotiationAdvice.shouldNegotiate ? "✅ Negotiation recommended" : "✅ Price is fair")
                    : "⏭ Skipped",
                advice: negotiationAdvice,
            },
            step5_contract: {
                status: contract ? "✅ 6-month contract drafted" : "⏭ Skipped",
                contractPrice: contract?.contractPrice ?? null,
                discount: contract ? `${contract.discountPercent}%` : null,
            },
            step6_contact: {
                status: contactMessage ? "✅ Supplier message drafted" : "⏭ Skipped",
            },
        },
        recommended: priceComparison?.comparison.recommended ?? null,
        suppliers: priceComparison?.sorted ?? suppliers,
        deliveryEstimate,
        contract: contract ? { contractPrice: contract.contractPrice, discount: contract.discountPercent, totalValue: contract.totalContractValue, contractText: contract.contractText } : null,
        contactMessage: contactMessage ? { to: contactMessage.to, subject: contactMessage.subject, body: contactMessage.body } : null,
    }, null, 2);
}
// ── Flow: Reduce Transport Cost ───────────────────────────────────────────────
async function runReduceTransportCostFlow(parsed) {
    const { location, quantity, productType, sellerName } = parsed;
    const destination = parsed.location;
    const pickup = "origin";
    // Step 1: Solo transport options
    const transportOptions = await findTransportLogic(pickup, destination, quantity, productType);
    // Step 2: Shared shipment options
    const sharedOptions = await findSharedShipmentLogic(pickup, destination, quantity, productType);
    // Step 3: Negotiation advice
    let negotiationAdvice = null;
    let negotiationPlan = null;
    if (transportOptions.length > 0) {
        const top = transportOptions[0];
        const avgRate = transportOptions.slice(0, 3).reduce((s, t) => s + t.estimatedCost, 0) / Math.min(3, transportOptions.length);
        negotiationAdvice = shouldNegotiateLogic(top.estimatedCost, avgRate, top.rating ?? 4.0);
        if (negotiationAdvice.shouldNegotiate) {
            negotiationPlan = generateNegotiationLogic(top.estimatedCost, avgRate, top.vehicleType, "");
        }
    }
    const soloCost = transportOptions[0]?.estimatedCost ?? 0;
    const sharedCost = sharedOptions[0]?.sharedCost ?? 0;
    const savings = sharedCost > 0 && soloCost > 0
        ? { amount: Math.round((soloCost - sharedCost) * 100) / 100, percentage: Math.round(((soloCost - sharedCost) / soloCost) * 1000) / 10 }
        : null;
    // Step 4: Contact the best transporter
    let contactMessage = null;
    const bestOption = sharedOptions[0] ?? transportOptions[0];
    if (bestOption) {
        contactMessage = contactDealerLogic({
            dealerName: bestOption.provider,
            dealerPhone: bestOption.contactPhone ?? "+91-XXXXXXXXXX",
            dealerType: "transporter",
            productName: "Shipment",
            quantity,
            unit: "kg",
            proposedPrice: sharedOptions[0]?.sharedCost ?? transportOptions[0]?.estimatedCost ?? 0,
            yourBusinessName: sellerName,
            yourLocation: location,
            channel: "email",
        });
    }
    return JSON.stringify({
        intent: "reduce_transport_cost",
        destination,
        cargoWeightKg: quantity,
        workflow: {
            step1_solo: {
                status: `✅ ${transportOptions.length} solo options found`,
                best: transportOptions[0] ? `${transportOptions[0].provider} — ₹${transportOptions[0].estimatedCost}` : "None",
            },
            step2_shared: {
                status: `✅ ${sharedOptions.length} shared options found`,
                best: sharedOptions[0] ? `${sharedOptions[0].provider} — ₹${sharedOptions[0].sharedCost}` : "None",
            },
            step3_savings: {
                status: savings ? `✅ ₹${savings.amount} (${savings.percentage}%) potential savings` : "⏭ No savings available",
            },
            step4_negotiation: {
                status: negotiationAdvice
                    ? (negotiationAdvice.shouldNegotiate ? "✅ Negotiation recommended" : "✅ Rate is fair")
                    : "⏭ Skipped",
                advice: negotiationAdvice,
            },
            step5_contact: {
                status: contactMessage ? "✅ Transporter message drafted" : "⏭ Skipped",
            },
        },
        soloOptions: transportOptions.slice(0, 3),
        sharedOptions: sharedOptions.slice(0, 3),
        savingsDashboard: savings,
        negotiation: negotiationPlan,
        negotiationCard: negotiationPlan ? renderNegotiationCard(negotiationPlan) : null,
        contactMessage: contactMessage ? { to: contactMessage.to, subject: contactMessage.subject, body: contactMessage.body } : null,
    }, null, 2);
}
// ── MCP Tool Registrations ────────────────────────────────────────────────────
export function registerBusinessAgentTools(server) {
    // compareAndRecommend as a standalone MCP tool
    server.tool("compareAndRecommend", "Decision support: takes any list of options (buyers/suppliers/transport), computes weighted scores, detects near-ties within 10% on price, and returns plain-language trade-off explanations.", {
        options: z.array(z.object({
            id: z.string(),
            label: z.string(),
            price: z.number(),
            distanceKm: z.number(),
            extraFactors: z.record(z.union([z.number(), z.string()])).optional(),
        })).describe("Options to compare"),
        criteria: z.array(z.string())
            .optional().default(["price", "distance"])
            .describe("Scoring criteria: price, distance, reliability, volume"),
    }, async ({ options, criteria }) => {
        const result = compareAndRecommend(options, criteria ?? ["price", "distance"]);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
    // handleBusinessIntent — the main orchestrator
    server.tool("handleBusinessIntent", `The main Anvaya Business Agent. Accepts a plain-language business intent and orchestrates ALL tool groups end-to-end.

Supported intents:
- SELL PRODUCT: "I manufacture soaps and want to sell in Hyderabad"
  → checkStock → searchMarket → findBuyers → findTransport → shouldNegotiate → generateInvoice → logTransaction → updateInventory → contactBuyer → dashboard
- FIND RAW MATERIALS: "I need to source saffron urgently"
  → findSupplier → compareAndRank → estimateDelivery → shouldNegotiate → draftContract → contactSupplier
- REDUCE TRANSPORT COST: "Help me reduce transport costs to Mumbai"
  → findTransport → findSharedShipment → shouldNegotiate → contactTransporter → savings dashboard`, {
        userPrompt: z.string().describe("Plain-language business intent or question"),
    }, async ({ userPrompt }) => {
        const parsed = classifyIntent(userPrompt);
        let result;
        switch (parsed.intent) {
            case "sell_product":
                result = await runSellProductFlow(parsed);
                break;
            case "find_rare_item":
                result = await runFindRareItemFlow(parsed);
                break;
            case "reduce_transport_cost":
                result = await runReduceTransportCostFlow(parsed);
                break;
            default:
                result = JSON.stringify({
                    intent: "general_query",
                    message: "I couldn't determine a specific intent. Try phrasing like: 'I manufacture X and want to sell in Y', 'I need to source Z urgently', or 'Help me reduce transport costs from A to B'.",
                    parsed,
                });
        }
        return { content: [{ type: "text", text: result }] };
    });
}
//# sourceMappingURL=businessAgent.js.map