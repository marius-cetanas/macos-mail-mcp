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
   * #39. AppleScript clusters a C0 control with a following combining mark into ONE character
   * (`id of` -> {1, 769}), so #33's integer guard sent the whole cluster down the passthrough
   * branch and a raw control byte reached the JSON string.
   *
   * These were `it.fails` while the defect stood. They are ordinary assertions now.
   */
  describe("#39 — a control character leading a grapheme cluster", () => {
    it("escapes the control and keeps the combining mark", () => {
      expect(escape(codePoints(0x01, 0x0301))).toBe("\\u0001\u0301");
    });

    it("emits no raw control character, so the result parses as JSON", () => {
      const value = escape(codePoints(0x01, 0x0301));
      expect(value).not.toContain("\u0001");
      expect(JSON.parse(`{"v":"${value}"}`)).toEqual({ v: "\u0001\u0301" });
    });

    // The general form, since the cluster need not lead with the control.
    it("judges every code point of a cluster, not only the first", () => {
      expect(escape(codePoints(0x65, 0x0301, 0x01))).toBe("e\u0301\\u0001");
    });
  });
});
