import { z } from "zod";
import { AppleScriptCommandError, AppleScriptTimeoutError, runAppleScript } from "../../bridge/applescript-runner.js";
import { sanitize } from "../../utils.js";
import type { SearchResponse, SearchScope } from "../../types.js";

export const SEARCH_TOTAL_MS = 45_000;
export const SEARCH_TARGET_MS = 10_000;
export const SEARCH_SAFE_MESSAGE_COUNT = 1000;
export const SEARCH_MAX_RESULTS = 200;

export const searchInputSchema = z.object({
  field: z.enum(["subject", "sender", "content"]).describe("Field to search; content requires allowSlow and a single account/mailbox"),
  query: z.string().default("").describe("Search text; may be empty when after or before is supplied"),
  mailboxName: z.string().optional().describe("Mailbox name or full path; requires accountName"),
  accountName: z.string().optional().describe("Mail account; default searches require both account and mailbox"),
  limit: z.number().int().min(1).max(SEARCH_MAX_RESULTS).default(50).describe("Maximum unique results, 1–200 (default 50)"),
  after: z.string().optional().describe("Include messages received on/after this ISO date"),
  before: z.string().optional().describe("Include messages received on/before this ISO date"),
  allowSlow: z.boolean().default(false).describe("Explicitly permit broad searches, content searches or mailboxes over 1,000 messages; queued Mail work may outlive cancellation"),
});

const inventorySchema = z.array(z.object({ name: z.string(), accountName: z.string() }));
const resultsSchema = z.array(z.object({
  id: z.number().int(), subject: z.string(), sender: z.string(), dateReceived: z.string(),
  readStatus: z.boolean(), flagged: z.boolean(), flagIndex: z.number().int(), hasAttachments: z.boolean(),
  mailboxName: z.string(), accountName: z.string(),
}));
const queuedWarning = "Mail may still be processing a queued search after osascript stops. Wait for Mail to recover or restart Mail before retrying; avoid immediate repeated searches.";

class SearchStopped extends Error {
  constructor(public readonly reason: "timeout" | "cancelled") { super(reason); }
}
class SearchPolicyError extends Error {}

function dateValue(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const calendar = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (calendar !== null) {
    const [year, month, day] = calendar.slice(1).map(Number);
    const check = new Date(0);
    check.setUTCFullYear(year!, month! - 1, day!);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month! - 1 || check.getUTCDate() !== day) throw new Error(`Invalid date: ${value}`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`Invalid date: ${value}`);
  return parsed;
}

export async function searchMessages(input: unknown, signal?: AbortSignal): Promise<SearchResponse> {
  const deadline = performance.now() + SEARCH_TOTAL_MS;
  const options = searchInputSchema.parse(input);
  const accountName = options.accountName === undefined ? undefined : sanitize(options.accountName);
  const mailboxName = options.mailboxName === undefined ? undefined : sanitize(options.mailboxName);
  const query = sanitize(options.query);
  if ((accountName !== undefined && accountName.trim() === "") || (mailboxName !== undefined && mailboxName.trim() === "")) throw new Error("Search scope names must not be blank.");
  if (mailboxName !== undefined && accountName === undefined) throw new Error("mailboxName requires accountName.");
  if (!options.allowSlow && (accountName === undefined || mailboxName === undefined || options.field === "content")) throw new Error("Specify accountName and mailboxName; broad/content searches require explicit allowSlow:true.");
  if (options.field === "content" && (accountName === undefined || mailboxName === undefined)) throw new Error("Content search requires one accountName and mailboxName, even with allowSlow.");
  const after = dateValue(options.after);
  const before = dateValue(options.before);
  if (after !== undefined && before !== undefined && after > before) throw new Error("after must not be later than before.");
  if (query.trim() === "" && after === undefined && before === undefined) throw new Error("Provide search text or a date filter.");

  const response: SearchResponse = { messages: [], partial: false, cancelled: false, limitReached: false, timedOut: [], skipped: [], errors: [], warnings: [] };
  let active: SearchScope = { accountName: accountName ?? null, mailboxName: mailboxName ?? null };
  let targets: Array<{ accountName: string; mailboxName: string }> = [];
  let targetIndex = -1;

  async function bounded(script: string, params: Record<string, string>): Promise<unknown> {
    if (signal?.aborted) throw new SearchStopped("cancelled");
    const budget = Math.min(SEARCH_TARGET_MS, Math.floor(deadline - performance.now()));
    if (budget <= 0) throw new SearchStopped("timeout");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let onAbort: () => void;
    const interruption = new Promise<never>((_resolve, reject) => {
      const stop = (reason: "timeout" | "cancelled") => {
        const error = new SearchStopped(reason);
        controller.abort(error);
        reject(error);
      };
      timer = setTimeout(() => stop("timeout"), budget);
      onAbort = () => stop("cancelled");
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    const operation = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return runAppleScript(script, { ...params, eventTimeoutSeconds: String(Math.max(1, Math.ceil(budget / 1000) - 1)) }, { timeout: budget, signal: controller.signal });
    });
    try {
      return await Promise.race([operation, interruption]);
    } finally {
      clearTimeout(timer!);
      signal?.removeEventListener("abort", onAbort!);
    }
  }

  try {
    if (accountName !== undefined && mailboxName !== undefined) {
      if (!options.allowSlow) {
        const info = await bounded("mailboxes/scripts/get-mailbox-info.applescript", { accountName, mailboxName });
        const count = (info as { messageCount?: unknown } | null)?.messageCount;
        if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > SEARCH_SAFE_MESSAGE_COUNT) throw new SearchPolicyError("Mailbox message count is unavailable or exceeds 1,000. Narrow the mailbox or deliberately pass allowSlow:true.");
      }
      targets = [{ accountName, mailboxName }];
    } else {
      const inventory = inventorySchema.parse(await bounded("mailboxes/scripts/list-mailboxes.applescript", { accountName: accountName ?? "__ALL__" }));
      const unique = new Map<string, { accountName: string; mailboxName: string }>();
      for (const mailbox of inventory) {
        const target = { accountName: sanitize(mailbox.accountName), mailboxName: sanitize(mailbox.name) };
        if (target.accountName !== mailbox.accountName || target.mailboxName !== mailbox.name) throw new Error("Mail returned an unsupported multiline search scope.");
        unique.set(JSON.stringify([target.accountName, target.mailboxName]), target);
      }
      targets = [...unique.values()];
    }

    const seen = new Set<string>();
    for (targetIndex = 0; targetIndex < targets.length; targetIndex++) {
      if (response.messages.length >= options.limit) {
        response.skipped.push(...targets.slice(targetIndex).map((target) => ({ ...target, reason: "limit" as const })));
        break;
      }
      active = targets[targetIndex]!;
      const seenIds = response.messages.filter((message) => message.accountName.toLowerCase() === active.accountName!.toLowerCase()).map((message) => message.id).join(",");
      const result = resultsSchema.parse(await bounded("messages/scripts/search-messages.applescript", {
        accountName: active.accountName!, mailboxName: active.mailboxName!, field: options.field, query,
        limit: String(options.limit - response.messages.length), seenIds,
        hasAfter: String(after !== undefined), hasBefore: String(before !== undefined),
        afterSeconds: String(after === undefined ? 0 : Math.floor((Date.now() - after) / 1000)),
        beforeSeconds: String(before === undefined ? 0 : Math.floor((Date.now() - before) / 1000)),
      }));
      for (const message of result) {
        const key = JSON.stringify([message.accountName.toLowerCase(), message.id]);
        if (seen.has(key)) continue;
        seen.add(key);
        response.messages.push(message);
        if (response.messages.length >= options.limit) break;
      }
    }
  } catch (error) {
    if (error instanceof SearchPolicyError) throw error;
    const reason = error instanceof SearchStopped ? error.reason : error instanceof AppleScriptTimeoutError || (error instanceof AppleScriptCommandError && error.errorNumber === -1712) ? "timeout" : "error";
    if (reason === "cancelled") {
      response.cancelled = true;
      response.skipped.push({ ...active, reason });
    } else if (reason === "timeout") {
      response.timedOut.push(active);
      response.warnings.push(queuedWarning);
    } else {
      response.errors.push({ ...active, message: error instanceof Error ? error.message : String(error) });
    }
    response.skipped.push(...targets.slice(targetIndex + 1).map((target) => ({ ...target, reason } as const)));
    response.partial = true;
  }
  response.limitReached = response.messages.length >= options.limit;
  response.partial ||= response.skipped.length > 0;
  return response;
}
