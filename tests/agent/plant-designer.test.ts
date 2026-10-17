import { describe, expect, it } from "vitest";
import { type FactoryGraph, param } from "@repo/sim";
import { designChanges } from "@repo/agent";
import { scripted } from "./support";

const plant: FactoryGraph = {
  nodes: [
    { id: "in", kind: "source", name: "Intake", interArrival: param(60, "s") },
    {
      id: "pumps",
      kind: "station",
      name: "Feed pumps",
      units: param(2, "units"),
      cycleTime: param(100, "s"),
    },
    { id: "out", kind: "sink", name: "Dispatch" },
    {
      id: "gas",
      kind: "support",
      name: "Gas valve train",
      units: param(1, "units"),
      mtbf: param(7200, "s"),
    },
  ],
  edges: [
    { from: "in", to: "pumps" },
    { from: "pumps", to: "out" },
  ],
  dependencies: [{ support: "gas", neededBy: "pumps" }],
};

const ask = (text: string) => [{ role: "user" as const, text }];

describe("designChanges", () => {
  it("keeps the changes that fit the plant and says which it dropped", async () => {
    const { ask: model, requests } = scripted(() => ({
      reply: "Added a spare valve train and a rack before the pumps.",
      changes: [
        {
          title: "Add a spare gas valve train",
          detail: "Covers a failure.",
          diffs: [{ type: "add-spare", support: "gas", count: 1 }],
        },
        {
          title: "Put a rack before the pumps",
          detail: "Absorbs gaps in supply.",
          diffs: [
            { type: "insert-buffer", from: "in", to: "pumps", name: "Pump rack", capacity: 20 },
          ],
        },
        {
          title: "Add a heat exchanger",
          detail: "",
          diffs: [{ type: "add-units", station: "exchanger", count: 1 }],
        },
        {
          title: "Spare for the pumps the wrong way",
          detail: "",
          diffs: [{ type: "add-spare", support: "pumps", count: 1 }],
        },
      ],
    }));

    const answer = await designChanges(model, {
      graph: plant,
      messages: ask("Add a spare valve train and a 20-part rack before the pumps"),
    });

    expect(answer.changes.map(({ title }) => title)).toEqual([
      "Add a spare gas valve train",
      "Put a rack before the pumps",
    ]);
    expect(answer.changes[1]!.diffs[0]).toMatchObject({
      type: "insert-buffer",
      id: "buffer-pump-rack",
      capacity: 20,
    });
    expect(answer.reply).toMatch(/heat exchanger/);
    expect(requests[0]!.prompt).toContain('support equipment "gas"');
  });

  it("passes a question back without changes", async () => {
    const { ask: model } = scripted(() => ({
      reply: "Which buffer do you mean?",
      changes: [],
    }));
    const answer = await designChanges(model, {
      graph: plant,
      messages: ask("make the buffer bigger"),
    });
    expect(answer).toEqual({ reply: "Which buffer do you mean?", changes: [] });
  });

  it("needs the user's request last", async () => {
    const { ask: model } = scripted(() => ({}));
    await expect(
      designChanges(model, {
        graph: plant,
        messages: [{ role: "assistant", text: "Hello" }],
      }),
    ).rejects.toThrow(/user's request/);
  });
});
