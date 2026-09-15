#!/usr/bin/env node
/**
 * Is the version this release just published on the registry yet?
 *
 * ## The defect this exists for
 *
 * npm accepts a publish and processes it afterwards. The CLI answers a successful PUT with "Your
 * package is being processed and may take a few minutes to become available", and `npm view` answers
 * 404 until it is done. The release workflow confirmed the registry with ten reads six seconds apart,
 * and on 2026-09-15 that failed the 2.1.0 release after a publish that had succeeded — provenance
 * signed, statement in the transparency log, `+ macos-mail-mcp@2.1.0` printed at 10:11:24Z — so the
 * tag and the GitHub release that follow the confirmation were skipped. The registry listed the
 * version at 10:16:31Z, five minutes after the PUT, with nothing behind it, and both were made by
 * hand.
 *
 * ## What this does instead
 *
 * Waits long enough to outlast the processing, and on giving up says what is known: the publish
 * reported success, the registry has not listed the version within the budget, and what to do — not
 * "the publish failed", which it did not. A read that fails for a reason other than the registry's
 * 404 ends the run with that reason, since a network error is not "not published".
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isMain } from "./is-main.mjs";

/** Ten minutes: twice what 2.1.0 took, and a ceiling rather than a wait — the loop returns on the first listing. */
export const DEFAULT_BUDGET_MS = 10 * 60 * 1000;
export const DEFAULT_POLL_MS = 10 * 1000;
/** The least a read of the attestation gets once the version is listed, whatever is left of the budget. */
export const ATTESTATION_READ_MS = 30 * 1000;

/** What the run should do once this gives up, stated on every failing path since the publish did not fail. */
export const GUIDANCE =
  "The publish reported success, and npm processes a publish after accepting it, so do not publish again: " +
  "check `npm view` for the version, and once it is listed, push the tag and cut the release by hand — " +
  "CLAUDE.md, Releasing, says how.";

/**
 * Read the registry until it lists the version, or the budget is spent.
 *
 * The budget is a wall-clock deadline, and each read is bounded to what is left of it: the time a
 * read takes counts, and a registry that hangs cannot carry the run past the ceiling — an earlier
 * cut counted only the sleeps and gave `npm view` no timeout (raised by Copilot on #104).
 *
 * @param {{
 *   view: (field: string, bound: { timeoutMs: number }) => Promise<string | null>,
 *   sleep: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   budgetMs?: number,
 *   pollMs?: number,
 *   log?: (line: string) => void,
 * }} deps `view(field, { timeoutMs })` is `npm view <name>@<version> <field>`, bounded to `timeoutMs`:
 *   the value, or null when the registry has no such version. `now` is the clock, injected so a test
 *   can drive it.
 * @returns {Promise<{ state: "published" | "absent", polls: number, elapsedMs: number, attested: boolean | null }>}
 */
export async function awaitPublished({
  view,
  sleep,
  now = Date.now,
  budgetMs = DEFAULT_BUDGET_MS,
  pollMs = DEFAULT_POLL_MS,
  log = () => {},
}) {
  const start = now();
  const deadline = start + budgetMs;
  const remaining = () => Math.max(1, deadline - now());
  let polls = 0;
  for (;;) {
    polls += 1;
    if ((await view("version", { timeoutMs: remaining() })) !== null) {
      const attested = Boolean(
        await view("dist.attestations.url", { timeoutMs: Math.max(remaining(), ATTESTATION_READ_MS) })
      );
      const elapsedMs = now() - start;
      const reads = `${polls} read${polls === 1 ? "" : "s"}`;
      log(`published: the registry lists the version after ${reads}, ${Math.round(elapsedMs / 1000)}s.`);
      log(
        attested
          ? "Provenance attestation present."
          : "::warning::No provenance attestation — the publish did not go through OIDC."
      );
      return { state: "published", polls, elapsedMs, attested };
    }
    const elapsedMs = now() - start;
    if (elapsedMs + pollMs > budgetMs) {
      log(
        `::error::the registry has not listed the version after ${polls} reads, ${Math.round(elapsedMs / 1000)}s. ${GUIDANCE}`
      );
      return { state: "absent", polls, elapsedMs, attested: null };
    }
    await sleep(pollMs);
  }
}

/**
 * `npm view <name>@<version> <field>` over an injected runner, bounded to `timeoutMs`: the field's
 * value, trimmed; null on the registry's 404 for a version it does not have; a read that ran out of
 * its bound thrown as such; anything else thrown, naming the failure. `--prefer-online`, because
 * the answer being waited for is exactly the one a cache would hide.
 *
 * @param {string} name
 * @param {string} version
 * @param {(file: string, args: string[], options: { timeout: number }) => Promise<{ stdout: string }>} run
 */
export function makeNpmView(name, version, run = promisify(execFile)) {
  return async (field, { timeoutMs } = {}) => {
    const options = timeoutMs === undefined ? {} : { timeout: timeoutMs };
    try {
      const { stdout } = await run("npm", ["view", `${name}@${version}`, field, "--prefer-online"], options);
      return String(stdout).trim();
    } catch (error) {
      if (error?.killed === true || error?.signal === "SIGTERM") {
        throw new Error(`npm view ${name}@${version} ${field} timed out after ${Math.round((timeoutMs ?? 0) / 1000)}s`);
      }
      const said = `${error?.stderr ?? ""}\n${error?.message ?? ""}`;
      if (/\bE404\b/.test(said)) return null;
      const reason = String(error?.stderr || error?.message || error).trim();
      throw new Error(`npm view ${name}@${version} ${field} failed: ${reason}`);
    }
  };
}

export const USAGE = "usage: confirm-published.mjs <name> <version>   e.g. macos-mail-mcp 2.1.0";

/* c8 ignore start -- CLI arm; awaitPublished and makeNpmView are exercised above */
if (isMain(import.meta.url)) {
  const [name, version] = process.argv.slice(2);
  if (!name || !version) {
    console.error(USAGE);
    process.exit(1);
  }
  const budgetMs = Number(process.env.CONFIRM_BUDGET_MS ?? DEFAULT_BUDGET_MS);
  const pollMs = Number(process.env.CONFIRM_POLL_MS ?? DEFAULT_POLL_MS);
  try {
    const result = await awaitPublished({
      view: makeNpmView(name, version),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      budgetMs,
      pollMs,
      log: console.log,
    });
    process.exit(result.state === "published" ? 0 : 1);
  } catch (error) {
    console.log(`::error::${error instanceof Error ? error.message : String(error)}. ${GUIDANCE}`);
    process.exit(1);
  }
}
/* c8 ignore stop */
