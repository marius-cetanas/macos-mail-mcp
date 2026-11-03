import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { composeScript, escapeForAppleScript, SHARED_HANDLER_FILES, substituteParams } from "../../../src/bridge/applescript-runner.js";
import { onMacOS } from "../../helpers/run-applescript.js";

const files = ["get-message", "get-message-by-id"];
const source = (file: string) => readFileSync(`src/domains/messages/scripts/${file}.applescript`, "utf8");
const shared = SHARED_HANDLER_FILES.map((file) => readFileSync(join("src/bridge", file), "utf8"));
const literal = (text: string) => `"${escapeForAppleScript(text)}"`;

function run(file: string, body: string): string {
  const handler = source(file).match(/^on buildRecipientsJson\([^]*?^end buildRecipientsJson$/m)?.[0];
  expect(handler, "production recipient serializer").toBeDefined();
  return execFileSync("osascript", ["-"], {
    input: composeScript(shared, `${handler}\nusing terms from application "Mail"\n${body}\nend using terms from`),
    encoding: "utf8", timeout: 20_000,
  }).replace(/\n$/, "");
}

describe.each(files)("%s recipient name wiring", (file) => {
  it.each(["to", "cc", "bcc"])("uses the guarded serializer for %s recipients", (kind) => {
    expect(source(file)).toContain(`set ${kind}Json to my buildRecipientsJson(${kind} recipients of msg)`);
    expect(source(file)).toContain("if rawName is not missing value then");
    expect(source(file)).not.toContain("escapeForJson(name of r as text)");
  });
});

describe.skipIf(!onMacOS).each(files)("%s production recipient serialization, executed without Mail", (file) => {
  it.each([
    ["missing value", ""],
    ['""', ""],
    [literal("missing value"), "missing value"],
    [literal('café "name" \\ 😀 e\u0301'), 'café "name" \\ 😀 e\u0301'],
  ])("normalizes name expression %s while preserving addresses and ordering", (nameExpression, expected) => {
    const address = 'quoted"address\\@example.invalid';
    const result = run(file, [
      `set fixtureRecipients to {{name:${nameExpression}, address:${literal(address)}}, {name:"Second", address:"second@example.invalid"}}`,
      "return my buildRecipientsJson(fixtureRecipients)",
    ].join("\n"));
    expect(JSON.parse(result)).toEqual([{ name: expected, address }, { name: "Second", address: "second@example.invalid" }]);
  });

  it("returns an empty array for no recipients", () => {
    expect(JSON.parse(run(file, "return my buildRecipientsJson({})"))).toEqual([]);
  });

  it("does not reuse a previous recipient's display name for a missing one", () => {
    const result = run(file, 'return my buildRecipientsJson({{name:"Known", address:"one@example.invalid"}, {name:missing value, address:"two@example.invalid"}, {name:"missing value", address:"three@example.invalid"}})');
    expect(JSON.parse(result)).toEqual([
      { name: "Known", address: "one@example.invalid" },
      { name: "", address: "two@example.invalid" },
      { name: "missing value", address: "three@example.invalid" },
    ]);
  });

  it("propagates recipient property errors", () => {
    const result = run(file, [
      "try", 'my buildRecipientsJson({{address:"recipient@example.invalid"}})',
      'return "property error swallowed"', "on error", 'return "property error propagated"', "end try",
    ].join("\n"));
    expect(result).toBe("property error propagated");
  });

  it("preserves normalized to/cc/bcc recipients through actual message JSON assembly", () => {
    const template = source(file);
    const bindings = template.split("\n").filter((line) => /^\s*set (?:to|cc|bcc)Json to my buildRecipientsJson/.test(line))
      .map((line) => line.replace(/(to|cc|bcc) recipients of msg/g, (_match, kind: string) => `fixture_${kind}`));
    const assembly = template.slice(template.indexOf('set result to "{"'), template.indexOf("return result") + "return result".length);
    const result = run(file, [
      'set fixture_to to {{name:missing value, address:"to@example.invalid"}}',
      'set fixture_cc to {{name:"CC name", address:"cc@example.invalid"}}',
      'set fixture_bcc to {{name:missing value, address:"bcc@example.invalid"}}',
      ...bindings,
      "set msgId to 1", 'set msgSubject to "subject"', 'set msgSender to "sender@example.invalid"',
      'set msgDate to "2026-11-03T00:00:00Z"', "set msgRead to false", "set msgFlagged to false", "set msgFlagIndex to -1",
      "set msgHasAttach to false", 'set msgBody to "body"', 'set msgHeaders to ""', 'set attachJson to ""',
      'set mboxNameEsc to "INBOX"', assembly,
    ].join("\n"));
    expect(JSON.parse(result)).toMatchObject({
      toRecipients: [{ name: "", address: "to@example.invalid" }],
      ccRecipients: [{ name: "CC name", address: "cc@example.invalid" }],
      bccRecipients: [{ name: "", address: "bcc@example.invalid" }],
    });
  });

  it("compiles the complete template and shared handlers without reading Mail", () => {
    const dir = mkdtempSync(join(tmpdir(), "mail-mcp-recipients-compile-"));
    try {
      const script = composeScript(shared, substituteParams(source(file), { messageId: "1", accountName: "Fixture", mailboxName: "INBOX" }));
      expect(script).not.toMatch(/\{\{\w+\}\}/);
      execFileSync("osacompile", ["-o", join(dir, "script.scpt"), "-"], { input: script, encoding: "utf8", timeout: 20_000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
