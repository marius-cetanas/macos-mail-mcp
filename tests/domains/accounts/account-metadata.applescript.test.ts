import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { composeScript, escapeForAppleScript, SHARED_HANDLER_FILES, substituteParams } from "../../../src/bridge/applescript-runner.js";
import { onMacOS } from "../../helpers/run-applescript.js";

const files = ["list-accounts", "get-account-detail"];
const source = (file: string) => readFileSync(`src/domains/accounts/scripts/${file}.applescript`, "utf8");
const shared = SHARED_HANDLER_FILES.map((file) => readFileSync(join("src/bridge", file), "utf8"));
const literal = (text: string) => `"${escapeForAppleScript(text)}"`;

function accountFixture(file: string, rawType: string, values = ['"imap.example.invalid"', "993", "true"], expectedGets?: number): unknown {
  const template = source(file);
  const outerBody = template.match(/tell application "Mail"\s+try\n([^]*?)\n\s*on error errMsg number errNum/)?.[1];
  expect(outerBody).toBeDefined();
  const typeHelper = template.match(/^on accountTypeName\([^]*?^end accountTypeName$/m)?.[0] ?? "";
  const body = outerBody!
    .replace("set allAccounts to every account", "set allAccounts to {fixtureAccount}")
    .replace('set acct to account "{{accountName}}"', "set acct to fixtureAccount")
    .replace("server name of acct", "my fixtureServer()")
    .replace("port of acct", "my fixturePort()")
    .replace("uses ssl of acct", "my fixtureSsl()")
    .replace("count of mailboxes of acct", "17");
  const script = [
    "script probe", "property gets : 0", "end script", typeHelper,
    ...["Server", "Port", "Ssl"].map((name, index) => [
      `on fixture${name}()`, "set gets of probe to (gets of probe) + 1",
      values[index]!.startsWith("error ") ? values[index]! : `return ${values[index]}`,
      `end fixture${name}`,
    ].join("\n")),
    "on fixtureRun()", 'using terms from application "Mail"',
    `set fixtureAccount to {name:"Exchange", account type:${literal(rawType)}, enabled:true, full name:"Display Name", email addresses:{"fixture@example.invalid"}, user name:"fixture-user"}`,
    body, "end using terms from", "end fixtureRun", "set payload to my fixtureRun()",
    ...(expectedGets === undefined ? [] : [`if gets of probe is not ${expectedGets} then error "wrong metadata getter count"`]),
    "return payload",
  ].join("\n");
  const output = execFileSync("osascript", ["-"], { input: composeScript(shared, script), encoding: "utf8", timeout: 20_000 });
  return JSON.parse(output);
}

describe("account metadata production wiring", () => {
  it.each(files)("%s preserves raw type text through canonicalization and JSON escaping", (file) => {
    expect(source(file)).toContain("my accountTypeName(account type of acct as text)");
    expect(source(file)).not.toContain('set acctType to "unknown"');
    expect(source(file)).toContain("my escapeForJson(acctType)");
  });

  it("declares nullable server metadata and an open type contract", () => {
    const types = readFileSync("src/types.ts", "utf8");
    expect(types).toContain("type: string;");
    expect(types).toContain("serverName: string | null;");
    expect(types).toContain("port: number | null;");
    expect(types).toContain("usesSsl: boolean | null;");
  });
});

describe.skipIf(!onMacOS).each(files)("%s production account serialization with fixtures", (file) => {
  it.each([
    ["imap", "imap"], ["IMAP", "imap"], ["pop", "pop"], ["POP", "pop"],
    ["iCloud", "iCloud"], ["ICLOUD", "iCloud"], ["smtp", "smtp"], ["SMTP", "smtp"],
    ["exchange", "exchange"], ["unknown", "unknown"], ["vendor-imap-next", "vendor-imap-next"],
    ['future "kind" \\ 😀', 'future "kind" \\ 😀'],
  ])("reports raw type %j as %j", (raw, expected) => {
    const result = accountFixture(file, raw);
    const account = (Array.isArray(result) ? result[0] : result) as Record<string, unknown>;
    expect(account).toMatchObject({ name: "Exchange", type: expected, enabled: true, fullName: "Display Name", emails: ["fixture@example.invalid"] });
  });

  it("compiles the full template and shared helpers without account reads", () => {
    const dir = mkdtempSync(join(tmpdir(), "mail-mcp-accounts-compile-"));
    try {
      const script = composeScript(shared, substituteParams(source(file), { accountName: "Fixture" }));
      expect(script).not.toMatch(/\{\{\w+\}\}/);
      execFileSync("osacompile", ["-o", join(dir, "script.scpt"), "-"], { input: script, encoding: "utf8", timeout: 20_000 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!onMacOS)("get_account_detail nullable server metadata", () => {
  it.each(["exchange", "unknown", "vendor-imap-next"])("does not read unsupported %s server properties", (type) => {
    expect(accountFixture("get-account-detail", type, undefined, 0)).toMatchObject({ type, serverName: null, port: null, usesSsl: null, userName: "fixture-user", mailboxCount: 17 });
  });

  it.each(["imap", "pop", "iCloud", "smtp"])("preserves available %s settings, including genuine false/zero", (type) => {
    expect(accountFixture("get-account-detail", type, ['""', "0", "false"], 3)).toMatchObject({ serverName: "", port: 0, usesSsl: false });
  });

  it("preserves available values and integer JSON encoding", () => {
    expect(accountFixture("get-account-detail", "imap", [literal('host"\\name'), "999999999", "true"], 3)).toMatchObject({ serverName: 'host"\\name', port: 999999999, usesSsl: true });
  });

  it("reports missing supported properties as null", () => {
    expect(accountFixture("get-account-detail", "imap", ["missing value", "missing value", "missing value"], 3)).toMatchObject({ serverName: null, port: null, usesSsl: null });
  });

  it.each(["1.5", "9007199254740992"])("reports an unrepresentable port %s as null", (port) => {
    expect(accountFixture("get-account-detail", "imap", ['"imap.example.invalid"', port, "true"], 3)).toMatchObject({ serverName: "imap.example.invalid", port: null, usesSsl: true });
  });

  it.each([0, 1, 2])("reports unavailable getter %i as null while preserving other settings", (index) => {
    const values = ['"imap.example.invalid"', "993", "true"];
    values[index] = 'error "metadata unavailable" number -1728';
    const expected = { serverName: "imap.example.invalid" as string | null, port: 993 as number | null, usesSsl: true as boolean | null };
    const key = ["serverName", "port", "usesSsl"][index]!;
    (expected as Record<string, unknown>)[key] = null;
    expect(accountFixture("get-account-detail", "imap", values, 3)).toMatchObject(expected);
  });
});
