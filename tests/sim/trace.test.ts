import {
  type NumberSource,
  type Scenario,
  givenNumbers,
  traceNumbers,
} from "@repo/sim";
import { describe, expect, it } from "vitest";
import {
  type WrittenReport,
  traceReport,
} from "../../apps/frontend/src/plant/claims";

const sources: NumberSource[] = [
  { label: "before", value: 312, decimals: 0 },
  { label: "without A", value: 22.4, decimals: 1 },
  { label: "gain %", value: 11.54, decimals: 1, percent: true },
];

/** Each number written in `text`, with what it was traced to. */
const traced = (text: string, given = sources) =>
  traceNumbers(text, given).flatMap((piece) =>
    piece.number ? [[piece.text, piece.source]] : [],
  );

describe("traceNumbers", () => {
  it("traces a number written exactly as it was given", () => {
    expect(traced("It shipped 312 parts.")).toEqual([["312", "before"]]);
  });

  it("allows rounding to fewer digits, give or take one", () => {
    expect(traced("about 22 parts, or 23, or 21")).toEqual([
      ["22", "without A"],
      ["23", "without A"],
      ["21", "without A"],
    ]);
  });

  it("traces a percentage only to a percentage", () => {
    expect(traced("a 12% gain, 11.5 % up, not 11.5 parts")).toEqual([
      ["12%", "gain %"],
      ["11.5 %", "gain %"],
      ["11.5", null],
    ]);
  });

  it("ignores the sign", () => {
    expect(traced("it loses −22.4, or -22.4, or +22.4")).toEqual([
      ["−22.4", "without A"],
      ["-22.4", "without A"],
      ["+22.4", "without A"],
    ]);
  });

  it("traces a number to the text the writer read", () => {
    const given = [
      ...sources,
      ...givenNumbers("the cost", "$40K–$60K once"),
      ...givenNumbers("the goal", "ship at least 300 parts in the 8-hour shift"),
    ];
    expect(
      traced("It costs $40,000 to $60K, over the 8-hour shift, aiming at 300.", given),
    ).toEqual([
      ["40,000", "the cost"],
      ["60K", "the cost"],
      ["8", "the goal"],
      ["300", "the goal"],
    ]);
  });

  it("flags a number nothing given matches", () => {
    expect(traced("It adds about 40 parts.")).toEqual([["40", null]]);
  });

  it("flags digits written past what was given", () => {
    expect(traced("It loses 22.43 parts.")).toEqual([["22.43", null]]);
  });

  it("leaves numbers inside words and ids alone", () => {
    expect(traced("Station M2 and press_3 run.")).toEqual([]);
  });

  it("keeps the text whole", () => {
    const text = "From 312 to 348, a 12% gain.";
    expect(
      traceNumbers(text, sources)
        .map((piece) => piece.text)
        .join(""),
    ).toBe(text);
  });
});

describe("traceReport", () => {
  const report: WrittenReport = {
    before: 311.6,
    after: 348.2,
    rows: [
      { id: "a", marginal: 22.4, solo: 9.1 },
      { id: "b", marginal: 8.6, solo: 0.4 },
      { id: "c", marginal: 0.7, solo: 1.2 },
    ],
    summary:
      "The redesign lifts output from 312 to 348 parts per shift, a 12% gain across 3 changes. Together they add about 40 parts, and the pump cuts starved time by 30%.",
    paragraphs: {
      a: "Without the pump the plant ships 22.4 fewer parts; alone it gains 9.1.",
      b: "Alone the buffer gains 0.4, but it is worth 9 with the pump's help.",
    },
  };
  const options = {
    changes: [
      { id: "a", title: "Add a spare feed pump", detail: "The pump fails often." },
      { id: "b", title: "Widen the press buffer", detail: "Room for 6 more parts." },
      { id: "c", title: "Shorten lathe service", detail: "Service it faster." },
    ],
    scenario: { name: "Heatwave", shiftHours: 8 } as Scenario,
    costs: { a: "$40K once" },
    unit: "parts",
  };

  it("lists what nothing measured backs up", () => {
    expect(traceReport(report, options).misses).toEqual(["40", "30%"]);
  });

  it("names a paragraph's own change first", () => {
    const pieces = traceReport(report, options).paragraphs.b!;
    expect(pieces.find((piece) => piece.text === "9")).toMatchObject({
      source: "Widen the press buffer, without it: −8.6 parts/shift",
    });
  });

  it("skips changes with no paragraph", () => {
    expect(Object.keys(traceReport(report, options).paragraphs)).toEqual([
      "a",
      "b",
    ]);
  });
});
