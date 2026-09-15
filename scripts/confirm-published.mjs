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

/**
 * Read the registry until it lists the version, or the budget is spent.
 *
 * @param {{
 *   view: (field: string) => Promise<string | null>,
 *   sleep: (ms: number) => Promise<void>,
 *   budgetMs?: number,
 *   pollMs?: number,
 *   log?: (line: string) => void,
 * }} deps `view(field)` is `npm view <name>@<version> <field>`: the value, or null when the registry
 *   has no such version.
 * @returns {Promise<{ state: "published" | "absent", polls: number, elapsedMs: number, attested: boolean | null }>}
 */
export async function awaitPublished({
  view,
  sleep,
  budgetMs = DEFAULT_BUDGET_MS,
  pollMs = DEFAULT_POLL_MS,
  log = () => {},
}) {
  let elapsedMs = 0;
  let polls = 0;
  for (;;) {
    polls += 1;
    if ((await view("version")) !== null) {
      const attested = Boolean(await view("dist.attestations.url"));
      const reads = `${polls} read${polls === 1 ? "" : "s"}`;
      log(`published: the registry lists the version after ${reads}, ${Math.round(elapsedMs / 1000)}s.`);
      log(
        attested
          ? "Provenance attestation present."
          : "::warning::No provenance attestation — the publish did not go through OIDC."
      );
      return { state: "published", polls, elapsedMs, attested };
    }
    if (elapsedMs + pollMs > budgetMs) {
      log(
        `::error::the registry has not listed the version after ${polls} reads, ${Math.round(elapsedMs / 1000)}s. ` +
          "The publish reported success, and npm processes a publish after accepting it, so do not publish again: " +
          "check `npm view` for the version, and once it is listed, push the tag and cut the release by hand — " +
          "CLAUDE.md, Releasing, says how."
      );
      return { state: "absent", polls, elapsedMs, attested: null };
    }
    await sleep(pollMs);
    elapsedMs += pollMs;
  }
}

/**
 * `npm view <name>@<version> <field>` over an injected runner: the field's value, trimmed; null on
 * the registry's 404 for a version it does not have; anything else thrown, naming the failure.
 * `--prefer-online`, because the answer being waited for is exactly the one a cache would hide.
 *
 * @param {string} name
 * @param {string} version
 * @param {(file: string, args: string[]) => Promise<{ stdout: string }>} run
 */
export function makeNpmView(name, version, run = promisify(execFile)) {
  return async (field) => {
    try {
      const { stdout } = await run("npm", ["view", `${name}@${version}`, field, "--prefer-online"]);
      return String(stdout).trim();
    } catch (error) {
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
    console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
/* c8 ignore stop */
