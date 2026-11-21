import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pdfPages, verifyClaim } from "@repo/agent";
import { type Baseline, COST_RATES, type Param, citationsOf } from "@repo/sim";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCES = join(ROOT, "docs", "demo-packs");
const worlds = readdirSync(SOURCES).filter((world) =>
  existsSync(join(SOURCES, world, "pack.json")),
);

interface Manifest {
  machines: { id: string; name: string; count: number; auxiliary?: boolean }[];
  documents: {
    file: string;
    machine?: string;
    kind: string;
    demo: boolean;
    title: string;
    costs?: boolean;
  }[];
}

interface Recorded {
  machines: Record<
    string,
    { params: Record<string, Param>; baselines: Record<string, Baseline> }
  >;
  costs?: Record<string, { value: number; document: string; page?: number; quote: string }>;
}

const one = (text: string) => Number(text.replaceAll(",", ""));

describe.each(worlds)("the %s pack", (world) => {
  const docs = join(ROOT, "apps", "frontend", "public", "worlds", world, "docs");
  const manifest = JSON.parse(readFileSync(join(docs, "pack.json"), "utf8")) as Manifest;
  const recorded = JSON.parse(
    readFileSync(
      join(ROOT, "apps", "frontend", "src", "twin", "sample-figures", `${world}.json`),
      "utf8",
    ),
  ) as Recorded;

  it("ships every document as a PDF, each machine with a log and a reference", () => {
    for (const { file } of manifest.documents) {
      expect(existsSync(join(docs, file)), file).toBe(true);
    }
    for (const machine of manifest.machines) {
      const kinds = manifest.documents
        .filter((document) => document.machine === machine.id)
        .map(({ kind }) => kind);
      expect(kinds, machine.name).toContain("plant-record");
      expect(kinds, machine.name).toContain("reference");
      if (!machine.auxiliary) expect(kinds, machine.name).toContain("datasheet");
    }
  });

  it("states summaries its work orders add up to", () => {
    for (const file of readdirSync(join(SOURCES, world)).filter((name) =>
      name.endsWith("-log.md"),
    )) {
      const text = readFileSync(join(SOURCES, world, file), "utf8");
      const section = (heading: string) =>
        text.split(`## ${heading}`)[1]!.split("\n## ")[0]!;
      const rows = (heading: string) =>
        section(heading)
          .split("\n")
          .filter((line) => /^\| (?!---|Unit |Work order )/.test(line))
          .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
      const hours = rows("Running hours");
      const orders = rows("Work orders");
      for (const [, start, end, running] of hours) {
        expect(one(end!) - one(start!)).toBeCloseTo(one(running!), 1);
      }
      const running = hours.reduce((sum, row) => sum + one(row[3]!), 0);
      const repairs = orders.reduce((sum, row) => sum + one(row[5]!), 0);
      const summary = section("Summary");
      expect(summary, file).toContain(
        `Summary: ${orders.length} stoppages in ${running.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} running hours`,
      );
      expect(summary, file).toContain(
        `(MTBF): ${(running / orders.length).toFixed(1)} running hours.`,
      );
      expect(summary, file).toContain(
        `(MTTR): ${(repairs / orders.length).toFixed(1)} min.`,
      );
    }
  });

  it("labels every page of every document for what it is", async () => {
    for (const document of manifest.documents) {
      const pages = await pdfPages(new Uint8Array(readFileSync(join(docs, document.file))));
      expect(pages, document.file).not.toBeNull();
      for (const page of pages!) {
        expect(page, document.file).toContain(
          document.demo
            ? "Demo document: fictional plant"
            : "Reference: figures from published sources",
        );
      }
    }
  });

  it("opens with cost rates that each cite a passage of its cost sheet", async () => {
    const sheet = manifest.documents.find((document) => document.costs);
    if (!sheet) return;
    const read = [
      {
        name: sheet.file,
        pages: await pdfPages(new Uint8Array(readFileSync(join(docs, sheet.file)))),
      },
    ];
    expect(Object.keys(recorded.costs ?? {}).sort()).toEqual(
      COST_RATES.map(({ key }) => key).sort(),
    );
    for (const [key, rate] of Object.entries(recorded.costs!)) {
      expect(
        verifyClaim(read, { ...rate, values: [{ value: rate.value, unit: "INR" }] }),
        key,
      ).toMatchObject({ status: "verified" });
    }
  });

  it("opens with figures that each cite a passage that holds", async () => {
    for (const machine of manifest.machines) {
      const figures = recorded.machines[machine.id];
      expect(figures, machine.name).toBeDefined();
      const wanted = machine.auxiliary
        ? ["mtbf", "mttr"]
        : ["cycleTime", "cycleTimeVariation", "mtbf", "mttr", "scrapRate"];
      expect(Object.keys(figures!.params).sort()).toEqual([...wanted].sort());
      expect(Object.keys(figures!.baselines).sort()).toEqual(["mtbf", "mttr"]);

      const read = await Promise.all(
        manifest.documents
          .filter((document) => document.machine === machine.id)
          .map(async ({ file }) => ({
            name: file,
            pages: await pdfPages(new Uint8Array(readFileSync(join(docs, file)))),
          })),
      );
      const citations = citationsOf(figures!.params, figures!.baselines);
      // Every figure cites something: none is a silent assumption.
      expect(citations).toHaveLength(wanted.length + 2);
      for (const citation of citations) {
        expect(
          verifyClaim(read, citation),
          `${machine.name} ${citation.role} ${citation.key}`,
        ).toMatchObject({ status: "verified" });
      }
    }
  });
});
