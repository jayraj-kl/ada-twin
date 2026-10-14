import { describe, expect, it } from "vitest";
import { needsInfo } from "@repo/agent";
import { BOILERS, PUMPS } from "./support";

describe("needsInfo", () => {
  it("asks for details only when there is nothing to look a machine up by", () => {
    expect(needsInfo(BOILERS, 0)).toBe(true);
    expect(needsInfo(BOILERS, 1)).toBe(false);
    expect(needsInfo(PUMPS, 0)).toBe(false);
  });
});
