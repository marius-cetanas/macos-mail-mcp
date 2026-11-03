import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { onMacOS } from "../../helpers/run-applescript.js";

vi.mock("../../../src/bridge/applescript-runner.js", async (original) => ({
  ...await original<typeof import("../../../src/bridge/applescript-runner.js")>(), runAppleScript: vi.fn(),
}));

import { runAppleScript, parseAppleScriptOutput, AppleScriptTimeoutError } from "../../../src/bridge/applescript-runner.js";
import { handleSearchMessages, registerMessagesTools } from "../../../src/domains/messages/messages.tools.js";
import { captureTools, payload } from "../../helpers/capture-tools.js";

const bridge = vi.mocked(runAppleScript);
const scope = (mailboxName = "INBOX", accountName = "Google") => ({ accountName, mailboxName });
const message = (id: number, mailboxName = "INBOX", accountName = "Google") => ({ id, subject: "invoice", sender: "fixture@example.invalid", dateReceived: "2026-11-03T00:00:00Z", readStatus: false, flagged: false, flagIndex: -1, hasAttachments: false, mailboxName, accountName });
const inventory = [scope("Fast"), scope("Slow"), scope("Later")].map((target) => ({ name: target.mailboxName, accountName: target.accountName }));
type Options = { field?: string; query?: string; accountName?: string; mailboxName?: string; limit?: number; after?: string; before?: string; allowSlow?: boolean; signal?: AbortSignal };
const call = (options: Options = {}) => handleSearchMessages(options.field ?? "subject", options.query ?? "invoice", options.mailboxName, options.accountName, options.limit, options.after, options.before, options.allowSlow, options.signal);
const scoped = (options: Options = {}) => call({ ...scope(), ...options });
const searchCalls = () => bridge.mock.calls.filter(([script]) => script.endsWith("search-messages.applescript"));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  vi.setSystemTime(new Date("2026-11-03T00:00:00Z"));
  bridge.mockReset().mockImplementation(async (script) => script.includes("get-mailbox-info") ? { messageCount: 10 } : script.includes("list-mailboxes") ? inventory : []);
});
afterEach(() => {
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe("search policy before Mail work", () => {
  it.skipIf(!onMacOS)("feeds an emitted UTC timestamp back into both search bounds without shifting its instant", async () => {
    const helper = readFileSync("src/bridge/date-to-utc-iso.applescript", "utf8");
    const emitted = execFileSync("osascript", ["-"], {
      input: `use framework "Foundation"\nuse scripting additions\n${helper}\nset fixtureDate to (current application's NSDate's dateWithTimeIntervalSince1970:1793514600) as date\nreturn my dateToUtcIso(fixtureDate)`,
      encoding: "utf8", timeout: 20_000, env: { ...process.env, TZ: "UTC" },
    }).trim();
    expect(emitted).toBe("2026-11-01T06:30:00Z");
    await scoped({ after: emitted, before: emitted, query: "", allowSlow: true });
    expect(searchCalls()[0]![1]).toMatchObject({ hasAfter: "true", hasBefore: "true", afterSeconds: "149400", beforeSeconds: "149400" });
  });

  it.each(["after", "before"].flatMap((bound) => [
    "2026-02-30", "2026-02-29", "2026-04-31", "1900-02-29",
    "2026-02-30T12:00:00+02:00", "2026-13-01", "2026-01-00",
  ].map((value) => ({ bound, value }))))("rejects impossible $bound calendar date $value before any Mail IPC", async ({ bound, value }) => {
    await expect(scoped({ [bound]: value })).rejects.toThrow(/Invalid date/);
    expect(bridge).not.toHaveBeenCalled();
  });

  it.each(["after", "before"].flatMap((bound) => [
    "2024-02-29", "2000-02-29", "2024-02-29T12:34:56+02:00",
    "2024-02-29T05:34:56-05:00", "2026-04-30T23:59:59Z",
    "Thu, 29 Feb 2024 12:34:56 GMT",
  ].map((value) => ({ bound, value }))))("preserves valid $bound input $value and its instant", async ({ bound, value }) => {
    expect(await scoped({ [bound]: value, allowSlow: true })).toMatchObject({ partial: false });
    const expected = String(Math.floor((Date.now() - Date.parse(value)) / 1000));
    expect(searchCalls()[0]![1]).toMatchObject(bound === "after" ? { hasAfter: "true", afterSeconds: expected } : { hasBefore: "true", beforeSeconds: expected });
  });

  it.each([
    {}, { accountName: "Google" }, { mailboxName: "INBOX", allowSlow: true },
    { ...scope(), field: "content" }, { accountName: "Google", field: "content", allowSlow: true },
    { ...scope(), query: " " }, { ...scope(), field: "invalid" }, { ...scope(), limit: 0 }, { ...scope(), limit: 201 },
    { ...scope(), after: "invalid" }, { ...scope(), before: "invalid" },
    { ...scope(), after: "2026-12-01", before: "2026-11-01" }, { ...scope(), accountName: " " },
  ])("rejects unsafe/invalid request %j without calling Mail", async (options) => {
    await expect(call(options)).rejects.toThrow();
    expect(bridge).not.toHaveBeenCalled();
  });

  it.each([1001, null, undefined, -1, "10", Number.MAX_SAFE_INTEGER + 1])("refuses unavailable/large message count %s before search", async (messageCount) => {
    bridge.mockResolvedValueOnce({ messageCount });
    await expect(scoped()).rejects.toThrow(/allowSlow/);
    expect(searchCalls()).toHaveLength(0);
  });

  it.each([0, 1000])("allows safe count %i and enforces short search budget", async (messageCount) => {
    bridge.mockResolvedValueOnce({ messageCount });
    expect(await scoped()).toMatchObject({ messages: [], partial: false, cancelled: false, timedOut: [], skipped: [], errors: [], limitReached: false });
    expect(bridge.mock.calls[0]![0]).toContain("get-mailbox-info");
    expect(searchCalls()[0]![2]).toMatchObject({ timeout: 10_000, signal: expect.any(AbortSignal), utcDates: true });
    expect(bridge.mock.calls[0]![2]!.utcDates).toBeUndefined();
  });

  it("requires deliberate content opt-in and bypasses the count gate", async () => {
    await scoped({ field: "content", allowSlow: true });
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(searchCalls()).toHaveLength(1);
  });

  it("passes date-only and zero-offset filters to one mailbox", async () => {
    await scoped({ query: "", after: "2026-11-03T00:00:00Z", before: "2026-12-01", allowSlow: true });
    expect(searchCalls()[0]![1]).toMatchObject({ hasAfter: "true", hasBefore: "true", afterSeconds: "0", query: "", accountName: "Google", mailboxName: "INBOX" });
  });

  it("refuses a missing preflight payload instead of starting search", async () => {
    bridge.mockResolvedValueOnce(null);
    await expect(scoped()).rejects.toThrow(/allowSlow/);
    expect(searchCalls()).toHaveLength(0);
  });

  it("accepts a before-only date search and rejects a blank mailbox scope", async () => {
    expect(await scoped({ query: "", before: "2026-11-03", allowSlow: true })).toMatchObject({ partial: false });
    await expect(scoped({ mailboxName: " " })).rejects.toThrow(/blank/);
  });
});

describe("bounded serial search results", () => {
  it("preserves fast results, times out a later mailbox and stops scheduling", async () => {
    let rejectLate!: (error: Error) => void;
    bridge.mockImplementation(async (script, params) => {
      if (script.includes("list-mailboxes")) return inventory;
      if (params?.mailboxName === "Fast") return [message(1, "Fast")];
      return new Promise((_resolve, reject) => { rejectLate = reject; });
    });
    let result: unknown;
    const work = call({ accountName: "Google", allowSlow: true }).then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(result).toMatchObject({ messages: [message(1, "Fast")], partial: true, timedOut: [scope("Slow")], skipped: [{ ...scope("Later"), reason: "timeout" }], warnings: [expect.stringMatching(/wait|restart Mail/i)] });
    expect(searchCalls()).toHaveLength(2);
    expect(searchCalls()[1]![2]!.signal!.aborted).toBe(true);
    rejectLate(new Error("late rejection"));
    await work;
    await Promise.resolve();
  });

  it("limits total work including discovery to 45 seconds despite wall-clock changes", async () => {
    const targets = Array.from({ length: 7 }, (_, index) => ({ name: String(index), accountName: "Google" }));
    bridge.mockImplementation(async (script, params) => {
      if (script.includes("list-mailboxes")) return new Promise((resolve) => setTimeout(() => resolve(targets), 5_000));
      return new Promise((resolve) => setTimeout(() => resolve([message(Number(params!.mailboxName), params!.mailboxName)]), 9_000));
    });
    let result: unknown;
    const work = call({ allowSlow: true }).then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(5_000);
    vi.setSystemTime(new Date("2020-01-01T00:00:00Z"));
    await vi.advanceTimersByTimeAsync(40_000);
    expect(result).toMatchObject({ messages: expect.any(Array), partial: true, timedOut: [scope("4")], skipped: [{ ...scope("5"), reason: "timeout" }, { ...scope("6"), reason: "timeout" }] });
    expect((result as { messages: unknown[] }).messages).toHaveLength(4);
    expect(searchCalls()).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(5_000);
    await work;
  });

  it.each(["list-mailboxes", "get-mailbox-info"])("bounds %s before scheduling any search", async (stage) => {
    bridge.mockImplementation(async () => new Promise(() => {}));
    let result: unknown;
    const work = (stage === "list-mailboxes" ? call({ allowSlow: true }) : scoped()).then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(result).toMatchObject({ messages: [], partial: true, timedOut: [expect.any(Object)] });
    expect(searchCalls()).toHaveLength(0);
    await work;
  });

  it("deduplicates account+ID in discovery/native order and passes account-local seen IDs", async () => {
    const targets = [{ name: "Inbox", accountName: "A" }, { name: "Inbox", accountName: "A" }, { name: "Archive", accountName: "A" }, { name: "Inbox", accountName: "B" }];
    bridge.mockImplementation(async (script, params) => script.includes("list-mailboxes") ? targets : params!.accountName === "B" ? [message(1, "Inbox", "B")] : params!.mailboxName === "Inbox" ? [message(1, "Inbox", "A")] : [message(1, "Archive", "A"), message(2, "Archive", "A")]);
    expect(await call({ allowSlow: true })).toMatchObject({ messages: [message(1, "Inbox", "A"), message(2, "Archive", "A"), message(1, "Inbox", "B")], partial: false });
    expect(searchCalls()).toHaveLength(3);
    expect(searchCalls()[1]![1]).toMatchObject({ seenIds: "1" });
    expect(searchCalls()[2]![1]).toMatchObject({ seenIds: "" });
  });

  it("stops at the global limit and reports remaining scopes", async () => {
    bridge.mockImplementation(async (script) => script.includes("list-mailboxes") ? inventory : [message(1, "Fast"), message(2, "Fast")]);
    expect(await call({ allowSlow: true, limit: 2 })).toMatchObject({ limitReached: true, partial: true, skipped: [{ ...scope("Slow"), reason: "limit" }, { ...scope("Later"), reason: "limit" }] });
    expect(searchCalls()).toHaveLength(1);
  });

  it("classifies native AppleEvent -1712 as a timeout and stops", async () => {
    bridge.mockImplementation(async (script) => {
      if (script.includes("list-mailboxes")) return inventory;
      return parseAppleScriptOutput('{"error":"AppleEvent timed out","errorNumber":-1712}');
    });
    expect(await call({ allowSlow: true })).toMatchObject({ partial: true, timedOut: [scope("Fast")], errors: [] });
    expect(searchCalls()).toHaveLength(1);
  });

  it("classifies child-process timeout errors and retains other AppleScript errors", async () => {
    bridge.mockRejectedValueOnce(new AppleScriptTimeoutError(10_000));
    expect(await scoped({ allowSlow: true })).toMatchObject({ timedOut: [scope()], errors: [] });
    bridge.mockImplementationOnce(async () => parseAppleScriptOutput('{"error":"No mailbox","errorNumber":-1728}'));
    expect(await scoped({ allowSlow: true })).toMatchObject({ timedOut: [], errors: [{ ...scope(), message: "No mailbox" }] });
  });

  it("does not schedule search if the overall deadline elapsed after preflight", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(45_001);
    try {
      expect(await scoped()).toMatchObject({ partial: true, timedOut: [scope()] });
      expect(searchCalls()).toHaveLength(0);
    } finally { clock.mockRestore(); }
  });

  it("returns a complete empty search when discovery has no mailboxes", async () => {
    bridge.mockResolvedValueOnce([]);
    expect(await call({ allowSlow: true })).toMatchObject({ messages: [], partial: false, errors: [] });
    expect(searchCalls()).toHaveLength(0);
  });

  it.each([new Error("permission denied"), "unexpected failure"])("returns operational error %s and stops", async (error) => {
    bridge.mockRejectedValue(error);
    expect(await scoped({ allowSlow: true })).toMatchObject({ messages: [], partial: true, errors: [{ ...scope(), message: expect.any(String) }] });
    expect(bridge).toHaveBeenCalledTimes(1);
  });

  it("returns malformed-result errors without scheduling later targets", async () => {
    bridge.mockImplementation(async (script) => script.includes("list-mailboxes") ? inventory : { invalid: true });
    expect(await call({ allowSlow: true })).toMatchObject({ partial: true, errors: [expect.any(Object)] });
    expect(searchCalls()).toHaveLength(1);
  });

  it("does not rewrite a multiline discovered mailbox into a different target", async () => {
    bridge.mockResolvedValueOnce([{ name: "One\nTwo", accountName: "Google" }]);
    expect(await call({ allowSlow: true })).toMatchObject({ partial: true, errors: [{ message: expect.stringMatching(/multiline/) }] });
    expect(searchCalls()).toHaveLength(0);
  });
});

describe("request cancellation", () => {
  it("removes request listeners after completed preflight and search", async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await scoped({ signal: controller.signal });
    expect(add).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls.map((args) => args[1])).toEqual(add.mock.calls.map((args) => args[1]));
    controller.abort();
    expect(bridge).toHaveBeenCalledTimes(2);
  });
  it("does no work for an already-cancelled request", async () => {
    const controller = new AbortController(); controller.abort();
    expect(await scoped({ signal: controller.signal })).toMatchObject({ cancelled: true, partial: true });
    expect(bridge).not.toHaveBeenCalled();
  });

  it("aborts in-flight work and handles late completion without more calls", async () => {
    let resolveLate!: (value: unknown) => void;
    bridge.mockImplementation(async () => new Promise((resolve) => { resolveLate = resolve; }));
    const controller = new AbortController();
    const work = scoped({ allowSlow: true, signal: controller.signal });
    await Promise.resolve(); controller.abort();
    expect(await work).toMatchObject({ cancelled: true, partial: true });
    expect(bridge.mock.calls[0]![2]!.signal!.aborted).toBe(true);
    resolveLate([message(99)]); await Promise.resolve();
    expect(bridge).toHaveBeenCalledTimes(1);
  });

  it("honors the installed SDK callback signal through the registered tool", async () => {
    const controller = new AbortController(); controller.abort();
    const tools = captureTools(registerMessagesTools);
    const result = await tools.get("search_messages")!.handler({ field: "subject", query: "invoice", ...scope() }, { signal: controller.signal });
    expect(payload(result)).toMatchObject({ cancelled: true });
    expect(bridge).not.toHaveBeenCalled();
  });
});
