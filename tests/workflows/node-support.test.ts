import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { documents } from "../helpers/documents.js";

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
 * It did survive, and review found the two ways this test could miss it. The first version named
 * the documents it checked, `CONTRIBUTING.md` was not among them, and "Node.js 20+" stood in the one
 * file nobody listed while this passed — so the documents are every tracked Markdown file rather
 * than a selection. The second read only the `20+` spelling, so "Node.js 20 or later" would have
 * been invisible — so it reads each way a document states a floor, pinned case by case below.
 * (Both raised by Copilot on #73.)
 */
const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

const engines: string = JSON.parse(read("package.json")).engines.node;
const matrix: string[] = parse(read(".github/workflows/verify.yml")).jobs.test.strategy.matrix.node;

/** `22.12.0` → `22.12`, and `24.0.0` → `24`: a version as the documents write it. */
function normalize(version: string): string {
  return version.replace(/(\.0)+$/, "");
}

/** `>=22.12.0` → `22.12`: the floor as the documents write it. */
function floorOf(range: string): string {
  return normalize(range.replace(/^>=/, ""));
}

/** `["22", "24"]` → `22 and 24`, and `["20", "22", "24"]` → `20, 22 and 24`. */
function spoken(list: string[]): string {
  if (list.length < 2) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

const floor = floorOf(engines);

/**
 * The ways a document states a floor: `Node.js 22.12+`; `Node 22.12 or later` (or newer, above,
 * higher); `Node.js >= 22.12` or `≥ 22.12`; each with an optional `v`; and the shields.io badge's
 * `node-%3E%3D22.12`. A version named without a floor — "tested on Node 24" — claims none and is
 * deliberately not read as one, and neither is TypeScript's `Node16` module mode.
 */
const FLOOR_CLAIMS = [
  /\bNode(?:\.js)?\s+v?(\d+(?:\.\d+)*)(?:\+|\s+or\s+(?:later|newer|above|higher))/g,
  /\bNode(?:\.js)?\s*(?:>=|≥)\s*v?(\d+(?:\.\d+)*)/g,
  /badge\/node-%3E%3D(\d+(?:\.\d+)*)-/g,
];

/** Every floor a text states, not the first, so a stale one cannot hide behind a current one. */
function claimsIn(text: string): string[] {
  return FLOOR_CLAIMS.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => normalize(m[1])));
}

describe("supported Node versions", () => {
  it("reads versions and lists the way the documents write them", () => {
    expect(floorOf(">=22.12.0")).toBe("22.12");
    expect(floorOf(">=24.0.0")).toBe("24");
    expect(normalize("22.10")).toBe("22.10");
    expect(spoken(["22", "24"])).toBe("22 and 24");
    expect(spoken(["20", "22", "24"])).toBe("20, 22 and 24");
  });

  it.each([
    ["Node.js 22.12+", "22.12"],
    ["Node 22.12+", "22.12"],
    ["Node.js 20 or later", "20"],
    ["Node v20 or newer", "20"],
    ["Node.js 24 or above", "24"],
    ["Node 24 or higher", "24"],
    ["Node.js >=20", "20"],
    ["Node.js >= 22.12.0", "22.12"],
    ["Node ≥ 24", "24"],
    ["[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen.svg)]", "22.12"],
  ])("reads %j as a floor of %s", (text, version) => {
    expect(claimsIn(text)).toEqual([version]);
  });

  it("does not read a version named without a floor, or TypeScript's Node16 mode, as one", () => {
    expect(claimsIn("CI tests on Node 24, with Node16 module resolution")).toEqual([]);
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
        expect(version, `${doc} states a Node floor of ${version}, but engines.node says ${floor}`).toBe(
          floor
        );
      }
    }
  });

  it("names the versions CI tests in CLAUDE.md", () => {
    expect(read("CLAUDE.md")).toContain(`CI builds and tests on ${spoken(matrix)})`);
  });
});
