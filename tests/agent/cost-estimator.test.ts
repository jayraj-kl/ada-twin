import { describe, expect, it } from "vitest";
import { estimateCosts } from "@repo/agent";
import { PUMPS, scripted } from "./support";

const changes = [
  {
    id: "units-pumps",
    title: "Add one more unit to Feed pumps",
    detail: "Feed pumps has the least spare capacity.",
    machine: PUMPS,
  },
  {
    id: "crew",
    title: "Add a maintenance crew",
    detail: "A second crew only helps when breakdowns queue.",
  },
];

describe("estimateCosts", () => {
  it("searches once for every change, naming the machine it alters", async () => {
    const { ask, requests } = scripted(() => []);
    await estimateCosts(ask, changes, { currency: "EUR" });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.search).toBe(true);
    expect(requests[0]!.prompt).toContain("EUR");
    expect(requests[0]!.prompt).toContain("KSB");
    expect(requests[0]!.prompt).toContain('id "crew"');
  });

  it("keeps real sources, and orders a range given backwards", async () => {
    const { ask } = scripted(() => [
      {
        id: "units-pumps",
        oneOff: { low: 14000, high: 9000 },
        yearly: null,
        basis: "One Etanorm 065 with motor, installed.",
        sources: [
          { url: "https://example.org/etanorm-price", title: "Price list" },
          { url: "a catalogue" },
        ],
      },
      {
        id: "crew",
        oneOff: null,
        yearly: { low: 55000, high: 70000 },
        basis: "One maintenance technician's yearly wage.",
        sources: [],
      },
      // Nothing was asked about this one.
      { id: "paint", oneOff: { low: 1, high: 2 }, basis: "", sources: [] },
    ]);

    const estimates = await estimateCosts(ask, changes);

    expect(estimates).toEqual([
      {
        id: "units-pumps",
        currency: "USD",
        oneOff: { low: 9000, high: 14000 },
        yearly: null,
        basis: "One Etanorm 065 with motor, installed.",
        sources: [
          { url: "https://example.org/etanorm-price", title: "Price list" },
        ],
      },
      {
        id: "crew",
        currency: "USD",
        oneOff: null,
        yearly: { low: 55000, high: 70000 },
        basis: "One maintenance technician's yearly wage.",
        sources: [],
      },
    ]);
  });

  it("asks nothing when there is nothing to price", async () => {
    const { ask, requests } = scripted(() => []);
    expect(await estimateCosts(ask, [])).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});
