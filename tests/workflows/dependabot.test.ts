import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * `@vitest/coverage-v8` peers on the exact `vitest` version, so the two install only as a pair.
 * Dependabot's #71 moved `vitest` alone and every job running `npm ci` died on ERESOLVE, because the
 * `dev-dependencies` group takes minor and patch updates only and so left a major ungrouped.
 * `dependabot.yml` now gives the pair a group of its own, for every update type, and keeps every
 * other group from taking half of it.
 *
 * That is configuration nothing else here would notice losing. An edit undoing it passes every check
 * on the day it lands and fails on the next major, months later, in a pull request nobody opened —
 * so the property is asserted rather than trusted. (Raised by Copilot on #73.)
 */
interface Group {
  patterns?: string[];
  "exclude-patterns"?: string[];
  "update-types"?: string[];
}

interface Update {
  "package-ecosystem": string;
  groups?: Record<string, Group>;
}

const config = parse(readFileSync(join(process.cwd(), ".github/dependabot.yml"), "utf8"));
const groups: Record<string, Group> =
  (config.updates as Update[]).find((u) => u["package-ecosystem"] === "npm")?.groups ?? {};

const PAIR = ["vitest", "@vitest/*"];

/** A name standing for each half of the pair, for asking whether a pattern would take it. */
const MEMBERS = ["vitest", "@vitest/coverage-v8"];

const escapeRegex = (s: string) => s.replace(/[.+?^$()|[\]\\{}]/g, "\\$&");

/** Dependabot group patterns are globs in which `*` matches any run of characters. */
function matches(pattern: string, name: string): boolean {
  return new RegExp(`^${pattern.split("*").map(escapeRegex).join(".*")}$`).test(name);
}

const holdsPair = (group: Group) => PAIR.every((p) => group.patterns?.includes(p) ?? false);

describe("dependabot.yml — the vitest pair moves together", () => {
  it("matches patterns the way Dependabot does", () => {
    expect(matches("@vitest/*", "@vitest/coverage-v8")).toBe(true);
    expect(matches("vitest", "@vitest/coverage-v8")).toBe(false);
    expect(matches("*", "vitest")).toBe(true);
    expect(matches("vite*", "vitest")).toBe(true);
    expect(matches("@vitest/*", "vitest")).toBe(false);
  });

  it("has npm groups to check", () => {
    expect(Object.keys(groups).length).toBeGreaterThan(0);
  });

  it("gives the pair exactly one group, filtering no update type", () => {
    const pair = Object.values(groups).filter(holdsPair);
    expect(pair, "no group holds both vitest and @vitest/*").toHaveLength(1);
    // A major is the update this group exists for, so it must not narrow the update types at all.
    expect(pair[0]["update-types"]).toBeUndefined();
  });

  it("keeps every other group from taking either half of the pair", () => {
    for (const [name, group] of Object.entries(groups)) {
      if (holdsPair(group)) continue;
      for (const member of MEMBERS) {
        // A group with no patterns takes every dependency its other filters admit.
        const takes = !group.patterns || group.patterns.some((p) => matches(p, member));
        const excludes = (group["exclude-patterns"] ?? []).some((p) => matches(p, member));
        expect(!takes || excludes, `group "${name}" can take ${member} without the rest of the pair`).toBe(
          true
        );
      }
    }
  });
});
