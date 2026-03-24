// tests/bridge/applescript-runner.test.ts
import { describe, it, expect } from "vitest";
import { escapeForAppleScript, substituteParams, parseAppleScriptOutput } from "../../src/bridge/applescript-runner.js";

describe("escapeForAppleScript", () => {
  it("escapes double quotes", () => {
    expect(escapeForAppleScript('hello "world"')).toBe('hello \\"world\\"');
  });
  it("escapes backslashes", () => {
    expect(escapeForAppleScript("path\\to\\file")).toBe("path\\\\to\\\\file");
  });
  it("escapes backslashes before quotes", () => {
    expect(escapeForAppleScript('say \\"hi\\"')).toBe('say \\\\\\"hi\\\\\\"');
  });
  it("passes through safe strings unchanged", () => {
    expect(escapeForAppleScript("hello world")).toBe("hello world");
  });
  it("handles empty string", () => {
    expect(escapeForAppleScript("")).toBe("");
  });
});

describe("substituteParams", () => {
  it("substitutes a single parameter", () => {
    const template = 'set x to "{{name}}"';
    const result = substituteParams(template, { name: "Alice" });
    expect(result).toBe('set x to "Alice"');
  });
  it("substitutes multiple parameters", () => {
    const template = 'mailbox "{{mailboxName}}" of account "{{accountName}}"';
    const result = substituteParams(template, { mailboxName: "INBOX", accountName: "Gmail" });
    expect(result).toBe('mailbox "INBOX" of account "Gmail"');
  });
  it("escapes parameter values", () => {
    const template = 'set x to "{{name}}"';
    const result = substituteParams(template, { name: 'O"Brien' });
    expect(result).toBe('set x to "O\\"Brien"');
  });
  it("leaves unmatched placeholders unchanged", () => {
    const template = "{{known}} and {{unknown}}";
    const result = substituteParams(template, { known: "yes" });
    expect(result).toBe("yes and {{unknown}}");
  });
});

describe("parseAppleScriptOutput", () => {
  it("parses valid JSON array", () => {
    const result = parseAppleScriptOutput('[{"name": "test"}]');
    expect(result).toEqual([{ name: "test" }]);
  });
  it("parses valid JSON object", () => {
    const result = parseAppleScriptOutput('{"key": "value"}');
    expect(result).toEqual({ key: "value" });
  });
  it("detects AppleScript error objects and throws", () => {
    expect(() =>
      parseAppleScriptOutput('{"error": "not found", "errorNumber": -1728}')
    ).toThrow("not found");
  });
  it("throws on invalid JSON", () => {
    expect(() => parseAppleScriptOutput("not json")).toThrow();
  });
  it("handles empty string", () => {
    expect(() => parseAppleScriptOutput("")).toThrow();
  });
});
