import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `CHANGELOG.md` carries a standing `## [Unreleased]` heading, per Keep a Changelog.
 *
 * The failure mode this guards is specific and has already happened once, in the other direction.
 * The release workflow **never commits to `main`**, so a version's entry can only be written before
 * its tag exists — 1.3.1 shipped with no entry at all and had to be backfilled from its own
 * commits. The natural way to prepare a release is then to rename `[Unreleased]` to the version,
 * which lands the entry correctly and **removes the standing heading**, leaving the next change
 * with nowhere to go and the next author repeating the whole cycle.
 *
 * So at release time the version heading is *inserted below* `[Unreleased]`, not renamed from it.
 * That is a one-word difference in a procedure nobody performs often, which is exactly the kind of
 * thing worth asserting rather than documenting.
 */
const changelog = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8");
const headings = [...changelog.matchAll(/^## \[([^\]]+)\](?: - (\S+))?/gm)];

describe("CHANGELOG.md", () => {
  it("has a standing Unreleased heading", () => {
    expect(headings.map((h) => h[1])).toContain("Unreleased");
  });

  it("keeps it at the top, above every released version", () => {
    expect(headings[0][1]).toBe("Unreleased");
  });

  it("gives it no date, because it names no release", () => {
    expect(headings[0][2]).toBeUndefined();
  });

  it("dates every other heading, because those did ship", () => {
    for (const [, name, date] of headings.slice(1)) {
      expect(date, `[${name}] has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("orders released versions newest first", () => {
    const versions = headings.slice(1).map((h) => h[1].split(".").map(Number));
    for (let i = 1; i < versions.length; i += 1) {
      expect(
        versions[i - 1] > versions[i],
        `${headings[i][1]} should sort above ${headings[i + 1][1]}`
      ).toBe(true);
    }
  });

  it("carries at least one released version, so Unreleased is not the whole file", () => {
    // Deliberately not asserting *which* version is newest. A hard-coded number there would go
    // stale on every release and this suite does not track figures nothing else checks — the tag
    // is the source of truth for what shipped, not this file and not `package.json`.
    expect(headings.length).toBeGreaterThan(1);
    expect(headings.slice(1).map((h) => h[1])).not.toContain("Unreleased");
  });
});
