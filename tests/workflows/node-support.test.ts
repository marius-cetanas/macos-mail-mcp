import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * The Node versions this package supports are decided by `engines.node` in `package.json`, and
 * repeated in the CI matrix and across the documentation.
 *
 * `engines.node` is the claim a consumer's npm reads. It is true only while CI runs the suite on the
 * floor's major line, and the documents repeating it are useful only while they agree with it.
 * Raising the floor from 20 to 22.12 — forced by Vitest 5, which does not support Node 20 — touched
 * all of them at once, which is precisely the edit where a sentence describing the old floor
 * survives.
 *
 * It did survive. The first version of this test named the documents it checked, `CONTRIBUTING.md`
 * was not among them, and "Node.js 20+" stood in the one file nobody listed while this passed. A
 * hand-written list is the same failure one level up, so the documents are now every tracked
 * Markdown file rather than a selection of them. (Raised by Copilot on #73.)
 */
const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

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

const floor = floorOf(engines);

/**
 * Every tracked Markdown file except the two kinds that are history rather than claims:
 * `CHANGELOG.md` records floors that were true when they shipped, and the handoffs record sessions.
 * Both may name a Node version this package no longer supports.
 */
function documents(): string[] {
  return execFileSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => f !== "" && f !== "CHANGELOG.md" && !f.startsWith(".portulan/handoffs/"));
}

/**
 * Every Node version a document states — `Node.js 22.12+`, `Node 22.12+`, or the shields.io badge's
 * `node-%3E%3D22.12` — and every one, not the first, so a stale claim further down cannot hide
 * behind a current one above it.
 */
function claimsIn(text: string): string[] {
  const patterns = [/\bNode(?:\.js)? (\d+(?:\.\d+)*)\+/g, /badge\/node-%3E%3D(\d+(?:\.\d+)*)-/g];
  return patterns.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => m[1]));
}

describe("supported Node versions", () => {
  it("reads the helpers the way the documents are written", () => {
    expect(floorOf(">=22.12.0")).toBe("22.12");
    expect(floorOf(">=24.0.0")).toBe("24");
    expect(spoken(["22", "24"])).toBe("22 and 24");
    expect(spoken(["20", "22", "24"])).toBe("20, 22 and 24");
    expect(claimsIn("Node.js 22.12+ and Node 24+, badge/node-%3E%3D22.12-green")).toEqual([
      "22.12",
      "24",
      "22.12",
    ]);
  });

  it("declares engines.node as a single >= floor, the shape the rest of this reads", () => {
    expect(engines).toMatch(/^>=\d+\.\d+\.\d+$/);
  });

  it("tests the floor's major line in CI, and nothing below it", () => {
    expect(Math.min(...matrix.map(Number))).toBe(Number(floor.split(".")[0]));
  });

  // A scan that silently finds nothing reports green for the wrong reason: the assertion below
  // would pass over an empty list. It anchors on the document a consumer reads first rather than on
  // a count, which adding or removing a document would legitimately move.
  it("finds the documents and claims it is meant to be checking", () => {
    expect(documents()).toContain("README.md");
    expect(claimsIn(read("README.md")).length).toBeGreaterThan(0);
  });

  it("states no other floor in any tracked document", () => {
    for (const doc of documents()) {
      for (const version of claimsIn(read(doc))) {
        expect(version, `${doc} states Node ${version}, but engines.node says ${floor}`).toBe(floor);
      }
    }
  });

  it("names the versions CI tests in CLAUDE.md", () => {
    expect(read("CLAUDE.md")).toContain(`CI builds and tests on ${spoken(matrix)})`);
  });
});
