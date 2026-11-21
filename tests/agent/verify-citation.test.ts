import { statesValue, verifyClaim } from "@repo/agent";
import { describe, expect, it } from "vitest";

const log = {
  name: "log.pdf",
  pages: [
    "Feed pumps: stoppage log\nWork orders ...",
    "Summary: 49 stoppages in 299.2 running hours across 2 units.\nMean time between failures (MTBF): 6.1 running hours.\nMean time to repair (MTTR): 25.5 min.",
  ],
};
const reference = {
  name: "reference.pdf",
  pages: [
    "Published MTBF for the class ranges from 1,166,025 to 2,076,992 calendar hours.\nPublished MTTR for the class ranges from 5.67 to 7.40 hours.",
  ],
};
const scan = { name: "scan.pdf", pages: null };
const documents = [log, reference, scan];

const mtbf = {
  document: "log.pdf",
  page: 2,
  quote: "Mean time between failures (MTBF): 6.1 running hours.",
  values: [{ value: 6.1 * 3600, unit: "s" }],
};

describe("statesValue", () => {
  it("reads durations in the unit the passage writes", () => {
    expect(statesValue("25.5 min", { value: 1530, unit: "s" })).toBe(true);
    expect(statesValue("6.1 running hours", { value: 21960, unit: "s" })).toBe(true);
    expect(statesValue("Cycle time: 70 s per batch.", { value: 70, unit: "s" })).toBe(true);
    expect(statesValue("25.5 min", { value: 25.5, unit: "s" })).toBe(false);
  });

  it("gives the first number of a range the unit of the second", () => {
    const passage = "ranges from 5.67 to 7.40 hours";
    expect(statesValue(passage, { value: 5.67 * 3600, unit: "s" })).toBe(true);
    expect(statesValue(passage, { value: 7.4 * 3600, unit: "s" })).toBe(true);
  });

  it("reads shares written as a percentage or as a fraction", () => {
    expect(statesValue("0.5% of batches", { value: 0.005, unit: "share" })).toBe(true);
    expect(statesValue("variation: 0.20.", { value: 0.2, unit: "share" })).toBe(true);
    expect(statesValue("2% of batches", { value: 0.2, unit: "share" })).toBe(false);
  });

  it("only allows the rounding the passage shows", () => {
    expect(statesValue("6.1 hours", { value: 6.14 * 3600, unit: "s" })).toBe(true);
    expect(statesValue("6.1 hours", { value: 6.2 * 3600, unit: "s" })).toBe(false);
  });

  it("takes a value written with thousands separators", () => {
    expect(
      statesValue("1,166,025 to 2,076,992 calendar hours", {
        value: 2_076_992 * 3600,
        unit: "s",
      }),
    ).toBe(true);
  });
});

describe("verifyClaim", () => {
  it("verifies a passage on the cited page that states the value", () => {
    expect(verifyClaim(documents, mtbf)).toEqual({ status: "verified", page: 2 });
  });

  it("ignores spacing and dashes the PDF did not keep", () => {
    expect(
      verifyClaim(documents, {
        ...mtbf,
        quote: "Mean  time between failures(MTBF): 6.1 running hours.",
      }).status,
    ).toBe("verified");
  });

  it("fails a passage on another page", () => {
    expect(verifyClaim(documents, { ...mtbf, page: 1 })).toEqual({
      status: "failed",
      reason: "The passage is on page 2, not page 1",
    });
  });

  it("fails a page the document does not have", () => {
    expect(verifyClaim(documents, { ...mtbf, page: 9 }).status).toBe("failed");
  });

  it("fails a passage that is not in the document", () => {
    expect(
      verifyClaim(documents, {
        ...mtbf,
        quote: "Mean time between failures (MTBF): 9.9 running hours.",
        values: [{ value: 9.9 * 3600, unit: "s" }],
      }),
    ).toEqual({ status: "failed", reason: 'The passage is not in "log.pdf"' });
  });

  it("fails a real passage that does not state the value", () => {
    expect(
      verifyClaim(documents, { ...mtbf, values: [{ value: 8 * 3600, unit: "s" }] }),
    ).toEqual({ status: "failed", reason: "The passage does not state 28800 s" });
  });

  it("fails a document the machine does not have", () => {
    expect(verifyClaim(documents, { ...mtbf, document: "other.pdf" }).status).toBe(
      "failed",
    );
  });

  it("finds the page when none was cited", () => {
    expect(verifyClaim(documents, { ...mtbf, page: undefined })).toEqual({
      status: "verified",
      page: 2,
    });
  });

  it("cannot verify a document with no text", () => {
    expect(verifyClaim(documents, { ...mtbf, document: "scan.pdf" }).status).toBe(
      "unverifiable",
    );
  });

  it("checks every value of a range", () => {
    const claim = {
      document: "reference.pdf",
      page: 1,
      quote: "Published MTTR for the class ranges from 5.67 to 7.40 hours.",
      values: [
        { value: 5.67 * 3600, unit: "s" },
        { value: 7.4 * 3600, unit: "s" },
      ],
    };
    expect(verifyClaim(documents, claim).status).toBe("verified");
    expect(
      verifyClaim(documents, {
        ...claim,
        values: [...claim.values, { value: 9 * 3600, unit: "s" }],
      }).status,
    ).toBe("failed");
  });

  it("takes a cost the same way, written as it is", () => {
    const quote = {
      name: "quote.pdf",
      pages: ["Spare feed pump, installed: 18,400 per unit."],
    };
    expect(
      verifyClaim([quote], {
        document: "quote.pdf",
        quote: "Spare feed pump, installed: 18,400 per unit.",
        values: [{ value: 18_400, unit: "EUR" }],
      }).status,
    ).toBe("verified");
  });
});
