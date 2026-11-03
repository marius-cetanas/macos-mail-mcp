import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { composeScript, SHARED_HANDLER_FILES, substituteParams } from "../../src/bridge/applescript-runner.js";
import { onMacOS } from "../helpers/run-applescript.js";

const files = ["list-messages", "search-messages", "get-message", "get-message-by-id"];
const source = (file: string) => readFileSync(`src/domains/messages/scripts/${file}.applescript`, "utf8");
const sites = files.flatMap((file) => [...source(file).matchAll(/^\s*set msgDate to (.+)$/gm)].map((match) => ({ file, expression: match[1]! })));
const shared = () => SHARED_HANDLER_FILES.map((file) => readFileSync(`src/bridge/${file}`, "utf8"));
const expected = (value: string) => new Date(value).toISOString().replace(".000Z", "Z");
const instants = [
  "1969-12-31T23:59:59Z", "1970-01-01T00:00:00Z", "2026-01-15T12:00:00Z", "2026-07-15T12:00:00Z",
  "2026-07-15T12:30:12+05:45", "2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00",
  "2026-12-31T23:59:59Z", "2027-01-01T00:00:00Z",
];

function run(body: string, zone = "UTC", locale = "C"): string {
  const script = `use framework "Foundation"\nuse scripting additions\n${composeScript(shared(), body)}`;
  return execFileSync("osascript", ["-"], { input: script, encoding: "utf8", timeout: 20_000, env: { ...process.env, TZ: zone, LC_ALL: locale, LANG: locale } }).trimEnd();
}

function nativeDate(value: string, name = "fixtureDate"): string {
  return `set ${name} to (current application's NSDate's dateWithTimeIntervalSince1970:${Date.parse(value) / 1000}) as date`;
}

describe("UTC message date wiring", () => {
  it("covers every dateReceived assignment in the four templates", () => {
    expect(sites).toHaveLength(5);
    for (const { expression } of sites) expect(expression).toMatch(/^my dateToUtcIso\(/);
    expect(SHARED_HANDLER_FILES).toContain("date-to-utc-iso.applescript");
  });
});

describe.skipIf(!onMacOS)("production UTC date serialization without Mail", () => {
  it.each(["C", "en_US.UTF-8", "ro_RO.UTF-8"])("preserves absolute instants and second precision in locale %s", (locale) => {
    const output = run([
      "set values to {}",
      ...instants.flatMap((value) => [nativeDate(value), "set end of values to my dateToUtcIso(fixtureDate)"]),
      'set AppleScript\'s text item delimiters to "|"', "return values as text",
    ].join("\n"), "UTC", locale).split("|");
    expect(output).toEqual(instants.map(expected));
    expect(output.map(Date.parse)).toEqual(instants.map(Date.parse));
    expect(output.every((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value))).toBe(true);
    expect(Date.parse(output[6]!) - Date.parse(output[5]!)).toBe(3_600_000);
  });

  it.each(["missing value", '"2026-01-15T12:00:00Z"', "0", "true"])("rejects non-date %s without inventing a timestamp", (input) => {
    const output = run(`try\nreturn my dateToUtcIso(${input})\non error errMsg\nreturn errMsg\nend try`);
    expect(output).toMatch(/Expected.*date/);
  });

  it.each(["America/New_York", "Europe/Bucharest", "Asia/Kathmandu"])("fails closed in a non-UTC subprocess %s", (zone) => {
    const output = run(`${nativeDate(instants[2]!)}\ntry\nreturn my dateToUtcIso(fixtureDate)\non error errMsg\nreturn errMsg\nend try`, zone);
    expect(output).toMatch(/UTC subprocess/);
  });

  it.each(sites)("$file uses production getter/JSON expressions with a UTC instant", ({ file, expression }) => {
    const getter = expression.replace("date received of msg", "fixtureDate").replace("msgDateRcvd", "fixtureDate");
    const line = source(file).split("\n").find((candidate) => candidate.includes('\\"dateReceived\\":'))!;
    const variable = line.match(/set (\w+) to/)![1];
    const output = run([
      nativeDate("2026-07-15T12:30:12+05:45"), `set msgDate to ${getter}`, `set ${variable} to "{"`, line,
      `return ${variable} & "\\\"done\\\":true}"`,
    ].join("\n"));
    expect(JSON.parse(output).dateReceived).toBe("2026-07-15T06:45:12Z");
  });

  it.each(["list-messages", "search-messages"])("%s reconstructs winter/summer after and before bounds without current-offset math", (file) => {
    const template = source(file);
    const lines = template.split("\n").filter((line) => /set (?:after|before)Date to \(current date\)/.test(line));
    const now = "2026-01-15T12:00:00Z";
    const bound = "2025-07-15T12:00:00Z";
    const seconds = (Date.parse(now) - Date.parse(bound)) / 1000;
    const body = substituteParams(lines.join("\n"), { hasAfter: "true", hasBefore: "true", afterSeconds: String(seconds), beforeSeconds: String(seconds) }).replaceAll("(current date)", "fixtureNow");
    const output = run([
      nativeDate(now, "fixtureNow"), `set afterSecs to ${seconds}`, `set beforeSecs to ${seconds}`, body,
      'return my dateToUtcIso(afterDate) & "|" & my dateToUtcIso(beforeDate)',
    ].join("\n"));
    expect(output.split("|")).toEqual([bound, bound]);
  });
});
