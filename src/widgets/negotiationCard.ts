import type { NegotiationPlan } from "../tools/negotiationAssistant.js";

export function renderNegotiationCard(plan: NegotiationPlan): string {
  const savingsPct = plan.expectedSavings.percentage;
  const savingsAmt = plan.expectedSavings.amount;

  return `
╔══════════════════════════════════════════════════════════╗
║           💼  ANVAYA NEGOTIATION CARD                   ║
╠══════════════════════════════════════════════════════════╣
║  Strategy:                                              ║
║  ${plan.strategy.slice(0, 54).padEnd(54)} ║
╠══════════════════════════════════════════════════════════╣
║  💰 Opening Offer    ₹${String(plan.suggestedOffer).padEnd(34)}║
║  🚫 Max Acceptable   ₹${String(plan.maxAcceptable).padEnd(34)}║
║  🔒 Floor (Walk Away) ₹${String(plan.floor).padEnd(33)}║
║  📈 Expected Saving  ₹${String(savingsAmt)} (${savingsPct}%)${" ".repeat(Math.max(0, 21 - String(savingsAmt).length - String(savingsPct).length))}║
╠══════════════════════════════════════════════════════════╣
║  📋 DRAFTED MESSAGE (copy and send):                    ║
╚══════════════════════════════════════════════════════════╝

${plan.messageDraft}
`.trim();
}

/** JSON-serialisable negotiation card for widget consumers */
export function negotiationCardJSON(plan: NegotiationPlan): object {
  return {
    widget: "NegotiationCard",
    strategy: plan.strategy,
    suggestedOffer: { amount: plan.suggestedOffer, currency: "INR" },
    maxAcceptable: { amount: plan.maxAcceptable, currency: "INR" },
    floor: { amount: plan.floor, currency: "INR" },
    expectedSavings: plan.expectedSavings,
    messageDraft: plan.messageDraft,
  };
}
