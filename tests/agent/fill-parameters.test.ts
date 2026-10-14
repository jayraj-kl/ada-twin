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
});
