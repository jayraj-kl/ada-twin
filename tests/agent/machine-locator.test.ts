import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { BOILERS, PANORAMA, PUMPS, scripted } from "./support";
import {
  type PanoramaView,
  locateInViews,
  locateMachines,
  splitPanorama,
} from "@repo/agent";

describe("locateMachines", () => {
  // PANORAMA is not a real image, so these take the whole-panorama path.
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

describe("locateInViews", () => {
  // Two level views a quarter-turn wide, the second turned 45° right: a unit
  // 22.5° right of centre is in both, at mirrored spots.
  const views: PanoramaView[] = [0, 45].map((yaw) => ({
    file: { bytes: new Uint8Array([yaw]), mimeType: "image/jpeg" },
    yaw,
    pitch: 0,
    fov: 90,
  }));
  const shared = Math.round(500 + 500 * Math.tan(Math.PI / 8));

  it("merges one unit seen by two views into one point", async () => {
    const { ask, requests } = scripted(({ files }) =>
      files![0]!.bytes[0] === 0
        ? [{ id: "pumps", points: [[500, shared]], note: "by the wall" }]
        : [{ id: "pumps", points: [[500, 1000 - shared]] }],
    );

    const [pumps] = await locateInViews(ask, views, [PUMPS]);

    expect(requests).toHaveLength(2);
    expect(pumps!.points).toHaveLength(1);
    expect(pumps!.points[0]![0]).toBeCloseTo(0.5 + 22.5 / 360, 2);
    expect(pumps!.points[0]![1]).toBeCloseTo(0.5, 2);
    expect(pumps!.note).toBe("by the wall");
  });

  it("keeps the units most views agree on, up to the machine's count", async () => {
    const { ask } = scripted(({ files }) =>
      files![0]!.bytes[0] === 0
        ? // The shared unit, and one only this view claims, near its edge.
          [
            {
              id: "pumps",
              points: [
                [500, shared],
                [500, 50],
              ],
            },
          ]
        : // The shared unit, and one only this view claims, dead centre.
          [
            {
              id: "pumps",
              points: [
                [500, 1000 - shared],
                [500, 500],
              ],
            },
          ],
    );

    const [pumps] = await locateInViews(ask, views, [PUMPS]);

    // Count 2: the shared unit, then the clearer of the two single sightings.
    expect(pumps!.points).toHaveLength(2);
    expect(pumps!.points[0]![0]).toBeCloseTo(0.5625, 2);
    expect(pumps!.points[1]![0]).toBeCloseTo(0.5 + 45 / 360, 2);
  });

  it("says why a machine no view mentions is unplaced", async () => {
    const { ask } = scripted(() => []);
    const [boilers] = await locateInViews(ask, views, [BOILERS]);
    expect(boilers).toEqual({
      id: "boilers",
      points: [],
      note: "Not mentioned in the model's answer for any view",
    });
  });
});

describe("splitPanorama", () => {
  /** A grey 2:1 panorama with a red patch centred at (u, v). */
  function panorama(u: number, v: number) {
    const image = new PNG({ width: 360, height: 180 });
    for (let y = 0; y < 180; y++) {
      for (let x = 0; x < 360; x++) {
        const at = (y * 360 + x) * 4;
        const red = Math.abs(x - u * 360) < 8 && Math.abs(y - v * 180) < 8;
        image.data.set(red ? [220, 20, 20, 255] : [90, 90, 90, 255], at);
      }
    }
    return { bytes: PNG.sync.write(image), mimeType: "image/png" };
  }

  const centre = (view: PanoramaView) => {
    const { data, width } = jpeg.decode(view.file.bytes, { useTArray: true });
    const at = ((width / 2) * width + width / 2) * 4;
    return [data[at]!, data[at + 1]!];
  };

  it("cuts the panorama into views facing round the horizon", () => {
    // The patch sits 90° right of the panorama's centre, on the horizon.
    const views = splitPanorama(panorama(0.75, 0.5), {
      count: 4,
      pitch: 0,
      fov: 90,
      size: 64,
    })!;

    expect(views.map(({ yaw }) => yaw)).toEqual([0, 90, 180, 270]);
    expect(views[0]!.file.mimeType).toBe("image/jpeg");
    const [red, green] = centre(views[1]!);
    expect(red).toBeGreaterThan(150);
    expect(green).toBeLessThan(80);
    expect(centre(views[3]!)[0]).toBeLessThan(120);
  });

  it("gives up on an image it cannot decode", () => {
    expect(splitPanorama(PANORAMA)).toBeNull();
  });
});
