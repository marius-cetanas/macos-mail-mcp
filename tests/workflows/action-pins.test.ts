import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), ".github/workflows");

interface Pin {
  where: string;
  action: string;
  sha: string;
  version: string;
}

/**
 * Pins are read from raw text rather than a parsed document on purpose: the
 * version a pin claims lives in its trailing `# vX.Y.Z` comment, and a YAML
 * parser discards comments. That comment is half of what these assertions are
 * about, so parsing it away would leave the more readable half unchecked.
 */
function pins(): Pin[] {
  const found: Pin[] = [];
  for (const file of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
    readFileSync(join(DIR, file), "utf8")
      .split("\n")
      .forEach((line, i) => {
        const m = line.match(/uses:\s*(\S+?)@(\S+?)(?:\s+#\s*(\S+))?\s*$/);
        if (m) {
          found.push({
            where: `${file}:${i + 1}`,
            action: m[1],
            sha: m[2],
            version: m[3] ?? "",
          });
        }
      });
  }
  return found;
}

/** `github/codeql-action/init` and `.../analyze` are one action, two paths. */
function family(action: string): string {
  return action.split("/").slice(0, 2).join("/");
}

describe(".github/workflows — action pins", () => {
  // A matcher that silently finds nothing reports green for the wrong reason:
  // every assertion below would pass over an empty list. This is the rail on
  // the rail.
  //
  // It anchors on a pin that is present rather than on how many pins there are.
  // A count couples this to the number of steps the workflows happen to have,
  // which merging two jobs or dropping a workflow legitimately moves — so it
  // would red for a reason that has nothing to do with the matcher working.
  it("finds the pins it is meant to be checking", () => {
    const found = pins();
    expect(found.length).toBeGreaterThan(0);

    // Counting alone would pass a regex that matched some lines but not the
    // canonical `uses: owner/repo@sha # vX.Y.Z` form, so name one that has to
    // be there: nothing in this repository builds without checking out.
    expect(found.map((p) => p.action)).toContain("actions/checkout");
  });

  // dependabot.yml states that actions are pinned to commit SHAs. Asserted
  // rather than trusted, per "a claim needs an assertion, not a sentence".
  it("pins every action to a full commit SHA", () => {
    for (const p of pins()) {
      expect(p.sha, `${p.where} pins ${p.action} to a non-SHA ref`).toMatch(
        /^[0-9a-f]{40}$/
      );
    }
  });

  // A bare SHA is unreadable, so the version comment is the only thing that
  // tells a reviewer what moved. A pin without one drifts unnoticed.
  it("annotates every pin with the version it claims to be", () => {
    for (const p of pins()) {
      expect(p.version, `${p.where} pins ${p.action} with no version comment`)
        .toMatch(/^v\d+/);
    }
  });

  /**
   * The defect this exists for. CodeQL refuses a run whose steps are not all
   * the same version — "Loaded a configuration file for version '4.37.4', but
   * running version '4.37.7'" — and Dependabot updates `init` and `analyze` as
   * separate paths, so it opened two PRs (#34, #35) each moving half the pair.
   * Both were red, and neither could go green on its own.
   *
   * dependabot.yml now groups them so the pair arrives as one PR. This asserts
   * the property that grouping is supposed to produce, because the grouping is
   * configuration that nothing else here would notice losing.
   */
  it("moves every path of a multi-path action in lockstep", () => {
    const byFamily = new Map<string, Pin[]>();
    for (const p of pins()) {
      const key = family(p.action);
      byFamily.set(key, [...(byFamily.get(key) ?? []), p]);
    }

    for (const [name, group] of byFamily) {
      const shas = new Set(group.map((p) => p.sha));
      const versions = new Set(group.map((p) => p.version));
      const detail = group.map((p) => `${p.where} ${p.action}@${p.version}`).join("\n  ");

      expect(shas.size, `${name} is pinned to ${shas.size} SHAs:\n  ${detail}`).toBe(1);
      expect(
        versions.size,
        `${name} claims ${versions.size} versions:\n  ${detail}`
      ).toBe(1);
    }
  });
});
