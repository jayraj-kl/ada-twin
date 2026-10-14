import { describe, expect, it } from "vitest";
import { BOILERS, PANORAMA, PUMPS, scripted } from "./support";
import { locateMachines } from "@repo/agent";

describe("locateMachines", () => {
  it("turns the model's points into image positions", async () => {
    const { ask, requests } = scripted(() => [
      {
        id: "pumps",
        points: [
          [700, 220],
          [690, 300],
          [680, 380],
        ],
        note: "blue plinths, left wall",
      },
      { id: "boilers", points: [], note: "behind the cabinets" },
    ]);

    const placements = await locateMachines(ask, PANORAMA, [PUMPS, BOILERS]);

    expect(placements).toEqual([
      {
        id: "pumps",
        // One per unit, and no more than the machine's count of 2.
        points: [
          [0.22, 0.7],
          [0.3, 0.69],
        ],
        note: "blue plinths, left wall",
      },
      { id: "boilers", points: [], note: "behind the cabinets" },
    ]);
    expect(requests[0]!.files).toEqual([PANORAMA]);
    expect(requests[0]!.prompt).toContain(
      'id "pumps": Feed pumps (centrifugal pump), count 2',
    );
  });

  it("leaves a machine unplaced when the answer skips it or is off the image", async () => {
    const { ask } = scripted(
      () => 'Here you go:\n```json\n[{"id":"pumps","points":[[1400,10]]}]\n```',
    );
    const placements = await locateMachines(ask, PANORAMA, [PUMPS, BOILERS]);
    expect(placements.map((placement) => placement.points)).toEqual([[], []]);
  });
});
