import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { composeScript, escapeForAppleScript, SHARED_HANDLER_FILES, substituteParams } from "../../src/bridge/applescript-runner.js";
import { onMacOS } from "../helpers/run-applescript.js";

const literal = (text: string) => `"${escapeForAppleScript(text)}"`;
const source = (file: string) => readFileSync(file, "utf8");
const moveSource = source("src/domains/messages/scripts/move-messages.applescript");
const shared = () => SHARED_HANDLER_FILES.map((file) => source(join("src/bridge", file)));
const integerFields = new Set(["id", "fileSize", "flagIndex", "port", "mailboxCount", "unreadCount", "messageCount", "moved", "failed", "errorNumber"]);

function scripts(dir = "src/domains"): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? scripts(file) : file.endsWith(".applescript") ? [file] : [];
  });
}

const sites = scripts().flatMap((file) => [...source(file).matchAll(/\\"(\w+)\\":\s*"\s*&\s*([^&\r\n]+?)\s*&/g)]
  .filter((match) => integerFields.has(match[1]!))
  .map((match) => ({ file, field: match[1]!, expression: match[2]! })));

function moveHandler(): string {
  const match = moveSource.match(/^on parseMoveMessageIds\([^]*?^end parseMoveMessageIds$/m);
  expect(match, "production move-ID parser").not.toBeNull();
  return match![0];
}

function run(body: string, helpers = ""): string {
  return execFileSync("osascript", ["-"], {
    input: composeScript(shared(), `${helpers}\n${body}`), encoding: "utf8", timeout: 20_000,
  }).replace(/\n$/, "");
}

function numbers(values: number[]): string[] {
  const result = run([
    "set output to {}",
    ...values.map((value) => `set end of output to my integerForJson(${value})`),
    'set AppleScript\'s text item delimiters to "|"',
    "return output as text",
  ].join("\n"));
  return result.split("|");
}

describe("integer JSON serialization wiring", () => {
  it("prepends the reserved numeric formatter", () => {
    expect(SHARED_HANDLER_FILES).toContain("integer-for-json.applescript");
  });

  it("covers all audited dynamic integer fields", () => {
    expect(new Set(sites.map((site) => site.field))).toEqual(integerFields);
    expect(sites).toHaveLength(44);
  });

  it.each(sites)("$file formats $field independently of locale", ({ file, field, expression }) => {
    if (file === "src/domains/accounts/scripts/get-account-detail.applescript" && field === "port") {
      expect(expression).toBe("acctPortJson");
      expect(source(file)).toContain("if rawPort is not missing value then set acctPortJson to my integerForJson(rawPort)");
    } else {
      expect(expression).toMatch(/^my integerForJson\(\w+\)$/);
    }
  });

  it("validates all move IDs before mailbox lookup or any move", () => {
    const parserCall = moveSource.indexOf('my parseMoveMessageIds("{{messageIds}}")');
    expect(parserCall).toBeGreaterThanOrEqual(0);
    expect(parserCall).toBeLessThan(moveSource.indexOf("my resolveMailbox("));
    expect(parserCall).toBeLessThan(moveSource.indexOf("move msg"));
    expect(moveSource).not.toMatch(/set targetId to .*as integer/);
  });
});

describe.skipIf(!onMacOS)("production integer serialization, executed without Mail", () => {
  it("reproduces native comma coercion while dot exponent JSON remains valid", () => {
    const native = run('set n to 999999999\nreturn n as text');
    expect(native).toMatch(/^9[.,]99999999E\+8$/);
    expect(JSON.parse('{"id":9.99999999E+8}').id).toBe(999999999);
    expect(Number.isInteger(JSON.parse('{"id":9.99999999E+8}').id)).toBe(true);
    expect(() => JSON.parse('{"id":9,99999999E+8}')).toThrow();
    if (native.includes(",")) expect(() => JSON.parse(`{"id":${native}}`)).toThrow();
  });

  it("reconstructs exact positive/negative values through both safe-integer limits", () => {
    const values = [0, -1, 1, 7, 12345678, 999999999, 2147483647, 2147483648,
      ...Array.from({ length: 21 }, (_, index) => Number.MAX_SAFE_INTEGER - index)];
    values.push(...values.filter((value) => value > 0).map((value) => -value));
    const output = numbers(values);
    expect(output).toEqual(values.map(String));
    expect(output.map((text) => JSON.parse(text))).toEqual(values);
    expect(output.every((text) => /^-?(?:0|[1-9]\d*)$/.test(text))).toBe(true);
  });

  it.each(['"0,1"', '"999999999"', '"1},\\\"injected\\\":true"', "true", "false", "missing value", "1.5", "-1.5", "9007199254740992", "-9007199254740992"])(
    "rejects invalid numeric input %s", (expression) => {
      expect(run(`try\nreturn my integerForJson(${expression})\non error errMsg\nreturn errMsg\nend try`)).toBe("Expected a safe integer for JSON.");
    }
  );

  it("leaves caller delimiters unchanged", () => {
    expect(run('set AppleScript\'s text item delimiters to "|"\nmy integerForJson(999999999)\nreturn AppleScript\'s text item delimiters as text')).toBe("|");
  });

  it.each(sites)("$file emits exact integer JSON for $field", ({ file, field, expression }) => {
    if (file === "src/domains/accounts/scripts/get-account-detail.applescript" && field === "port") {
      const assignment = source(file).split("\n").find((line) => line.includes("if rawPort is not missing value then set acctPortJson"));
      expect(assignment).toBeDefined();
      expect(run(`set rawPort to 999999999\n${assignment}\nreturn acctPortJson`)).toBe("999999999");
      return;
    }
    const variable = expression.match(/\((\w+)\)/)?.[1] ?? expression;
    const expected = variable === "errNum" ? -2147483647 : 999999999;
    const encoded = run(`set ${variable} to ${expected}\nreturn ${expression}`);
    expect(encoded).toBe(String(expected));
    expect(JSON.parse(encoded)).toBe(expected);
  });

  it("retains partial move counts, exact failed IDs and escaped error text", () => {
    const errorLine = moveSource.split("\n").find((line) => line.includes('set errorList to errorList & "{\\"id\\":'));
    const separatorLine = moveSource.split("\n").find((line) => line.includes('if errorList is not "" then'));
    const returnLine = moveSource.split("\n").find((line) => line.includes('return "{\\"moved\\":'));
    expect(errorLine).toBeDefined();
    expect(separatorLine).toBeDefined();
    expect(returnLine).toBeDefined();
    const error = 'missing "message" \\ ăîșț';
    const result = run([
      "set movedCount to 1", "set failedCount to 2", 'set errorList to ""', `set errMsg to ${literal(error)}`,
      "set targetId to 999999999", errorLine!,
      "set targetId to 9007199254740991", separatorLine!, errorLine!, returnLine!,
    ].join("\n"));
    expect(JSON.parse(result)).toEqual({ moved: 1, failed: 2, errors: [
      { id: 999999999, error }, { id: Number.MAX_SAFE_INTEGER, error },
    ] });
  });

  it("parses safe move IDs exactly and restores caller delimiters", () => {
    const values = [30428, 999999999, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 0];
    const result = run([
      'set AppleScript\'s text item delimiters to "|"',
      "set callerDelimiters to AppleScript's text item delimiters",
      `set ids to my parseMoveMessageIds(${literal(values.join(","))})`,
      "if AppleScript's text item delimiters is not callerDelimiters then error \"delimiter changed\"",
      "set encoded to {}", "repeat with n in ids", "set end of encoded to my integerForJson(n)", "end repeat",
      "return encoded as text",
    ].join("\n"), moveHandler());
    expect(result.split("|")).toEqual(values.map(String));
  });

  it.each(["", "1,", "1,2.5", "1,true", "1,9007199254740992", '1,2},"injected":true', "1, 2"])(
    "rejects invalid move tokens %j and restores delimiters before any continuation", (text) => {
      const result = run([
        'set AppleScript\'s text item delimiters to "|"', "try",
        `my parseMoveMessageIds(${literal(text)})`, 'return "move reached"', "on error errMsg",
        'if errMsg is not "Invalid move ID list." and errMsg is not "Expected a safe integer for JSON." then error errMsg',
        'return "rejected" & (AppleScript\'s text item delimiters as text)', "end try",
      ].join("\n"), moveHandler());
      expect(result).toBe("rejected|");
    }
  );

  it.each(scripts())("compiles %s with shared helpers without executing Mail", (file) => {
    const dir = mkdtempSync(join(tmpdir(), "mail-mcp-integer-compile-"));
    try {
      const params: Record<string, string> = {};
      const numeric = new Set(["messageId", "limit", "offset", "afterSeconds", "beforeSeconds", "flagIndex", "attachmentCount"]);
      for (const [, name] of source(file).matchAll(/\{\{(\w+)\}\}/g)) params[name!] = numeric.has(name!) ? "1" : "__NONE__";
      params.flagged = "true";
      params.read = "true";
      params.messageIds = "30428,999999999";
      const script = composeScript(shared(), substituteParams(source(file), params));
      expect(script).not.toMatch(/\{\{\w+\}\}/);
      execFileSync("osacompile", ["-o", join(dir, "script.scpt"), "-"], { input: script, encoding: "utf8", timeout: 20_000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
