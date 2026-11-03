import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  composeScript,
  escapeForAppleScript,
  SHARED_HANDLER_FILES,
  substituteParams,
} from "../../src/bridge/applescript-runner.js";
import { onMacOS } from "../helpers/run-applescript.js";

const READ_SITES = [
  { file: "compose/scripts/send-message.applescript", variable: "bodyContent" },
  { file: "compose/scripts/reply-to-message.applescript", variable: "bodyContent" },
  { file: "compose/scripts/forward-message.applescript", variable: "bodyContent" },
  { file: "compose/scripts/send-message.applescript", variable: "attachmentData" },
  { file: "messages/scripts/save-attachment.applescript", variable: "targetAttName" },
  { file: "messages/scripts/read-attachment.applescript", variable: "targetAttName" },
  { file: "messages/scripts/read-attachment.applescript", variable: "fileContent" },
];
const literal = (text: string) => `"${escapeForAppleScript(text)}"`;
const source = (file: string) => readFileSync(join("src/domains", file), "utf8");
const sharedSources = () => SHARED_HANDLER_FILES.map((file) => readFileSync(join("src/bridge", file), "utf8"));

function readExpression(site: (typeof READ_SITES)[number]): string {
  const expression = [...source(site.file).matchAll(new RegExp(`^\\s*set ${site.variable} to (.+)$`, "gm"))]
    .map((match) => match[1]!)
    .find((value) => /^(?:do shell script|my readUtf8File)\b/.test(value));
  expect(expression, `${site.file} must read ${site.variable}`).toBeDefined();
  return expression!;
}

function run(body: string): string {
  return execFileSync("osascript", ["-"], {
    input: composeScript(sharedSources(), body), encoding: "utf8", timeout: 20_000,
  }).replace(/\n$/, "");
}

function withFixture(content: string, body: (file: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "mail-mcp-utf8-"));
  try {
    const file = join(dir, "café's \"text\" \\ 😀.txt");
    writeFileSync(file, content, "utf8");
    body(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readJson(expression: string): string {
  const output = run(`set fileContent to ${expression}\nreturn "\\\"" & my escapeForJson(fileContent) & "\\\""`);
  return JSON.parse(output) as string;
}

function domainScripts(dir = "src/domains"): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? domainScripts(file) : file.endsWith(".applescript") ? [file] : [];
  });
}

describe("native UTF-8 file reads are wired into every text read", () => {
  it("prepends the shared UTF-8 reader", () => {
    expect(SHARED_HANDLER_FILES).toContain("read-utf8-file.applescript");
  });

  it.each(READ_SITES)("$file reads $variable with the production helper", (site) => {
    expect(readExpression(site)).toMatch(/^my readUtf8File\(/);
  });

  it("leaves no shell-cat read in any domain script", () => {
    const remaining = domainScripts().filter((file) => /do shell script\s+"cat\b/.test(readFileSync(file, "utf8")));
    expect(remaining).toEqual([]);
  });
});

describe.skipIf(!onMacOS)("UTF-8 file content through production reads and JSON, executed", () => {
  it.each(READ_SITES)("$file preserves $variable, including mixed line endings and trailing newlines", (site) => {
    const content = 'line 1: ✓ ăîșț 😀 e\u0301\nline 2: "quotes" \\backslash\r\nline 3\rlast\n\n';
    withFixture(content, (file) => {
      const expression = substituteParams(readExpression(site), { bodyFile: file, attNameFile: file });
      const output = run([
        `set pathsFile to ${literal(file)}`,
        `set tempPath to ${literal(file)}`,
        `set fileContent to ${expression}`,
        'return "\\\"" & my escapeForJson(fileContent) & "\\\""',
      ].join("\n"));
      expect(Buffer.from(JSON.parse(output), "utf8")).toEqual(Buffer.from(content, "utf8"));
    });
  });

  it.each([
    ["empty", ""],
    ["no final newline", "plain ✓ ăîșț 😀 e\u0301"],
    ["LF", "one\ntwo\n"],
    ["CRLF", "one\r\ntwo\r\n"],
    ["lone CR", "one\rtwo\r"],
    ["multiple trailing newlines", "one\n\n\n"],
    ["newlines only", "\n\r\n\r\n"],
    ["quotes and backslashes", '"quoted" \\ path\\\n'],
    ["control characters", "a\0b\t\u0001\u001f\n"],
    ["leading UTF-8 BOM", "\ufeffone\n"],
    ["UTF-8 BOM only", "\ufeff"],
    ["repeated UTF-8 BOM", "\ufeff\ufeffone\n"],
  ])("preserves %s in native read/JSON roundtrip", (_name, content) => {
    withFixture(content, (file) => {
      expect(Buffer.from(readJson(`my readUtf8File(${literal(file)})`), "utf8"))
        .toEqual(Buffer.from(content, "utf8"));
    });
  });

  it.each(["", "read again\n", "\ufeffread again\n"])("propagates file errors and leaves implicit read handles closed for %j", (content) => {
    withFixture(content, (file) => {
      const result = run([
        "repeat 5 times",
        "    try",
        `        my readUtf8File(${literal(`${file}.missing`)})`,
        '        return "missing file was accepted"',
        "    on error",
        "    end try",
        `    my readUtf8File(${literal(file)})`,
        "    try",
        `        close access (POSIX file ${literal(file)})`,
        '        return "read handle leaked"',
        "    on error errMsg number errNum",
        "        if errNum is not -38 then error errMsg number errNum",
        "    end try",
        "end repeat",
        'return "reads and errors closed"',
      ].join("\n"));
      expect(result).toBe("reads and errors closed");
      expect(existsSync(`${file}.missing`)).toBe(false);
    });
  });

  it.each([...new Set(READ_SITES.map((site) => site.file))])("compiles %s and shared handlers without executing Mail", (file) => {
    const dir = mkdtempSync(join(tmpdir(), "mail-mcp-utf8-compile-"));
    try {
      const script = composeScript(sharedSources(), substituteParams(source(file), {
        bodyFile: "/tmp/body.txt", attNameFile: "/tmp/attname.txt", attachmentPathsFile: "/tmp/paths.txt",
        attachmentCount: "2", subject: "Fixture", sender: "__NONE__", to: "nobody@example.invalid",
        cc: "__NONE__", bcc: "__NONE__", messageId: "1", accountName: "Fixture", mailboxName: "INBOX",
        replyAll: "false", savePath: "/tmp",
      }));
      expect(script).not.toMatch(/\{\{\w+\}\}/);
      execFileSync("osacompile", ["-o", join(dir, "script.scpt"), "-"], {
        input: script, encoding: "utf8", timeout: 20_000,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
