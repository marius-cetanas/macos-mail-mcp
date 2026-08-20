#!/usr/bin/env node
/**
 * Has the Copilot round landed on the commit this pull request would actually merge?
 *
 * ## The defect this exists for
 *
 * `main` already requires conversation resolution, which covers the RESOLVED half of the rule — a
 * Copilot thread cannot be ignored. Nothing covered the AWAITED half. A merge could land in the
 * window between the final push and the review arriving, leaving a round that describes the merged
 * tree answered by nobody.
 *
 * ## The head SHA is the whole point
 *
 * A review on an EARLIER commit must not satisfy this. That is the exact hole being closed: the
 * review existed, it just described a different tree than the one merging. So a round counts only
 * when its `commit_id` equals the pull request's current head.
 *
 * ## Waiting is not failing
 *
 * Three states, because the question has three answers. Collapsing `awaited` into `failure` reports
 * "still working" in the same colour as "broken", and a red that means two things is read as
 * neither.
 */

/** Reviewer logins that count as the Copilot reviewer. Compared lower-cased. */
export const COPILOT_LOGINS = [
  "copilot-pull-request-reviewer[bot]",
  "copilot",
  "copilot[bot]",
];

export function isCopilotLogin(login) {
  return typeof login === "string" && COPILOT_LOGINS.includes(login.toLowerCase());
}

/**
 * @param {{reviews: Array<object>, head: string, draft?: boolean}} input
 * @returns {{state: "landed"|"awaited"|"not-owed", reason: string}}
 */
export function classifyRound({ reviews, head, draft = false }) {
  if (draft) {
    return {
      state: "not-owed",
      // The ruleset sets `review_draft_pull_requests: false`, so no round is owed here and
      // waiting for one would hang until the budget expired.
      reason: "pull request is a draft — the ruleset requests no round on drafts",
    };
  }

  if (typeof head !== "string" || head === "") {
    throw new Error("no head SHA — cannot tell which commit a round would have to describe");
  }

  const list = Array.isArray(reviews) ? reviews : [];
  const byCopilot = list.filter((r) => isCopilotLogin(r?.user?.login));
  const onHead = byCopilot.filter((r) => r?.commit_id === head);
  const short = head.slice(0, 8);

  if (onHead.length > 0) {
    return {
      state: "landed",
      reason: `${onHead.length} Copilot round(s) on ${short}, the commit being merged`,
    };
  }

  if (byCopilot.length > 0) {
    return {
      state: "awaited",
      // Named separately from "none at all" because it is the dangerous case: a reviewer has
      // spoken, just about a different tree, which is what makes a stale round look like a fresh one.
      reason: `${byCopilot.length} Copilot round(s), none on ${short} — the branch moved after the last one`,
    };
  }

  return { state: "awaited", reason: `no Copilot round yet on ${short}` };
}


/**
 * Wait for the round inside the run we already have.
 *
 * The head is re-read on every poll rather than taken once: a push during the wait must not be
 * answered against the head this run started on. `synchronize` will start a fresh run for the new
 * head, and this one noticing the move is what stops it reporting a stale success.
 *
 * I/O is injected so the loop is testable without a network or a clock.
 *
 * @param {{api: (path: string) => Promise<any>, sleep: (ms: number) => Promise<void>,
 *          budgetMs?: number, pollMs?: number, log?: (line: string) => void}} deps
 * @returns {Promise<{state: string, reason: string, polls: number}>}
 */
export async function awaitRound({ api, sleep, budgetMs = 20 * 60 * 1000, pollMs = 30 * 1000, log = () => {} }) {
  let waited = 0;
  let polls = 0;

  for (;;) {
    polls += 1;
    const pr = await api("");
    const reviews = await api("/reviews");
    const result = classifyRound({
      reviews,
      head: pr?.head?.sha,
      draft: Boolean(pr?.draft),
    });

    if (result.state !== "awaited") {
      return { ...result, polls };
    }

    if (waited >= budgetMs) {
      return {
        state: "expired",
        // The budget expiring means something went wrong rather than something was slow — which
        // is the only way the red at the end of it is worth reading.
        reason: `${result.reason} — gave up after ${Math.round(budgetMs / 1000)}s`,
        polls,
      };
    }

    log(`waiting: ${result.reason}`);
    await sleep(pollMs);
    waited += pollMs;
  }
}

/* c8 ignore start -- CLI arm; the classification and the loop above are what the tests exercise */
if (import.meta.url === `file://${process.argv[1]}`) {
  const repo = process.env.GITHUB_REPOSITORY;
  const pr = process.env.PR_NUMBER;
  const token = process.env.GH_TOKEN;
  if (!repo || !pr || !token) {
    console.error("need GITHUB_REPOSITORY, PR_NUMBER and GH_TOKEN");
    process.exit(1);
  }

  const api = async (suffix) => {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${pr}${suffix}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "macos-mail-mcp-copilot-gate",
      },
    });
    if (!res.ok) throw new Error(`GET pulls/${pr}${suffix} -> ${res.status}`);
    return res.json();
  };

  const { state, reason } = await awaitRound({
    api,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (line) => console.log(line),
  });

  console.log(`${state}: ${reason}`);
  process.exit(state === "landed" || state === "not-owed" ? 0 : 1);
}
/* c8 ignore stop */
