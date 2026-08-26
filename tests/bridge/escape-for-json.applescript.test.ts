import { describe, it, expect } from "vitest";
import { runHandler, runHandlerScript, codePoints, onMacOS } from "../helpers/run-applescript.js";

const HANDLER = "src/bridge/escape-for-json.applescript";

const escape = (expression: string) => runHandler(HANDLER, `escapeForJson(${expression})`);

/**
 * The first tests in this repository that execute AppleScript.
 *
 * Run only on macOS; skipped everywhere else, including CI, because `osascript` does not exist on
 * the Linux runner. That is a real limit and not a soft one: these assertions run where the code
 * runs, on a maintainer's machine, and never in the merge gate. They are still worth having,
 * because the alternative was a handler with no executable coverage at all, which is how #33
 * shipped.
 */
describe.skipIf(!onMacOS)("escapeForJson, executed", () => {
  describe("text that needs no escaping survives unchanged", () => {
    it("passes ASCII through", () => {
      expect(escape('"hello world"')).toBe("hello world");
    });

    it("passes a precomposed accent through", () => {
      // U+00E9 — one code point, so `id of` returns an integer and the old guard coped.
      // Written as an escape, not as a literal: this file's whole premise is that a literal `é`
      // could be either form and an editor could normalise one into the other. The expected value
      // is subject to that exactly as the input is.
      expect(escape(codePoints(0x00e9))).toBe("\u00e9");
    });

    /** #33: `id of` returns {101, 769} here, and comparing a list with `>=` raised -1700. */
    it("passes a decomposed accent through", () => {
      expect(escape(codePoints(0x65, 0x0301))).toBe("e\u0301");
    });

    it("passes an emoji carrying a variation selector through", () => {
      expect(escape(codePoints(0x2764, 0xfe0f))).toBe("\u2764\ufe0f");
    });

    // Never broken, and asserted so that the boundary of #33 is on the page: an astral character
    // is a single code point to AppleScript, not a surrogate pair.
    it("passes an astral emoji through", () => {
      expect(escape(codePoints(0x1f600))).toBe("\u{1f600}");
    });

    it("passes a ZWJ sequence through", () => {
      expect(escape(codePoints(0x1f468, 0x200d, 0x1f469))).toBe("\u{1f468}\u200d\u{1f469}");
    });
  });

  describe("the escaping it exists to do", () => {
    it("escapes a double quote", () => {
      expect(escape('"say \\"hi\\""')).toBe('say \\"hi\\"');
    });

    it("escapes a backslash", () => {
      expect(escape(codePoints(0x5c))).toBe("\\\\");
    });

    it("escapes tab, newline and carriage return by name", () => {
      expect(escape(codePoints(0x09))).toBe("\\t");
      expect(escape(codePoints(0x0a))).toBe("\\n");
      expect(escape(codePoints(0x0d))).toBe("\\r");
    });

    it("escapes a CRLF pair as two escapes", () => {
      expect(escape(codePoints(0x0d, 0x0a))).toBe("\\r\\n");
    });

    // The label carries the code point because vitest's title formatting has no %04X — an earlier
    // version used one and every title rendered as the literal "U+%04X", hiding which case ran.
    it.each([
      ["U+0001", "\\u0001", 0x01],
      ["U+0008", "\\u0008", 0x08],
      ["U+000B", "\\u000b", 0x0b],
      ["U+000C", "\\u000c", 0x0c],
      ["U+001F", "\\u001f", 0x1f],
      // vitest fills %s positionally from the row, so the two it prints must be items 0 and 1 —
      // the point rides last precisely because it is the one value the title should not show.
    ])("escapes C0 control %s as %s", (_label, expected, point) => {
      expect(escape(codePoints(point as number))).toBe(expected as string);
    });

    it("escapes a control character embedded in ordinary text", () => {
      expect(escape(`"a" & ${codePoints(0x01)} & "b"`)).toBe("a\\u0001b");
    });
  });

  describe("the output is valid JSON, which is the actual contract", () => {
    it("round-trips through JSON.parse", () => {
      const value = escape(`"caf" & ${codePoints(0x65, 0x0301)} & ${codePoints(0x01)}`);
      expect(JSON.parse(`{"v":"${value}"}`)).toEqual({ v: "cafe\u0301\u0001" });
    });
  });

  /**
   * #39, and the class it turned out to belong to.
   *
   * The handler no longer has delimiter phases, so "inside a cluster" is not a category it can
   * treat differently — every code point is judged once, on its own. These cases are kept because
   * they are the ones that were broken, and because each broke a different earlier design.
   */
  describe("#39 — characters JSON must escape, next to a combining mark", () => {
    it("escapes a control code point wherever it sits", () => {
      expect(escape(codePoints(0x01, 0x0301))).toBe("\\u0001\u0301");
      expect(escape(codePoints(0x65, 0x0301, 0x01))).toBe("e\u0301\\u0001");
    });

    it("emits no raw control character, so the result parses as JSON", () => {
      const value = escape(codePoints(0x01, 0x0301));
      expect(value).not.toContain("\u0001");
      expect(JSON.parse(`{"v":"${value}"}`)).toEqual({ v: "\u0001\u0301" });
    });

    it("escapes a quote and a backslash next to a combining mark", () => {
      expect(escape(codePoints(0x22, 0x0301))).toBe('\\"\u0301');
      expect(escape(codePoints(0x5c, 0x0301))).toBe("\\\\\u0301");
    });

    it("does not double-escape a bare quote or backslash", () => {
      expect(escape(codePoints(0x22))).toBe('\\"');
      expect(escape(codePoints(0x5c))).toBe("\\\\");
      expect(escape('"say \\"hi\\" \\\\ done"')).toBe('say \\"hi\\" \\\\ done');
    });

    it.each([
      ["tab", 0x09, "\\t"],
      ["newline", 0x0a, "\\n"],
      ["carriage return", 0x0d, "\\r"],
    ])("escapes a %s next to a combining mark, by its short form", (_name, point, expected) => {
      expect(escape(codePoints(point as number, 0x0301))).toBe(`${expected}\u0301`);
    });
  });

  /**
   * The regression the supervisor pass found, and the reason the delimiter phases are gone.
   *
   * `text items of` had no single behaviour to reason from — measured, it was blind to a
   * backslash followed by U+0301, split a cluster containing one followed by U+200D (matching the
   * backslash and orphaning the ZWJ), and refused to match a bare quote followed by U+200C. Every
   * phase-based design got one of these wrong: the ZWJ cases were valid on main and broken by the
   * cluster-branch fix, the ZWNJ case was broken on both.
   */
  describe("zero-width joiners and non-joiners", () => {
    it.each([
      ["quote + ZWJ", [0x22, 0x200d, 0x41], '\\"\u200dA'],
      ["backslash + ZWJ", [0x5c, 0x200d, 0x41], "\\\\\u200dA"],
      ["backslash + ZWJ + quote", [0x5c, 0x200d, 0x22], '\\\\\u200d\\"'],
      ["quote + ZWNJ", [0x22, 0x200c, 0x41], '\\"\u200cA'],
    ])("escapes %s and stays valid JSON", (_name, points, expected) => {
      const value = escape(codePoints(...(points as number[])));
      expect(value).toBe(expected);
      expect(() => JSON.parse(`{"v":"${value}"}`)).not.toThrow();
    });
  });

  /**
   * #42 introduced a flush boundary, and nothing in the tree pinned it.
   *
   * The rewrite accumulates ordinary code points into a buffer and converts them in one
   * `string id` call every 500. That is a new failure surface with no analogue in the handler it
   * replaced: a grapheme cluster can straddle a flush, an escape can land exactly on one, and a
   * run of astral characters can cross it. Every existing correctness test uses inputs far below
   * 500 code points, so none of them reaches it.
   *
   * These are deterministic and assert exact output — no timing, unlike the performance file.
   */
  describe("#42 — the 500-code-point flush boundary", () => {
    /** `n` copies of "a", then whatever code points follow. */
    const run = (n: number, ...after: number[]) =>
      `(my repeatText("a", ${n}))${after.length ? ` & ${codePoints(...after)}` : ""}`;

    // A handler the test script defines for itself, to build inputs without a quadratic concat.
    const REPEAT = [
      "on repeatText(c, n)",
      "    set out to {}",
      "    repeat n times",
      "        set end of out to c",
      "    end repeat",
      "    set oldD to AppleScript's text item delimiters",
      "    set AppleScript's text item delimiters to \"\"",
      "    set s to out as text",
      "    set AppleScript's text item delimiters to oldD",
      "    return s",
      "end repeatText",
    ].join("\n");

    const escapeAt = (expression: string) =>
      runHandlerScript(HANDLER, `${REPEAT}\n\nreturn my escapeForJson(${expression})`);

    it.each([499, 500, 501])(
      "escapes a quote sitting immediately after %i ordinary characters",
      (n) => {
        expect(escapeAt(run(n, 0x22))).toBe(`${"a".repeat(n)}\\"`);
      }
    );

    it.each([498, 499, 500])(
      "keeps a decomposed accent intact when the flush falls inside it (%i leading)",
      (n) => {
        // e + U+0301. At n=499 the cluster straddles the boundary exactly.
        //
        // Escapes on BOTH sides, for the reason this file states at the top: a literal accented
        // character on the page could be the precomposed U+00E9 or the decomposed pair, and those
        // are exactly the two forms that behave differently here. An editor normalising the
        // expected value would silently retarget the assertion.
        expect(escapeAt(run(n, 0x65, 0x0301))).toBe(`${"a".repeat(n)}\u0065\u0301`);
      }
    );

    it("keeps a ZWJ sequence intact across the boundary", () => {
      // The emoji occupies 499..502, so the joiner itself crosses the flush. The joiner is written
      // as an escape rather than a literal: it is invisible on the page, and editors and
      // formatters are known to drop or reorder it.
      expect(escapeAt(run(498, 0x1f468, 0x200d, 0x1f469))).toBe(
        `${"a".repeat(498)}\u{1f468}\u200d\u{1f469}`
      );
    });

    it("carries an astral character across the boundary", () => {
      expect(escapeAt(run(499, 0x1f600))).toBe(`${"a".repeat(499)}\u{1f600}`);
    });

    it("escapes a control character landing exactly on the boundary", () => {
      expect(escapeAt(run(500, 0x01))).toBe(`${"a".repeat(500)}\\u0001`);
    });

    /**
     * Every code point escapes, so the run buffer is never filled and `parts` is what reaches its
     * flush instead. 600 crosses that second threshold; the old shape had neither.
     */
    it("escapes 600 consecutive quotes, crossing the parts flush", () => {
      const value = escapeAt(`(my repeatText(${codePoints(0x22)}, 600))`);
      expect(value).toBe('\\"'.repeat(600));
      expect(JSON.parse(`{"v":"${value}"}`)).toEqual({ v: '"'.repeat(600) });
    });

    /**
     * The empty-run paths. `string id {}` does not raise — it SEGFAULTS osascript, uncatchable by
     * `try` — so an input ending exactly on a flush, and one that is nothing but escapes, are the
     * two shapes that would reach it if a guard were ever dropped.
     */
    it.each([500, 1000])("survives an input ending exactly on a flush (%i)", (n) => {
      expect(escapeAt(run(n))).toBe("a".repeat(n));
    });

    it("round-trips a mixed 1,200-character input through JSON.parse", () => {
      const value = escapeAt(`(my repeatText("ab" & ${codePoints(0x22)} & ${codePoints(0x09)}, 300))`);
      expect(JSON.parse(`{"v":"${value}"}`)).toEqual({ v: 'ab"\t'.repeat(300) });
    });
  });

  /**
   * A caller's comparison attributes reach into this handler, and one of them used to disable it.
   *
   * `considering` / `ignoring` are dynamically scoped in AppleScript: they apply inside every
   * handler called from the block, including a prepended one. The rewrite for #42 introduced a
   * text comparison — `esc is ""` as the "needs no escape" sentinel — and under
   * `ignoring punctuation` both `"\\\"" is ""` and `"\\\\" is ""` are TRUE. Measured, the handler
   * then returned `say "hi" b\s`: raw quote and raw backslash, the two characters that carry JSON's
   * structure, in the function whose entire job is escaping them.
   *
   * Nothing in this repository sets those attributes today, so this never shipped broken. It is
   * pinned because the file is prepended into every script forever, and a future `ignoring` around
   * some mailbox-name comparison would re-enable it silently — the exact failure class
   * *a silent wrong answer is worse than a loud failure* names.
   */
  describe("comparison attributes cannot disable the escaping", () => {
    const escapeUnder = (attribute: string, expression: string) =>
      runHandlerScript(
        HANDLER,
        [
          `${attribute}`,
          `    return my escapeForJson(${expression})`,
          `end ${attribute.split(" ")[0]}`,
        ].join("\n")
      );

    const INPUT = `"say " & ${codePoints(0x22)} & "hi" & ${codePoints(0x22)} & " b" & ${codePoints(0x5c)} & "s"`;
    const EXPECTED = 'say \\"hi\\" b\\\\s';

    it("escapes normally, as the baseline for the cases below", () => {
      expect(escape(INPUT)).toBe(EXPECTED);
    });

    it.each([
      ["ignoring punctuation", "ignoring punctuation"],
      ["ignoring white space", "ignoring white space"],
      ["ignoring case", "ignoring case"],
      ["considering punctuation", "considering punctuation"],
    ])("still escapes under %s", (_label, attribute) => {
      expect(escapeUnder(attribute, INPUT)).toBe(EXPECTED);
    });
  });

  describe("degenerate input", () => {
    it("returns the empty string unchanged", () => {
      // `id of ""` is an empty list rather than an integer, which the normalisation must survive.
      expect(escape('""')).toBe("");
    });

    it("handles a single-character string, whose id is an integer not a list", () => {
      expect(escape('"A"')).toBe("A");
    });
  });
});
