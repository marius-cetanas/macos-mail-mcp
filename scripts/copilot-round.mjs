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
import { isMain } from "./is-main.mjs";

export const COPILOT_LOGINS = [
  "copilot-pull-request-reviewer[bot]",
  "copilot-pull-request-reviewer",
  "copilot",
  "copilot[bot]",
];

export function isCopilotLogin(login) {
  return typeof login === "string" && COPILOT_LOGINS.includes(login.toLowerCase());
}

/**
 * The reviewer's REST login, which is how its node id is looked up.
 *
 * ## Why this is not requested over REST (#44)
 *
 * `POST /pulls/{n}/requested_reviewers` with this login returns **201 Created and adds nobody**.
 * Measured on #48 on 2026-08-26: 201, then `/requested_reviewers` empty and no timeline event.
 * #44 observed the same behaviour and recorded the status as 200; either way it is a success code
 * for an action that did not happen. #44 read that as "the API does not work"; the cause is
 * narrower and makes the fix obvious. Copilot is a **Bot**, and that endpoint takes `reviewers`
 * (Users) and `team_reviewers` (Teams). A Bot matches neither, so it is accepted and dropped.
 *
 * A success status for an action that did not happen is precisely the failure this repository has
 * a principle about, so it is written down here rather than rediscovered.
 */
export const COPILOT_REVIEWER = "copilot-pull-request-reviewer[bot]";

/**
 * The same actor's GraphQL `Bot.login`, which drops the `[bot]` suffix REST carries. Measured, not
 * assumed: the two spellings differ and comparing the wrong one silently never matches.
 */
export const COPILOT_BOT_LOGIN = "copilot-pull-request-reviewer";

/**
 * Is a Copilot round already on order?
 *
 * Asked before requesting one, so the ordinary case — the ruleset requested it a second after the
 * pull request opened — does not draw a duplicate request from this job as well.
 *
 * Reads the GraphQL `reviewRequests` shape, because the REST `/requested_reviewers` payload never
 * lists a Bot at all: on #48, with Copilot demonstrably requested and visible in GraphQL, REST
 * reported `users: []`. Asking REST would answer "nothing pending" every time.
 *
 * Every comparison goes through `isCopilotLogin`, which is the only place that type-guards. An
 * earlier version tested `COPILOT_BOT_LOGIN` with a second, unguarded `login?.toLowerCase()` — and
 * `?.` short-circuits on null and undefined only, so a login that was present but not a string
 * (`{login: 42}`) raised `login?.toLowerCase is not a function` and aborted the wait loop. Raised
 * by Copilot's round on #49 and reproduced before fixing. Both spellings now live in
 * `COPILOT_LOGINS`, so there is one comparison and it cannot drift from the guard.
 *
 * @param {Array<{requestedReviewer?: {login?: unknown}} | null>} nodes
 *   `pullRequest.reviewRequests.nodes` — elements and `requestedReviewer` are both nullable, and a
 *   Team or Mannequin reviewer matches neither inline fragment and arrives as `{}`.
 */
export function hasPendingRequest(nodes) {
  return Array.isArray(nodes) && nodes.some((n) => isCopilotLogin(n?.requestedReviewer?.login));
}

/**
 * Bodies that are a Copilot round arriving with **no review in it** (#54).
 *
 * A round is the gate's proxy for "somebody looked at this tree". Copilot submits a review in two
 * cases where nobody looked, and `classifyRound` counted both as `landed` until now — so the merge
 * gate was satisfied by the absence of a review, which is the thing it was built to prevent.
 *
 * The two are **not the same failure** and do not get the same answer, which is the half #54 did
 * not have when it was filed:
 *
 *   * `DECLINED_DIFF` — *"Copilot wasn't able to review any files in this pull request."* Returned
 *     for a diff Copilot will not read; measured on #55 and #56, both `package-lock.json`-only, and
 *     both merged on it. **Re-requesting cannot fix this** — the diff will still be a lockfile — so
 *     the round that is owed is a person's. Satisfied by a human review on the head, and `awaited`
 *     until there is one. See `isHumanReviewer`.
 *   * `ERRORED` — *"Copilot encountered an error and was unable to review this pull request."*
 *     Transient; #53 got a real verdict from a re-request two minutes later. `awaited`, which is
 *     also what makes `awaitRound` ask again.
 *
 * Matching a vendor's prose is brittle and is the right trade anyway: the alternative is a gate
 * that silently accepts nothing. Loose enough to survive rewording, and the day a string changes
 * the failure is a **red** gate rather than a green one, because an unmatched body falls through
 * to `landed` only if it is a real round — and a reworded apology reaching `landed` is the
 * behaviour we already had. Ordered specific-first: `DECLINED_DIFF` is checked before `ERRORED` so
 * a future *"Copilot was unable to review any files"* lands in the right one.
 */
export const DECLINED_DIFF = /able to review any files/i;

/** @see DECLINED_DIFF */
export const ERRORED = /unable to review/i;

/**
 * Is this review a person's?
 *
 * Only consulted where Copilot has declined to read the diff, and there the whole gate rests on it:
 * a bot slipping through this predicate would satisfy the check with nobody having looked, which is
 * the defect #54 is about, one layer down.
 *
 * Three ways an account can fail to be a person, because one is not enough. `type` is what the API
 * means to say and is trusted first; it is absent from trimmed payloads, so the `[bot]` suffix
 * catches the ones that carry a login and no type; and Copilot is checked by name because it
 * appears under four spellings, one of which — `Copilot` — has neither marker.
 *
 * @param {unknown} user a review's `user` object
 */
export function isHumanReviewer(user) {
  const login = /** @type {any} */ (user)?.login;
  if (typeof login !== "string" || login === "") return false;
  if (isCopilotLogin(login)) return false;
  if (login.toLowerCase().endsWith("[bot]")) return false;
  return /** @type {any} */ (user)?.type !== "Bot";
}

/**
 * Does this round's body say Copilot did not review anything?
 *
 * Guards the type rather than assuming it: `body` is absent on some review payloads and `null` on
 * others, and `String(null).match()` would happily test the text "null".
 *
 * @param {unknown} body
 * @returns {"declined"|"errored"|null} null when the body reads as an actual review
 */
export function emptyRound(body) {
  if (typeof body !== "string" || body === "") return null;
  if (DECLINED_DIFF.test(body)) return "declined";
  if (ERRORED.test(body)) return "errored";
  return null;
}

/**
 * @param {{reviews: Array<object>, head: string, draft?: boolean}} input
 * @returns {{state: "landed"|"awaited"|"not-owed", reason: string, awaiting?: "human"}}
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
  // Every review describing the head, Copilot's and everyone else's — the declined branch below is
  // the one place a non-Copilot review decides the answer.
  const allOnHead = list.filter((r) => r?.commit_id === head);

  /*
   * A round that reviewed nothing does not count as one (#54). Split before deciding, and let a
   * real round win over an empty one on the same head — that is #53's exact sequence, where an
   * error round and the genuine verdict both carried `commit_id: 6313d73e`.
   */
  const real = onHead.filter((r) => emptyRound(r?.body) === null);
  const declined = onHead.filter((r) => emptyRound(r?.body) === "declined");

  if (real.length > 0) {
    return {
      state: "landed",
      reason: `${real.length} Copilot round(s) on ${short}, the commit being merged`,
    };
  }

  if (declined.length > 0) {
    /*
     * Copilot will not read this diff, so no re-request produces a round and the only reviewer
     * left is a person. The gate holds rather than exempting the pull request: a lockfile is where
     * a supply-chain change arrives, which is the diff least worth waving through.
     *
     * **Any human review on the head counts, not only an approval**, and that is a deadlock guard
     * rather than laxity. GitHub forbids approving your own pull request, so an APPROVED-only rule
     * would make a maintainer-authored lockfile change unmergeable by anyone — the sole maintainer
     * cannot approve it and there is nobody else. A `COMMENTED` review is allowed on your own pull
     * request, so the rule stays satisfiable in every case while still costing a person a look and
     * a statement on the record against this exact tree.
     */
    const humans = allOnHead.filter((r) => isHumanReviewer(r?.user));
    if (humans.length > 0) {
      return {
        state: "landed",
        reason: `Copilot declined to read the diff on ${short}; ${humans.length} human review(s) on it`,
      };
    }
    return {
      state: "awaited",
      // `human`, so the loop asks Copilot for nothing here — another round would arrive declining
      // the same diff, and the log would name the wrong thing as missing.
      awaiting: "human",
      reason: `Copilot declined to read the diff on ${short} — waiting for a human review of it`,
    };
  }

  if (onHead.length > 0) {
    return {
      state: "awaited",
      // The error case. Naming it separately is the point: a bare "no round yet" here would
      // describe a round that arrived and said it had failed.
      reason: `${onHead.length} Copilot round(s) on ${short}, all of them errors — waiting for a real one`,
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
 * Describe a thrown value for the log, whatever it turns out to be.
 *
 * `err.message` alone has two failure modes, and only the first is the obvious one. `throw null`
 * and `throw undefined` make the property access itself raise, which would abort the wait loop —
 * the exact opposite of the "keep waiting" the catch exists for. Less obviously, a thrown **string
 * or object** does not throw: it yields `undefined`, and the log then reads
 * `could not request a round (undefined)`, naming nothing. That is the failure
 * *an error message that misleads costs more than one that is missing* describes, so both are
 * handled here rather than only the one that crashes.
 *
 * @param {unknown} err
 * @returns {string} something a reader can act on, never empty
 */
export function describeError(err) {
  if (err === null) return "null";
  if (err === undefined) return "undefined";
  if (typeof err === "object" && typeof err.message === "string" && err.message) return err.message;
  // `String("")` is `""`, and an empty parenthesis in the log names as little as `(undefined)`
  // does. Falling back to the type is not much, but it is something a reader can act on.
  return String(err) || `empty ${typeof err}`;
}

/**
 * How long the check waits before calling it. Ten minutes against rounds measured here at roughly
 * one to five — long enough that expiry means something went wrong rather than something was slow,
 * which is the only way the red at the end of it is worth reading.
 */
export const DEFAULT_BUDGET_MS = 10 * 60 * 1000;

/** How often to look. 30s keeps a full budget well inside the token's hourly read allowance. */
export const DEFAULT_POLL_MS = 30 * 1000;

/**
 * Wait for the round inside the run we already have — and ask for it if nobody else has.
 *
 * The head is re-read on every poll rather than taken once: a push during the wait must not be
 * answered against the head this run started on. `synchronize` will start a fresh run for the new
 * head, and this one noticing the move is what stops it reporting a stale success.
 *
 * ## Why this asks (#44)
 *
 * The check used to only wait, on the reasoning that the `copilot auto-review on pull requests`
 * ruleset is what requests the round. Measured, that ruleset does not fire for every pull request
 * this check gates, and the two holes have different causes:
 *
 *   * **A non-default base.** The ruleset is conditioned on `~DEFAULT_BRANCH`, so a pull request
 *     opened against another branch never draws a round. Measured on #41: zero reviews across three
 *     heads, three runs each burning the full budget.
 *   * **A bot author.** #47 was opened by Dependabot against `main` — the default branch, condition
 *     satisfied, not a draft — and drew no round in 16 hours. For comparison, #43, #45, #46 and #48
 *     were each auto-requested **one second** after opening.
 *
 * On the second one, be careful what the evidence is. Every Dependabot pull request in this
 * repository's history — 18 of them — has drawn zero automatic rounds, but 17 predate the ruleset
 * (created 2026-08-20) and so prove nothing about it. **#47 is the only probative case**, against
 * the human pull requests opened after the same date as controls. An earlier draft of this comment
 * said "ten", which reproduces from no query at all.
 *
 * Both present identically: a red required check with no explanation, which reads as though the
 * change were at fault. Widening the ruleset's `ref_name` would fix only the first, so this asks
 * instead, on the reasoning that asking stops depending on which pull requests the ruleset chooses
 * to notice.
 *
 * **Measured on 2026-09-01, that reasoning holds for the first hole and not the second.** The ask
 * is a silent no-op on a Dependabot pull request — see the section below. The claim that it "fixes
 * both" stood here from #49 (2026-08-26) to 2026-09-01 and was false throughout; #58 carries the
 * measurement.
 *
 * Asked at most once per run, and only when nothing is pending — the ordinary case already has a
 * request in flight a second after opening, and a duplicate would be noise.
 *
 * ## What this still does not cover
 *
 * "Pending" is trusted for the rest of the run. If Copilot accepts a request and never delivers,
 * every poll sees the request still on order, nothing re-asks, and the check expires red. That is
 * exactly the pre-#44 behaviour rather than a regression, but the log will say "requested already"
 * throughout, which is the opposite of a clue.
 *
 * **Worse, the ask itself can be accepted and do nothing, and the log then reads as a success.**
 * On #55, #56 and #57 — Dependabot pull requests, 2026-09-01 — `requestReviews` resolved without
 * throwing, so this logged `requested: no round was on order, asked … for one`, and no
 * `review_requested` event was ever recorded on any of the three. All three expired red.
 *
 * It is not the token. That job's log reports `PullRequests: write` under `GITHUB_TOKEN
 * Permissions`, with `Secret source: Dependabot` — the mutation was accepted with the scope it
 * needed and recorded nothing. Nor is it Copilot declining Dependabot: requested under a
 * user-scoped token, the same three pull requests drew a round on the same heads within five
 * seconds, which is how they were unblocked. The same code path on a human-authored pull request
 * (#49) does record `review_requested by github-actions[bot]`.
 *
 * So the failing combination is a bot-authored pull request asked by the Actions token, and which
 * side GitHub keys on is not established. Until it is, a Dependabot pull request needs the round
 * requested by hand and the job re-run; #58 has the controls. The **diagnosis** is fixed — see
 * `describeRequest`, which re-checks `isRoundPending()` after the mutation and refuses to call an
 * unconfirmed request a success. The **mechanism** is not: this still cannot make GitHub honour the
 * request, so #58 stays open and the manual step stands.
 *
 * I/O is injected so the loop is testable without a network or a clock.
 *
 * @param {{api: (path: string) => Promise<any>, sleep: (ms: number) => Promise<void>,
 *          requestRound?: () => Promise<unknown>, isRoundPending?: () => Promise<boolean>,
 *          budgetMs?: number, pollMs?: number, log?: (line: string) => void}} deps
 * @returns {Promise<{state: string, reason: string, polls: number}>}
 */
export async function awaitRound({ api, sleep, requestRound, isRoundPending, budgetMs = DEFAULT_BUDGET_MS, pollMs = DEFAULT_POLL_MS, log = () => {} }) {
  let waited = 0;
  let polls = 0;
  let asked = false;

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

    /*
     * Nothing to ask for when the missing reviewer is a person: another Copilot round would arrive
     * declining the same diff, and the log would announce a request for the one thing already
     * known not to be coming.
     */
    if (!asked && requestRound && result.awaiting !== "human") {
      asked = true;

      /*
       * The two calls are tried separately so a failure names the one that failed. Folded into one
       * catch, a failing pending check reported "could not request a round", which is false — the
       * request had not been attempted — and named a status describing the other call entirely.
       *
       * A failed check also falls through to asking rather than skipping. A check that did not
       * answer is not evidence that a round is on order, any more than a missing check is; the
       * worst case is a duplicate request, which `union: true` makes a no-op, and the best case is
       * the round this check exists to wait for.
       */
      let pending = false;
      try {
        pending = Boolean(isRoundPending && (await isRoundPending()));
      } catch (err) {
        log(`could not check for a pending round (${describeError(err)}) — asking anyway`);
      }

      if (pending) {
        log("requested already: a Copilot round is on order, waiting for it");
      } else {
        // A failure here must not end the wait. On a pull request from a fork the token is
        // read-only whatever the workflow asks for, so this is expected to fail there — and the
        // right answer is the one the check always had: wait, and let the budget decide.
        try {
          await requestRound();
          log(await describeRequest(isRoundPending));
        } catch (err) {
          log(`could not request a round (${describeError(err)}) — waiting anyway`);
        }
      }
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

/**
 * What to log after a request that did not throw (#58).
 *
 * The old line said `requested: no round was on order, asked … for one` on any resolved mutation,
 * and on a Dependabot pull request that is a lie: measured on #55, #56 and #57, `requestReviews`
 * resolves, **no `review_requested` event is ever recorded**, and the check expires red ten
 * minutes later with a success line at the top of the log. Not a permissions problem — that job's
 * own log reports `PullRequests: write`. A success code for an action that did not happen is the
 * failure this repository has a principle about, and it had reappeared inside the code written to
 * fix it.
 *
 * So the request is checked rather than assumed. **The check is not conclusive and does not claim
 * to be**: a request that Copilot picks up immediately also reads as "nothing pending" — measured
 * on #49, where the pending request was cleared before the job's first poll. Both readings are in
 * the line, with the one that matters attached to the outcome that distinguishes them, because a
 * reader who is looking at this log at all is looking at a run that expired.
 *
 * A failure to check is not evidence either way and says so, rather than picking the reassuring
 * reading.
 *
 * @param {(() => Promise<boolean>) | undefined} isRoundPending
 * @returns {Promise<string>}
 */
export async function describeRequest(isRoundPending) {
  if (!isRoundPending) return `requested: asked ${COPILOT_REVIEWER} for a round`;
  try {
    if (await isRoundPending()) {
      return `requested: asked ${COPILOT_REVIEWER} for a round, and it is on order`;
    }
    return (
      `requested ${COPILOT_REVIEWER} and the mutation succeeded, but nothing is on order a moment ` +
      `later — either Copilot took it up already, or the request did not take (#58). If this run ` +
      `expires red, it was the second.`
    );
  } catch (err) {
    return (
      `requested: asked ${COPILOT_REVIEWER} for a round, and could not confirm it landed ` +
      `(${describeError(err)})`
    );
  }
}

/**
 * How many requested reviewers to read when checking whether a round is on order.
 *
 * A pull request here carries one or two, so this is slack rather than a limit. It matters only in
 * one direction: if Copilot fell outside the page, the check would read "nothing pending" and ask
 * for a round that was already on order — harmless under `union: true`, but a wasted call.
 */
export const REVIEWER_PAGE = 100;

/**
 * Build the GitHub calls `awaitRound` needs, over an injected `fetch`.
 *
 * Extracted from the CLI arm so it can be tested. It is the half that actually runs in CI, and
 * leaving it inside the `isMain` block put every real network path — status handling, the GraphQL
 * error envelope, the node-id lookup — beyond the reach of the suite. `tests/release/cli.test.ts`
 * makes the same argument for the other scripts: an entry point is only meaningful if invoking it
 * runs something.
 *
 * @param {{fetch: typeof globalThis.fetch, token: string, repo: string, pr: string|number}} deps
 */
export function makeGithubIo({ fetch, token, repo, pr }) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "macos-mail-mcp-copilot-gate",
  };

  const api = async (suffix) => {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${pr}${suffix}`, {
      headers,
    });
    if (!res.ok) throw new Error(`GET pulls/${pr}${suffix} -> ${res.status}`);
    return res.json();
  };

  const graphql = async (query, variables) => {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`GraphQL -> ${res.status}`);
    const body = await res.json();
    // GraphQL answers 200 with an `errors` array, so a non-ok status is not the only failure.
    if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
    return body.data;
  };

  const [owner, name] = String(repo).split("/");

  const pullRequest = async (selection) =>
    (
      await graphql(
        `query($owner:String!,$name:String!,$number:Int!){
           repository(owner:$owner,name:$name){ pullRequest(number:$number){ ${selection} } }
         }`,
        { owner, name, number: Number(pr) }
      )
    ).repository.pullRequest;

  const isRoundPending = async () =>
    hasPendingRequest(
      (
        await pullRequest(
          `reviewRequests(first:${REVIEWER_PAGE}){nodes{requestedReviewer{... on Bot{login} ... on User{login}}}}`
        )
      ).reviewRequests.nodes
    );

  /*
   * Requested over GraphQL because REST cannot do it — see COPILOT_REVIEWER above for the measured
   * 201-and-nothing-happens. `botIds` is the field a Bot reviewer goes in, and `union: true` adds
   * to the existing requests rather than replacing them, so a human reviewer already on the pull
   * request is not removed by this call.
   *
   * Needs `pull-requests: write`, which the workflow grants. On a fork's pull request the token is
   * read-only regardless and this throws — `awaitRound` treats that as "wait anyway".
   *
   * **The Actions token can do this, and that was not obvious enough to assume.** A Copilot review
   * request could plausibly have required a seat held by a person rather than an app installation,
   * in which case all of the above would be an elaborate no-op in the only place it runs. Measured
   * on this pull request's own check, run 32959250916 on head `9fe2c9a1`: the pending request was
   * cleared before the job's first poll, and the job then logged
   * `requested: no round was on order` while the timeline recorded
   * `review_requested by github-actions[bot]`. It waited, correctly refused a round sitting on an
   * earlier head, and exited 0 when the fresh one landed.
   */
  const requestRound = async () => {
    // Checked rather than parsed blind: on a 403 the body still parses, `node_id` is simply absent,
    // and the throw below would then blame the account for not existing instead of naming the
    // status. That is the misleading error this repository has a principle about.
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(COPILOT_REVIEWER)}`, {
      headers,
    });
    if (!res.ok) throw new Error(`GET users/${COPILOT_REVIEWER} -> ${res.status}`);
    const { node_id: botId } = await res.json();
    if (!botId) throw new Error(`no node id in the response for ${COPILOT_REVIEWER}`);

    const { id } = await pullRequest("id");
    return graphql(
      `mutation($pullRequestId:ID!,$botIds:[ID!]){
         requestReviews(input:{pullRequestId:$pullRequestId,botIds:$botIds,union:true}){
           pullRequest{ id }
         }
       }`,
      { pullRequestId: id, botIds: [botId] }
    );
  };

  return { api, graphql, isRoundPending, requestRound };
}

/* c8 ignore start -- CLI arm; everything it calls is exercised above */
if (isMain(import.meta.url)) {
  const repo = process.env.GITHUB_REPOSITORY;
  const pr = process.env.PR_NUMBER;
  const token = process.env.GH_TOKEN;
  if (!repo || !pr || !token) {
    console.error("need GITHUB_REPOSITORY, PR_NUMBER and GH_TOKEN");
    process.exit(1);
  }

  const { api, isRoundPending, requestRound } = makeGithubIo({ fetch, token, repo, pr });

  const { state, reason } = await awaitRound({
    api,
    requestRound,
    isRoundPending,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (line) => console.log(line),
  });

  console.log(`${state}: ${reason}`);
  process.exit(state === "landed" || state === "not-owed" ? 0 : 1);
}
/* c8 ignore stop */
