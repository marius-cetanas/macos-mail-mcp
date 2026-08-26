import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SHARED_HANDLER_FILES } from "../../src/bridge/applescript-runner.js";

/**
 * No domain script may redefine a handler the bridge prepends.
 *
 * `applescript-runner` concatenates `src/bridge/*.applescript` ahead of every domain script, so the
 * prepended handler names are effectively reserved. Redefining one is not a subtle problem —
 * measured, AppleScript refuses to compile the result:
 *
 *   script error: The joinStrings handler is specified more than once. (-2752)
 *
 * which means **every call of that tool fails**, loudly, at runtime. That is the good outcome; the
 * bad one is a maintainer meeting -2752 with no idea why, because the rule lived only in prose.
 *
 * This is the one check in this area that runs **in the merge gate**. Everything else touching
 * AppleScript needs `osascript` and is skipped on Linux; this reads text, so CI enforces it.
 */
const BRIDGE = join(process.cwd(), "src/bridge");
const DOMAINS = join(process.cwd(), "src/domains");

/**
 * Top-level handler declarations, in every form that can collide.
 *
 * Not just `on name(…)`. AppleScript's labelled-parameter forms take no parentheses at all, and
 * they collide identically — measured, `on joinStrings given size:x` and `on joinStrings above x`
 * each raise `-2752` against the prepended `on joinStrings(theList)`. Matching only the
 * parenthesised form would have missed them.
 *
 * (The bare `on name` with no parameters at all, which prompted this widening, turns out not to be
 * valid AppleScript: it raises `Expected "given", "into", "with", "without" or other parameter
 * name`. The labelled forms that error message names are the real gap, and they are covered here.)
 *
 * Anchored to column 1, which is what keeps `on error` clauses out — they are inside handlers and
 * therefore indented. `error` is excluded by name as well, so a top-level one could not be read as
 * a declaration.
 */
function handlerNames(source: string): string[] {
  return [...source.matchAll(/^on\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm)]
    .map((m) => m[1])
    .filter((name) => name !== "error");
}

function applescriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return applescriptFiles(full);
    return e.name.endsWith(".applescript") ? [full] : [];
  });
}

/*
 * Read the files the runner declares it prepends, not everything in the directory. A handler only
 * becomes reserved by being prepended, so `SHARED_HANDLER_FILES` is the authority — and taking it
 * from there means adding a file to `src/bridge/` without wiring it in cannot make this test
 * quietly reserve names nothing actually defines.
 */
const reserved = new Map<string, string>();
for (const name of SHARED_HANDLER_FILES) {
  const file = join(BRIDGE, name);
  for (const handler of handlerNames(readFileSync(file, "utf8"))) {
    reserved.set(handler, name);
  }
}

describe("handlers the bridge prepends are reserved names", () => {
  it("finds the prepended handlers at all, so an empty set cannot pass vacuously", () => {
    // If the bridge is ever restructured, this must fail rather than silently check nothing.
    expect([...reserved.keys()].sort()).toEqual([
      "escapeForJson",
      "joinStrings",
      "mailboxFullName",
      "resolveMailbox",
    ]);
  });

  it.each(applescriptFiles(DOMAINS).map((f) => [f.replace(`${process.cwd()}/`, ""), f]))(
    "%s redefines none of them",
    (_label, file) => {
      const clashes = handlerNames(readFileSync(file, "utf8")).filter((n) => reserved.has(n));
      expect(clashes, `redefines prepended handler(s): ${clashes.join(", ")}`).toEqual([]);
    }
  );
});
