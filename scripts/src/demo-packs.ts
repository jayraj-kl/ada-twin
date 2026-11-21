/**
 * Builds a demo world's document pack: writes its stoppage logs from a seeded
 * generator, renders every document in docs/demo-packs/<world>/ to PDF, and
 * writes the PDFs and their manifest to the world's public folder.
 *
 *   pnpm --filter @repo/scripts demo-packs boiler
 *
 * The PDFs are committed; builds never run this.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { chromium } from "playwright";
import { main } from "./lib/cli";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

interface PackDocument {
  file: string;
  machine?: string;
  title: string;
  kind: "overview" | "plant-record" | "datasheet" | "reference";
  demo: boolean;
  /** The plant's cost sheet, which the cost rates are read from. */
  costs?: boolean;
}

interface LogSpec {
  file: string;
  machine: string;
  units: string[];
  mtbfHours: number;
  mttrMinutes: number;
  seed: number;
  faults: string[];
}

interface Pack {
  world: string;
  title: string;
  plant: string;
  machines: { id: string; name: string; count: number; auxiliary?: boolean }[];
  window: { start: string; weeks: number; shiftStart: number; shiftHours: number };
  documents: PackDocument[];
  logs: LogSpec[];
}

// --- the stoppage logs --------------------------------------------------------

/** A small seeded generator, so a log comes out the same every time. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const one = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** A month of a worn machine's stoppages, as its work orders would list them. */
export function stoppageLog(pack: Pack, spec: LogSpec): string {
  const next = random(spec.seed);
  const normal = () =>
    Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  const { shiftStart, shiftHours, weeks } = pack.window;
  const shifts = weeks * 5;
  const span = shifts * shiftHours;
  const start = new Date(`${pack.window.start}T00:00:00Z`);

  const rows: { at: number; unit: string; fault: string; minutes: number }[] = [];
  const hours = spec.units.map((unit) => {
    let clock = 0;
    let repairs = 0;
    for (;;) {
      clock += -Math.log(1 - next()) * spec.mtbfHours;
      if (clock >= span) break;
      // Log-normal repairs around the mean, as repair times usually are.
      const minutes = Math.max(
        5,
        Math.round(spec.mttrMinutes * Math.exp(0.6 * normal() - 0.18)),
      );
      rows.push({
        at: clock,
        unit,
        fault: spec.faults[Math.floor(next() * spec.faults.length)]!,
        minutes,
      });
      repairs += minutes / 60;
      clock += minutes / 60;
    }
    const running = Math.round((span - Math.min(repairs, span)) * 10) / 10;
    const meter = Math.round((20_000 + next() * 25_000) * 10) / 10;
    return { unit, meter, running };
  });
  rows.sort((a, b) => a.at - b.at);

  const failures = rows.length;
  const running = hours.reduce((sum, { running }) => sum + running, 0);
  const mtbf = running / failures;
  const mttr = rows.reduce((sum, { minutes }) => sum + minutes, 0) / failures;
  const end = new Date(start.getTime() + ((weeks - 1) * 7 + 4) * 86_400_000);
  const when = (at: number) => {
    const shift = Math.floor(at / shiftHours);
    const date = new Date(
      start.getTime() + (Math.floor(shift / 5) * 7 + (shift % 5)) * 86_400_000,
    );
    const minutes = Math.floor((shiftStart + (at % shiftHours)) * 60);
    const clock = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    return { day: DAY.format(date).replace(",", ""), clock };
  };
  const month = start.toISOString().slice(2, 4) + start.toISOString().slice(5, 7);

  return [
    `# ${spec.machine}: stoppage log`,
    "",
    `${pack.plant} ${pack.title.toLowerCase()} · Work orders ${DAY.format(start).replace(",", "")} to ${DAY.format(end).replace(",", "")} · One ${shiftHours}-hour shift a day, 5 days a week`,
    "",
    "Every stop that needed a technician is a work order. Repair time runs from the technician starting work to the unit running again.",
    "",
    "## Running hours",
    "",
    "| Unit | Hour meter at start (h) | Hour meter at end (h) | Running hours |",
    "| --- | ---: | ---: | ---: |",
    ...hours.map(
      ({ unit, meter, running }) =>
        `| ${unit} | ${one(meter)} | ${one(meter + running)} | ${one(running)} |`,
    ),
    "",
    "## Work orders",
    "",
    "| Work order | Date | Stopped at | Unit | Fault | Repair (min) |",
    "| --- | --- | --- | --- | --- | ---: |",
    ...rows.map((row, index) => {
      const { day, clock } = when(row.at);
      return `| WO-${month}-${String(index + 1).padStart(4, "0")} | ${day} | ${clock} | ${row.unit} | ${row.fault} | ${row.minutes} |`;
    }),
    "",
    "## Summary",
    "",
    `Summary: ${failures} stoppages in ${one(running)} running hours across ${spec.units.length === 1 ? "1 unit" : `${spec.units.length} units`}.`,
    "",
    `Mean time between failures (MTBF): ${one(mtbf)} running hours.`,
    "",
    `Mean time to repair (MTTR): ${one(mttr)} min.`,
    "",
    "MTBF counts running hours only: hour-meter time while a unit was running, divided by the number of stoppages.",
    "",
  ].join("\n");
}

// --- rendering ----------------------------------------------------------------

const STYLE = `
  body { font: 10.5pt/1.45 "Segoe UI", Arial, sans-serif; color: #1a1a17; }
  h1 { font-size: 17pt; margin: 0 0 6pt; }
  h2 { font-size: 12pt; margin: 16pt 0 6pt; border-bottom: 1px solid #ccc; padding-bottom: 2pt; }
  p { margin: 0 0 7pt; }
  table { border-collapse: collapse; width: 100%; margin: 4pt 0 10pt; font-size: 9pt; }
  th, td { border: 1px solid #c9c9c3; padding: 3pt 5pt; text-align: left; }
  th { background: #efeee9; }
  td[align="right"], th[align="right"] { text-align: right; }
  tr { break-inside: avoid; }
`;

function band(text: string, color: string) {
  return `<div style="width:100%;font:8pt Arial,sans-serif;color:${color};padding:0 14mm;display:flex;justify-content:space-between"><span style="font-weight:600">${text}</span></div>`;
}

await main(async () => {
  const world = process.argv[2];
  if (!world) throw new Error("Name the world: demo-packs <world>");
  const source = join(ROOT, "docs", "demo-packs", world);
  const out = join(ROOT, "apps", "frontend", "public", "worlds", world, "docs");
  const pack = JSON.parse(await readFile(join(source, "pack.json"), "utf8")) as Pack;

  for (const spec of pack.logs) {
    await writeFile(join(source, spec.file), stoppageLog(pack, spec));
    console.log(`wrote ${spec.file}`);
  }

  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const document of pack.documents) {
      const markdown = await readFile(join(source, document.file), "utf8");
      const body = await marked.parse(markdown);
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><title>${document.title}</title><style>${STYLE}</style></head><body>${body}</body></html>`,
      );
      const label = document.demo
        ? "Demo document: fictional plant"
        : "Reference: figures from published sources";
      const pdf = document.file.replace(/\.md$/, ".pdf");
      await page.pdf({
        path: join(out, pdf),
        format: "A4",
        margin: { top: "20mm", bottom: "18mm", left: "16mm", right: "16mm" },
        displayHeaderFooter: true,
        headerTemplate: band(label, document.demo ? "#a3420f" : "#1f5f8b"),
        footerTemplate: `<div style="width:100%;font:8pt Arial,sans-serif;color:#666;padding:0 14mm;display:flex;justify-content:space-between"><span>${document.title}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
      });
      console.log(`rendered ${pdf}`);
    }
  } finally {
    await browser.close();
  }

  await writeFile(
    join(out, "pack.json"),
    `${JSON.stringify(
      {
        world: pack.world,
        title: pack.title,
        plant: pack.plant,
        machines: pack.machines,
        documents: pack.documents.map(({ file, ...rest }) => ({
          file: file.replace(/\.md$/, ".pdf"),
          ...rest,
        })),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`wrote ${join(out, "pack.json")}`);
});
