import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Run a shared AppleScript handler for real, through `osascript`.
 *
 * Every other test in this suite mocks `node:child_process`, which means the `.applescript` files
 * are never executed — they are text that gets concatenated and handed to a mock. That gap let a
 * real bug through (#33: `id of c` returns a *list* for a multi-code-point grapheme cluster, so the
 * comparison against 31 raised -1700 and every message with an emoji subject failed).
 *
 * This helper closes it for the one handler where the risk is concentrated. It only works where
 * `osascript` exists, so callers gate on `darwin` — see `onMacOS` below.
 */
export function runHandler(handlerPath: string, expression: string): string {
  const source = readFileSync(join(process.cwd(), handlerPath), "utf8");
  const script = `${source}\n\nreturn ${expression}\n`;
  return execFileSync("osascript", ["-"], {
    input: script,
    encoding: "utf8",
    timeout: 20_000,
  }).replace(/\n$/, "");
}

/**
 * AppleScript source for a string literal built from explicit code points.
 *
 * Written this way rather than as a literal so the test says which code points it means. A `é` in
 * a source file could be either the precomposed U+00E9 or the decomposed pair, and those are the
 * two cases that behave differently — a reader must not have to guess which one is on the page,
 * and an editor must not be able to silently normalise one into the other.
 */
export function codePoints(...points: number[]): string {
  return points.map((p) => `(character id ${p})`).join(" & ");
}

/** `osascript` exists on macOS only; CI runs on Linux. */
export const onMacOS = process.platform === "darwin";
