import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { composeScript, escapeForAppleScript, SHARED_HANDLER_FILES, substituteParams } from "../../../src/bridge/applescript-runner.js";
import { onMacOS } from "../../helpers/run-applescript.js";

const template = readFileSync("src/domains/messages/scripts/search-messages.applescript", "utf8");
const shared = SHARED_HANDLER_FILES.map((file) => readFileSync(join("src/bridge", file), "utf8"));
const literal = (value: string) => `"${escapeForAppleScript(value)}"`;

describe("one-mailbox search template wiring", () => {
  it("does not enumerate accounts/mailboxes and resolves one scoped target", () => {
    expect(template).not.toMatch(/every (?:account|mailbox)/);
    expect(template).toContain("my resolveMailbox(theAccountName, theMailboxName)");
    expect(template.match(/my searchInMailbox\(/g)).toHaveLength(1);
    expect(template).toContain("with timeout of {{eventTimeoutSeconds}} seconds");
    expect(template).toContain("my mailboxFullName(theMailbox)");
    expect(template).toContain("my escapeForJson(accountName)");
    expect(template).toContain("if msgId is in newSeenIds then");
  });

  it("keeps zero-offset date filters and explicit per-target limit", () => {
    expect(template).toContain('if "{{hasAfter}}" is "true" then');
    expect(template).toContain('if "{{hasBefore}}" is "true" then');
    expect(template).not.toContain("if afterSecs is not 0");
    expect(template).toContain("if matchCount >= remainingLimit then exit repeat");
  });
});

describe.skipIf(!onMacOS)("production search guards without Mail", () => {
  const guard = template.slice(template.indexOf('if theAccountName is "__ALL__"'), template.indexOf("set seenIds to"));
  it.each([["__ALL__", "INBOX"], ["Google", "__ALL__"], ["", "INBOX"], ["Google", ""]])("rejects broad account=%j mailbox=%j", (account, mailbox) => {
    const body = [`set theAccountName to ${literal(account)}`, `set theMailboxName to ${literal(mailbox)}`, 'set theField to "subject"', "try", guard, 'return "search reached"', "on error errMsg", "return errMsg", "end try"].join("\n");
    expect(execFileSync("osascript", ["-"], { input: substituteParams(body, { limit: "50" }), encoding: "utf8" })).toContain("Search requires one account and one mailbox");
  });

  it("compiles the complete substituted search template without executing it", () => {
    const dir = mkdtempSync(join(tmpdir(), "mail-mcp-search-compile-"));
    try {
      const script = composeScript(shared, substituteParams(template, { field: "subject", query: 'quoted "query" \\ 😀', accountName: "Fixture", mailboxName: "[Gmail]/All Mail", limit: "50", seenIds: "1,999999999", hasAfter: "true", hasBefore: "false", afterSeconds: "0", beforeSeconds: "0", eventTimeoutSeconds: "9" }));
      expect(script).not.toMatch(/\{\{\w+\}\}/);
      execFileSync("osacompile", ["-o", join(dir, "search.scpt"), "-"], { input: script, encoding: "utf8", timeout: 20_000 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
