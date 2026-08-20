import { describe, it, expect } from "vitest";
import { classifyFreshness, DEFAULT_LIMIT } from "../../scripts/branch-freshness.mjs";

describe("classifyFreshness", () => {
  it("defaults to the ceiling the gate map states", () => {
    expect(DEFAULT_LIMIT).toBe(5);
  });

  it("is ok and says so plainly when the branch is current", () => {
    expect(classifyFreshness({ behindBy: 0 })).toEqual({
      ok: true,
      message: "up to date with main",
    });
  });

  it("allows drift under the ceiling", () => {
    expect(classifyFreshness({ behindBy: 3 }).ok).toBe(true);
  });

  // The boundary is the whole content of the rule, so it is asserted from both sides rather than
  // trusted to the comparison operator.
  it("allows exactly the ceiling and refuses one past it", () => {
    expect(classifyFreshness({ behindBy: 5 }).ok).toBe(true);
    expect(classifyFreshness({ behindBy: 6 }).ok).toBe(false);
  });

  // A check that reports only a number leaves the reader to guess what to do about it.
  it("names the remedy when it refuses", () => {
    expect(classifyFreshness({ behindBy: 9 }).message).toContain("rebase onto main");
  });

  it("honours a custom ceiling", () => {
    expect(classifyFreshness({ behindBy: 4, limit: 3 }).ok).toBe(false);
    expect(classifyFreshness({ behindBy: 4, limit: 10 }).ok).toBe(true);
  });

  it("refuses input it cannot compare rather than coercing it", () => {
    expect(() => classifyFreshness({ behindBy: -1 })).toThrow(/non-negative integer/);
    expect(() => classifyFreshness({ behindBy: 1.5 })).toThrow(/non-negative integer/);
    expect(() => classifyFreshness({ behindBy: NaN })).toThrow(/non-negative integer/);
    expect(() => classifyFreshness({ behindBy: "3" as unknown as number })).toThrow(
      /non-negative integer/
    );
    expect(() => classifyFreshness({ behindBy: 0, limit: -1 })).toThrow(/non-negative integer/);
  });
});
