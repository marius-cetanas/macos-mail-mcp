import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Timeout for an expression-based correctness test. These escape a handful of code points, so 20s
 * is already three orders of magnitude of headroom, and a hang should surface fast rather than
 * hold the suite for two minutes.
 */
const CORRECTNESS_TIMEOUT_MS = 20_000;

/**
 * Timeout for a test that deliberately escapes tens of thousands of characters.
 *
 * Generous on purpose, and it is *not* the bound the performance tests assert against — they time
 * themselves and fail on their own assertion, with a measured number in the message. This only
 * stops a genuine hang from running forever, so it sits far above the ~10s bound those tests use.
 * Kept separate from `CORRECTNESS_TIMEOUT_MS` because a regression to the quadratic shape #42
 * reported took ~25s: sharing the 20s timeout would turn that assertion into an opaque
 * `ETIMEDOUT` from the runner instead of the number the test exists to report.
 */
const LARGE_INPUT_TIMEOUT_MS = 120_000;

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
  return runHandlerScript(handlerPath, `return ${expression}`, CORRECTNESS_TIMEOUT_MS);
}

/**
 * Run arbitrary statements against a handler file, rather than a single expression.
 *
 * Needed wherever a test has to *do* something before it escapes — build a 40,000-character input
 * by doubling, define a helper, or wrap the call in an `ignoring` block. None of those is an
 * expression, which is all `runHandler` can take.
 *
 * (Doubling is used for the large inputs because appending one character at a time is quadratic in
 * AppleScript. Thirteen `&` operations are not; the loop shape is what costs, not `&` itself.)
 */
export function runHandlerScript(
  handlerPath: string,
  body: string,
  timeoutMs = LARGE_INPUT_TIMEOUT_MS
): string {
  const source = readFileSync(join(process.cwd(), handlerPath), "utf8");
  const script = `${source}\n\n${body}\n`;
  return execFileSync("osascript", ["-"], {
    input: script,
    encoding: "utf8",
    timeout: timeoutMs,
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
