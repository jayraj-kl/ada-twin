import { describe, expect, it } from "vitest";
import { describeScenario } from "@repo/agent";
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
