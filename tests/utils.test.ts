import { describe, it, expect } from "vitest";
import { sanitize, expandTilde } from "../src/utils.js";

describe("sanitize", () => {
  it("returns unchanged string when no line breaks present", () => {
    expect(sanitize("hello world")).toBe("hello world");
  });

  it("replaces \\n with a space", () => {
    expect(sanitize("line1\nline2")).toBe("line1 line2");
  });

  it("replaces \\r with a space", () => {
    expect(sanitize("line1\rline2")).toBe("line1 line2");
  });

  it("replaces \\r\\n (CRLF) with a single space", () => {
    expect(sanitize("line1\r\nline2")).toBe("line1 line2");
  });

  it("collapses multiple consecutive newlines into a single space", () => {
    expect(sanitize("line1\n\n\nline2")).toBe("line1 line2");
  });

  it("collapses mixed \\r and \\n into a single space", () => {
    expect(sanitize("line1\r\n\r\nline2")).toBe("line1 line2");
  });

  it("handles newlines at start and end of string", () => {
    expect(sanitize("\nhello\n")).toBe(" hello ");
  });

  it("handles string that is only newlines", () => {
    expect(sanitize("\n\r\n")).toBe(" ");
  });

  it("handles empty string", () => {
    expect(sanitize("")).toBe("");
  });

  it("preserves tabs and other whitespace", () => {
    expect(sanitize("hello\tworld")).toBe("hello\tworld");
  });

  it("handles multiple separate newline groups", () => {
    expect(sanitize("a\nb\nc\nd")).toBe("a b c d");
  });
});

describe("expandTilde", () => {
  it("expands ~/path to homedir + /path", () => {
    const result = expandTilde("~/Downloads");
    expect(result).not.toContain("~");
    expect(result).toMatch(/^\/.*\/Downloads$/);
  });

  it("leaves absolute paths unchanged", () => {
    expect(expandTilde("/tmp/test")).toBe("/tmp/test");
  });

  it("leaves relative paths unchanged", () => {
    expect(expandTilde("some/path")).toBe("some/path");
  });

  it("does not expand tilde in middle of path", () => {
    expect(expandTilde("/home/~/test")).toBe("/home/~/test");
  });

  it("handles ~ alone (no slash after)", () => {
    // ~ without / after should not be expanded
    expect(expandTilde("~")).toBe("~");
  });
});
