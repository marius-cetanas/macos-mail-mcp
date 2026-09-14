import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * The Node versions this package supports are stated in five places, and `package.json` decides.
 *
 * `engines.node` is the claim a consumer's npm reads. It is true only while CI runs the suite on the
 * floor's major line, and the documents repeating it are useful only while they agree with it.
 * Raising the floor from 20 to 22.12 — forced by Vitest 5, which does not support Node 20 — moved
 * all five at once, which is precisely the edit where a sentence describing the old floor survives.
 * So each is held to `package.json` here rather than to a grep somebody remembers to run.
 */
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const engines: string = JSON.parse(read("package.json")).engines.node;
const matrix: string[] = parse(read(".github/workflows/verify.yml")).jobs.test.strategy.matrix.node;

/** `>=22.12.0` → `22.12`, and `>=24.0.0` → `24`: the floor as the documents write it. */
function floorOf(range: string): string {
  return range.replace(/^>=/, "").replace(/(\.0)+$/, "");
}

/** `["22", "24"]` → `22 and 24`, and `["20", "22", "24"]` → `20, 22 and 24`. */
function spoken(list: string[]): string {
  if (list.length < 2) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * Every version a pattern finds, not the first: a document stating the new floor once and the old
 * one further down must fail, and a first-match check would pass it.
 */
function stated(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((m) => m[1]);
}

const floor = floorOf(engines);

/** A pattern that matches nothing would pass every per-claim assertion vacuously. */
function expectAllAtFloor(where: string, versions: string[]) {
  expect(versions.length, `${where}: no Node version claim found`).toBeGreaterThan(0);
  for (const v of versions) {
    expect(v, `${where} states Node ${v}, but engines.node says ${floor}`).toBe(floor);
  }
}

describe("supported Node versions", () => {
  it("reads the helpers the way the documents are written", () => {
    expect(floorOf(">=22.12.0")).toBe("22.12");
    expect(floorOf(">=24.0.0")).toBe("24");
    expect(spoken(["22", "24"])).toBe("22 and 24");
    expect(spoken(["20", "22", "24"])).toBe("20, 22 and 24");
  });

  it("declares engines.node as a single >= floor, the shape the rest of this reads", () => {
    expect(engines).toMatch(/^>=\d+\.\d+\.\d+$/);
  });

  it("tests the floor's major line in CI, and nothing below it", () => {
    expect(Math.min(...matrix.map(Number))).toBe(Number(floor.split(".")[0]));
  });

  it("states the floor in the README badge and requirements", () => {
    const readme = read("README.md");
    expectAllAtFloor("README.md badge", stated(readme, /badge\/node-%3E%3D(\d+(?:\.\d+)*)-/g));
    expectAllAtFloor("README.md", stated(readme, /Node\.js (\d+(?:\.\d+)*)\+/g));
  });

  it("states the floor and the CI versions in CLAUDE.md", () => {
    const text = read("CLAUDE.md");
    expectAllAtFloor("CLAUDE.md", stated(text, /Node\.js (\d+(?:\.\d+)*)\+/g));
    expect(text).toContain(`CI builds and tests on ${spoken(matrix)})`);
  });

  it("states the floor in the workspace identity", () => {
    const identity = read(".portulan/identity.md");
    expectAllAtFloor(".portulan/identity.md", stated(identity, /Node (\d+(?:\.\d+)*)\+/g));
  });
});
