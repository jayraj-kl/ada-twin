import { describe, expect, it } from "vitest";
import { describeScenario, suggestScenarios } from "@repo/agent";
import type { Scenario } from "@repo/sim";
import { scripted } from "./support";

const scenario: Scenario = {
  name: "Normal week",
  shiftHours: 8,
  demandPerShift: 300,
  maintenanceCrews: 2,
  targets: { throughputPerShift: 280 },
};
const machines = [
  { id: "pumps", name: "Feed pumps" },
  { id: "boilers", name: "Boilers" },
];
const said = (text: string) => [{ role: "user" as const, text }];

describe("describeScenario", () => {
  it("shows the settings, their values and the machines", async () => {
    const { ask, requests } = scripted(() => ({ reply: "ok" }));
    await describeScenario(ask, {
      scenario,
      machines,
      messages: said("A hot week"),
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.search).toBeFalsy();
    const prompt = requests[0]!.prompt;
    expect(prompt).toContain("- demandPerShift (");
    expect(prompt).toContain("): 300");
    expect(prompt).toContain("- ambientTempC (");
    expect(prompt).toContain("not set");
    expect(prompt).toContain("Feed pumps, Boilers");
    expect(prompt).toContain('"""\nA hot week\n"""');
  });

  it("keeps changes that fit, clamped and rounded, and drops the rest", async () => {
    const { ask } = scripted(() => ({
      reply: "A hot, busy week with fitters off.",
      changes: [
        { field: "ambientTempC", value: 38, reason: "Assumed 38 °C." },
        { field: "demandPerShift", value: 412.6, reason: "A big order." },
        { field: "absenteeism", value: 1.5, reason: "Everyone off." },
        { field: "maintenanceCrews", value: 2, reason: "Unchanged." },
        { field: "colour", value: "red", reason: "Not a setting." },
        { field: "name", value: "  Hot July  ", reason: "Named it." },
        { field: "shiftHours", value: null, reason: "Cannot unset." },
        { field: "targets.throughputPerShift", value: null, reason: "No target." },
      ],
      briefing: "  Keep the boilers cool.  ",
      notModelled: ["Boiler 2 out until noon", " "],
    }));
    const answer = await describeScenario(ask, {
      scenario,
      machines,
      messages: said("Hot week, big order, fitters off, boiler 2 out till noon"),
    });
    expect(answer).toEqual({
      reply: "A hot, busy week with fitters off.",
      changes: [
        { field: "ambientTempC", value: 38, reason: "Assumed 38 °C." },
        { field: "demandPerShift", value: 413, reason: "A big order." },
        { field: "absenteeism", value: 1, reason: "Everyone off." },
        { field: "name", value: "Hot July", reason: "Named it." },
        {
          field: "targets.throughputPerShift",
          value: null,
          reason: "No target.",
        },
      ],
      briefing: "Keep the boilers cool.",
      notModelled: ["Boiler 2 out until noon"],
    });
  });

  it("keeps the briefing when the reply repeats it", async () => {
    const { ask } = scripted(() => ({
      reply: "Nothing new.",
      briefing: "Watch the pumps.",
    }));
    const answer = await describeScenario(ask, {
      scenario: { ...scenario, briefing: "Watch the pumps." },
      machines,
      messages: said("Same as before"),
    });
    expect(answer.briefing).toBeNull();
    expect(answer.changes).toEqual([]);
  });

  it("needs the user to speak last", async () => {
    const { ask, requests } = scripted(() => ({}));
    await expect(
      describeScenario(ask, {
        scenario,
        machines,
        messages: [{ role: "assistant", text: "How hot?" }],
      }),
    ).rejects.toThrow(/user/);
    expect(requests).toHaveLength(0);
  });
});

describe("suggestScenarios", () => {
  it("offers up to three distinct, short suggestions in the plant's terms", async () => {
    const { ask, requests } = scripted(() => ({
      suggestions: [
        "A heatwave week with the boilers running flat out",
        " A heatwave week with the boilers running flat out ",
        "",
        "Two of the three fitters off sick during a rush order",
        "Half the feedwater supply lost for the shift",
        "One more that is past the limit",
      ],
    }));
    const suggestions = await suggestScenarios(ask, {
      machines: [{ name: "Boilers", count: 2 }, { name: "Feed pumps" }],
      process: "Water goes through the pumps, then the boilers.",
    });
    expect(suggestions).toEqual([
      "A heatwave week with the boilers running flat out",
      "Two of the three fitters off sick during a rush order",
      "Half the feedwater supply lost for the shift",
    ]);
    expect(requests[0]!.task).toBe("suggest-scenarios");
    expect(requests[0]!.prompt).toContain("Boilers ×2, Feed pumps");
    expect(requests[0]!.prompt).toContain("then the boilers");
  });

  it("answers nothing when the model suggests nothing usable", async () => {
    const { ask } = scripted(() => ({ suggestions: ["  "] }));
    expect(await suggestScenarios(ask, { machines: [] })).toEqual([]);
  });
});

describe("the plant's size in the prompts", () => {
  it("tells the suggestions what the plant makes and how much", async () => {
    const { ask, requests } = scripted(() => ({ suggestions: [] }));
    await suggestScenarios(ask, {
      machines: [{ name: "Boring mill" }],
      plant: { capacityPerShift: 6.4, unit: "castings" },
    });
    expect(requests[0]!.prompt).toContain("counts its work in castings");
    expect(requests[0]!.prompt).toContain("about 6 castings in an 8-hour shift");
  });

  it("tells the scenario writer too, and says parts when nothing is known", async () => {
    const { ask, requests } = scripted(() => ({ reply: "Noted." }));
    await describeScenario(ask, {
      scenario,
      machines,
      messages: said("A rush order"),
      plant: { capacityPerShift: 40, unit: "motors" },
    });
    await describeScenario(ask, { scenario, machines, messages: said("A rush order") });
    expect(requests[0]!.prompt).toContain("about 40 motors");
    expect(requests[1]!.prompt).toContain("counts its work in parts");
    expect(requests[1]!.prompt).not.toContain("8-hour shift");
  });
});
