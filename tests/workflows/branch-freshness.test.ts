import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
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

/**
 * The workflow re-runs when a pull request is edited, because its answer depends on the base. A pull
 * request opened against another branch and retargeted to `main` keeps the same head, so without
 * `edited` the freshness it passed against the old base would stand for the new one (raised by
 * Copilot on #98). The base has to come from the event payload for that re-run to see the new base.
 */
describe("the branch-freshness workflow", () => {
  const workflow = parse(
    readFileSync(join(process.cwd(), ".github/workflows/branch-freshness.yml"), "utf8")
  ) as {
    on: { pull_request?: { types?: string[] } };
    jobs: Record<string, { steps: Array<{ run?: string; env?: Record<string, string> }> }>;
  };

  it("re-runs when a pull request is edited, which includes a change of base", () => {
    expect(workflow.on.pull_request?.types ?? []).toEqual(
      expect.arrayContaining(["opened", "reopened", "synchronize", "edited"])
    );
  });

  it("reads the base from the event, so a re-run on an edit measures against the new base", () => {
    const step = Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .find((s) => s.run?.includes("scripts/check-freshness.mjs"));
    expect(step?.env?.BASE).toBe("${{ github.event.pull_request.base.sha }}");
  });
});
