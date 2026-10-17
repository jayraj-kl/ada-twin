import { describe, expect, it } from "vitest";
import {
  type EditImage,
  type ImageEditRequest,
  explainChanges,
  illustrate,
  outsideRedesign,
} from "@repo/agent";
import { scripted } from "./support";

const VIEW = { mimeType: "image/jpeg", data: "b3JpZ2luYWw=" };

function recording() {
  const requests: ImageEditRequest[] = [];
  const edit: EditImage = async (request) => {
    requests.push(request);
    return {
      image: { mimeType: "image/jpeg", data: "ZWRpdGVk" },
      text: "Added a second valve train.",
      turn: {
        role: "model",
        parts: [
          { text: "Added a second valve train." },
          {
            inlineData: { mimeType: "image/jpeg", data: "ZWRpdGVk" },
            thoughtSignature: "c2ln",
          },
        ],
      },
    };
  };
  return { edit, requests };
}

describe("illustrate", () => {
  it("sends the photo with the changes for a first drawing", async () => {
    const { edit, requests } = recording();
    await illustrate(edit, {
      view: VIEW,
      subject: "Gas valve train (1 unit)",
      changes: ["Add a standby gas valve train"],
      message: "Add a second valve train beside the first",
    });
    const [request] = requests;
    expect(request!.contents).toHaveLength(1);
    expect(request!.contents[0]!.parts[0]!.inlineData).toEqual(VIEW);
    expect(request!.contents[0]!.parts[1]!.text).toContain(
      "Add a standby gas valve train",
    );
    expect(request!.aspectRatio).toBe("16:9");
  });

  it("sends the model's last turn back unchanged to revise it", async () => {
    const { edit, requests } = recording();
    const first = await illustrate(edit, {
      view: VIEW,
      subject: "Boiler",
      changes: [],
      message: "Add a boiler",
    });
    await illustrate(edit, {
      view: VIEW,
      subject: "Boiler",
      changes: [],
      previous: first.turn,
      notes: ["Add a boiler"],
      message: "Make it grey",
    });
    const contents = requests[1]!.contents;
    expect(contents.map(({ role }) => role)).toEqual(["user", "model", "user"]);
    expect(contents[1]).toEqual(first.turn);
    expect(contents[1]!.parts[1]!.thoughtSignature).toBe("c2ln");
    expect(contents[2]!.parts[0]!.text).toContain("Make it grey");
  });
});

describe("outsideRedesign", () => {
  it("reads the model's verdict", async () => {
    const { ask, requests } = scripted(() => ({
      outside: true,
      note: "A fourth boiler was not simulated.",
    }));
    const verdict = await outsideRedesign(ask, {
      changes: ["Add one more unit to Boilers"],
      message: "Add a fourth boiler",
    });
    expect(verdict).toEqual({
      outside: true,
      note: "A fourth boiler was not simulated.",
    });
    expect(requests[0]!.prompt).toContain("Add one more unit to Boilers");
  });
});

describe("explainChanges", () => {
  const changes = [
    {
      id: "a",
      title: "Add a standby gas valve train",
      detail: "The boiler stops when it fails.",
      tier: "critical" as const,
      marginal: 40,
      solo: 35,
      cost: "USD 4,000–9,000",
    },
    {
      id: "b",
      title: "Add an inlet tank",
      detail: "",
      tier: "low" as const,
      marginal: 0,
      solo: -2,
    },
  ];

  it("keeps paragraphs only for the changes it was given", async () => {
    const { ask, requests } = scripted(() => ({
      summary: "Two changes.",
      paragraphs: [
        { id: "a", text: "The valve train matters most." },
        { id: "zzz", text: "Invented." },
      ],
    }));
    const report = await explainChanges(ask, {
      scenario: "Hot week",
      before: 280,
      after: 320,
      changes,
    });
    expect(report.summary).toBe("Two changes.");
    expect(report.paragraphs).toEqual({ a: "The valve train matters most." });
    expect(requests[0]!.prompt).toContain("USD 4,000–9,000");
    expect(requests[0]!.prompt).toContain("[critical]");
  });

  it("asks nothing when there is nothing to explain", async () => {
    const { ask, requests } = scripted(() => ({}));
    await explainChanges(ask, { scenario: "x", before: 0, after: 0, changes: [] });
    expect(requests).toHaveLength(0);
  });
});
