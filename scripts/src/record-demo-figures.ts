/**
 * Records the figures a demo world opens with: runs the document-reader on
 * each machine's pack, exactly as "Find its parameters" would, verifies every
 * citation it returns against the PDFs, and writes the result for the sample
 * seed. Run after `demo-packs`, and review the printout before committing.
 *
 *   pnpm --filter @repo/scripts record-demo-figures boiler
 *
 * Reads the model key from apps/api/.env.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type MachineDocument,
  createGeminiModel,
  fillParameters,
  pdfPages,
  readCostRates,
  textModelId,
  verifyClaim,
} from "@repo/agent";
import { COST_RATES, type DocumentKind, citationsOf } from "@repo/sim";
import { main } from "./lib/cli";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

interface Manifest {
  world: string;
  machines: { id: string; name: string; count: number; auxiliary?: boolean }[];
  documents: {
    file: string;
    machine?: string;
    title: string;
    kind: DocumentKind;
    demo: boolean;
    /** The plant's cost sheet, which the cost rates are read from. */
    costs?: boolean;
  }[];
}

await main(async () => {
  const world = process.argv[2];
  if (!world) throw new Error("Name the world: record-demo-figures <world>");
  const dir = join(ROOT, "apps", "frontend", "public", "worlds", world, "docs");
  const manifest = JSON.parse(
    await readFile(join(dir, "pack.json"), "utf8"),
  ) as Manifest;
  const ask = createGeminiModel();

  const out = join(ROOT, "apps", "frontend", "src", "twin", "sample-figures");
  const file = join(out, `${world}.json`);
  // --costs-only keeps the machines' recorded figures and reads the costs again.
  const costsOnly = process.argv.includes("--costs-only");
  const previous = costsOnly
    ? (JSON.parse(await readFile(file, "utf8")) as {
        model: string;
        recordedAt: string;
        machines: Record<string, unknown>;
      })
    : null;

  const machines: Record<string, unknown> = previous?.machines ?? {};
  let failed = 0;
  for (const machine of costsOnly ? [] : manifest.machines) {
    const documents: MachineDocument[] = await Promise.all(
      manifest.documents
        .filter((document) => document.machine === machine.id)
        .map(async (document) => ({
          name: document.file,
          bytes: new Uint8Array(await readFile(join(dir, document.file))),
          mimeType: "application/pdf",
          kind: document.kind,
        })),
    );
    const filled = await fillParameters(ask, machine, documents);
    const read = await Promise.all(
      documents.map(async ({ name, bytes }) => ({
        name,
        pages: await pdfPages(bytes),
      })),
    );

    console.log(`\n${machine.name}`);
    const wanted = machine.auxiliary ? ["mtbf", "mttr"] : Object.keys(filled.params);
    for (const key of wanted) {
      const param = filled.params[key as keyof typeof filled.params];
      const source = param.provenance;
      console.log(
        `  ${key.padEnd(18)} ${String(param.value).padStart(12)} ${param.unit.padEnd(5)} ${source.kind === "doc" ? `${source.document} p.${source.page ?? "?"} "${source.quote ?? ""}"` : source.kind}`,
      );
    }
    for (const citation of citationsOf(
      Object.fromEntries(wanted.map((key) => [key, filled.params[key as keyof typeof filled.params]])),
      filled.baselines,
    )) {
      const verdict = verifyClaim(read, citation);
      if (verdict.status !== "verified") failed++;
      console.log(
        `  ${verdict.status === "verified" ? "✓" : "✗"} ${citation.role} ${citation.key}${verdict.status === "verified" ? "" : `: ${verdict.reason}`}`,
      );
    }
    const missing = wanted.filter(
      (key) => filled.params[key as keyof typeof filled.params].provenance.kind !== "doc",
    );
    if (missing.length > 0) {
      failed++;
      console.log(`  ✗ not read from the pack: ${missing.join(", ")}`);
    }
    machines[machine.id] = {
      params: Object.fromEntries(
        wanted.map((key) => [key, filled.params[key as keyof typeof filled.params]]),
      ),
      baselines: filled.baselines,
    };
  }

  // The plant's cost rates, from its cost sheet.
  const costs: Record<string, unknown> = {};
  const sheet = manifest.documents.find((document) => document.costs);
  if (sheet) {
    const bytes = new Uint8Array(await readFile(join(dir, sheet.file)));
    const rates = await readCostRates(ask, {
      name: sheet.file,
      bytes,
      mimeType: "application/pdf",
    });
    const read = [{ name: sheet.file, pages: await pdfPages(bytes) }];
    console.log("\nCost rates");
    for (const { key } of COST_RATES) {
      const rate = rates[key];
      if (!rate) {
        failed++;
        console.log(`  ✗ ${key}: not read from ${sheet.file}`);
        continue;
      }
      const verdict = verifyClaim(read, {
        ...rate,
        values: [{ value: rate.value, unit: "INR" }],
      });
      if (verdict.status !== "verified") failed++;
      console.log(
        `  ${verdict.status === "verified" ? "✓" : "✗"} ${key.padEnd(20)} ₹${rate.value} p.${rate.page ?? "?"} "${rate.quote}"${verdict.status === "verified" ? "" : `: ${verdict.reason}`}`,
      );
      costs[key] = rate;
    }
  }

  await mkdir(out, { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify(
      {
        world,
        model: previous?.model ?? textModelId(),
        recordedAt: previous?.recordedAt ?? new Date().toISOString().slice(0, 10),
        machines,
        ...(sheet
          ? { costs, costsRecordedAt: new Date().toISOString().slice(0, 10) }
          : {}),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nwrote sample-figures/${world}.json`);
  if (failed > 0) {
    throw new Error(`${failed} figure(s) did not verify: fix the pack or re-run before committing`);
  }
});
