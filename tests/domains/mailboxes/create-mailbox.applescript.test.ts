import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { composeScript, escapeForAppleScript, SHARED_HANDLER_FILES, substituteParams } from "../../../src/bridge/applescript-runner.js";
import { onMacOS } from "../../helpers/run-applescript.js";

const template = readFileSync("src/domains/mailboxes/scripts/create-mailbox.applescript", "utf8");
const shared = SHARED_HANDLER_FILES.map((file) => readFileSync(join("src/bridge", file), "utf8"));
const literal = (text: string) => `"${escapeForAppleScript(text)}"`;

function handler(name: string): string {
  const match = template.match(new RegExp(`^on ${name}\\([^]*?^end ${name}$`, "m"));
  expect(match, `production ${name} handler`).not.toBeNull();
  return match![0];
}

function run(body: string): string {
  const helpers = ["mailboxCreationPath", "assertCreatedMailboxPath"].map(handler).join("\n");
  return execFileSync("osascript", ["-"], {
    input: composeScript(shared, `${helpers}\n${body}`), encoding: "utf8", timeout: 20_000,
  }).replace(/\n$/, "");
}

describe("create_mailbox account-scoped path wiring", () => {
  it("resolves a parent before constructing its full path and creating at the requested account", () => {
    const resolution = template.indexOf('my resolveMailbox("{{accountName}}", theParent)');
    const construction = template.indexOf('my mailboxCreationPath(my mailboxFullName(parentMbox), "{{mailboxName}}")');
    const creation = template.indexOf("make new mailbox with properties {name:requestedPath} at theAccount");
    expect(resolution).toBeGreaterThanOrEqual(0);
    expect(construction).toBeGreaterThan(resolution);
    expect(creation).toBeGreaterThan(construction);
    expect(template).toContain('set theAccount to account "{{accountName}}"');
    expect(template.match(/make new mailbox/g)).toHaveLength(1);
    expect(template).not.toContain("at parentMbox");
  });

  it("keeps top-level and caller-supplied full path creation at the account", () => {
    expect(template).toContain('set requestedPath to my mailboxCreationPath("", "{{mailboxName}}")');
    expect(template).toContain('if theParent is not "__NONE__" then');
  });

  it("validates actual full path readback before returning it", () => {
    const readback = template.indexOf("set actualPath to my mailboxFullName(newMbox)");
    const guard = template.indexOf("my assertCreatedMailboxPath(requestedPath, actualPath)");
    const escape = template.indexOf("set mboxName to my escapeForJson(actualPath)");
    expect(readback).toBeGreaterThan(template.indexOf("make new mailbox"));
    expect(guard).toBeGreaterThan(readback);
    expect(escape).toBeGreaterThan(guard);
    expect(template).not.toContain("escapeForJson(name of newMbox)");
    expect(template.indexOf('\\"success\\": true')).toBeGreaterThan(escape);
  });

  it("preserves locale-independent error numbers", () => {
    expect(template).toContain("my integerForJson(errNum)");
  });
});

describe.skipIf(!onMacOS)("production mailbox creation path helpers, executed without Mail", () => {
  it.each([
    ["", "Archive", "Archive"],
    ["", "Parent/Nested", "Parent/Nested"],
    ["Parent", "Nested", "Parent/Nested"],
    ["Projects/2026", "Q2", "Projects/2026/Q2"],
    ["[Gmail]/Projects", "Nested", "[Gmail]/Projects/Nested"],
    ["Parent", "Child/Grandchild", "Parent/Child/Grandchild"],
    ['café \\ "parent"', "emoji 😀 e\u0301 'child'", 'café \\ "parent"/emoji 😀 e\u0301 \'child\''],
  ])("constructs %j plus %j as %j", (parent, child, expected) => {
    const output = run([
      `set fullPath to my mailboxCreationPath(${literal(parent)}, ${literal(child)})`,
      'return "\\\"" & my escapeForJson(fullPath) & "\\\""',
    ].join("\n"));
    expect(JSON.parse(output)).toBe(expected);
  });

  it("does not change caller delimiters", () => {
    expect(run('set AppleScript\'s text item delimiters to "|"\nmy mailboxCreationPath("Parent", "Child")\nreturn AppleScript\'s text item delimiters as text')).toBe("|");
  });

  it("accepts matching root or nested full-path readback", () => {
    for (const path of ["Root", "[Gmail]/Parent/Child", "café/😀"])
      expect(run(`my assertCreatedMailboxPath(${literal(path)}, ${literal(path)})\nreturn "accepted"`)).toBe("accepted");
  });

  it.each([
    ["Parent/Child", "Child"],
    ["Parent/Child", "Other/Child"],
    ["Parent/Child", "parent/child"],
    ["Parent/Child", "Parent / Child"],
    ["Parent/Child", "ParentChild"],
  ])("rejects requested %j with readback %j before success", (requested, actual) => {
    const output = run([
      "try", `my assertCreatedMailboxPath(${literal(requested)}, ${literal(actual)})`,
      'return "success reached"', "on error errMsg", "return errMsg", "end try",
    ].join("\n"));
    expect(output).toMatch(/Mail returned a different mailbox path/);
  });

  it("returns full-path and account readback through the actual JSON assembly", () => {
    const resultLine = template.split("\n").find((line) => line.includes('return "{\\"success\\": true'));
    expect(resultLine).toBeDefined();
    const path = 'Parent \\ "quoted"/Nested 😀';
    const output = run([
      `set actualPath to ${literal(path)}`,
      "set mboxName to my escapeForJson(actualPath)",
      'set acctName to my escapeForJson("Fixture account")',
      resultLine!,
    ].join("\n"));
    expect(JSON.parse(output)).toEqual({ success: true, mailboxName: path, accountName: "Fixture account" });
  });

  it("compiles the full substituted template without executing mailbox creation", () => {
    const dir = mkdtempSync(join(tmpdir(), "mail-mcp-mailbox-compile-"));
    try {
      const script = composeScript(shared, substituteParams(template, {
        accountName: 'Fixture "account"', parentMailboxName: "[Gmail]/Projects", mailboxName: "Child 😀",
      }));
      expect(script).not.toMatch(/\{\{\w+\}\}/);
      execFileSync("osacompile", ["-o", join(dir, "script.scpt"), "-"], { input: script, encoding: "utf8", timeout: 20_000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
