import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rates = JSON.parse(
  readFileSync(join(__dirname, "../../config/rates.json"), "utf-8")
) as {
  decisionSupport: {
    nearTieThresholdPercent: number;
    scoringWeights: Record<string, number>;
  };
};

export interface DecisionOption {
  id: string;
  label: string;
  price: number;
  distanceKm: number;
  extraFactors?: Record<string, number | string>; // e.g. {reliability: 4.5, volume: 500}
}

export interface ScoredOption extends DecisionOption {
  score: number;
}

export interface CompareResult {
  recommended: { id: string; label: string; reasoning: string };
  nearTies: Array<{ id: string; label: string; tradeoffNote: string }> | null;
  allOptionsRanked: Array<{ id: string; label: string; score: number; price: number; distanceKm: number }>;
}

/**
 * Normalize a value to 0-1 where lower raw value = higher score (used for price, distance).
 */
function normalizeAscending(value: number, min: number, max: number): number {
  if (max === min) return 1;
  return 1 - (value - min) / (max - min); // lower = better
}

/**
 * Core decision support: compute weighted score, detect near-ties, produce trade-off text.
 * criteria: which factors matter — subset of ["price","distance","reliability","volume"]
 */
export function compareAndRecommend(
  options: DecisionOption[],
  criteria: string[] = ["price", "distance"]
): CompareResult {
  if (!options.length) {
    return {
      recommended: { id: "", label: "No options", reasoning: "No options provided." },
      nearTies: null,
      allOptionsRanked: [],
    };
  }

  const { scoringWeights, nearTieThresholdPercent } = rates.decisionSupport;

  // Build active weight map restricted to requested criteria, then re-normalise so they sum to 1
  const activeWeights: Record<string, number> = {};
  let totalW = 0;
  for (const c of criteria) {
    const w = scoringWeights[c] ?? 0.2;
    activeWeights[c] = w;
    totalW += w;
  }
  for (const c of criteria) activeWeights[c] /= totalW;

  // Pre-compute min/max for normalisation
  const prices = options.map(o => o.price);
  const distances = options.map(o => o.distanceKm);
  const minPrice = Math.min(...prices), maxPrice = Math.max(...prices);
  const minDist = Math.min(...distances), maxDist = Math.max(...distances);

  // Extra numeric factors: reliability (higher = better), volume (higher = better)
  const getExtra = (o: DecisionOption, key: string): number => {
    const v = o.extraFactors?.[key];
    return typeof v === "number" ? v : 0;
  };
  const reliabilities = options.map(o => getExtra(o, "reliability"));
  const volumes = options.map(o => getExtra(o, "volume"));
  const minRel = Math.min(...reliabilities), maxRel = Math.max(...reliabilities);
  const minVol = Math.min(...volumes), maxVol = Math.max(...volumes);

  const scored: ScoredOption[] = options.map(o => {
    let score = 0;
    if (activeWeights["price"])
      score += activeWeights["price"] * normalizeAscending(o.price, minPrice, maxPrice);
    if (activeWeights["distance"])
      score += activeWeights["distance"] * normalizeAscending(o.distanceKm, minDist, maxDist);
    if (activeWeights["reliability"] && maxRel > minRel)
      score += activeWeights["reliability"] * ((getExtra(o, "reliability") - minRel) / (maxRel - minRel));
    if (activeWeights["volume"] && maxVol > minVol)
      score += activeWeights["volume"] * ((getExtra(o, "volume") - minVol) / (maxVol - minVol));
    return { ...o, score: Math.round(score * 100) / 100 };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  // Near-tie detection: options within nearTieThresholdPercent% of top price
  const threshold = top.price * (nearTieThresholdPercent / 100);
  const nearTiedOptions = scored.filter(
    o => o.id !== top.id && Math.abs(o.price - top.price) <= threshold
  );

  const nearTies =
    nearTiedOptions.length > 0
      ? nearTiedOptions.map(o => ({
          id: o.id,
          label: o.label,
          tradeoffNote: buildTradeoffNote(top, o),
        }))
      : null;

  const reasoning = buildReasoning(top, scored, criteria);

  return {
    recommended: { id: top.id, label: top.label, reasoning },
    nearTies,
    allOptionsRanked: scored.map(o => ({
      id: o.id,
      label: o.label,
      score: o.score,
      price: o.price,
      distanceKm: o.distanceKm,
    })),
  };
}

function buildTradeoffNote(top: ScoredOption, other: ScoredOption): string {
  const priceDiff = Math.abs(other.price - top.price);
  const pricePct = ((priceDiff / top.price) * 100).toFixed(1);
  const distDiff = Math.abs(other.distanceKm - top.distanceKm);

  const parts: string[] = [];

  if (other.price < top.price) {
    parts.push(`${other.label} is ₹${priceDiff.toFixed(0)} cheaper (${pricePct}% less)`);
  } else if (other.price > top.price) {
    parts.push(`${other.label} costs ₹${priceDiff.toFixed(0)} more (${pricePct}% higher)`);
  } else {
    parts.push(`${other.label} has the same price`);
  }

  if (other.distanceKm < top.distanceKm) {
    parts.push(`but is ${distDiff.toFixed(0)} km closer`);
  } else if (other.distanceKm > top.distanceKm) {
    parts.push(`but is ${distDiff.toFixed(0)} km farther`);
  }

  const otherRel = other.extraFactors?.["reliability"];
  const topRel = top.extraFactors?.["reliability"];
  if (typeof otherRel === "number" && typeof topRel === "number") {
    if (otherRel > topRel) parts.push(`with higher reliability (${otherRel} vs ${topRel})`);
    else if (otherRel < topRel) parts.push(`with lower reliability (${otherRel} vs ${topRel})`);
  }

  return parts.join(", ") + ".";
}

function buildReasoning(top: ScoredOption, all: ScoredOption[], criteria: string[]): string {
  const criteriaStr = criteria.join(" and ");
  const secondPlace = all[1];
  if (!secondPlace) {
    return `${top.label} is the only option available, selected on ${criteriaStr}.`;
  }
  const margin = ((top.score - secondPlace.score) * 100).toFixed(1);
  return `${top.label} scores highest on ${criteriaStr} (score: ${top.score.toFixed(2)}), beating ${secondPlace.label} by ${margin} points. Price: ₹${top.price.toFixed(2)}, Distance: ${top.distanceKm} km.`;
}
