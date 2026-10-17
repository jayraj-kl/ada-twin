import { describe, expect, it } from "vitest";
import { type FactoryGraph, param } from "@repo/sim";
import { type RunDigest, scoutEquipment } from "@repo/agent";
import { scripted } from "./support";

const plant: FactoryGraph = {
  nodes: [
    { id: "in", kind: "source", name: "Feedwater in", interArrival: param(60, "s") },
    {
      id: "boiler",
      kind: "station",
      name: "Boiler",
      units: param(1, "units"),
      cycleTime: param(50, "s"),
      mtbf: param(4 * 3600, "s"),
      mttr: param(2 * 3600, "s"),
    },
    { id: "out", kind: "sink", name: "Steam out" },
  ],
  edges: [
    { from: "in", to: "boiler" },
    { from: "boiler", to: "out" },
  ],
};

const digest: RunDigest = {
  shipped: 310,
  range: { min: 280, max: 340 },
  days: 5,
  bottleneck: "boiler",
  stations: [{ id: "boiler", working: 0.7, down: 0.21, idle: 0.09, failures: 3 }],
  supports: [],
};

const SOURCE = { url: "https://example.com/softener", title: "Softener guide" };

describe("scoutEquipment", () => {
  it("keeps suggestions that fit the plant, with ids and sourced estimates", async () => {
    const { ask, requests } = scripted(() => ({
      suggestions: [
        {
          kind: "new-support",
          title: "Add a water softener",
          problem: "The boiler was down 21% of the shift with 3 breakdowns.",
          detail: "Scale causes most boiler trips.",
          diffs: [
            { type: "add-support", name: "Water softener", units: 1, neededBy: ["boiler"], mtbf: 400 * 3600, mttr: 1800 },
            { type: "set-param", node: "boiler", param: "mtbf", value: 8 * 3600 },
          ],
          sources: [SOURCE],
        },
        {
          kind: "spares",
          title: "Keep burner spares on the shelf",
          problem: "Each boiler repair took 2 hours.",
          diffs: [{ type: "set-param", node: "boiler", param: "mttr", value: 3600 }],
        },
        {
          kind: "new-station",
          title: "Add a pre-heater",
          problem: "Feedwater arrives cold.",
          diffs: [
            { type: "insert-station", from: "in", to: "boiler", name: "Pre-heater", units: 1, cycleTime: 30 },
            { type: "set-param", node: "boiler", param: "cycleTime", value: 40 },
          ],
        },
      ],
    }));
    const { suggestions, dropped } = await scoutEquipment(ask, {
      graph: plant,
      digest,
      known: ["Add one more boiler"],
    });

    expect(dropped).toEqual([]);
    expect(suggestions.map(({ kind }) => kind)).toEqual(["new-support", "spares", "new-station"]);
    const softener = suggestions[0]!;
    expect(softener.diffs[0]).toMatchObject({
      type: "add-support",
      id: "new-water-softener",
      provenance: { kind: "web", url: SOURCE.url },
    });
    expect(softener.sources).toEqual([SOURCE]);
    expect(suggestions[2]!.diffs[0]).toMatchObject({ id: "new-pre-heater", provenance: { kind: "assumed" } });

    const prompt = requests[0]!.prompt;
    expect(requests[0]!.search).toBe(true);
    expect(prompt).toContain('"boiler" (Boiler): working 70%, down 21%, idle 9%, 3 breakdowns');
    expect(prompt).toContain('"Add one more boiler"');
  });

  it("drops suggestions that do not fit, or are not the kind they claim", async () => {
    const { ask } = scripted(() => ({
      suggestions: [
        // A link that does not exist.
        {
          kind: "new-station",
          title: "Add a filter",
          problem: "x",
          diffs: [{ type: "insert-station", from: "boiler", to: "in", name: "Filter", cycleTime: 10 }],
        },
        // Spares that make repairs slower.
        {
          kind: "spares",
          title: "Slower spares",
          problem: "x",
          diffs: [{ type: "set-param", node: "boiler", param: "mttr", value: 3 * 3600 }],
        },
        // Claims to add equipment, but only tunes a machine.
        {
          kind: "new-support",
          title: "Tune the boiler",
          problem: "x",
          diffs: [{ type: "set-param", node: "boiler", param: "mtbf", value: 9 * 3600 }],
        },
        // Something needed by the sink.
        {
          kind: "new-support",
          title: "Add a pump",
          problem: "x",
          diffs: [{ type: "add-support", name: "Pump", units: 1, neededBy: ["out"] }],
        },
      ],
    }));
    const { suggestions, dropped } = await scoutEquipment(ask, { graph: plant, digest });
    expect(suggestions).toEqual([]);
    expect(dropped).toEqual([
      "Add a filter",
      "Slower spares",
      "Tune the boiler",
      "Add a pump",
    ]);
  });
});
