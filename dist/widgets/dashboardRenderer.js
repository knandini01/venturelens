function bar(score, max = 100, width = 20) {
    const filled = Math.round((score / max) * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
}
function stars(rating) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    return "★".repeat(full) + (half ? "☆" : "") + "☆".repeat(5 - full - (half ? 1 : 0));
}
export function renderDashboard(input) {
    const lines = [];
    const w = 65;
    const sep = "─".repeat(w);
    lines.push(`\n${"═".repeat(w)}`);
    lines.push(`  🏢  ANVAYA RECOMMENDATION DASHBOARD`);
    lines.push(`  ${input.title}`);
    lines.push(`${"═".repeat(w)}`);
    // ── MARKET INTELLIGENCE ───────────────────────────────────────────
    if (input.market) {
        const m = input.market;
        lines.push(`\n📊  MARKET INTELLIGENCE — ${m.location.toUpperCase()}`);
        lines.push(sep);
        lines.push(`  Demand Score     [${bar(m.demandScore)}] ${m.demandScore}/100`);
        lines.push(`  Competition      [${bar(m.competitionScore)}] ${m.competitionScore}/100`);
        lines.push(`  Confidence       [${bar(m.confidenceScore)}] ${m.confidenceScore}/100`);
        lines.push(`  Selling Price    ₹${m.estimatedSellingPrice.min}–₹${m.estimatedSellingPrice.max} ${m.estimatedSellingPrice.currency} (${m.estimatedSellingPrice.basis})`);
        lines.push(`  💡 ${m.recommendation}`);
        if (m.nearbyBusinesses?.length) {
            lines.push(`\n  Nearby Businesses (${m.nearbyBusinesses.length} found):`);
            m.nearbyBusinesses.slice(0, 5).forEach(b => {
                lines.push(`    • ${b.name} (${b.type}) — ${b.distanceKm} km`);
            });
        }
    }
    // ── TOP BUYERS ────────────────────────────────────────────────────
    if (input.buyers?.length) {
        lines.push(`\n🛒  TOP BUYERS (${input.buyers.length} found)`);
        lines.push(sep);
        lines.push(`  ${"#".padEnd(3)} ${"Name".padEnd(28)} ${"Type".padEnd(14)} ${"Dist".padEnd(8)} Est. Revenue`);
        lines.push(`  ${"─".repeat(62)}`);
        input.buyers.slice(0, 5).forEach((b, i) => {
            const rank = `#${b.rank || i + 1}`;
            const name = b.name.slice(0, 27).padEnd(27);
            const type = b.businessType.slice(0, 13).padEnd(13);
            const dist = `${b.distanceKm}km`.padEnd(7);
            const rev = `₹${b.estimatedProfit.toLocaleString("en-IN")}`;
            const src = b.source === "osm" ? "🌍" : "📦";
            lines.push(`  ${rank.padEnd(3)} ${src} ${name} ${type} ${dist} ${rev}`);
        });
    }
    // ── TRANSPORT OPTIONS ─────────────────────────────────────────────
    if (input.transport?.length) {
        lines.push(`\n🚛  TRANSPORT OPTIONS`);
        lines.push(sep);
        lines.push(`  ${"Provider".padEnd(26)} ${"Vehicle".padEnd(16)} ${"Dist".padEnd(8)} Cost`);
        lines.push(`  ${"─".repeat(60)}`);
        input.transport.slice(0, 3).forEach((t, i) => {
            const badge = i === 0 ? "⭐" : "  ";
            const prov = t.provider.slice(0, 25).padEnd(25);
            const vt = t.vehicleType.slice(0, 15).padEnd(15);
            const dist = `${t.distanceKm}km`.padEnd(7);
            lines.push(`  ${badge} ${prov} ${vt} ${dist} ₹${t.estimatedCost.toLocaleString("en-IN")}`);
        });
    }
    // ── SHARED TRANSPORT ──────────────────────────────────────────────
    if (input.sharedTransport?.length) {
        lines.push(`\n🤝  SHARED TRANSPORT (COST-SAVING)`);
        lines.push(sep);
        input.sharedTransport.slice(0, 2).forEach(s => {
            lines.push(`  💰 ${s.provider} — ₹${s.sharedCost} (${s.spareCapacityKg}kg spare capacity)`);
        });
    }
    // ── NEGOTIATION SUMMARY ───────────────────────────────────────────
    if (input.negotiation) {
        const n = input.negotiation;
        lines.push(`\n🤝  NEGOTIATION QUICK VIEW`);
        lines.push(sep);
        lines.push(`  Opening Offer    ₹${n.suggestedOffer}`);
        lines.push(`  Max Acceptable   ₹${n.maxAcceptable}`);
        lines.push(`  Expected Saving  ₹${n.expectedSavings.amount} (${n.expectedSavings.percentage}%)`);
    }
    lines.push(`\n${"═".repeat(w)}\n`);
    return lines.join("\n");
}
/** JSON-serialisable dashboard payload for MCP widget consumers */
export function dashboardJSON(input) {
    return {
        widget: "RecommendationDashboard",
        title: input.title,
        intent: input.intent,
        sections: {
            market: input.market ?? null,
            topBuyers: (input.buyers ?? []).slice(0, 5),
            transport: (input.transport ?? []).slice(0, 3),
            sharedTransport: (input.sharedTransport ?? []).slice(0, 2),
            negotiation: input.negotiation ?? null,
        },
    };
}
//# sourceMappingURL=dashboardRenderer.js.map