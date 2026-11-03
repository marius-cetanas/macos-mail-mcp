import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { composeScript, escapeForAppleScript, SHARED_HANDLER_FILES, substituteParams } from "../../src/bridge/applescript-runner.js";
import { onMacOS } from "../helpers/run-applescript.js";

const scoped = [
  "messages/scripts/get-message.applescript", "messages/scripts/mark-read.applescript", "messages/scripts/flag-message.applescript", "messages/scripts/delete-message.applescript",
  "messages/scripts/move-message.applescript", "messages/scripts/move-messages.applescript", "messages/scripts/list-attachments.applescript", "messages/scripts/read-attachment.applescript",
  "messages/scripts/save-attachment.applescript", "messages/scripts/save-all-attachments.applescript", "compose/scripts/reply-to-message.applescript", "compose/scripts/forward-message.applescript",
];
const source = (file: string) => readFileSync(join("src/domains", file), "utf8");
function domainFiles(dir = "src/domains"): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? domainFiles(path) : path.endsWith(".applescript") ? [path] : [];
  });
}
const literal = (value: string) => `"${escapeForAppleScript(value)}"`;
const wide = source("messages/scripts/get-message-by-id.applescript");
const bulk = source("messages/scripts/move-messages.applescript");
const account = 'requested "account" \\ café e\u0301 👩‍💻\r\nnext';
const mailbox = '[Gmail]/requested "folder" \\ e\u0301 👩‍💻\nnext';
const nativeMessage = 'Native UUID BBD014D5-80CA-448D-9735-CA8921166D1C: id 9.99999999E+8';
const errorLine = (template: string) => template.split("\n").find((line) => line.includes('return "{\\"error\\":') && line.includes("my escapeForJson(errMsg)"))!;

function run(body: string, fixtureLookup: string): string {
  const shared = SHARED_HANDLER_FILES.map((file) => {
    let text = readFileSync(join("src/bridge", file), "utf8");
    if (file === "resolve-message.applescript") {
      expect(text).toContain("(first message of theMailbox whose id is targetId)");
      text = text.replace('tell application "Mail"', 'using terms from application "Mail"')
        .replace(/\bend tell\b/, "end using terms from")
        .replace("(first message of theMailbox whose id is targetId)", "my fixtureLookup(theMailbox, targetId)");
      expect(text).not.toContain('tell application "Mail"');
    }
    return text;
  });
  return execFileSync("osascript", ["-"], {
    input: composeScript(shared, ["using terms from application \"Mail\"", "script probe", "property calls : 0", "end script",
      "on fixtureLookup(theMailbox, targetId)", "set calls of probe to (calls of probe) + 1", fixtureLookup, "end fixtureLookup", body, "end using terms from"].join("\n")),
    encoding: "utf8", timeout: 20_000,
  }).replace(/\n$/, "");
}

function missingText(id: number, path: string | null = mailbox): string {
  return `Message ${id} not found in account "${account}"${path === null ? " (searched all mailboxes)." : `, mailbox "${path}".`}`;
}

function scopedResult(file: string, id: number, errorNumber: number): unknown {
  const template = source(file);
  const statement = template.split("\n").find((line) => line.includes("set msg to my requireMessage("));
  expect(statement).toBeDefined();
  return JSON.parse(run([
    'set theMailbox to "resolved mailbox"', 'set srcMailbox to "resolved mailbox"', `set targetId to ${id}`, "try",
    substituteParams(statement!, { messageId: String(id), accountName: account, mailboxName: mailbox }),
    'return "{\\"id\\":" & my integerForJson(id of msg) & "}"', "on error errMsg number errNum", errorLine(template), "end try",
  ].join("\n"), errorNumber ? `error ${literal(nativeMessage)} number ${errorNumber}` : "return {id:targetId}"));
}

function accountWide(codes: number[], id = 999999999): { result: unknown; calls: number } {
  const start = wide.indexOf("set targetId to");
  const end = wide.indexOf("set msg to foundMsg", start);
  let flow = wide.slice(start, end).replace('account "{{accountName}}"', '"requested account"').replace("every mailbox of theAccount", "fixtureMailboxes");
  flow = substituteParams(flow, { messageId: String(id), accountName: account });
  const output = run([
    `set fixtureMailboxes to {${codes.map((code, i) => `{name:"mailbox${i}", lookupCode:${code}}`).join(",")}}`,
    'set resultJson to ""', "try", flow, 'set resultJson to "{\\"id\\":" & my integerForJson(id of foundMsg) & "}"',
    "on error errMsg number errNum", errorLine(wide).replace("return ", "set resultJson to "), "end try",
    'return "{\\"result\\":" & resultJson & ",\\"calls\\":" & my integerForJson(calls of probe) & "}"',
  ].join("\n"), `if lookupCode of theMailbox is not 0 then error ${literal(nativeMessage)} number (lookupCode of theMailbox)\nreturn {id:targetId}`);
  return JSON.parse(output);
}

describe("all message-ID lookup wiring", () => {
  it("uses the shared scoped boundary at all twelve scoped sites", () => {
    expect(scoped).toHaveLength(12);
    expect(SHARED_HANDLER_FILES).toContain("resolve-message.applescript");
    for (const file of scoped) {
      expect(source(file)).toContain("set msg to my requireMessage(");
      expect(source(file)).not.toMatch(/first message .*whose id/);
    }
    expect(wide).toContain("my findMessageInMailbox(mb, targetId)");
    expect(wide).not.toMatch(/first message .*whose id|messageId}} as integer/);
    const scripts = domainFiles();
    expect(scripts.filter((file) => /first message .*whose id/.test(readFileSync(file, "utf8")))).toEqual([]);
    expect(scripts.filter((file) => /set msg to my (requireMessage|findMessageInMailbox)\(/.test(readFileSync(file, "utf8"))).sort())
      .toEqual([...scoped, "messages/scripts/get-message-by-id.applescript"].map((file) => join("src/domains", file)).sort());
  });

  it("forces ID evaluation inside only the native lookup catch", () => {
    const file = SHARED_HANDLER_FILES.find((name) => name === "resolve-message.applescript");
    expect(file).toBeDefined();
    const helper = readFileSync(join("src/bridge", file!), "utf8");
    expect(helper.indexOf("get id of foundMessage")).toBeGreaterThan(helper.indexOf("first message of theMailbox"));
    expect(helper).toContain("if errNum is -1719 or errNum is -1728 then return missing value");
    expect(helper).toContain("error errMsg number errNum");
  });
});

describe.skipIf(!onMacOS)("production message lookup/error flows with local transport", () => {
  it.each(scoped)("%s reports missing IDs with escaped requested context", (file) => {
    expect(scopedResult(file, 999999999, -1719)).toEqual({ error: missingText(999999999), errorNumber: -1728 });
    expect(scopedResult(file, 999999999, -1728)).toEqual({ error: missingText(999999999), errorNumber: -1728 });
  });

  it.each([0, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER])("formats ID %s as plain decimal through actual error JSON", (id) => {
    expect(scopedResult(scoped[0]!, id, -1728)).toEqual({ error: missingText(id), errorNumber: -1728 });
  });

  it.each([-1743, -1712, -10000])("preserves non-missing lookup error %s", (code) => {
    expect(scopedResult(scoped[0]!, 999999999, code)).toEqual({ error: nativeMessage, errorNumber: code });
  });

  it("returns the found reference and forces ID readback before returning it", () => {
    expect(scopedResult(scoped[0]!, 999999999, 0)).toEqual({ id: 999999999 });
    expect(run('set foundMessage to my findMessageInMailbox("fixture", 1)\nreturn foundMessage is missing value', "return {}" )).toBe("true");
  });

  it("does not relabel a later message-property error as a missing lookup", () => {
    const template = source(scoped[0]!);
    const lookup = template.split("\n").find((line) => line.includes("set msg to my requireMessage("))!;
    const subject = template.split("\n").find((line) => line.includes("set msgSubject to"))!.replace("subject of msg", "my fixtureSubject(msg)");
    const result = JSON.parse(run([
      'set theMailbox to "resolved mailbox"', "try", substituteParams(lookup, { messageId: "1", accountName: account, mailboxName: mailbox }), subject,
      'return "{}"', "on error errMsg number errNum", errorLine(template), "end try",
      'on fixtureSubject(msg)\nerror "native subject property failed" number -1728\nend fixtureSubject',
    ].join("\n"), "return {id:targetId}"));
    expect(result.errorNumber).toBe(-1728);
    expect(result.error).toBe("native subject property failed");
    expect(result.error).not.toContain("not found in account");
  });

  it("keeps mailbox-resolution errors outside the message lookup boundary", () => {
    const template = source(scoped[0]!);
    const resolution = template.split("\n").find((line) => line.includes("set theMailbox to my resolveMailbox("))!;
    const lookup = template.split("\n").find((line) => line.includes("set msg to my requireMessage("))!;
    expect(template.indexOf(resolution)).toBeLessThan(template.indexOf(lookup));
    const result = JSON.parse(run([
      "try", resolution.replace(/my resolveMailbox\(.+\)/, 'my fixtureMailbox()'),
      substituteParams(lookup, { messageId: "1", accountName: account, mailboxName: mailbox }), 'return "{}"',
      "on error errMsg number errNum", errorLine(template), "end try",
      'on fixtureMailbox()\nerror "requested mailbox is unavailable" number -1728\nend fixtureMailbox',
    ].join("\n"), 'error "lookup must not run" number -10000'));
    expect(result).toEqual({ error: "requested mailbox is unavailable", errorNumber: -1728 });
  });

  it("continues account-wide search only for known missing codes", () => {
    expect(accountWide([-1719, -1728, 0])).toEqual({ result: { id: 999999999 }, calls: 3 });
    expect(accountWide([-1719, -1728])).toEqual({ result: { error: missingText(999999999, null), errorNumber: -1728 }, calls: 2 });
  });

  it.each([-1743, -1712, -10000])("stops account-wide lookup on error %s without replacing it with not-found", (code) => {
    expect(accountWide([-1719, code, 0])).toEqual({ result: { error: nativeMessage, errorNumber: code }, calls: 2 });
  });

  it("preserves partial bulk move results and distinguishes missing lookup from later action errors", () => {
    const main = bulk.slice(0, bulk.indexOf("\non parseMoveMessageIds"))
      .replace('tell application "Mail"', 'using terms from application "Mail"').replace(/^end tell$/m, "end using terms from")
      .replace('my resolveMailbox("{{accountName}}", "{{mailboxName}}")', '"source"')
      .replace('my resolveMailbox("{{accountName}}", "{{toMailbox}}")', '"destination"')
      .replace("move msg to destMailbox", "my fixtureMove(msg, destMailbox)");
    const parser = bulk.slice(bulk.indexOf("on parseMoveMessageIds"));
    const output = run([
      "on fixtureMove(msg, destination)", 'if id of msg is 2 then error "native action failed" number -1728', "end fixtureMove", parser,
      substituteParams(main, { accountName: account, mailboxName: mailbox, toMailbox: "destination", messageIds: "1,999999999,2" }),
    ].join("\n"), `if targetId is 999999999 then error ${literal(nativeMessage)} number -1719\nreturn {id:targetId}`);
    expect(JSON.parse(output)).toEqual({ moved: 1, failed: 2, errors: [{ id: 999999999, error: missingText(999999999) }, { id: 2, error: "native action failed" }] });
  });
});
