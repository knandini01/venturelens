import "dotenv/config";
import http from "http";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Import all tool logic functions directly
import { searchMarketLogic } from "./tools/marketIntelligence.js";
import {
  findRetailersLogic,
  findWholesalersLogic,
  findDistributorsLogic,
  rankBuyersLogic,
} from "./tools/buyerDiscovery.js";
import {
  findTransportLogic,
  findSharedShipmentLogic,
  type ProductType,
} from "./tools/logisticsOptimization.js";
import {
  generateNegotiationLogic,
  shouldNegotiateLogic,
  draftContractLogic,
} from "./tools/negotiationAssistant.js";
import {
  findSupplierLogic,
  findRareProductLogic,
  comparePricesLogic,
  estimateDeliveryLogic,
} from "./tools/inventoryMatching.js";
import { checkStockLevelLogic, updateInventoryLogic } from "./tools/inventoryManagement.js";
import { generateInvoiceLogic, logTransactionLogic, getTransactionHistoryLogic } from "./tools/businessDocuments.js";
import { contactDealerLogic } from "./tools/communicationAgent.js";
import { compareAndRecommend, type DecisionOption } from "./tools/decisionSupport.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "../public");
const PORT = parseInt(process.env.PORT ?? "3456", 10);

// ── Intent Classification (same as businessAgent, extracted here for the step-by-step API) ──

function classifyIntent(prompt: string) {
  const lower = prompt.toLowerCase();

  let intent = "general_query";
  if (/sell|market|wholesal|distribut|retail|buyer|customer|export/i.test(lower)) {
    intent = "sell_product";
  } else if (/source|find|rare|import|buy|purchase|procure|supplier|where.*get|can.*get|need.*material|raw.*material/i.test(lower)) {
    intent = "find_rare_item";
  } else if (/transport|logistic|freight|shipping|cost|reduce|cheaper|save.*transport|delivery cost/i.test(lower)) {
    intent = "reduce_transport_cost";
  }

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

  const locationPatterns = [
    /(?:in|at|to|from|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:market|city|region)/i,
  ];
  let location = "Hyderabad";
  for (const pattern of locationPatterns) {
    const match = prompt.match(pattern);
    if (match?.[1]) { location = match[1].trim(); break; }
  }

  const qtyMatch = prompt.match(/(\d[\d,]*)\s*(?:kg|units?|pieces?|liters?|tons?|rolls?|packs?)/i);
  const quantity = qtyMatch ? parseInt(qtyMatch[1].replace(",", ""), 10) : 100;

  let productType: ProductType = "standard";
  if (/food|vegetable|fruit|dairy|meat|fish|milk|perishable/i.test(lower)) productType = "perishable";
  else if (/glass|ceramic|fragile|marble|crystal/i.test(lower)) productType = "fragile";
  else if (/chemical|acid|hazardous|flammable|explosive/i.test(lower)) productType = "hazardous";

  const businessType = /farmer|farm/i.test(lower) ? "farmer"
    : /manufactur/i.test(lower) ? "manufacturer"
    : /wholesal/i.test(lower) ? "wholesaler" : "vendor";

  const sellerMatch = prompt.match(/(?:my\s+(?:company|business|shop|store)\s+(?:is\s+)?|i\s+am\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  const sellerName = sellerMatch?.[1] ?? "My Business";

  const budgetMatch = prompt.match(/budget\s+(?:of\s+)?(?:rs\.?\s*|₹\s*)?(\d[\d,]*)/i);
  const budget = budgetMatch ? parseInt(budgetMatch[1].replace(",", ""), 10) : 0;

  return { intent, productName, location, quantity, productType, budget, businessType, sellerName };
}

// ── Step-by-step API handlers ─────────────────────────────────────────────────
// Each step returns its result so the frontend can animate per-step

type StepHandler = (ctx: Record<string, unknown>) => Promise<Record<string, unknown>>;

const sellProductSteps: Array<{ id: string; label: string; icon: string; subSteps: string[]; handler: StepHandler }> = [
  {
    id: "understand_intent",
    label: "Understanding business intent",
    icon: "🧠",
    subSteps: ["Parsing natural language", "Classifying intent", "Extracting parameters"],
    handler: async (ctx) => {
      const parsed = classifyIntent(ctx.prompt as string);
      return { parsed, stepResult: parsed };
    },
  },
  {
    id: "check_inventory",
    label: "Checking inventory levels",
    icon: "📦",
    subSteps: ["Loading inventory data", "Matching product", "Checking stock levels"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const result = checkStockLevelLogic(parsed.productName);
      const item = result.items[0];
      return {
        inventoryCheck: result,
        inventoryItem: item,
        hasStock: item ? item.quantityAvailable >= parsed.quantity : false,
        stepResult: {
          found: result.items.length > 0,
          currentStock: item?.quantityAvailable ?? 0,
          requested: parsed.quantity,
          alerts: result.lowStockAlerts,
        },
      };
    },
  },
  {
    id: "market_intelligence",
    label: "Market Intelligence MCP",
    icon: "📊",
    subSteps: ["Geocoding target location", "Searching nearby businesses", "Calculating demand score", "Estimating market price", "Ranking market opportunities"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const result = await searchMarketLogic(parsed.productName, parsed.businessType, parsed.location, parsed.budget);
      return { marketResult: result, stepResult: result };
    },
  },
  {
    id: "buyer_discovery",
    label: "Buyer Discovery MCP",
    icon: "🏪",
    subSteps: ["Finding retailers", "Finding wholesalers", "Finding distributors", "Ranking buyers", "Estimating profits"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const [retailers, wholesalers, distributors] = await Promise.all([
        findRetailersLogic(parsed.productName, parsed.location, 50),
        findWholesalersLogic(parsed.productName, parsed.location, 100),
        findDistributorsLogic(parsed.productName, parsed.location, 200),
      ]);
      const allBuyers = [...retailers, ...wholesalers, ...distributors];
      const ranked = rankBuyersLogic(allBuyers, parsed.quantity, parsed.productName);
      const topBuyers = ranked.slice(0, 5);
      return {
        topBuyers,
        allBuyersCount: allBuyers.length,
        stepResult: {
          retailersFound: retailers.length,
          wholesalersFound: wholesalers.length,
          distributorsFound: distributors.length,
          totalBuyers: allBuyers.length,
          topBuyers: topBuyers.map(b => ({ name: b.name, type: b.businessType, location: b.location, distanceKm: b.distanceKm, estimatedProfit: b.estimatedProfit })),
        },
      };
    },
  },
  {
    id: "logistics_optimization",
    label: "Logistics Optimization MCP",
    icon: "🚛",
    subSteps: ["Finding transport providers", "Finding shared shipments", "Calculating route distances", "Estimating costs"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const topBuyers = ctx.topBuyers as Array<{ location: string }>;
      const dest = topBuyers[0]?.location ?? parsed.location;
      const [transport, shared] = await Promise.all([
        findTransportLogic(parsed.location, dest, parsed.quantity, parsed.productType),
        findSharedShipmentLogic(parsed.location, dest, parsed.quantity, parsed.productType),
      ]);
      return {
        transportOptions: transport,
        sharedOptions: shared,
        stepResult: {
          soloOptionsFound: transport.length,
          sharedOptionsFound: shared.length,
          bestSolo: transport[0] ? { provider: transport[0].provider, cost: transport[0].estimatedCost, vehicle: transport[0].vehicleType } : null,
          bestShared: shared[0] ? { provider: shared[0].provider, cost: shared[0].sharedCost } : null,
        },
      };
    },
  },
  {
    id: "negotiation_analysis",
    label: "Negotiation Assistant MCP",
    icon: "🤝",
    subSteps: ["Analyzing deal fairness", "Computing market rate comparison", "Generating negotiation strategy"],
    handler: async (ctx) => {
      const transport = ctx.transportOptions as Array<{ estimatedCost: number; vehicleType: string; rating?: number }>;
      if (!transport.length) return { negotiationAdvice: null, negotiationPlan: null, stepResult: { skipped: true } };

      const top = transport[0];
      const avg = transport.slice(0, 3).reduce((s, t) => s + t.estimatedCost, 0) / Math.min(3, transport.length);
      const advice = shouldNegotiateLogic(top.estimatedCost, avg, top.rating ?? 4.0);
      let plan = null;
      if (advice.shouldNegotiate) {
        plan = generateNegotiationLogic(top.estimatedCost, avg, top.vehicleType, "");
      }
      return { negotiationAdvice: advice, negotiationPlan: plan, stepResult: { advice, plan } };
    },
  },
  {
    id: "decision_support",
    label: "Decision Support Layer",
    icon: "⚖️",
    subSteps: ["Comparing profit margins", "Evaluating transport costs", "Assessing demand scores", "Computing confidence score", "Selecting best plan"],
    handler: async (ctx) => {
      const topBuyers = ctx.topBuyers as Array<{ name: string; location: string; estimatedProfit: number; distanceKm: number; rating?: number }>;
      const transport = ctx.transportOptions as Array<{ provider: string; estimatedCost: number; distanceKm: number }>;
      const shared = ctx.sharedOptions as Array<{ provider: string; sharedCost: number }>;
      const market = ctx.marketResult as { demandScore: number; competitionScore: number; confidenceScore: number };

      const bestBuyer = topBuyers[0] ?? null;
      const bestTransport = transport[0] ?? null;
      const bestShared = shared[0] ?? null;

      const soloCost = bestTransport?.estimatedCost ?? 0;
      const sharedCost = bestShared?.sharedCost ?? 0;
      const savings = sharedCost > 0 && soloCost > 0
        ? { amount: Math.round((soloCost - sharedCost) * 100) / 100, percentage: Math.round(((soloCost - sharedCost) / soloCost) * 1000) / 10 }
        : null;

      return {
        decision: { bestBuyer: bestBuyer?.name, bestTransport: bestTransport?.provider, savings },
        stepResult: {
          bestBuyerSelected: bestBuyer ? `${bestBuyer.name} — ₹${bestBuyer.estimatedProfit} est. profit` : null,
          sharedTransportFound: bestShared ? `${bestShared.provider} — ₹${bestShared.sharedCost}` : null,
          estimatedSavings: savings,
          demandScore: market?.demandScore,
          competitionScore: market?.competitionScore,
          confidenceScore: market?.confidenceScore,
        },
      };
    },
  },
  {
    id: "generate_documents",
    label: "Generating Business Documents",
    icon: "📄",
    subSteps: ["Generating tax invoice", "Calculating GST", "Logging transaction", "Updating inventory"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const topBuyers = ctx.topBuyers as Array<{ name: string; location: string; contact?: string }>;
      const transport = ctx.transportOptions as Array<{ provider: string; estimatedCost: number }>;
      const inventoryItem = ctx.inventoryItem as { category?: string; unit?: string } | undefined;
      const market = ctx.marketResult as { estimatedSellingPrice?: { max: number } };
      const hasStock = ctx.hasStock as boolean;

      if (!topBuyers[0]) return { invoice: null, stepResult: { skipped: true, reason: "No buyer found" } };

      const sellingPrice = market?.estimatedSellingPrice?.max ?? 100;
      const invoiceResult = generateInvoiceLogic({
        type: "sale",
        productName: parsed.productName,
        productType: parsed.productType,
        category: inventoryItem?.category ?? "general",
        quantity: parsed.quantity,
        unit: inventoryItem?.unit ?? "units",
        unitPrice: sellingPrice,
        sellerName: parsed.sellerName,
        sellerLocation: parsed.location,
        buyerName: topBuyers[0].name,
        buyerLocation: topBuyers[0].location,
        transportProvider: transport[0]?.provider ?? "Self",
        transportCost: transport[0]?.estimatedCost ?? 0,
      });

      const txnLog = logTransactionLogic(invoiceResult.invoice);
      if (hasStock) updateInventoryLogic(parsed.productName, parsed.quantity, parsed.location);

      return {
        invoice: invoiceResult,
        stepResult: {
          invoiceNumber: invoiceResult.invoice.invoiceNumber,
          grandTotal: invoiceResult.invoice.grandTotal,
          gstAmount: invoiceResult.invoice.gstAmount,
          transactionLogged: txnLog.logged,
          inventoryUpdated: hasStock,
        },
      };
    },
  },
  {
    id: "contact_buyer",
    label: "Drafting buyer communication",
    icon: "📤",
    subSteps: ["Selecting communication channel", "Personalizing message", "Preparing proposal"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const topBuyers = ctx.topBuyers as Array<{ name: string; contact?: string; location: string }>;
      const inventoryItem = ctx.inventoryItem as { unit?: string } | undefined;
      const market = ctx.marketResult as { estimatedSellingPrice?: { max: number } };

      if (!topBuyers[0]) return { contactMessage: null, stepResult: { skipped: true } };

      const msg = contactDealerLogic({
        dealerName: topBuyers[0].name,
        dealerPhone: topBuyers[0].contact ?? "+91-XXXXXXXXXX",
        dealerType: "buyer",
        productName: parsed.productName,
        quantity: parsed.quantity,
        unit: inventoryItem?.unit ?? "units",
        proposedPrice: market?.estimatedSellingPrice?.max ?? 100,
        yourBusinessName: parsed.sellerName,
        yourLocation: parsed.location,
        channel: "email",
      });

      return { contactMessage: msg, stepResult: { to: msg.to, subject: msg.subject, channel: msg.channel, body: msg.body } };
    },
  },
];

const findRareItemSteps: Array<{ id: string; label: string; icon: string; subSteps: string[]; handler: StepHandler }> = [
  {
    id: "understand_intent", label: "Understanding business intent", icon: "🧠",
    subSteps: ["Parsing natural language", "Classifying intent", "Extracting parameters"],
    handler: async (ctx) => { const parsed = classifyIntent(ctx.prompt as string); return { parsed, stepResult: parsed }; },
  },
  {
    id: "find_suppliers", label: "Searching suppliers", icon: "🔍",
    subSteps: ["Searching local suppliers", "Expanding to nationwide", "Matching product catalogs"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      let suppliers = await findSupplierLogic(parsed.productName, parsed.quantity, parsed.location, 300);
      let fallback = false;
      if (!suppliers.length) { suppliers = await findRareProductLogic(parsed.productName); fallback = true; }
      return { suppliers, usedFallback: fallback, stepResult: { found: suppliers.length, fallback } };
    },
  },
  {
    id: "compare_prices", label: "Comparing supplier prices", icon: "💰",
    subSteps: ["Normalizing price data", "Computing weighted scores", "Detecting near-ties"],
    handler: async (ctx) => {
      const suppliers = ctx.suppliers as Array<any>;
      if (!suppliers.length) return { priceComparison: null, topSupplier: null, stepResult: { skipped: true } };
      const comparison = comparePricesLogic(suppliers);
      return { priceComparison: comparison, topSupplier: comparison.sorted[0], stepResult: { recommended: comparison.comparison.recommended, sorted: comparison.sorted.slice(0, 3).map((s: any) => ({ name: s.name, location: s.location, unitPrice: s.unitPrice, unit: s.unit })) } };
    },
  },
  {
    id: "estimate_delivery", label: "Estimating delivery", icon: "🚚",
    subSteps: ["Geocoding supplier location", "Calculating route distance", "Estimating transit time", "Computing delivery cost"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const top = ctx.topSupplier as any;
      if (!top) return { deliveryEstimate: null, stepResult: { skipped: true } };
      const est = await estimateDeliveryLogic(top.location, parsed.location, parsed.quantity, parsed.productType, top.leadTimeDays);
      return { deliveryEstimate: est, stepResult: est };
    },
  },
  {
    id: "negotiation_check", label: "Negotiation analysis", icon: "🤝",
    subSteps: ["Comparing quoted vs market rate", "Assessing dealer reliability", "Recommending action"],
    handler: async (ctx) => {
      const suppliers = ctx.suppliers as Array<any>;
      const top = ctx.topSupplier as any;
      if (!top || suppliers.length < 2) return { negotiationAdvice: null, stepResult: { skipped: true } };
      const avg = suppliers.reduce((s: number, sup: any) => s + sup.unitPrice, 0) / suppliers.length;
      const advice = shouldNegotiateLogic(top.unitPrice, avg, top.rating);
      return { negotiationAdvice: advice, stepResult: advice };
    },
  },
  {
    id: "draft_contract", label: "Drafting supply contract", icon: "📝",
    subSteps: ["Calculating lock-in discount", "Generating contract terms", "Preparing document"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const top = ctx.topSupplier as any;
      if (!top) return { contract: null, stepResult: { skipped: true } };
      const contract = draftContractLogic({ contractType: "6-month", sellerName: top.name, buyerName: parsed.sellerName, product: parsed.productName, monthlyQuantity: Math.ceil(parsed.quantity / 6), unit: top.unit, basePrice: top.unitPrice });
      return { contract, stepResult: { contractPrice: contract.contractPrice, discount: contract.discountPercent, totalValue: contract.totalContractValue } };
    },
  },
  {
    id: "contact_supplier", label: "Drafting supplier message", icon: "📤",
    subSteps: ["Personalizing message", "Including contract terms", "Preparing proposal"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const top = ctx.topSupplier as any;
      if (!top) return { contactMessage: null, stepResult: { skipped: true } };
      const msg = contactDealerLogic({ dealerName: top.name, dealerPhone: "+91-XXXXXXXXXX", dealerType: "supplier", productName: parsed.productName, quantity: parsed.quantity, unit: top.unit, proposedPrice: top.unitPrice, yourBusinessName: parsed.sellerName, yourLocation: parsed.location, channel: "email", additionalNotes: "Interested in a 6-month supply contract." });
      return { contactMessage: msg, stepResult: { to: msg.to, subject: msg.subject, body: msg.body } };
    },
  },
];

const reduceTransportSteps: Array<{ id: string; label: string; icon: string; subSteps: string[]; handler: StepHandler }> = [
  {
    id: "understand_intent", label: "Understanding business intent", icon: "🧠",
    subSteps: ["Parsing natural language", "Classifying intent", "Extracting parameters"],
    handler: async (ctx) => { const parsed = classifyIntent(ctx.prompt as string); return { parsed, stepResult: parsed }; },
  },
  {
    id: "find_solo_transport", label: "Finding solo transport", icon: "🚛",
    subSteps: ["Searching transport providers", "Filtering by capacity", "Estimating costs"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const transport = await findTransportLogic("origin", parsed.location, parsed.quantity, parsed.productType);
      return { transportOptions: transport, stepResult: { found: transport.length, options: transport.slice(0, 3).map(t => ({ provider: t.provider, cost: t.estimatedCost, vehicle: t.vehicleType })) } };
    },
  },
  {
    id: "find_shared_transport", label: "Finding shared shipments", icon: "🤝",
    subSteps: ["Searching overlapping routes", "Checking spare capacity", "Calculating shared cost"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const shared = await findSharedShipmentLogic("origin", parsed.location, parsed.quantity, parsed.productType);
      return { sharedOptions: shared, stepResult: { found: shared.length, options: shared.slice(0, 3).map(s => ({ provider: s.provider, cost: s.sharedCost, spareKg: s.spareCapacityKg })) } };
    },
  },
  {
    id: "calculate_savings", label: "Calculating savings", icon: "💰",
    subSteps: ["Comparing solo vs shared costs", "Computing percentage savings"],
    handler: async (ctx) => {
      const transport = ctx.transportOptions as Array<{ estimatedCost: number }>;
      const shared = ctx.sharedOptions as Array<{ sharedCost: number }>;
      const solo = transport[0]?.estimatedCost ?? 0;
      const sh = shared[0]?.sharedCost ?? 0;
      const savings = sh > 0 && solo > 0 ? { amount: Math.round((solo - sh) * 100) / 100, percentage: Math.round(((solo - sh) / solo) * 1000) / 10 } : null;
      return { savings, stepResult: savings ?? { noSavings: true } };
    },
  },
  {
    id: "negotiation_check", label: "Negotiation analysis", icon: "🤝",
    subSteps: ["Analyzing rate fairness", "Generating strategy"],
    handler: async (ctx) => {
      const transport = ctx.transportOptions as Array<{ estimatedCost: number; vehicleType: string; rating?: number }>;
      if (!transport.length) return { negotiationAdvice: null, stepResult: { skipped: true } };
      const top = transport[0];
      const avg = transport.slice(0, 3).reduce((s, t) => s + t.estimatedCost, 0) / Math.min(3, transport.length);
      const advice = shouldNegotiateLogic(top.estimatedCost, avg, top.rating ?? 4.0);
      return { negotiationAdvice: advice, stepResult: advice };
    },
  },
  {
    id: "contact_transporter", label: "Drafting transporter message", icon: "📤",
    subSteps: ["Selecting best option", "Personalizing message"],
    handler: async (ctx) => {
      const parsed = ctx.parsed as ReturnType<typeof classifyIntent>;
      const transport = ctx.transportOptions as Array<{ provider: string; estimatedCost: number; contactPhone?: string }>;
      const shared = ctx.sharedOptions as Array<{ provider: string; sharedCost: number; contactPhone?: string }>;
      const best = shared[0] ?? transport[0];
      if (!best) return { contactMessage: null, stepResult: { skipped: true } };
      const msg = contactDealerLogic({ dealerName: best.provider, dealerPhone: (best as any).contactPhone ?? "+91-XXXXXXXXXX", dealerType: "transporter", productName: "Shipment", quantity: parsed.quantity, unit: "kg", proposedPrice: (shared[0] as any)?.sharedCost ?? (transport[0] as any)?.estimatedCost ?? 0, yourBusinessName: parsed.sellerName, yourLocation: parsed.location, channel: "email" });
      return { contactMessage: msg, stepResult: { to: msg.to, subject: msg.subject, body: msg.body } };
    },
  },
];

// ── HTTP Server ───────────────────────────────────────────────────────────────

function getStepsForIntent(intent: string) {
  switch (intent) {
    case "sell_product": return sellProductSteps;
    case "find_rare_item": return findRareItemSteps;
    case "reduce_transport_cost": return reduceTransportSteps;
    default: return [];
  }
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Serve static files
  if (url.pathname === "/" || url.pathname === "/workflow.html") {
    try {
      const html = readFileSync(join(PUBLIC_DIR, "workflow.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end("workflow.html not found. Create public/workflow.html first.");
    }
    return;
  }

  // API: Classify intent and return workflow steps
  if (url.pathname === "/api/classify" && req.method === "POST") {
    const body = await readBody(req);
    const { prompt } = JSON.parse(body);
    const parsed = classifyIntent(prompt);
    const steps = getStepsForIntent(parsed.intent);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      intent: parsed.intent,
      parsed,
      steps: steps.map(s => ({ id: s.id, label: s.label, icon: s.icon, subSteps: s.subSteps })),
    }));
    return;
  }

  // API: Execute a single step (SSE-streamed for per-substep animation)
  if (url.pathname === "/api/execute-step" && req.method === "POST") {
    const body = await readBody(req);
    const { intent, stepId, context } = JSON.parse(body);
    const steps = getStepsForIntent(intent);
    const step = steps.find(s => s.id === stepId);

    if (!step) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Step "${stepId}" not found` }));
      return;
    }

    try {
      const result = await step.handler(context);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ stepId, status: "completed", result }));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ stepId, status: "error", error: errorMessage }));
    }
    return;
  }

  // API: Execute full workflow (returns all steps sequentially as JSON)
  if (url.pathname === "/api/execute-workflow" && req.method === "POST") {
    const body = await readBody(req);
    const { prompt } = JSON.parse(body);
    const parsed = classifyIntent(prompt);
    const steps = getStepsForIntent(parsed.intent);

    if (!steps.length) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ intent: "general_query", message: "Could not determine intent.", parsed }));
      return;
    }

    // SSE stream for real-time step updates
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    let ctx: Record<string, unknown> = { prompt };

    for (const step of steps) {
      // Signal step start
      res.write(`data: ${JSON.stringify({ event: "step_start", stepId: step.id, label: step.label, icon: step.icon, subSteps: step.subSteps })}\n\n`);

      // Simulate sub-step progress
      for (let i = 0; i < step.subSteps.length; i++) {
        res.write(`data: ${JSON.stringify({ event: "substep_progress", stepId: step.id, subStepIndex: i, subStep: step.subSteps[i] })}\n\n`);
        // Small delay between substeps for animation
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      try {
        const result = await step.handler(ctx);
        // Merge result into context for the next step
        ctx = { ...ctx, ...result };
        res.write(`data: ${JSON.stringify({ event: "step_complete", stepId: step.id, result: result.stepResult })}\n\n`);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.write(`data: ${JSON.stringify({ event: "step_error", stepId: step.id, error: errorMessage })}\n\n`);
      }
    }
    
    // Generate a final natural language summary
    let finalAnswer = "";
    if (parsed.intent === "sell_product") {
      const b = (ctx.topBuyers as any[])?.[0];
      const t = (ctx.transportOptions as any[])?.[0];
      const m = ctx.marketResult as any;
      if (b) {
        finalAnswer = `<strong>I've analyzed the market for ${parsed.productName} in ${parsed.location}.</strong><br><br>The demand is ${m?.demandScore > 60 ? "high" : "moderate"} with a recommended selling price around ₹${m?.estimatedSellingPrice?.max ?? 100}. <br><br>I found the best buyer for you: <strong>${b.name}</strong>, a ${b.businessType} located ${b.distanceKm}km away. They can absorb your quantity and yield an estimated profit of ₹${b.estimatedProfit}.<br><br>`;
        if (t) {
          finalAnswer += `For logistics, <strong>${t.provider}</strong> can deliver it for ₹${t.estimatedCost}. <br><br>`;
        }
        if ((ctx as any).invoice) {
          finalAnswer += `I've automatically generated GST invoice <strong>${(ctx as any).invoice.invoice.invoiceNumber}</strong> for this transaction, logged it to your ledger, and drafted a proposal email to the buyer.`;
        }
      } else {
        finalAnswer = `I couldn't find any suitable buyers for ${parsed.productName} in ${parsed.location} right now.`;
      }
    } else if (parsed.intent === "find_rare_item") {
      const s = ctx.topSupplier as any;
      if (s) {
        finalAnswer = `<strong>I found a supplier for ${parsed.productName}.</strong><br><br>The best match is <strong>${s.name}</strong> located in ${s.location}. They offer it at ₹${s.unitPrice} per ${s.unit}.<br><br>`;
        if ((ctx as any).deliveryEstimate) {
          finalAnswer += `Estimated delivery takes about ${(ctx as any).deliveryEstimate.totalDays} days, costing ₹${(ctx as any).deliveryEstimate.deliveryCost}.<br><br>`;
        }
        if ((ctx as any).contract) {
          finalAnswer += `Since this is a good deal, I've drafted a <strong>6-month supply contract</strong> locking in a ${(ctx as any).contract.discountPercent}% discount, and prepared an email to send them.`;
        }
      } else {
        finalAnswer = `I couldn't locate any suppliers for ${parsed.productName} at this moment.`;
      }
    } else if (parsed.intent === "reduce_transport_cost") {
      const t = (ctx.transportOptions as any[])?.[0];
      const s = (ctx.sharedOptions as any[])?.[0];
      const sav = ctx.savings as any;
      
      finalAnswer = `<strong>Here is the transport analysis for ${parsed.location}.</strong><br><br>`;
      if (s && sav) {
        finalAnswer += `Instead of booking a dedicated truck, you can use a shared shipment with <strong>${s.provider}</strong> for <strong>₹${s.sharedCost}</strong>.<br><br>This saves you <strong>₹${sav.amount} (${sav.percentage}%)</strong> compared to standard solo transport.<br><br>I've drafted a message to book this shared space immediately.`;
      } else if (t) {
        finalAnswer += `I couldn't find a shared shipment, but <strong>${t.provider}</strong> offers a solo trip for ₹${t.estimatedCost}. I've drafted an email to contact them.`;
      } else {
        finalAnswer = `I couldn't find any transport options to ${parsed.location} for this cargo.`;
      }
    } else {
      finalAnswer = "I've completed the analysis, but couldn't determine a specific action for this intent.";
    }

    res.write(`data: ${JSON.stringify({ event: "workflow_complete", intent: parsed.intent, finalAnswer })}\n\n`);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
  });
}

server.listen(PORT, () => {
  console.log(`✅ Anvaya HTTP Bridge running at http://localhost:${PORT}`);
  console.log(`   Open http://localhost:${PORT} in your browser`);
  console.log(`   API endpoints:`);
  console.log(`     POST /api/classify          — classify intent & get workflow steps`);
  console.log(`     POST /api/execute-step      — execute a single step`);
  console.log(`     POST /api/execute-workflow   — execute full workflow (SSE stream)`);
});
