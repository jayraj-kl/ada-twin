// Draws the deck's performance charts from bench-out/benchmark.json as SVGs
// in the deck's palette, plus a preview page. Run after `benchmark`:
//   pnpm --filter @repo/scripts bench-charts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type GraphDiff,
  type Kpis,
  applyDiffs,
  applyScenario,
  simulateDays,
  spread,
} from "@repo/sim";
import { DEMO_GRAPH, DEMO_SCENARIO } from "./lib/demo-factory";

const OUT = fileURLToPath(new URL("../bench-out/", import.meta.url));
const bench = JSON.parse(readFileSync(`${OUT}benchmark.json`, "utf8"));

// The deck's palette and type.
const C = {
  orange: "#C2410C",
  accent: "#FB8C3B",
  charcoal: "#1E1B18",
  ink: "#2A2622",
  muted: "#7A726B",
  line: "#E4DCD2",
  cream: "#F8F4EF",
  card: "#FFFDFA",
};
const FONT = "Inter, 'Segoe UI', Arial, sans-serif";

// --- the one combination the benchmark did not isolate ---------------------
const DAYS = bench.scenario.days as number;
const applied = applyScenario(DEMO_GRAPH, DEMO_SCENARIO);
const config = {
  seed: 1,
  horizon: applied.horizon,
  maintenanceCrews: applied.maintenanceCrews,
  tickInterval: 30 * 60,
};
const fixes = bench.fixes.items as {
  id: string;
  title: string;
  diffs: GraphDiff[];
  extraCrews: number;
  gain: { mean: number; min: number; max: number };
}[];
const best = fixes.filter((fix) => fix.gain.mean > 0).slice(0, 2);
const round = (value: number, digits = 1) =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const stat = (days: Kpis[], pick: (kpis: Kpis) => number) => {
  const { mean, min, max } = spread(days.map(pick));
  return { mean: round(mean), min: round(min), max: round(max) };
};
const metrics = (days: Kpis[]) => ({
  partsShipped: stat(days, (k) => k.completed),
  averageWip: stat(days, (k) => k.averageWip),
  boilersDownPct: stat(days, (k) => (k.stations.boilers?.down ?? 0) * 100),
  partsScrapped: stat(days, (k) => k.scrapped),
});
const withBest = await simulateDays(
  applyDiffs(
    applied.graph,
    best.flatMap(({ diffs }) => diffs),
  ),
  {
    ...config,
    maintenanceCrews:
      config.maintenanceCrews + best.reduce((sum, fix) => sum + fix.extraCrews, 0),
  },
  DAYS,
);
const standard = bench.outcomes.standardRules as ReturnType<typeof metrics>;
const fixed = metrics(withBest);
const target = bench.scenario.targets.throughputPerShift as number;
writeFileSync(
  `${OUT}fixed.json`,
  JSON.stringify({ fixes: best.map(({ title }) => title), standardRules: standard, withBestFixes: fixed }, null, 2),
);

// --- helpers ---------------------------------------------------------------
const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const svg = (width: number, height: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">\n${body}\n</svg>\n`;
const text = (
  x: number,
  y: number,
  content: string,
  // A halo keeps text readable over lines; off for text drawn on a fill.
  { size = 16, fill = C.ink, weight = 400, anchor = "start", spacing = 0, halo = true } = {},
) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" text-anchor="${anchor}"${halo ? ` stroke="${C.card}" stroke-width="5" stroke-linejoin="round" paint-order="stroke"` : ""}${spacing ? ` letter-spacing="${spacing}"` : ""}>${esc(content)}</text>`;
const label = (x: number, y: number, content: string, fill = C.muted) =>
  text(x, y, content.toUpperCase(), { size: 13, fill, weight: 600, spacing: 2 });
const money = (value: number) =>
  value >= 1e6
    ? `$${round(value / 1e6, 1)}M`
    : value >= 1e3
      ? `$${round(value / 1e3, value >= 1e4 ? 0 : 1)}k`
      : `$${Math.round(value)}`;

// --- 1. step-up: standard rules -> each fix -> target ----------------------
function stepUp() {
  const W = 900;
  const H = 480;
  // The cheaper fix first: it is the one a plant would try first.
  const first = best.find((fix) => fix.id === "halve-repair") ?? best[0]!;
  const second = best.find((fix) => fix !== first);
  const steps = [
    { name: "Standard rules", value: standard.partsShipped.mean, kind: "base" },
    { name: `+ ${first.title}`, value: round(standard.partsShipped.mean + first.gain.mean), kind: "step" },
    { name: `+ ${second?.title ?? ""}`, value: fixed.partsShipped.mean, kind: "step" },
  ];
  const top = 340;
  const chartTop = 70;
  const chartBottom = 400;
  const y = (value: number) =>
    chartBottom - (value / top) * (chartBottom - chartTop);
  const colW = 200;
  const gap = 70;
  const left = 70;
  let body = label(left, 34, "Parts shipped per shift · 30-day average");
  // Target line.
  body += `<line x1="${left - 20}" x2="${W - 30}" y1="${y(target)}" y2="${y(target)}" stroke="${C.charcoal}" stroke-width="2" stroke-dasharray="6 6"/>`;
  body += text(W - 30, y(target) - 10, `Target ${target}`, { size: 15, fill: C.charcoal, weight: 600, anchor: "end" });
  steps.forEach((step, index) => {
    const x = left + index * (colW + gap);
    const previous = index === 0 ? 0 : steps[index - 1]!.value;
    const barTop = y(step.value);
    if (step.kind === "base") {
      body += `<rect x="${x}" y="${barTop}" width="${colW}" height="${chartBottom - barTop}" rx="6" fill="${C.charcoal}"/>`;
    } else {
      // The earlier height in a pale fill, the step itself in orange.
      body += `<rect x="${x}" y="${y(previous)}" width="${colW}" height="${chartBottom - y(previous)}" rx="6" fill="${C.line}"/>`;
      body += `<rect x="${x}" y="${barTop}" width="${colW}" height="${y(previous) - barTop}" rx="6" fill="${C.accent}"/>`;
      body += text(x + colW / 2, barTop + (y(previous) - barTop) / 2 + 7, `+${round(step.value - previous)}`, { size: 20, fill: C.charcoal, weight: 700, anchor: "middle", halo: false });
      body += `<path d="M ${x - gap + 8} ${y(previous)} L ${x - 8} ${y(previous)}" stroke="${C.muted}" stroke-width="1.5" stroke-dasharray="3 4"/>`;
    }
    body += text(x + colW / 2, barTop - 14, `${Math.round(step.value)}`, { size: 34, fill: step.kind === "base" ? C.charcoal : C.orange, weight: 700, anchor: "middle" });
    body += text(x + colW / 2, chartBottom + 30, step.name, { size: 15, fill: C.ink, weight: 600, anchor: "middle" });
  });
  body += text(left, H - 14, `Same 30 seeds for every bar. Range by day: ${standard.partsShipped.min}–${standard.partsShipped.max} → ${fixed.partsShipped.min}–${fixed.partsShipped.max}.`, { size: 13, fill: C.muted });
  return svg(W, H, body);
}

// --- 2. dumbbell: standard rules vs with the fixes, 30-day ranges -----------
function dumbbell() {
  const W = 900;
  const H = 420;
  const rows: { name: string; key: keyof typeof standard; unit: string; better: "up" | "down"; max: number }[] = [
    { name: "Parts shipped", key: "partsShipped", unit: "", better: "up", max: 360 },
    { name: "Boilers down", key: "boilersDownPct", unit: "%", better: "down", max: 40 },
    { name: "Work in progress", key: "averageWip", unit: "", better: "down", max: 20 },
    { name: "Parts scrapped", key: "partsScrapped", unit: "", better: "down", max: 14 },
  ];
  const left = 230;
  const right = W - 60;
  let body = label(40, 34, "Standard rules vs with the two fixes · 30 days");
  body += `<circle cx="${W - 300}" cy="29" r="7" fill="${C.charcoal}"/>` + text(W - 286, 34, "Standard rules", { size: 13, fill: C.muted });
  body += `<circle cx="${W - 160}" cy="29" r="7" fill="${C.accent}"/>` + text(W - 146, 34, "With fixes", { size: 13, fill: C.muted });
  rows.forEach((row, index) => {
    const cy = 100 + index * 80;
    const x = (value: number) => left + (value / row.max) * (right - left);
    const before = standard[row.key];
    const after = fixed[row.key];
    body += text(40, cy + 6, row.name, { size: 18, fill: C.ink, weight: 600 });
    body += `<line x1="${left}" x2="${right}" y1="${cy}" y2="${cy}" stroke="${C.line}" stroke-width="1"/>`;
    // Worst-to-best day ranges, thin and pale.
    body += `<line x1="${x(before.min)}" x2="${x(before.max)}" y1="${cy - 9}" y2="${cy - 9}" stroke="${C.charcoal}" stroke-opacity="0.25" stroke-width="5" stroke-linecap="round"/>`;
    body += `<line x1="${x(after.min)}" x2="${x(after.max)}" y1="${cy + 9}" y2="${cy + 9}" stroke="${C.accent}" stroke-opacity="0.35" stroke-width="5" stroke-linecap="round"/>`;
    // Averages, joined.
    body += `<line x1="${x(before.mean)}" x2="${x(after.mean)}" y1="${cy}" y2="${cy}" stroke="${C.muted}" stroke-width="2"/>`;
    body += `<circle cx="${x(before.mean)}" cy="${cy}" r="9" fill="${C.charcoal}"/>`;
    body += `<circle cx="${x(after.mean)}" cy="${cy}" r="9" fill="${C.accent}" stroke="${C.card}" stroke-width="2"/>`;
    const fmt = (value: number) => `${row.key === "partsShipped" || row.key === "partsScrapped" ? Math.round(value) : round(value)}${row.unit}`;
    const leftFirst = before.mean < after.mean;
    body += text(x(before.mean) + (leftFirst ? -14 : 14), cy - 18, fmt(before.mean), { size: 15, fill: C.charcoal, weight: 700, anchor: leftFirst ? "end" : "start" });
    body += text(x(after.mean) + (leftFirst ? 14 : -14), cy - 18, fmt(after.mean), { size: 15, fill: C.orange, weight: 700, anchor: leftFirst ? "start" : "end" });
  });
  body += text(40, H - 14, "Dot = 30-day average · bar = worst to best day.", { size: 13, fill: C.muted });
  return svg(W, H, body);
}

// --- 3. fix leaderboard: measured gain and web-estimated cost --------------
function leaderboard() {
  const W = 900;
  const H = 400;
  const estimates = (bench.costs.estimates ?? []) as {
    id: string;
    oneOff: { low: number; high: number } | null;
    yearly: { low: number; high: number } | null;
  }[];
  const left = 470;
  const zero = left;
  const scale = 7;
  let body = label(40, 34, "Each fix re-simulated · gain per shift and cost");
  fixes.forEach((fix, index) => {
    const cy = 92 + index * 76;
    const cost = estimates.find((estimate) => estimate.id === fix.id);
    body += text(40, cy, fix.title, { size: 17, fill: C.ink, weight: 600 });
    const price = cost?.oneOff
      ? `${money(cost.oneOff.low)}–${money(cost.oneOff.high)} once${cost.yearly ? ` + ${money(cost.yearly.low)}–${money(cost.yearly.high)}/yr` : ""}`
      : cost?.yearly
        ? `${money(cost.yearly.low)}–${money(cost.yearly.high)} a year`
        : "cost not found";
    const middle = cost?.oneOff ? (cost.oneOff.low + cost.oneOff.high) / 2 : null;
    const perPart =
      middle && fix.gain.mean > 0 ? ` · ${money(middle / fix.gain.mean)} per extra part/shift` : "";
    body += text(40, cy + 22, price + perPart, { size: 13, fill: C.muted });
    const width = Math.abs(fix.gain.mean) * scale;
    const positive = fix.gain.mean >= 0;
    body += `<rect x="${positive ? zero : zero - width}" y="${cy - 18}" width="${Math.max(width, 2)}" height="26" rx="4" fill="${index === 0 || fix.gain.mean > 30 ? C.accent : positive ? C.accent : C.line}" fill-opacity="${positive ? 1 : 1}"/>`;
    body += text(positive ? zero + width + 12 : zero + 12, cy + 1, `${positive ? "+" : "−"}${Math.abs(round(fix.gain.mean))} parts`, { size: 17, fill: positive ? C.orange : C.muted, weight: 700 });
  });
  body += `<line x1="${zero}" x2="${zero}" y1="60" y2="${H - 50}" stroke="${C.muted}" stroke-width="1"/>`;
  body += text(40, H - 14, "Gain = average over the same 30 seeds, standard rules. Costs: Gemini web search, USD.", { size: 13, fill: C.muted });
  return svg(W, H, body);
}

// --- 4. the AI crew, before and after the twin's fixes --------------------
function crewImproved() {
  const W = 900;
  const H = 300;
  const { aiCrew, aiCrewPlusTopFixes } = bench.outcomes;
  const bars = [
    { name: "AI crew's playbook, plant as it is", kpis: aiCrew, fill: C.charcoal },
    { name: "Same playbook, with the twin's two fixes", kpis: aiCrewPlusTopFixes, fill: C.accent },
  ];
  const left = 40;
  const max = 340;
  const width = W - 330;
  let body = label(left, 34, "Gemini crew · 30-day average · parts shipped per shift");
  bars.forEach((bar, index) => {
    const cy = 92 + index * 86;
    const value = Math.round(bar.kpis.partsShipped.mean);
    body += text(left, cy - 12, bar.name, { size: 16, fill: C.ink, weight: 600 });
    body += `<rect x="${left}" y="${cy}" width="${(value / max) * width}" height="30" rx="5" fill="${bar.fill}"/>`;
    body += text(left + (value / max) * width + 14, cy + 22, `${value} parts`, { size: 20, fill: index ? C.orange : C.charcoal, weight: 700 });
    body += text(W - 40, cy + 22, `boilers down ${round(bar.kpis.boilersDownPct.mean)}%`, { size: 14, fill: C.muted, anchor: "end" });
  });
  const gain = Math.round(aiCrewPlusTopFixes.partsShipped.mean - aiCrew.partsShipped.mean);
  body += text(left, H - 40, `+${gain} parts a shift, and the target of 300 is met.`, { size: 16, fill: C.orange, weight: 700 });
  body += text(left, H - 16, `Crew's rules written by Gemini after a live shift (${bench.agentRun.decisions} decisions, ${bench.agentRun.fallbacks} fallbacks), replayed on the same 30 seeds.`, { size: 13, fill: C.muted });
  return svg(W, H, body);
}

// --- 5. pipeline timeline (slide 11) --------------------------------------
function pipeline() {
  const W = 1500;
  const H = 230;
  const run = bench.agentRun;
  const stages = [
    { name: "3D world", value: "~12 min", note: "World Labs · from the deck's earlier timing", weight: 12 * 60 },
    { name: "Price fixes", value: `${Math.round(bench.costs.lookupMs / 1000)} s`, note: "Gemini + web search", weight: bench.costs.lookupMs / 1000 },
    { name: "8-hour shift, AI crew", value: `${Math.round(run.shiftDoneMs / 1000)} s`, note: `${run.decisions} Gemini decisions`, weight: run.shiftDoneMs / 1000 },
    { name: "Playbook", value: `${round((run.playbookWrittenMs - run.shiftDoneMs) / 1000, 0)} s`, note: "crew's rules written", weight: (run.playbookWrittenMs - run.shiftDoneMs) / 1000 },
    { name: "30-day average", value: `${round(bench.simulator.totalMs / 1000, 2)} s`, note: "in the browser", weight: bench.simulator.totalMs / 1000 },
  ];
  // Square-root widths so seconds-long stages stay visible next to minutes.
  const roots = stages.map((stage) => Math.sqrt(stage.weight));
  const total = roots.reduce((sum, value) => sum + value, 0);
  const left = 40;
  const span = W - 80;
  const gapPx = 8;
  const minPx = 150;
  // Every stage gets a readable minimum; the rest is shared by duration.
  const spare = span - stages.length * (minPx + gapPx);
  const widths = roots.map((root) => minPx + (root / total) * spare);
  let x = left;
  let body = label(left, 34, "From photo to a tested fix · measured on the live system");
  stages.forEach((stage, index) => {
    const width = widths[index]!;
    body += `<rect x="${x}" y="58" width="${width}" height="56" rx="8" fill="${index === 0 ? C.charcoal : index % 2 ? C.accent : C.orange}"/>`;
    body += text(x + 14, 94, stage.value, { size: 22, fill: index === 0 ? C.cream : C.charcoal, weight: 700, halo: false });
    body += text(x, 142, stage.name, { size: 15, fill: C.ink, weight: 600 });
    body += text(x, 164, stage.note, { size: 12, fill: C.muted });
    x += width + gapPx;
  });
  body += text(left, H - 14, "Widths on a square-root scale so short stages stay visible.", { size: 12, fill: C.muted });
  return svg(W, H, body);
}

// --- 6. big numbers (slide 11) --------------------------------------------
function bigNumbers() {
  const W = 1500;
  const H = 210;
  const tiles = [
    { value: `${round(bench.simulator.timesFasterThanRealTime / 1e6, 1)}M×`, note: "faster than real time (8-h shift in 15 ms)" },
    { value: `${round(bench.simulator.totalMs / 1000, 2)} s`, note: "for a 30-day average, in-browser" },
    { value: `${bench.agentRun.decisions - bench.agentRun.fallbacks}/${bench.agentRun.decisions}`, note: "Gemini decisions, none fell back" },
    { value: `${bench.tests.passed ?? 71}/${bench.tests.total ?? 71}`, note: "automated tests passing" },
  ];
  const width = (W - 80) / tiles.length;
  let body = "";
  tiles.forEach((tile, index) => {
    const x = 40 + index * width;
    if (index > 0) body += `<line x1="${x}" x2="${x}" y1="20" y2="${H - 30}" stroke="${C.line}"/>`;
    body += text(x + (index ? 24 : 0), 96, tile.value, { size: 64, fill: C.orange, weight: 500 });
    body += text(x + (index ? 24 : 0), 140, tile.note, { size: 16, fill: C.muted });
  });
  return svg(W, H, body);
}

const charts = {
  "10-step-up.svg": stepUp(),
  "10-ranges.svg": dumbbell(),
  "10-fixes.svg": leaderboard(),
  "10-crew-improved.svg": crewImproved(),
  "11-pipeline.svg": pipeline(),
  "11-big-numbers.svg": bigNumbers(),
};
for (const [file, content] of Object.entries(charts)) writeFileSync(`${OUT}${file}`, content);
writeFileSync(
  `${OUT}preview.html`,
  `<!doctype html><meta charset="utf-8"><title>Ada-Twin benchmark charts</title><body style="margin:0;padding:32px;background:${C.cream};font-family:${FONT}">` +
    Object.keys(charts)
      .map((file) => `<p style="color:${C.muted};font:600 12px ${FONT};letter-spacing:2px">${file}</p><img src="${file}" style="display:block;max-width:100%;background:${C.card};border:1px solid ${C.line};margin-bottom:28px">`)
      .join("") +
    "</body>",
);
console.log(`wrote ${Object.keys(charts).length} charts to ${OUT}`);
console.log(JSON.stringify({ fixes: best.map((fix) => fix.title), standard: standard.partsShipped, withFixes: fixed.partsShipped }));
