import type { Kpis } from "@repo/sim";
import { describe, expect, it } from "vitest";
import {
  byShownGain,
  headline,
  latestOf,
  shippedOf,
  shownGain,
} from "../../apps/frontend/src/results/latest";

// Only what the results read of a day: how many parts it shipped.
const day = (completed: number) => ({ completed }) as Kpis;
const days = (...completed: number[]) => completed.map(day);

const run = { name: "your plant", kpis: day(212) };
const withPicks = { name: "with the picks", kpis: day(282) };

describe("latestOf", () => {
  it("shows the run with the picks once it is current", () => {
    const latest = latestOf(run, days(180, 190), days(200, 210), {
      run: withPicks,
      rules: days(225, 235),
      agents: days(255, 265),
    });
    expect(latest).toEqual({
      run: withPicks,
      rules: days(225, 235),
      crewDays: days(255, 265),
      withPicks: true,
    });
  });

  it("shows the run itself without one", () => {
    const latest = latestOf(run, days(180, 190), null, null);
    expect(latest).toEqual({
      run,
      rules: days(180, 190),
      crewDays: null,
      withPicks: false,
    });
  });

  it("does not fall back to the run's crew while the picks' playbook is written", () => {
    const latest = latestOf(run, days(180), days(200), {
      run: withPicks,
      rules: days(230),
      agents: null,
    });
    expect(latest.crewDays).toBeNull();
    expect(shippedOf(latest, true).crew).toBe(282);
  });
});

describe("shippedOf", () => {
  it("averages standard rules and the crew's playbook over the days", () => {
    const latest = latestOf(run, days(180, 190), days(250, 271.2), null);
    expect(shippedOf(latest, true)).toEqual({ rules: 185, crew: 260.6 });
  });

  it("uses the crew's one real day until their playbook replays", () => {
    const latest = latestOf(run, days(180, 190), null, null);
    expect(shippedOf(latest, true)).toEqual({ rules: 185, crew: 212 });
  });

  it("has no crew figure without agents", () => {
    const latest = latestOf(run, days(180, 190), null, null);
    expect(shippedOf(latest, false).crew).toBeNull();
  });
});

describe("headline", () => {
  const unit = "parts";

  it("says the target was met by the run with the picks", () => {
    expect(
      headline({ rules: 230, crew: 260.6, target: 250, picked: 1, unit }),
    ).toBe(
      "With your picked change, the crew shipped 30.6 more parts than standard rules, and the target of 250 was met",
    );
  });

  it("says how far short the plant is, to one decimal", () => {
    expect(
      headline({ rules: 188.7, crew: 194.3, target: 250, picked: 0, unit }),
    ).toBe(
      "The crew shipped 5.6 more parts than standard rules, but the plant is 55.7 short of 250",
    );
  });

  it("says when the crew ships fewer than standard rules", () => {
    expect(
      headline({ rules: 242.8, crew: 242.2, target: 300, picked: 0, unit }),
    ).toBe(
      "The crew shipped 0.6 fewer parts than standard rules, but the plant is 57.8 short of 300",
    );
  });

  it("judges the plant by standard rules without agents", () => {
    expect(
      headline({ rules: 230, crew: null, target: 250, picked: 2, unit }),
    ).toBe(
      "With your picked changes, no agents ran this shift, but the plant is 20 short of 250",
    );
  });

  it("calls a difference under a tenth a match, and leaves out a missing target", () => {
    expect(
      headline({ rules: 230, crew: 230.04, picked: 0, unit: "batches" }),
    ).toBe("The crew matched standard rules");
  });
});

describe("suggestion gains", () => {
  const changes = [
    { id: "a", gain: 40 },
    { id: "b", gain: 12 },
    { id: "c", gain: 25 },
  ];
  const onTop = { a: 3, b: 9, c: "failed" as const };

  it("show their gain on the plant as it is before the picks have run", () => {
    expect(shownGain(changes[0]!, onTop, false)).toBe(40);
    expect(byShownGain(changes, onTop, false).map(({ id }) => id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("show and sort by what they add on top once the picks have run", () => {
    expect(shownGain(changes[0]!, onTop, true)).toBe(3);
    expect(shownGain({ id: "d", gain: 99 }, onTop, true)).toBeUndefined();
    expect(byShownGain(changes, onTop, true).map(({ id }) => id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});
