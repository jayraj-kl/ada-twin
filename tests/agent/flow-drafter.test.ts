import { describe, expect, it } from "vitest";
import { BOILERS, PANORAMA, PUMPS, scripted } from "./support";
import { draftFlow, reviseFlow } from "@repo/agent";

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
      support: [],
      needs: [],
      note: "No buffer mentioned",
    });
    expect(requests[0]!.prompt).toContain(
      "Water goes from the pumps to the boilers.",
    );
  });

  it("keeps support equipment out of the parts path", async () => {
    const panel = { id: "panel", name: "Control panel" };
    const compressor = { id: "air", name: "Compressor", auxiliary: true };
    const { ask, requests } = scripted(() => ({
      nodes: [
        { id: "in", kind: "source", name: "Intake" },
        { id: "rack", kind: "buffer", name: "Rack" },
        { id: "out", kind: "sink", name: "Dispatch" },
      ],
      edges: [
        { from: "in", to: "pumps" },
        { from: "pumps", to: "rack" },
        { from: "rack", to: "boilers" },
        { from: "boilers", to: "out" },
        // Support equipment handles no parts, whoever marked it.
        { from: "boilers", to: "panel" },
        { from: "air", to: "out" },
      ],
      // The model forgot the compressor the user marked, and named a node.
      support: ["panel", "rack"],
      needs: [
        { from: "panel", to: "boilers" },
        { from: "panel", to: "boilers" },
        { from: "air", to: "in" },
        // Only stations and sources can need support.
        { from: "panel", to: "rack" },
        { from: "panel", to: "out" },
        { from: "panel", to: "chiller" },
        // Only support equipment can be needed.
        { from: "pumps", to: "boilers" },
      ],
    }));

    const draft = await draftFlow(ask, PANORAMA, [
      PUMPS,
      BOILERS,
      panel,
      compressor,
    ]);

    expect(requests[0]!.prompt).toContain(
      "Compressor, count 1, marked by the user as support equipment",
    );
    expect(draft.support).toEqual(["air", "panel"]);
    expect(draft.needs).toEqual([
      { from: "panel", to: "boilers" },
      { from: "air", to: "in" },
    ]);
    expect(draft.edges).toEqual([
      { from: "in", to: "pumps" },
      { from: "pumps", to: "rack" },
      { from: "rack", to: "boilers" },
      { from: "boilers", to: "out" },
    ]);
  });
});

describe("reviseFlow", () => {
  const current = {
    nodes: [
      { id: "in", kind: "source" as const, name: "Intake", value: 90 },
      { id: "out", kind: "sink" as const, name: "Dispatch" },
    ],
    edges: [
      { from: "in", to: "pumps" },
      { from: "pumps", to: "boilers" },
      { from: "boilers", to: "out" },
    ],
    needs: [],
  };

  it("sends the flow and the conversation, and checks the answer like a draft", async () => {
    const { ask, requests } = scripted(() => ({
      nodes: [
        ...current.nodes,
        { id: "rack", kind: "buffer", name: "Staging rack", value: 12 },
        // A sink has no value to keep.
        { id: "scrap", kind: "sink", name: "Scrap", value: 3 },
      ],
      edges: [
        { from: "in", to: "pumps" },
        { from: "pumps", to: "rack" },
        { from: "rack", to: "boilers" },
        { from: "boilers", to: "out" },
        { from: "boilers", to: "scrap" },
        // Not a link that can exist.
        { from: "out", to: "in" },
      ],
      reply: "Added a staging rack for 12 between the pumps and the boilers.",
    }));

    const revision = await reviseFlow(
      ask,
      PANORAMA,
      [PUMPS, BOILERS],
      current,
      [
        { role: "user", text: "Rejects leave the boilers to scrap." },
        { role: "assistant", text: "Which node holds the rejects?" },
        {
          role: "user",
          text: "Put a rack for 12 after the pumps, and send rejects to scrap.",
        },
      ],
    );

    expect(revision.nodes).toEqual([
      { id: "in", kind: "source", name: "Intake", value: 90 },
      { id: "out", kind: "sink", name: "Dispatch" },
      { id: "rack", kind: "buffer", name: "Staging rack", value: 12 },
      { id: "scrap", kind: "sink", name: "Scrap" },
    ]);
    expect(revision.edges).not.toContainEqual({ from: "out", to: "in" });
    expect(revision.edges).toContainEqual({ from: "pumps", to: "rack" });
    expect(revision.reply).toBe(
      "Added a staging rack for 12 between the pumps and the boilers.",
    );
    const prompt = requests[0]!.prompt;
    expect(prompt).toContain(JSON.stringify(current));
    expect(prompt).toContain("You: Which node holds the rejects?");
    expect(prompt).toContain("Put a rack for 12 after the pumps");
  });

  it("keeps support equipment the user marked, whatever the answer says", async () => {
    const panel = { id: "panel", name: "Control panel", auxiliary: true };
    const { ask } = scripted(() => ({ ...current, support: [] }));

    const revision = await reviseFlow(
      ask,
      PANORAMA,
      [PUMPS, BOILERS, panel],
      current,
      [{ role: "user", text: "The panel handles parts now." }],
    );

    expect(revision.support).toEqual(["panel"]);
    expect(revision.reply).toBe("Done.");
  });

  it("needs a request from the user to act on", async () => {
    const { ask, requests } = scripted(() => current);

    await expect(
      reviseFlow(ask, PANORAMA, [PUMPS], current, [
        { role: "assistant", text: "Anything else?" },
      ]),
    ).rejects.toThrow("user's request");
    expect(requests).toHaveLength(0);
  });
});
