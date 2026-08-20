import { describe, it, expect } from "vitest";
import { runHandler, codePoints, onMacOS } from "../helpers/run-applescript.js";

const HANDLER = "src/bridge/escape-for-json.applescript";

const escape = (expression: string) => runHandler(HANDLER, `escapeForJson(${expression})`);

/**
 * The first tests in this repository that execute AppleScript.
 *
 * Skipped off macOS, which includes CI — `osascript` does not exist on the Linux runner. That is a
 * real limit and not a soft one: these assertions run where the code runs, on a maintainer's
 * machine, and never in the merge gate. They are still worth having, because the alternative was a
 * handler with no executable coverage at all, which is how #33 shipped.
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
   * #39, and the class it belongs to.
   *
   * The delimiter phases at the top of the handler are cluster-blind: `text items of` does not
   * split on a character that sits inside a grapheme cluster. So anything JSON requires escaping
   * can still be raw when the per-character loop is reached — but only inside a cluster.
   *
   * These were `it.fails` while the defect stood. They are ordinary assertions now.
   */
  describe("#39 — characters JSON must escape, hidden inside a grapheme cluster", () => {
    it("escapes a control code point wherever it sits in the cluster", () => {
      expect(escape(codePoints(0x01, 0x0301))).toBe("\\u0001\u0301");
      // Not only when it leads: the loop judges every code point.
      expect(escape(codePoints(0x65, 0x0301, 0x01))).toBe("e\u0301\\u0001");
    });

    it("emits no raw control character, so the result parses as JSON", () => {
      const value = escape(codePoints(0x01, 0x0301));
      expect(value).not.toContain("\u0001");
      expect(JSON.parse(`{"v":"${value}"}`)).toEqual({ v: "\u0001\u0301" });
    });

    /**
     * Found by the supervisor pass, and it is the same defect one column over: a quote or
     * backslash clustered with a combining mark reached the output raw, because the loop's only
     * judgment was the control range.
     */
    it("escapes a quote and a backslash clustered with a combining mark", () => {
      expect(escape(codePoints(0x22, 0x0301))).toBe('\\"\u0301');
      expect(escape(codePoints(0x5c, 0x0301))).toBe("\\\\\u0301");
    });

    /**
     * The guard on the fix for the line above. By the time the loop runs, the delimiter phases
     * have already turned a bare quote into `\"` — two single-code-point characters. Escaping 34
     * and 92 unconditionally would re-escape that half into `\\"`, breaking every quoted string.
     * The escaping is therefore confined to the cluster branch, and this pins it.
     */
    it("does not double-escape a quote or backslash the delimiter phases already handled", () => {
      expect(escape(codePoints(0x22))).toBe('\\"');
      expect(escape(codePoints(0x5c))).toBe("\\\\");
      expect(escape('"say \\"hi\\" \\\\ done"')).toBe('say \\"hi\\" \\\\ done');
    });

    /**
     * Named controls are handled by their own delimiter phases, which are equally cluster-blind —
     * so inside a cluster they fall through to the C0 loop and come out as \u00XX rather than \t.
     * Both are valid JSON. Pinned because a future "tab is already handled above" tidy-up would
     * regress this invisibly.
     */
    it.each([
      ["tab", 0x09, "\\u0009"],
      ["newline", 0x0a, "\\u000a"],
      ["carriage return", 0x0d, "\\u000d"],
    ])("escapes a %s clustered with a combining mark", (_name, point, expected) => {
      const value = escape(codePoints(point as number, 0x0301));
      expect(value).toBe(`${expected}\u0301`);
      expect(() => JSON.parse(`{"v":"${value}"}`)).not.toThrow();
    });
  });
});
