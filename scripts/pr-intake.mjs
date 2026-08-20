#!/usr/bin/env node
/**
 * What a pull request's intake step says about whether CI is held.
 *
 * Extracted from `pr-intake.yml` rather than left as an `if` in a `run:` block, per DoD 8 — the
 * commit that introduced it claimed no logic was embedded in YAML while embedding this, which is
 * the drift that rule exists to catch.
 */

/**
 * @param {{isFork: boolean, author?: string}} input
 * @returns {string} markdown for the job summary
 */
export function intakeSummary({ isFork, author }) {
  if (!isFork) {
    return "### CI runs normally\n\nSame-repository branch; nothing is held.\n";
  }

  // Named rather than left to "@undefined": a payload without a login is a ghost author, and the
  // sentence still has to read.
  const who = author ? `@${author}` : "an outside contributor";
  return (
    "### Awaiting maintainer approval\n\n" +
    `This pull request comes from a fork (${who}), so GitHub holds every workflow until a ` +
    "maintainer selects **Approve and run**.\n\n" +
    "Until then the required checks do not report at all — they are absent rather than pending, " +
    "and branch protection reads an absent required check exactly as it reads a failing one. " +
    "That is why the pull request shows as blocked with nothing else explaining it.\n"
  );
}

/* c8 ignore start -- CLI arm; the summary above is what the tests exercise */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { appendFileSync } = await import("node:fs");
  const summary = intakeSummary({
    isFork: process.env.IS_FORK === "true",
    author: process.env.AUTHOR,
  });
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}
/* c8 ignore stop */
