import { describe, expect, it } from "vitest";
import { BOILERS, PANORAMA, PUMPS, scripted } from "./support";
import { draftFlow } from "@repo/agent";

describe("draftFlow", () => {
  it("keeps the sound links and drops the ones that cannot be", async () => {
    const { ask, requests } = scripted(() => ({
      nodes: [
        { id: "in", kind: "source", name: "Intake" },
        { id: "out", kind: "sink", name: "Dispatch" },
        // Clashes with a machine, so it is not a new node.
        { id: "pumps", kind: "buffer", name: "Pump rack" },
      ],
      edges: [
        { from: "in", to: "pumps" },
        { from: "pumps", to: "boilers" },
        { from: "boilers", to: "out" },
        { from: "boilers", to: "out" },
        { from: "out", to: "pumps" },
        { from: "pumps", to: "in" },
        { from: "pumps", to: "pumps" },
        { from: "boilers", to: "chiller" },
      ],
      note: "No buffer mentioned",
    }));

    const draft = await draftFlow(
      ask,
      PANORAMA,
      [PUMPS, BOILERS],
      "Water goes from the pumps to the boilers.",
    );

    expect(draft).toEqual({
      nodes: [
        { id: "in", kind: "source", name: "Intake" },
        { id: "out", kind: "sink", name: "Dispatch" },
      ],
      edges: [
        { from: "in", to: "pumps" },
        { from: "pumps", to: "boilers" },
        { from: "boilers", to: "out" },
      ],
      note: "No buffer mentioned",
    });
    expect(requests[0]!.prompt).toContain(
      "Water goes from the pumps to the boilers.",
    );
  });
});
