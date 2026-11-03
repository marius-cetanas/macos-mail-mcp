import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHandler, onMacOS } from "../../helpers/run-applescript.js";
import { composeScript, substituteParams, SHARED_HANDLER_FILES } from "../../../src/bridge/applescript-runner.js";

const GUARD = "src/bridge/compose-guards.applescript";
const files = ["reply-to-message", "forward-message"];

describe.each(files)("%s content preservation", (name) => {
  const source = readFileSync(`src/domains/compose/scripts/${name}.applescript`, "utf8");

  it("inserts into rich text without replacing it", () => {
    expect(source).toMatch(/make new paragraph at beginning of content/);
    expect(source).not.toMatch(/set content to/);
  });

  it("validates the prepared message before checking send acceptance", () => {
    const message = name === "reply-to-message" ? "replyMsg" : "fwdMsg";
    expect(source).toContain(`my assertComposeReady(bodyContent, originalText, content of ${message} as text, originalAttachments, count of attachments of content of ${message}, count of recipients of ${message})`);
    expect(source).toContain(`set originalText to content of ${message} as text`);
    expect(source).toContain(`set originalAttachments to count of attachments of content of ${message}`);
    const insertion = source.indexOf("make new paragraph");
    expect(source.indexOf(`set originalText to content of ${message} as text`)).toBeLessThan(insertion);
    expect(source.indexOf(`set originalAttachments to count of attachments of content of ${message}`)).toBeLessThan(insertion);
    expect(source).toMatch(/if not \(send \w+\) then error/);
    expect(source.indexOf("my assertComposeReady(")).toBeLessThan(source.indexOf("(send "));
  });

  it.skipIf(!onMacOS)("compiles against the installed Mail dictionary without executing", () => {
    const dir = mkdtempSync(join(tmpdir(), "mail-mcp-compile-"));
    try {
      const script = composeScript(
        SHARED_HANDLER_FILES.map((f) => readFileSync(`src/bridge/${f}`, "utf8")),
        substituteParams(source, { bodyFile: "__NONE__", sender: "__NONE__", replyAll: "true", to: "fixture@example.invalid", messageId: "1", accountName: "Fixture", mailboxName: "INBOX" })
      );
      execFileSync("osacompile", ["-o", join(dir, "script.scpt"), "-"], { input: script, timeout: 20_000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!onMacOS)("production compose guard", () => {
  it("accepts a multiline Unicode prefix, quoted text and unchanged attachments", () => {
    expect(runHandler(GUARD, 'my assertComposeReady("line 1" & linefeed & "Salut 👋", "quoted original", "line 1" & linefeed & "Salut 👋" & linefeed & linefeed & "quoted original", 2, 2, 1)')).toBe("true");
  });

  it.each([
    ['"body", "quote", "quote", 1, 1, 1', "body"],
    ['"Body", "quote", "body" & linefeed & linefeed & "quote", 1, 1, 1', "body"],
    ['"body", "quote", "body" & linefeed & linefeed, 1, 1, 1', "original"],
    ['"quoted original", "quoted original" & linefeed & linefeed, "quoted original" & linefeed & linefeed, 0, 0, 1', "original"],
    ['"body", "quote", "body" & linefeed & linefeed & "quote", 2, 1, 1', "attachments"],
    ['"body", "quote", "body" & linefeed & linefeed & "quote", 1, 2, 1', "attachments"],
    ['"", "quote", "quote", 0, 0, 0', "recipients"],
  ])("rejects an invalid prepared message (%s)", (args, reason) => {
    expect(() => runHandler(GUARD, `my assertComposeReady(${args})`)).toThrow(new RegExp(reason));
  });

  it("allows a forward without a prefix and an empty original", () => {
    expect(runHandler(GUARD, 'my assertComposeReady("", "", "", 0, 0, 1)')).toBe("true");
  });
});
