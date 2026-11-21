import { describe, expect, it } from "vitest";
import { fillParameters } from "@repo/agent";
import { PUMPS, scripted } from "./support";

describe("fillParameters", () => {
  const manual = {
    name: "pump-manual.pdf",
    bytes: new Uint8Array([4]),
    mimeType: "application/pdf",
  };

  it("prefers documents, then the web, then a marked assumption", async () => {
    const { ask, requests } = scripted((request) =>
      request.search
        ? [
            // Already known from the manual, so this must not override it.
            {
              param: "cycleTime",
              value: 999,
              url: "https://ksb.com/a",
              confidence: "datasheet",
            },
            {
              param: "mtbf",
              value: 20000,
              url: "https://example.org/pump-reliability",
              quote: "Typical MTBF for centrifugal pumps is 5 to 6 hours…",
              confidence: "typical",
            },
            // Not a usable source, and not a possible share.
            {
              param: "mttr",
              value: 900,
              url: "a forum post",
              confidence: "typical",
            },
            {
              param: "scrapRate",
              value: 3,
              url: "https://example.org/x",
              confidence: "typical",
            },
          ]
        : [
            { param: "cycleTime", value: 140, page: 11 },
            { param: "rotorDiameter", value: 0.3, page: 2 },
          ],
    );

    const filled = await fillParameters(ask, PUMPS, [manual]);

    expect(filled.params.cycleTime).toEqual({
      value: 140,
      unit: "s",
      provenance: { kind: "doc", document: "pump-manual.pdf", page: 11 },
    });
    expect(filled.params.mtbf.provenance).toEqual({
      kind: "web",
      url: "https://example.org/pump-reliability",
      quote: "Typical MTBF for centrifugal pumps is 5 to 6 hours…",
      confidence: "typical",
    });
    expect(filled.params.mttr.provenance).toEqual({ kind: "assumed" });
    expect(filled.params.scrapRate.provenance).toEqual({ kind: "assumed" });
    expect(filled.assumed).toEqual(["cycleTimeVariation", "mttr", "scrapRate"]);

    // The web was only asked for what the manual did not give.
    const search = requests.find((request) => request.search)!;
    expect(search.prompt).toContain('"mtbf"');
    expect(search.prompt).not.toContain('"cycleTime" (s)');
    expect(search.prompt).toContain("Manufacturer: KSB");
  });

  it("skips the web when the documents cover everything", async () => {
    const { ask, requests } = scripted(() => [
      { param: "cycleTime", value: 140 },
      { param: "cycleTimeVariation", value: 0.2 },
      { param: "mtbf", value: 10800 },
      { param: "mttr", value: 900 },
      { param: "scrapRate", value: 0.01 },
    ]);
    const filled = await fillParameters(ask, PUMPS, [manual]);
    expect(filled.assumed).toEqual([]);
    expect(requests.some((request) => request.search)).toBe(false);
  });

  it("only looks up failure and repair times for auxiliary equipment", async () => {
    const { ask, requests } = scripted((request) =>
      request.search
        ? [
            {
              param: "mtbf",
              value: 50000,
              url: "https://example.org/cabinet",
              confidence: "typical",
            },
          ]
        : [],
    );
    const cabinet = {
      id: "cabinet",
      name: "Control cabinet",
      manufacturer: "Siemens",
      model: "8MF",
      auxiliary: true,
    };
    const filled = await fillParameters(ask, cabinet, [manual]);

    const search = requests.find((request) => request.search)!;
    expect(search.prompt).toContain('"mttr"');
    expect(search.prompt).not.toContain('"cycleTime"');
    expect(search.prompt).not.toContain('"scrapRate"');
    expect(search.prompt).toContain("support equipment");
    expect(filled.params.mtbf.value).toBe(50000);
    expect(filled.assumed).toEqual(["mttr"]);
  });

  it("ranks plant records over datasheets and keeps references as baselines", async () => {
    const pdf = (name: string) => ({
      name,
      bytes: new Uint8Array([1]),
      mimeType: "application/pdf",
    });
    const { ask, requests } = scripted((request) => {
      if (request.search) return [];
      const name = (request.files?.[0] as { name?: string } | undefined)?.name;
      if (name === "datasheet.pdf") {
        return {
          kind: "datasheet",
          values: [
            { param: "mtbf", value: 90000, page: 1, quote: "MTBF 25 h" },
            {
              param: "cycleTime",
              value: 70,
              page: 1,
              quote: "Cycle time: 70 s per batch.",
            },
          ],
        };
      }
      if (name === "log.pdf") {
        return {
          kind: "plant-record",
          values: [
            {
              param: "mtbf",
              value: 21960,
              page: 2,
              quote: "MTBF: 6.1 running hours.",
            },
          ],
        };
      }
      // Not told what it is: the reader judges it a reference sheet.
      return {
        kind: "reference",
        values: [{ param: "mtbf", value: 4.2e9, page: 1, quote: "1,166,025 h" }],
        baselines: [
          {
            param: "mtbf",
            low: 4.2e9,
            high: 7.5e9,
            basis: "calendar",
            page: 1,
            quote: "ranges from 1,166,025 to 2,076,992 calendar hours",
          },
        ],
      };
    });

    const filled = await fillParameters(ask, PUMPS, [
      { ...pdf("datasheet.pdf"), kind: "datasheet" },
      { ...pdf("log.pdf"), kind: "plant-record" },
      pdf("reference.pdf"),
    ]);

    // The plant's own log wins over the maker's figure, and the reference
    // sheet's class figure is never used as the value.
    expect(filled.params.mtbf).toEqual({
      value: 21960,
      unit: "s",
      provenance: {
        kind: "doc",
        document: "log.pdf",
        page: 2,
        quote: "MTBF: 6.1 running hours.",
        documentKind: "plant-record",
      },
    });
    expect(filled.params.cycleTime.provenance).toMatchObject({
      document: "datasheet.pdf",
      documentKind: "datasheet",
    });
    expect(filled.baselines.mtbf).toEqual({
      low: 4.2e9,
      high: 7.5e9,
      unit: "s",
      basis: "calendar",
      document: "reference.pdf",
      page: 1,
      quote: "ranges from 1,166,025 to 2,076,992 calendar hours",
    });
    expect(filled.kinds).toEqual({
      "datasheet.pdf": "datasheet",
      "log.pdf": "plant-record",
      "reference.pdf": "reference",
    });
    // Only the document nobody had classified was asked what it is.
    const asked = requests.filter((request) =>
      request.prompt.includes("Say what the document is"),
    );
    expect(asked).toHaveLength(1);
  });
});
