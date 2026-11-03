import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  composeScript,
  escapeForAppleScript,
  SHARED_HANDLER_FILES,
  substituteParams,
} from "../../../src/bridge/applescript-runner.js";
import { onMacOS } from "../../helpers/run-applescript.js";

const template = readFileSync("src/domains/compose/scripts/send-message.applescript", "utf8");
const sharedSources = SHARED_HANDLER_FILES.map((file) => readFileSync(join("src/bridge", file), "utf8"));
const literal = (text: string) => `"${escapeForAppleScript(text)}"`;

function handler(name: string): string {
  const match = template.match(new RegExp(`^on ${name}\\([^]*?^end ${name}$`, "m"));
  expect(match, `template must define ${name}`).not.toBeNull();
  return match![0];
}

// Execute only the production helpers; the Mail application block never runs.
function run(body: string): string {
  const helpers = ["readAttachmentPaths", "requireAttachmentCount", "requireSendAccepted"].map(handler).join("\n");
  return execFileSync("osascript", ["-"], {
    input: `${sharedSources[0]}\n${helpers}\n${body}`,
    encoding: "utf8",
    timeout: 20_000,
  }).trimEnd();
}

function withPathList(paths: string[], body: (file: string) => void): void {
  const temp = mkdtempSync(join(tmpdir(), "mail-mcp-attachment-test-"));
  try {
    const file = join(temp, "paths.txt");
    writeFileSync(file, paths.join("\n"), "utf8");
    body(file);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

describe("send attachment safety wiring", () => {
  it("checks the parsed count and outgoing rich-text attachments before send", () => {
    expect(template).toContain('my readAttachmentPaths("{{attachmentPathsFile}}", {{attachmentCount}})');
    expect(template).toContain("tell content of newMsg");
    const check = template.indexOf("my requireAttachmentCount(count of attachments of content of newMsg, {{attachmentCount}})");
    expect(check).toBeGreaterThan(template.indexOf("make new attachment"));
    expect(check).toBeLessThan(template.indexOf("send newMsg"));
    expect(template).not.toMatch(/mail attachments of newMsg/);
  });

  it("guards Mail's send result before reporting success", () => {
    expect(template).toContain("set didSend to send newMsg");
    const check = template.indexOf("my requireSendAccepted(didSend)");
    expect(check).toBeGreaterThan(template.indexOf("send newMsg"));
    expect(check).toBeLessThan(template.indexOf('\\"success\\": true'));
  });
});

describe.skipIf(!onMacOS)("send attachment helpers, executed", () => {
  it.each([1, 2, 3])("reads all %i LF-separated paths after shell line-ending conversion", (count) => {
    const paths = ["/tmp/one.txt", "/tmp/two.csv", "/tmp/three.png"].slice(0, count);
    withPathList(paths, (file) => {
      const result = run([
        `set paths to my readAttachmentPaths(${literal(file)}, ${count})`,
        "set resultParts to {}",
        "repeat with p in paths",
        '    set end of resultParts to "\\\"" & my escapeForJson(p as text) & "\\\""',
        "end repeat",
        'set AppleScript\'s text item delimiters to ","',
        'return "[" & (resultParts as text) & "]"',
      ].join("\n"));
      expect(JSON.parse(result)).toEqual(paths);
    });
  });

  it("preserves spaces, apostrophes, quotes, backslashes, Unicode, order and duplicate paths", () => {
    const paths = ["/tmp/café's \"report\" \\ résumé.txt", "/tmp/e\u0301 😀.csv", "/tmp/e\u0301 😀.csv"];
    withPathList(paths, (file) => {
      const result = run([
        `set paths to my readAttachmentPaths(${literal(file)}, ${paths.length})`,
        "set resultParts to {}",
        "repeat with p in paths",
        '    set end of resultParts to "\\\"" & my escapeForJson(p as text) & "\\\""',
        "end repeat",
        'set AppleScript\'s text item delimiters to ","',
        'return "[" & (resultParts as text) & "]"',
      ].join("\n"));
      expect(JSON.parse(result)).toEqual(paths);
    });
  });

  it("leaves caller text item delimiters unchanged", () => {
    withPathList(["/tmp/one.txt", "/tmp/two.txt"], (file) => {
      expect(run([
        'set AppleScript\'s text item delimiters to "|"',
        `set paths to my readAttachmentPaths(${literal(file)}, 2)`,
        "return AppleScript's text item delimiters as text",
      ].join("\n"))).toBe("|");
    });
  });

  it("rejects a parsed-list mismatch before its send continuation", () => {
    withPathList(["/tmp/one.txt", "/tmp/two.txt"], (file) => {
      const result = run([
        "try",
        `    my readAttachmentPaths(${literal(file)}, 3)`,
        '    return "send reached"',
        "on error errMsg",
        "    return errMsg",
        "end try",
      ].join("\n"));
      expect(result).toMatch(/expected 3.*found 2.*not sent/);
    });
  });

  it.each(["0", "-1", "1.5", '"2"', "missing value"])("rejects invalid expected count %s", (expected) => {
    expect(run([
      "try",
      `    my requireAttachmentCount(0, ${expected})`,
      '    return "send reached"',
      "on error errMsg",
      "    return errMsg",
      "end try",
    ].join("\n"))).toMatch(/Invalid expected attachment count.*not sent/);
  });

  it.each([0, 1, 3])("a failed attach count of %i cannot reach send when 2 were requested", (actual) => {
    expect(run([
      "try",
      `    my requireAttachmentCount(${actual}, 2)`,
      '    return "send reached"',
      "on error errMsg",
      "    return errMsg",
      "end try",
    ].join("\n"))).toMatch(new RegExp(`expected 2.*found ${actual}.*not sent`));
  });

  it("allows send continuation only after the expected attachment count", () => {
    expect(run('my requireAttachmentCount(3, 3)\nreturn "send reached"')).toBe("send reached");
  });

  it.each(["false", "missing value"])("rejects Mail send result %s", (result) => {
    expect(run([
      "try",
      `    my requireSendAccepted(${result})`,
      '    return "success reached"',
      "on error errMsg",
      "    return errMsg",
      "end try",
    ].join("\n"))).toMatch(/Mail did not accept.*sending/);
  });

  it("accepts a true send result", () => {
    expect(run('my requireSendAccepted(true)\nreturn "success reached"')).toBe("success reached");
  });

  it("compiles the complete substituted template with shared handlers without executing Mail", () => {
    const temp = mkdtempSync(join(tmpdir(), "mail-mcp-compile-test-"));
    try {
      const script = composeScript(sharedSources, substituteParams(template, {
        bodyFile: "/tmp/body.txt", subject: "Hi", sender: "__NONE__",
        to: "nobody@example.invalid", cc: "__NONE__", bcc: "__NONE__",
        attachmentPathsFile: "/tmp/attachments.txt", attachmentCount: "3",
      }));
      expect(script).not.toMatch(/\{\{\w+\}\}/);
      execFileSync("osacompile", ["-o", join(temp, "send.scpt"), "-"], {
        input: script, encoding: "utf8", timeout: 20_000,
      });
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
