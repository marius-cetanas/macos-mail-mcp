import { describe, it, expect } from "vitest";
import { runHandlerScript, onMacOS } from "../helpers/run-applescript.js";

const HANDLER = "src/bridge/escape-for-json.applescript";

/**
 * #42 — the handler was quadratic, and a body around 40,000 characters reached `DEFAULT_TIMEOUT`.
 *
 * These are the assertions behind the measurement table in the handler's header comment. They are
 * timing tests, which are usually a bad idea, and the design here is what makes them worth having:
 *
 *   * The bound is not a target. Measured after the fix, 40,000 characters escape in about 0.3s on
 *     an M-series Mac; the bound is `BUDGET_MS`, roughly thirty times that. It is not there to
 *     police a few hundred milliseconds of drift on a slower or busier machine — it is there to
 *     catch a return to the quadratic shape, which cost 27.67s on the same input and would miss
 *     the bound by a factor of three.
 *   * The second test does NOT describe a bug users met. The handler this replaced was already flat
 *     across escape density — measured at 40,960: 21.26s plain against 27.31s at 50% quotes. What
 *     cost an order of magnitude more on dense input was a *candidate* for this rewrite, which
 *     sliced each run out of the full code-point list (0.18s plain, 3.06s at 50%). The assertion
 *     is kept because that candidate is the obvious way to write this and the tempting one to
 *     return to — it pins the design against a rewrite, not against history.
 *
 * Like every other executable AppleScript test here, these run on macOS only and never in the merge
 * gate. `npm run test:coverage` on a maintainer's machine is what runs them.
 */
describe.skipIf(!onMacOS)("escapeForJson, performance (#42)", () => {
  /**
   * `DEFAULT_TIMEOUT` in the bridge is 30s and is what the old shape was hitting. 10s leaves the
   * fixed handler ~30x headroom while still failing a quadratic regression, which needed 27.67s.
   */
  const BUDGET_MS = 10_000;

  /** 5 characters doubled 13 times. Built by doubling because `&` in a loop is itself quadratic. */
  const SIZE = 5 * 2 ** 13;

  /**
   * @param base an AppleScript expression for a 5-character string
   * @returns the escaped length, and how long the whole `osascript` run took
   */
  const escapeLarge = (base: string): { length: number; ms: number } => {
    const body = [
      `set s to ${base}`,
      "repeat 13 times",
      "    set s to s & s",
      "end repeat",
      "return (length of my escapeForJson(s)) as text",
    ].join("\n");

    const started = performance.now();
    const out = runHandlerScript(HANDLER, body);
    return { length: Number(out), ms: performance.now() - started };
  };

  /** Five ordinary characters — nothing to escape. */
  const PLAIN = '"abcde"';
  /** Five characters of which one is a quote, so one in five needs escaping. */
  const DENSE = '"abc" & (character id 34) & "d"';

  /**
   * An explicit timeout on each timing test, well above the budget they assert.
   *
   * vitest's default is 5s. `execFileSync` is synchronous, so vitest cannot preempt it — but on a
   * slower machine the green path of the two-run test (~0.55s here) could brush 5s and fail as
   * "timed out", which reports the wrong thing. The only way these should fail is their own
   * assertion, with the measured number in the message.
   */
  const TEST_TIMEOUT_MS = BUDGET_MS * 3;

  it(`escapes ${SIZE} plain characters well inside the bridge timeout`, () => {
    const { length, ms } = escapeLarge(PLAIN);

    // Nothing needed escaping, so the output is the input.
    expect(length).toBe(SIZE);
    expect(ms).toBeLessThan(BUDGET_MS);
  }, TEST_TIMEOUT_MS);

  it("costs about the same whether the input needs escaping or not", () => {
    const plain = escapeLarge(PLAIN);
    const dense = escapeLarge(DENSE);

    // One quote in five becomes two characters, so the output grows by exactly a fifth.
    expect(dense.length).toBe(SIZE + SIZE / 5);
    expect(dense.ms).toBeLessThan(BUDGET_MS);

    /*
     * The property the rejected candidate failed — not the shipped predecessor, which was flat.
     * That candidate sliced each run out of the full code-point list, so cost scaled with escape
     * count: 0.18s at 0% against 3.06s at 50%. A factor of 5 is loose enough to absorb process
     * startup and a noisy machine, and far tighter than the behaviour it rules out.
     */
    expect(dense.ms).toBeLessThan(plain.ms * 5);
  }, TEST_TIMEOUT_MS);

  it("still produces valid JSON at that size", () => {
    const body = [
      `set s to ${DENSE}`,
      "repeat 13 times",
      "    set s to s & s",
      "end repeat",
      "return my escapeForJson(s)",
    ].join("\n");

    const escaped = runHandlerScript(HANDLER, body);

    // The contract is that the result can be dropped between two quotes, asserted here at a size
    // that crosses many flushes. An escape cannot itself be split — it is appended to `parts` as
    // one item — so the boundary risks are mid-cluster and mid-run, and those are pinned
    // deterministically in `escape-for-json.applescript.test.ts` rather than by this timing file.
    const parsed = JSON.parse(`{"v":"${escaped}"}`) as { v: string };
    expect(parsed.v).toHaveLength(SIZE);
    expect(parsed.v.startsWith('abc"d')).toBe(true);
  }, TEST_TIMEOUT_MS);
});
