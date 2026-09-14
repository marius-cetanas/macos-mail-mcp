import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  classifyRound,
  emptyRound,
  isHumanReviewer,
  isHumanReview,
  readComments,
  describeRequest,
  DECLINED_DIFF,
  ERRORED,
  isCopilotLogin,
  hasPendingRequest,
  describeError,
  awaitRound,
  DEFAULT_BUDGET_MS,
  DEFAULT_POLL_MS,
  COPILOT_LOGINS,
  COPILOT_REVIEWER,
  COPILOT_BOT_LOGIN,
  makeGithubIo,
  REVIEWER_PAGE,
  REST_PAGE,
  nextPageUrl,
} from "../../scripts/copilot-round.mjs";

const HEAD = "a".repeat(40);
const OLDER = "b".repeat(40);

/** A review as the reviews API returns it, trimmed to the fields that decide the answer. */
const review = (login: string, commit_id: string) => ({ user: { login }, commit_id });

describe("isCopilotLogin", () => {
  it("accepts every login the reviewer is known to appear under", () => {
    for (const login of COPILOT_LOGINS) {
      expect(isCopilotLogin(login), login).toBe(true);
    }
  });

  // Measured on this repository: the same actor submits reviews as
  // `copilot-pull-request-reviewer[bot]` and inline comments as `Copilot`.
  it("compares case-insensitively, because the actor appears in both cases", () => {
    expect(isCopilotLogin("Copilot")).toBe(true);
    expect(isCopilotLogin("COPILOT-PULL-REQUEST-REVIEWER[BOT]")).toBe(true);
  });

  it("rejects a human and a different bot", () => {
    expect(isCopilotLogin("marius-cetanas")).toBe(false);
    expect(isCopilotLogin("dependabot[bot]")).toBe(false);
  });

  it("rejects a missing login rather than throwing", () => {
    expect(isCopilotLogin(undefined as unknown as string)).toBe(false);
    expect(isCopilotLogin(null as unknown as string)).toBe(false);
  });
});

describe("classifyRound", () => {
  it("is landed when a round names the head being merged", () => {
    expect(classifyRound({ reviews: [review("Copilot", HEAD)], head: HEAD })).toMatchObject({
      state: "landed",
    });
  });

  /**
   * The defect the whole check exists for. A review on an earlier commit describes a different
   * tree, so it must not satisfy the gate — and it must not be reported the same way as no review
   * at all, because a stale round is the case that looks satisfied and is not.
   */
  it("is awaited when every round names an earlier commit", () => {
    const result = classifyRound({ reviews: [review("Copilot", OLDER)], head: HEAD });
    expect(result.state).toBe("awaited");
    expect(result.reason).toContain("the branch moved");
  });

  it("is awaited when there are no rounds at all, and says so differently", () => {
    const result = classifyRound({ reviews: [], head: HEAD });
    expect(result.state).toBe("awaited");
    expect(result.reason).toContain("no Copilot round yet");
  });

  it("does not count a human review on the head", () => {
    expect(
      classifyRound({ reviews: [review("marius-cetanas", HEAD)], head: HEAD }).state
    ).toBe("awaited");
  });

  it("counts every round on the head, not just the first", () => {
    const reviews = [review("Copilot", HEAD), review("copilot-pull-request-reviewer[bot]", HEAD)];
    expect(classifyRound({ reviews, head: HEAD }).reason).toContain("2 Copilot round(s)");
  });

  // The ruleset sets `review_draft_pull_requests: false`, so a draft is owed nothing. Waiting for
  // a round that will never be requested would hang the job until its budget expired.
  it("is not-owed on a draft, without needing any reviews", () => {
    expect(classifyRound({ reviews: [], head: HEAD, draft: true })).toMatchObject({
      state: "not-owed",
    });
  });

  // A missing head is not "no round yet" — it means the step cannot tell what it is asking about,
  // and answering anyway would be answering a question it never read.
  it("refuses a missing head rather than guessing", () => {
    expect(() => classifyRound({ reviews: [], head: "" })).toThrow(/no head SHA/);
    expect(() =>
      classifyRound({ reviews: [], head: undefined as unknown as string })
    ).toThrow(/no head SHA/);
  });

  it("tolerates a malformed reviews payload", () => {
    expect(
      classifyRound({ reviews: undefined as unknown as [], head: HEAD }).state
    ).toBe("awaited");
    expect(classifyRound({ reviews: [{} as never], head: HEAD }).state).toBe("awaited");
  });
});

/**
 * #54 — a Copilot round that contains no review is not a review.
 *
 * The bodies are the ones GitHub actually sent, not paraphrases: the first was quoted on #54 from
 * the round that satisfied the gate on #53, the second measured on #55 and #56, which merged on it.
 * Paraphrasing them here would test the matcher against my memory of the string rather than the
 * string, which is the whole defect one level up.
 */
const ERROR_BODY =
  "Copilot encountered an error and was unable to review this pull request. " +
  "You can try again by re-requesting a review.";
const DECLINED_BODY = "Copilot wasn't able to review any files in this pull request.";
const REAL_BODY = "### 🟢 Approval recommended\n\nThe change is a straightforward SHA-pin bump.";

/** As `review`, plus the body — which is what decides whether a round is a review at all. */
const round = (login: string, commit_id: string, body: string) => ({
  user: { login },
  commit_id,
  body,
});

describe("emptyRound (#54)", () => {
  it("names the declined-diff body, which no re-request can fix", () => {
    expect(emptyRound(DECLINED_BODY)).toBe("declined");
  });

  it("names the error body, which a re-request can", () => {
    expect(emptyRound(ERROR_BODY)).toBe("errored");
  });

  it("passes a real verdict through", () => {
    expect(emptyRound(REAL_BODY)).toBe(null);
  });

  /*
   * The two patterns must not both match one body, or the ordering in `classifyRound` decides the
   * answer by accident. "wasn't able to review" does not contain "unable to review" — asserted
   * rather than reasoned about, because that is a claim about a regex and regexes are checkable.
   */
  it("keeps the two patterns disjoint on the measured bodies", () => {
    expect(ERRORED.test(DECLINED_BODY)).toBe(false);
    expect(DECLINED_DIFF.test(ERROR_BODY)).toBe(false);
  });

  /*
   * The specific-first ordering exists for a rewording that has not happened yet, so this is the
   * only assertion here testing a string GitHub has never sent. It is worth its keep: it is what
   * stops the ordering being silently rearranged.
   */
  it("reads a hypothetical 'was unable to review any files' as declined, not errored", () => {
    expect(emptyRound("Copilot was unable to review any files in this pull request.")).toBe(
      "declined"
    );
  });

  it("treats a missing or empty body as a real round rather than throwing", () => {
    expect(emptyRound(undefined)).toBe(null);
    expect(emptyRound(null)).toBe(null);
    expect(emptyRound("")).toBe(null);
    expect(emptyRound(42)).toBe(null);
  });
});

describe("classifyRound on rounds that reviewed nothing (#54)", () => {
  /*
   * The regression. Before this, `classifyRound` reported `landed` here and the gate went green
   * over a pull request nothing had reviewed — measured on #53, where it nearly merged.
   */
  it("does not count an error round as landed", () => {
    const result = classifyRound({ reviews: [round("Copilot", HEAD, ERROR_BODY)], head: HEAD });
    expect(result.state).toBe("awaited");
    expect(result.reason).toMatch(/all of them errors/);
  });

  /*
   * A diff Copilot will not read still owes a review — a person's. A lockfile is where a
   * supply-chain change arrives, so it is the diff least worth waving through.
   */
  it("waits for a human when Copilot declined the diff", () => {
    const result = classifyRound({ reviews: [round("Copilot", HEAD, DECLINED_BODY)], head: HEAD });
    expect(result.state).toBe("awaited");
    expect(result.awaiting).toBe("human");
    expect(result.reason).toMatch(/waiting for a human review/);
  });

  it("is satisfied by a human review of the same head", () => {
    const result = classifyRound({
      reviews: [
        round("Copilot", HEAD, DECLINED_BODY),
        { user: { login: "marius-cetanas", type: "User" }, commit_id: HEAD, body: "lgtm" },
      ],
      head: HEAD,
    });
    expect(result.state).toBe("landed");
    expect(result.reason).toMatch(/1 human review\(s\)/);
  });

  it("does not accept a human review of an earlier commit", () => {
    const result = classifyRound({
      reviews: [
        round("Copilot", HEAD, DECLINED_BODY),
        { user: { login: "marius-cetanas", type: "User" }, commit_id: OLDER, body: "lgtm" },
      ],
      head: HEAD,
    });
    expect(result.state).toBe("awaited");
    expect(result.awaiting).toBe("human");
  });

  /*
   * The gate rests entirely on this predicate in the declined case, so a bot must not pass it.
   * Dependabot authors the pull requests this branch exists for.
   *
   * Copilot is deliberately not in this list: a Copilot review with a real body on the head is a
   * genuine round and *should* land, declined sibling or not. That it is not a human reviewer is
   * asserted in `isHumanReviewer` instead, which is where the claim belongs.
   */
  it("does not accept a bot review as the human one", () => {
    for (const user of [
      { login: "dependabot[bot]", type: "Bot" },
      { login: "some-app[bot]" },
      { login: "renovate", type: "Bot" },
    ]) {
      const result = classifyRound({
        reviews: [round("Copilot", HEAD, DECLINED_BODY), { user, commit_id: HEAD, body: "x" }],
        head: HEAD,
      });
      expect(result.state, user.login).toBe("awaited");
    }
  });

  /*
   * #53's exact sequence: Copilot errored at 17:00:46Z and delivered the real verdict at 18:53:00Z,
   * both carrying `commit_id: 6313d73e`. The real one has to win regardless of order in the list.
   */
  it("lets a real round win over an empty one on the same head", () => {
    for (const reviews of [
      [round("Copilot", HEAD, ERROR_BODY), round("Copilot", HEAD, REAL_BODY)],
      [round("Copilot", HEAD, REAL_BODY), round("Copilot", HEAD, ERROR_BODY)],
    ]) {
      const result = classifyRound({ reviews, head: HEAD });
      expect(result.state).toBe("landed");
      expect(result.reason).toMatch(/^1 Copilot round\(s\)/);
    }
  });

  it("still ignores an empty round that describes an older commit", () => {
    const result = classifyRound({ reviews: [round("Copilot", OLDER, DECLINED_BODY)], head: HEAD });
    expect(result.state).toBe("awaited");
    expect(result.reason).toMatch(/the branch moved/);
  });

  it("counts only the real rounds in the reason", () => {
    const reviews = [
      round("Copilot", HEAD, ERROR_BODY),
      round("Copilot", HEAD, REAL_BODY),
      round("Copilot", HEAD, REAL_BODY),
    ];
    expect(classifyRound({ reviews, head: HEAD }).reason).toContain("2 Copilot round(s)");
  });
});

describe("classifyRound when no round can be requested at all (#58)", () => {
  const human = { user: { login: "marius-cetanas", type: "User" }, commit_id: HEAD, body: "lgtm" };

  /*
   * The generalisation of #61's ruling, not a return of the `not-owed` exemption it replaced. Two
   * ways no round is coming — Copilot will not read the diff, or the request cannot be placed —
   * and one answer to both: a person's review of this head.
   */
  it("waits for a human when the request could not be placed", () => {
    const r = classifyRound({ reviews: [], head: HEAD, roundUnobtainable: true });
    expect(r.state).toBe("awaited");
    expect(r.awaiting).toBe("human");
    expect(r.reason).toMatch(/no Copilot round can be requested/);
  });

  it("is satisfied by a human review of the same head", () => {
    const r = classifyRound({ reviews: [human], head: HEAD, roundUnobtainable: true });
    expect(r.state).toBe("landed");
    expect(r.reason).toMatch(/1 human review\(s\)/);
  });

  /*
   * The flag widens what satisfies the check; it must never narrow it. A round that arrives anyway
   * — because a user requested one from outside the job, which is the documented workaround —
   * still wins, and still wins over a human review.
   */
  it("never suppresses a Copilot round that arrives anyway", () => {
    const r = classifyRound({
      reviews: [round("Copilot", HEAD, REAL_BODY)],
      head: HEAD,
      roundUnobtainable: true,
    });
    expect(r.state).toBe("landed");
    expect(r.reason).toMatch(/the commit being merged/);
  });

  it("does not accept a bot review, or a human review of an earlier commit", () => {
    for (const review of [
      { user: { login: "dependabot[bot]", type: "Bot" }, commit_id: HEAD, body: "x" },
      { ...human, commit_id: OLDER },
    ]) {
      expect(classifyRound({ reviews: [review], head: HEAD, roundUnobtainable: true }).state).toBe(
        "awaited"
      );
    }
  });

  /** Off by default, so nothing about an ordinary pull request changes. */
  it("changes nothing when the flag is not set", () => {
    expect(classifyRound({ reviews: [human], head: HEAD }).state).toBe("awaited");
  });
});

/**
 * A reply to a review thread is not a review — measured on #73.
 *
 * GitHub records a reply to a thread as a pull request review of its own. On #73, review 5198788557
 * is `COMMENTED`, has an empty body, carries the head it was posted against, and holds exactly one
 * comment, 4006098256, whose `in_reply_to_id` is 4006046306. The reviews list shows only the first
 * three of those facts, so a check reading the list alone cannot tell a reply from a review — and
 * where no Copilot round is coming, one reply from any account that is not a bot satisfied the gate
 * that exists so a person reads the diff.
 */
const PERSON = { login: "marius-cetanas", type: "User" };

/** 4006098256 on #73, trimmed to the fields that decide the answer. */
const REPLY = { id: 4006098256, pull_request_review_id: 5198788557, in_reply_to_id: 4006046306 };

/**
 * A top-level comment — one that starts a thread. The key is **absent**, not null: measured through
 * the same endpoint on twelve of Copilot's reviews. The ids here are illustrative; the shape is not.
 */
const TOP_LEVEL = { id: 4006000001, pull_request_review_id: 5198788557 };

/** Review 5198788557 as the reviews list returns it; `extra` overrides or adds fields. */
const personReview = (extra: Record<string, unknown> = {}) => ({
  id: 5198788557,
  user: PERSON,
  commit_id: HEAD,
  state: "COMMENTED",
  body: "",
  ...extra,
});

const DECLINED_ROUND = round("Copilot", HEAD, DECLINED_BODY);

describe("classifyRound on a person's review that is only a thread reply", () => {
  /** Both ways no Copilot round is coming reach the same branch, so both are held to the rule. */
  it.each([
    { label: "a declined diff", reviews: [DECLINED_ROUND], roundUnobtainable: false },
    { label: "a round that cannot be requested", reviews: [], roundUnobtainable: true },
  ])(
    "does not let an empty-body COMMENTED review whose comments are all replies satisfy it, on $label",
    ({ reviews, roundUnobtainable }) => {
      const r = classifyRound({
        reviews: [...reviews, personReview({ comments: [REPLY] })],
        head: HEAD,
        roundUnobtainable,
      });
      expect(r.state).toBe("awaited");
      expect(r.awaiting).toBe("human");
    }
  );

  it("lets an empty-body COMMENTED review with a top-level inline comment satisfy it", () => {
    const r = classifyRound({
      reviews: [DECLINED_ROUND, personReview({ comments: [TOP_LEVEL] })],
      head: HEAD,
    });
    expect(r.state).toBe("landed");
    expect(r.reason).toMatch(/1 human review\(s\)/);
  });

  it("lets one satisfy it that holds a top-level comment beside its replies", () => {
    const r = classifyRound({
      reviews: [DECLINED_ROUND, personReview({ comments: [REPLY, TOP_LEVEL] })],
      head: HEAD,
    });
    expect(r.state).toBe("landed");
  });

  /*
   * A verdict is a statement on its own, so nothing else has to be read. Measured shape: review
   * 5199013512 on #75 — `APPROVED`, body "", no comments.
   */
  it("lets an empty-body APPROVED review satisfy it", () => {
    const r = classifyRound({
      reviews: [DECLINED_ROUND, personReview({ id: 5199013512, state: "APPROVED" })],
      head: HEAD,
    });
    expect(r.state).toBe("landed");
  });

  it("lets an empty-body CHANGES_REQUESTED review satisfy it", () => {
    const r = classifyRound({
      reviews: [DECLINED_ROUND, personReview({ state: "CHANGES_REQUESTED" })],
      head: HEAD,
    });
    expect(r.state).toBe("landed");
  });

  /*
   * The deadlock guard stays. GitHub refuses an approval on your own pull request, so a `COMMENTED`
   * review with something in it has to count, whatever else it holds.
   */
  it("lets a COMMENTED review with a body satisfy it, even when its comments are replies", () => {
    const r = classifyRound({
      reviews: [DECLINED_ROUND, personReview({ body: "Read the lockfile diff.", comments: [REPLY] })],
      head: HEAD,
    });
    expect(r.state).toBe("landed");
  });

  it("does not read whitespace as a body", () => {
    const r = classifyRound({
      reviews: [DECLINED_ROUND, personReview({ body: " \n\t", comments: [REPLY] })],
      head: HEAD,
    });
    expect(r.state).toBe("awaited");
  });

  /* Dismissal withdraws the verdict and leaves the rest, so the review counts for what remains. */
  it("counts a dismissed review only for what it still says", () => {
    const empty = personReview({ state: "DISMISSED", comments: [] });
    const said = personReview({ state: "DISMISSED", body: "Looked; see the thread." });
    expect(classifyRound({ reviews: [DECLINED_ROUND, empty], head: HEAD }).state).toBe("awaited");
    expect(classifyRound({ reviews: [DECLINED_ROUND, said], head: HEAD }).state).toBe("landed");
  });

  /*
   * Every comment GitHub returns carries a numeric `id`, so an entry without one is not taken for a
   * top-level comment just because it has no `in_reply_to_id` either.
   */
  it("does not take a malformed entry for a top-level comment", () => {
    for (const comment of [null, "a string", 42, {}, [], { in_reply_to_id: null }]) {
      const r = classifyRound({
        reviews: [DECLINED_ROUND, personReview({ comments: [comment] })],
        head: HEAD,
      });
      expect(r.state, JSON.stringify(comment)).toBe("awaited");
      // Nor diagnosed as a reply: the reason names what the review lacks, which is as true of a
      // malformed entry as of a reply. (Raised by Copilot on #82.)
      expect(r.reason, JSON.stringify(comment)).toMatch(
        /no verdict, no body beyond whitespace and no top-level comment/
      );
      expect(r.reason, JSON.stringify(comment)).not.toMatch(/thread replies/);
    }
  });

  /*
   * Fail closed: a review whose comments have not been read has not shown that it says anything.
   * It is named, so the loop can read it, rather than refused for good.
   */
  it("does not count a review whose comments are unread, and names it for reading", () => {
    const r = classifyRound({ reviews: [DECLINED_ROUND, personReview()], head: HEAD });
    expect(r).toMatchObject({ state: "awaited", awaiting: "human", unread: [5198788557] });
  });

  it("names for reading only a person's review on the head whose answer rests on its comments", () => {
    const r = classifyRound({
      reviews: [
        DECLINED_ROUND,
        personReview({ id: 1 }),
        personReview({ id: 2, commit_id: OLDER }),
        personReview({ id: 3, user: { login: "dependabot[bot]", type: "Bot" } }),
        personReview({ id: 4, comments: [REPLY] }),
        personReview({ id: undefined }),
      ],
      head: HEAD,
    });
    expect(r.unread).toEqual([1]);
  });

  it("names nothing for reading while it is Copilot the check is waiting on", () => {
    const r = classifyRound({ reviews: [personReview()], head: HEAD });
    expect(r.reason).toMatch(/no Copilot round yet/);
    expect(r.unread).toBeUndefined();
  });

  /*
   * The person who replied on the head is exactly who reads this log, and "waiting for a human
   * review" alone reads to them as a broken check.
   */
  it("says why a person's reply on the head does not clear it", () => {
    const r = classifyRound({
      reviews: [DECLINED_ROUND, personReview({ comments: [REPLY] })],
      head: HEAD,
    });
    expect(r.reason).toMatch(
      /waiting for a human review of it; 1 review\(s\) by a person on it have no verdict, no body beyond whitespace and no top-level comment — a reply to a thread is not a review$/
    );
  });

  it("adds nothing to the reason when no person has left a review on the head", () => {
    expect(classifyRound({ reviews: [DECLINED_ROUND], head: HEAD }).reason).toMatch(
      /waiting for a human review of it$/
    );
  });
});

describe("awaitRound reading a person's review before counting it", () => {
  const noSleep = async () => {};
  const COMMENTS = "/reviews/5198788557/comments";

  /** Serves the pull request, its reviews and any review's comments; records every path asked for. */
  const serving = (reviews: object[], comments: Record<string, unknown> = {}) => {
    const asked: string[] = [];
    const api = async (suffix: string) => {
      asked.push(suffix);
      if (suffix === "") return { head: { sha: HEAD } };
      if (suffix === "/reviews") return reviews;
      if (suffix in comments) return comments[suffix];
      throw new Error(`GET pulls/7${suffix} -> 404`);
    };
    return { api, asked, reads: () => asked.filter((s) => s.includes("/comments")).length };
  };

  it("reads the comments of a person's review whose answer rests on them", async () => {
    const s = serving([DECLINED_ROUND, personReview()], { [COMMENTS]: [REPLY] });
    await awaitRound({ api: s.api, sleep: noSleep, budgetMs: 0 });
    expect(s.asked).toContain(COMMENTS);
  });

  it("keeps waiting, and expires, when that review holds only replies", async () => {
    const s = serving([DECLINED_ROUND, personReview()], { [COMMENTS]: [REPLY] });
    const result = await awaitRound({ api: s.api, sleep: noSleep, budgetMs: 0 });
    expect(result.state).toBe("expired");
    expect(result.reason).toMatch(
      /have no verdict, no body beyond whitespace and no top-level comment — a reply to a thread is not a review/
    );
  });

  it("lands in the same poll when the review holds a top-level comment", async () => {
    const s = serving([DECLINED_ROUND, personReview()], { [COMMENTS]: [TOP_LEVEL] });
    const result = await awaitRound({ api: s.api, sleep: noSleep, budgetMs: 0 });
    expect(result).toMatchObject({ state: "landed", polls: 1 });
    expect(s.reads()).toBe(1);
  });

  /*
   * A reply on the head is ordinary while Copilot is still owed a round — it is how a round gets
   * answered — so reading it there would put a new call, and a new way to fail, on the path every
   * pull request takes, for an answer nothing on that path uses.
   */
  it("reads nothing while the check is still waiting on Copilot", async () => {
    const s = serving([personReview()]);
    const result = await awaitRound({ api: s.api, sleep: noSleep, budgetMs: 0 });
    expect(result.reason).toMatch(/no Copilot round yet/);
    expect(s.reads()).toBe(0);
  });

  /*
   * Once the request proves unobtainable, every poll decides twice (see `awaitRound`). A review's
   * comments are read once per poll, not once per decision.
   */
  it("reads a review's comments once per poll, not once per decision", async () => {
    const s = serving([personReview()], { [COMMENTS]: [REPLY] });
    const result = await awaitRound({
      api: s.api,
      requestRound: async () => ({ recorded: false }),
      isRoundPending: async () => false,
      sleep: noSleep,
      budgetMs: 30_000,
      pollMs: 30_000,
    });
    expect(result).toMatchObject({ state: "expired", polls: 2 });
    expect(s.reads()).toBe(2);
  });

  /*
   * A check that could not see a review has not seen it say nothing. The read fails the run the
   * way the loop's other reads do, naming the call, rather than answering either way.
   */
  it("fails loudly, rather than counting or refusing, when the read itself fails", async () => {
    const s = serving([DECLINED_ROUND, personReview()]);
    await expect(awaitRound({ api: s.api, sleep: noSleep, budgetMs: 0 })).rejects.toThrow(
      `GET pulls/7${COMMENTS} -> 404`
    );
  });

  /*
   * Through `makeGithubIo`'s own `api`, which is all the workflow passes: the read needs nothing the
   * CLI arm would have to wire, and that arm is the one part of the script the suite cannot run.
   * That `api` reads every page of a list (#81), so this fake pages a review's comments the way the
   * reviews fake beside #81's tests pages reviews — a `Link` header naming the next page — and a
   * top-level comment on the second page has to count.
   */
  const githubWithComments = (pages: object[][]) => {
    const urls: string[] = [];
    const fetch = async (url: string) => {
      urls.push(url);
      const u = new URL(url);
      const headers = new Headers();
      const answer = (body: unknown) => ({ ok: true, status: 200, headers, json: async () => body });
      if (u.pathname.endsWith("/comments")) {
        const n = Number(u.searchParams.get("page") ?? 1);
        if (n < pages.length) {
          headers.set(
            "link",
            `<https://api.github.com/repositories/1191561833/pulls/7/reviews/5198788557/comments?per_page=100&page=${n + 1}>; rel="next"`
          );
        }
        return answer(pages[n - 1] ?? []);
      }
      if (u.pathname.endsWith("/reviews")) return answer([DECLINED_ROUND, personReview()]);
      if (url === "https://api.github.com/repos/o/r/pulls/7?per_page=100") return answer({ head: { sha: HEAD } });
      return { ok: false, status: 404, headers, json: async () => ({}) };
    };
    return { urls, fetch: fetch as unknown as typeof globalThis.fetch };
  };

  const throughGithubIo = (gh: ReturnType<typeof githubWithComments>) =>
    awaitRound({
      api: makeGithubIo({ fetch: gh.fetch, token: "t", repo: "o/r", pr: "7" }).api,
      sleep: noSleep,
      budgetMs: 0,
    });

  it("asks GitHub for a review's comments through the api the workflow already passes", async () => {
    const gh = githubWithComments([[REPLY]]);
    const result = await throughGithubIo(gh);
    expect(gh.urls).toContain(
      "https://api.github.com/repos/o/r/pulls/7/reviews/5198788557/comments?per_page=100"
    );
    expect(result.state).toBe("expired");
  });

  it("reads every page of those comments, so a top-level comment past the first page counts", async () => {
    const gh = githubWithComments([[REPLY], [TOP_LEVEL]]);
    const result = await throughGithubIo(gh);
    expect(result).toMatchObject({ state: "landed", polls: 1 });
    expect(gh.urls.filter((u) => new URL(u).pathname.endsWith("/comments"))).toHaveLength(2);
  });
});

describe("isHumanReviewer", () => {
  it("accepts a person", () => {
    expect(isHumanReviewer({ login: "marius-cetanas", type: "User" })).toBe(true);
    expect(isHumanReviewer({ login: "marius-cetanas" })).toBe(true);
  });

  it("rejects a bot by type, by suffix, and by name", () => {
    expect(isHumanReviewer({ login: "someone", type: "Bot" })).toBe(false);
    expect(isHumanReviewer({ login: "dependabot[bot]" })).toBe(false);
    // The spelling that carries neither marker, which is why the name check exists.
    expect(isHumanReviewer({ login: "Copilot" })).toBe(false);
  });

  /*
   * The account-type set is open — REST also returns `Organization`, GraphQL adds `Mannequin` — so
   * "anything but Bot" would read every future member as a person. Refused by default instead.
   * (Raised by Copilot on #61.)
   */
  it("accepts only the literal User when a type is present", () => {
    expect(isHumanReviewer({ login: "someone", type: "User" })).toBe(true);
    for (const type of ["Organization", "Mannequin", "EnterpriseUserAccount", "", "user"]) {
      expect(isHumanReviewer({ login: "someone", type }), type).toBe(false);
    }
  });

  it("still tolerates a payload trimmed to a login", () => {
    expect(isHumanReviewer({ login: "someone", type: undefined })).toBe(true);
    expect(isHumanReviewer({ login: "someone", type: null })).toBe(true);
  });

  it("rejects a missing or malformed user rather than throwing", () => {
    expect(isHumanReviewer(undefined)).toBe(false);
    expect(isHumanReviewer(null)).toBe(false);
    expect(isHumanReviewer({})).toBe(false);
    expect(isHumanReviewer({ login: "" })).toBe(false);
    expect(isHumanReviewer({ login: 42 })).toBe(false);
  });
});

describe("isHumanReview", () => {
  it("requires a person before anything in the review counts", () => {
    for (const user of [{ login: "dependabot[bot]", type: "Bot" }, { login: "Copilot" }, undefined]) {
      const review = personReview({ user, state: "APPROVED", body: "lgtm", comments: [TOP_LEVEL] });
      expect(isHumanReview(review), JSON.stringify(user)).toBe(false);
    }
  });

  it("counts a verdict, a body, or a top-level comment, each on its own", () => {
    expect(isHumanReview(personReview({ state: "APPROVED" }))).toBe(true);
    expect(isHumanReview(personReview({ state: "CHANGES_REQUESTED" }))).toBe(true);
    expect(isHumanReview(personReview({ body: "lgtm" }))).toBe(true);
    expect(isHumanReview(personReview({ comments: [TOP_LEVEL] }))).toBe(true);
  });

  it("refuses a review holding only replies, holding nothing, or whose comments are unread", () => {
    expect(isHumanReview(personReview({ comments: [REPLY] }))).toBe(false);
    expect(isHumanReview(personReview({ comments: [] }))).toBe(false);
    expect(isHumanReview(personReview())).toBe(false);
  });

  /*
   * Only a key that is absent or null makes a comment top-level. Any other value reads as a reply,
   * one that is not a number included — the direction to be wrong in.
   */
  it("reads any in_reply_to_id that is present and not null as a reply", () => {
    for (const in_reply_to_id of [4006046306, "4006046306", 0, false]) {
      const review = personReview({ comments: [{ id: 1, in_reply_to_id }] });
      expect(isHumanReview(review), String(in_reply_to_id)).toBe(false);
    }
    expect(isHumanReview(personReview({ comments: [{ id: 1, in_reply_to_id: null }] }))).toBe(true);
  });

  it("takes only the two verdict states as a statement on their own, compared exactly", () => {
    for (const state of ["COMMENTED", "DISMISSED", "PENDING", "approved", "", undefined]) {
      expect(isHumanReview(personReview({ state })), String(state)).toBe(false);
    }
  });

  it("refuses a malformed review rather than throwing", () => {
    for (const review of [undefined, null, {}, { user: PERSON, comments: "x" }, { user: PERSON, body: 42 }]) {
      expect(isHumanReview(review), JSON.stringify(review)).toBe(false);
    }
  });
});

describe("readComments", () => {
  it("reads only the listed reviews, one read each, and hands the others back untouched", async () => {
    const asked: string[] = [];
    const api = async (suffix: string) => {
      asked.push(suffix);
      return [REPLY];
    };
    const other = personReview({ id: 2 });
    const [read, untouched] = await readComments(api, [personReview(), other], [5198788557]);
    expect(asked).toEqual(["/reviews/5198788557/comments"]);
    expect(read).toMatchObject({ id: 5198788557, comments: [REPLY] });
    expect(untouched).toBe(other);
  });

  it("reads a payload that is not a list as no comments, so the review is refused, not re-read", async () => {
    const [read] = await readComments(async () => ({ message: "odd" }), [personReview()], [5198788557]);
    expect(read).toMatchObject({ comments: [] });
    expect(isHumanReview(read)).toBe(false);
  });

  it("does not modify the reviews it was given", async () => {
    const given = personReview();
    await readComments(async () => [TOP_LEVEL], [given], [5198788557]);
    expect(given).not.toHaveProperty("comments");
  });
});

describe("describeRequest (#58)", () => {
  it("says the round is on order when the request took", async () => {
    expect(await describeRequest(async () => true)).toMatch(/on order/);
  });

  /*
   * The line that exists for #58. It must name both readings — a request Copilot picked up
   * instantly looks identical here (measured on #49) — and attach the one that matters to the
   * outcome that separates them.
   */
  it("names both readings when nothing is on order afterwards", async () => {
    const line = await describeRequest(async () => false);
    expect(line).toMatch(/did not take \(#58\)/);
    expect(line).toMatch(/took it up already/);
    expect(line).toMatch(/expires red/);
  });

  it("reports a failed confirmation as unknown rather than as either answer", async () => {
    const line = await describeRequest(async () => {
      throw new Error("GraphQL -> 403");
    });
    expect(line).toMatch(/could not confirm it landed \(GraphQL -> 403\)/);
    expect(line).not.toMatch(/did not take/);
    expect(line).not.toMatch(/on order/);
  });

  it("keeps the `requested:` prefix on every branch", async () => {
    const lines = [
      await describeRequest(async () => true),
      await describeRequest(async () => false),
      await describeRequest(async () => {
        throw new Error("boom");
      }),
      await describeRequest(undefined),
      await describeRequest(undefined, true),
      await describeRequest(undefined, false),
    ];
    for (const line of lines) expect(line, line).toMatch(/^requested: /);
  });

  /*
   * The mutation's own response is the post-mutation state, so it is not racing Copilot the way
   * the poll below is. It wins wherever it exists.
   */
  it("prefers what the mutation reported over a later poll", async () => {
    const contradicting = async () => false;
    expect(await describeRequest(contradicting, true)).toMatch(/GitHub recorded it/);
    const alsoContradicting = async () => true;
    expect(await describeRequest(alsoContradicting, false)).toMatch(/did not take \(#58\)/);
  });

  /*
   * Definite about what GitHub said, and deliberately not about what happens next. An earlier
   * draft ended "the check will expire", which the loop does not guarantee: it keeps polling, and
   * #58's own documented workaround — a user requesting the round by hand — lands inside that
   * window and turns the check green. (Raised by Copilot on #63.)
   */
  it("is definite about GitHub's answer and not about the run's outcome", async () => {
    const line = await describeRequest(undefined, false);
    // Names the list it actually read — `reviewRequests`, not the reviews. (Raised by Copilot on #63.)
    expect(line).toMatch(/does not list Copilot among the pull request's requested reviewers/);
    expect(line).toMatch(/No round is coming from this job/);
    // A thread reply is the first thing someone reading this on a Dependabot pull request might
    // post, and it does not satisfy the check, so the line says what does.
    expect(line).toMatch(/a person's review of this head now satisfies the check instead/);
    expect(line).toMatch(
      /one with a verdict, a body or a top-level comment, since a reply to a thread is not a review/
    );
    expect(line).toMatch(/still lands and still counts/);
    expect(line).not.toMatch(/will expire/);
    // No hedging on GitHub's answer, though — unlike the poll, that reading has no innocent one.
    expect(line).not.toMatch(/took it up already/);
  });

  it("falls back to the poll when the mutation reported nothing either way", async () => {
    for (const recorded of [null, undefined]) {
      expect(await describeRequest(async () => true, recorded)).toMatch(/on order/);
      expect(await describeRequest(async () => false, recorded)).toMatch(/took it up already/);
    }
  });

  it("claims nothing when there is no way to check", async () => {
    const line = await describeRequest(undefined);
    expect(line).toBe(`requested: asked ${COPILOT_REVIEWER} for a round`);
  });
});

describe("describeError", () => {
  it("uses the message when there is a real one", () => {
    expect(describeError(new Error("GraphQL -> 403"))).toBe("GraphQL -> 403");
  });

  // The two values whose property access raises, which is what would abort the wait loop.
  it("names null and undefined instead of raising on them", () => {
    expect(describeError(null)).toBe("null");
    expect(describeError(undefined)).toBe("undefined");
  });

  // These do not raise; `err.message` yields undefined and the log then names nothing.
  it("names a thrown value that has no message, rather than saying undefined", () => {
    expect(describeError("just a string")).toBe("just a string");
    expect(describeError({ code: 42 })).toBe("[object Object]");
    expect(describeError(new Error(""))).toBe("Error");
  });

  it("never returns an empty string, whatever it is handed", () => {
    for (const v of [null, undefined, "", 0, false, {}, new Error("")]) {
      expect(describeError(v), String(v)).not.toBe("");
    }
  });
});

/** A `reviewRequests.nodes` entry as GraphQL returns it. */
const requested = (login: string) => ({ requestedReviewer: { login } });

describe("hasPendingRequest", () => {
  /**
   * GraphQL's `Bot.login` drops the `[bot]` suffix REST carries, so the two spellings differ and
   * matching only one silently never fires. Both are measured on this repository.
   */
  it("accepts either spelling of the reviewer's login", () => {
    expect(hasPendingRequest([requested(COPILOT_BOT_LOGIN)])).toBe(true);
    expect(hasPendingRequest([requested(COPILOT_REVIEWER)])).toBe(true);
    expect(hasPendingRequest([requested("Copilot")])).toBe(true);
  });

  it("names the two spellings distinctly, because they are not the same string", () => {
    expect(COPILOT_REVIEWER).toBe("copilot-pull-request-reviewer[bot]");
    expect(COPILOT_BOT_LOGIN).toBe("copilot-pull-request-reviewer");
    expect(COPILOT_BOT_LOGIN).not.toBe(COPILOT_REVIEWER);
  });

  it("is false when only humans are on order", () => {
    expect(hasPendingRequest([requested("marius-cetanas")])).toBe(false);
  });

  it("finds the reviewer among other requested reviewers", () => {
    expect(hasPendingRequest([requested("marius-cetanas"), requested(COPILOT_BOT_LOGIN)])).toBe(
      true
    );
  });

  it("is false for an empty or malformed payload rather than throwing", () => {
    expect(hasPendingRequest([])).toBe(false);
    expect(hasPendingRequest(undefined as never)).toBe(false);
    expect(hasPendingRequest([{}] as never)).toBe(false);
    // A Team or Mannequin reviewer matches neither inline fragment and arrives as `{}`.
    expect(hasPendingRequest([{ requestedReviewer: {} }] as never)).toBe(false);
    // A deleted reviewer arrives as a null element or a null requestedReviewer, both legal.
    expect(hasPendingRequest([null] as never)).toBe(false);
    expect(hasPendingRequest([{ requestedReviewer: null }] as never)).toBe(false);
  });

  /**
   * Raised by Copilot's round on #49 and reproduced before fixing: `?.` short-circuits on null and
   * undefined only, so a login that is *present but not a string* sailed past the guard and
   * `login?.toLowerCase()` raised `is not a function` — inside the loop whose whole contract is to
   * keep waiting. "Malformed" has to mean any shape, not just an absent one.
   */
  it.each([
    ["a number", 42],
    ["a boolean", true],
    ["an object", {}],
    ["an array", ["copilot"]],
  ])("is false for a login that is %s, rather than throwing", (_label, login) => {
    expect(hasPendingRequest([{ requestedReviewer: { login } }] as never)).toBe(false);
  });
});

/**
 * #44 — the check now asks for the round instead of only waiting for one.
 *
 * The ruleset requests a round for most pull requests and not all of them, and the ones it skips
 * could never go green however long this waited. Two holes were measured, with different causes: a
 * non-default base, which the ruleset's `~DEFAULT_BRANCH` condition never matches, and a bot author
 * — #47 drew nothing in 16 hours against `main` while #43/#45/#46/#48 were each requested one
 * second after opening.
 *
 * These assertions cover the loop's decision to ask, which is all they ever covered. **They do not
 * establish that asking works**, and on a Dependabot pull request it does not: the mutation is
 * accepted and records nothing (#58). Injected I/O cannot see that, so nothing here fails when it
 * happens — which is why it took three red pull requests, six days after #49 merged, to notice.
 */
describe("awaitRound requesting the round (#44)", () => {
  /** Serves the two endpoints the loop reads. Pending state is injected separately, as in the CLI. */
  const apiWith = (reviews: object[], head = HEAD) => async (suffix: string) =>
    suffix === "/reviews" ? reviews : { head: { sha: head } };

  const noSleep = async () => {};
  const notPending = async () => false;

  /** Counts calls and records the log, which is all these assertions need to distinguish. */
  const spy = () => {
    const lines: string[] = [];
    let asked = 0;
    return {
      lines,
      get asked() {
        return asked;
      },
      requestRound: async () => {
        asked += 1;
      },
      log: (l: string) => lines.push(l),
    };
  };

  it("asks for a round when none is pending", async () => {
    const s = spy();
    await awaitRound({
      api: apiWith([]),
      requestRound: s.requestRound,
      // Flips the way a request that takes does: nothing on order before the ask, on order after.
      isRoundPending: (() => {
        let asked = false;
        return async () => (asked ? true : ((asked = true), false));
      })(),
      sleep: noSleep,
      budgetMs: 0,
      log: s.log,
    });
    expect(s.asked).toBe(1);
    expect(s.lines.some((l) => l.startsWith("requested:"))).toBe(true);
  });

  /*
   * #58 — the same call, on a pull request where the mutation resolves and records nothing.
   * Measured on #55, #56 and #57. Before this the log read `requested: no round was on order,
   * asked … for one` and the run then expired red ten minutes later with a success line at the
   * top, which is the opposite of a clue.
   */
  it("says so when the request resolves and leaves nothing on order", async () => {
    const s = spy();
    await awaitRound({
      api: apiWith([]),
      requestRound: s.requestRound,
      isRoundPending: notPending,
      sleep: noSleep,
      budgetMs: 0,
      log: s.log,
    });
    expect(s.asked).toBe(1);
    expect(s.lines.some((l) => /did not take \(#58\)/.test(l))).toBe(true);
    // Every line this function emits shares the prefix, so prefix scanning stays meaningful.
    // (Raised by Copilot on #61.)
    expect(s.lines.every((l) => l.startsWith("requested:") || l.startsWith("waiting:"))).toBe(true);
  });

  /*
   * The #54 half through the loop rather than only through the classifier. A declined diff does
   * **not** end the wait: the check stays `awaited` for a human review of that head and expires
   * red without one, which is the point of it. What ends early is the asking — see below.
   *
   * _(This comment described the `not-owed` exemption an earlier revision of this branch had, and
   * survived the switch to requiring a human review. Raised by Copilot on #61; a test read as a
   * spec is exactly where a stale comment does its damage.)_
   */
  const DECLINED_ON_HEAD = {
    user: { login: "Copilot" },
    commit_id: HEAD,
    body: "Copilot wasn't able to review any files in this pull request.",
  };

  /*
   * Asking again would request the one thing already known not to be coming, and would put
   * "asked Copilot for a round" in a log whose actual problem is that no person has looked.
   */
  it("asks Copilot for nothing when the missing reviewer is a person", async () => {
    const s = spy();
    const result = await awaitRound({
      api: apiWith([DECLINED_ON_HEAD]),
      requestRound: s.requestRound,
      isRoundPending: notPending,
      sleep: noSleep,
      budgetMs: 0,
      log: s.log,
    });
    expect(result.state).toBe("expired");
    expect(result.reason).toMatch(/waiting for a human review/);
    expect(s.asked).toBe(0);
  });

  /*
   * The ceremony this removes: before it, a Dependabot lockfile bump took four manual steps —
   * request the round by hand, wait for Copilot to decline it, review, re-run. The first two
   * existed only to obtain a round already known to be empty, whose sole function was to reach the
   * branch that then asked for the review. The review is unchanged; the two empty steps are gone.
   */
  it("accepts a human review once the ask reports the request did not take (#58)", async () => {
    const s2 = spy();
    const result = await awaitRound({
      api: apiWith([{ user: { login: "marius-cetanas", type: "User" }, commit_id: HEAD, body: "ok" }]),
      requestRound: async () => ({ recorded: false }),
      isRoundPending: notPending,
      sleep: noSleep,
      budgetMs: 0,
      log: s2.log,
    });
    expect(result.state).toBe("landed");
    // Same poll, not the next one: waiting would sit out a full interval before noticing a review
    // already on the head, and on a nearly-spent budget could miss it entirely.
    expect(result.polls).toBe(1);
  });

  it("still expires when the request did not take and nobody has reviewed", async () => {
    const s2 = spy();
    const result = await awaitRound({
      api: apiWith([]),
      requestRound: async () => ({ recorded: false }),
      isRoundPending: notPending,
      sleep: noSleep,
      budgetMs: 0,
      log: s2.log,
    });
    expect(result.state).toBe("expired");
    expect(result.reason).toMatch(/waiting for a human review/);
  });

  it("goes green the moment the human review of that head exists", async () => {
    const s = spy();
    const result = await awaitRound({
      api: apiWith([
        DECLINED_ON_HEAD,
        { user: { login: "marius-cetanas", type: "User" }, commit_id: HEAD, body: "lgtm" },
      ]),
      requestRound: s.requestRound,
      isRoundPending: notPending,
      sleep: noSleep,
      budgetMs: 0,
      log: s.log,
    });
    expect(result.state).toBe("landed");
    expect(result.polls).toBe(1);
    expect(s.asked).toBe(0);
  });

  // The ordinary case: the ruleset requested one a second after the pull request opened. Asking
  // again would be noise on every pull request this repository already handles correctly.
  it("does not ask when the ruleset already has one in flight", async () => {
    const s = spy();
    await awaitRound({
      api: apiWith([]),
      requestRound: s.requestRound,
      isRoundPending: async () => true,
      sleep: noSleep,
      budgetMs: 0,
      log: s.log,
    });
    expect(s.asked).toBe(0);
    expect(s.lines.some((l) => l.includes("requested already"))).toBe(true);
  });

  it("asks at most once, however many times it polls", async () => {
    const s = spy();
    const result = await awaitRound({
      api: apiWith([]),
      requestRound: s.requestRound,
      isRoundPending: notPending,
      sleep: noSleep,
      budgetMs: 120_000,
      pollMs: 30_000,
    });
    expect(result.polls).toBeGreaterThan(2);
    expect(s.asked).toBe(1);
  });

  /**
   * A fork's pull request gets a read-only token whatever the workflow asks for, so this call is
   * expected to fail there. The right answer is the one the check always had: wait, and let the
   * budget decide — not to crash and report a red that names the wrong thing.
   */
  it("keeps waiting when the request fails, and says why", async () => {
    const s = spy();
    const result = await awaitRound({
      api: apiWith([]),
      requestRound: async () => {
        throw new Error("GraphQL -> 403");
      },
      isRoundPending: notPending,
      sleep: noSleep,
      budgetMs: 60_000,
      pollMs: 30_000,
      log: s.log,
    });
    expect(result.state).toBe("expired");
    expect(s.lines.some((l) => l.includes("could not request") && l.includes("403"))).toBe(true);
  });

  /**
   * Copilot's round on this pull request raised the `err.message` case. Its example was wrong —
   * a thrown string yields `undefined` rather than raising — but the concern is real for `throw
   * null` and `throw undefined`, where the property access itself raises and aborts the wait. Both
   * that and the silent `(undefined)` are covered here, since a log naming nothing is the second
   * failure and the one easier to ship.
   */
  it.each([
    ["an Error", new Error("GraphQL -> 500"), "GraphQL -> 500"],
    ["null", null, "null"],
    ["undefined", undefined, "undefined"],
    ["a string", "just a string", "just a string"],
    ["an object with no message", { code: 42 }, "[object Object]"],
  ])("keeps waiting and names the cause when the request throws %s", async (_l, thrown, shown) => {
    const s = spy();
    const result = await awaitRound({
      api: apiWith([]),
      requestRound: async () => {
        throw thrown;
      },
      isRoundPending: notPending,
      sleep: noSleep,
      budgetMs: 0,
      log: s.log,
    });
    expect(result.state).toBe("expired");
    // Naming the value is the assertion. A regression to bare `err.message` turns the string and
    // object rows into `(undefined)`, which fails here — while the genuinely-undefined row still
    // passes, because there `(undefined)` is the honest answer rather than a swallowed one.
    expect(s.lines.find((l) => l.includes("could not request"))).toContain(shown as string);
  });

  /**
   * A failing pending check must ask anyway.
   *
   * A check that did not answer is not evidence that a round is on order — the same reasoning the
   * "no pending check supplied" case below already applies to a missing one. Skipping the ask here
   * would burn the whole budget over a single transient 502 and go red, which is the symptom this
   * whole change exists to remove.
   */
  it("asks anyway when the pending check fails, and blames the right call", async () => {
    const s = spy();
    const result = await awaitRound({
      api: apiWith([]),
      requestRound: s.requestRound,
      isRoundPending: async () => {
        throw new Error("GraphQL -> 502");
      },
      sleep: noSleep,
      budgetMs: 0,
      log: s.log,
    });
    expect(result.state).toBe("expired");
    expect(s.asked).toBe(1);
    // Naming the call that failed. Folded into one catch, this said "could not request a round"
    // while quoting a status that described the check, and the request had not been attempted.
    expect(s.lines.some((l) => l.includes("could not check for a pending round") && l.includes("502"))).toBe(
      true
    );
    expect(s.lines.some((l) => l.includes("could not request a round"))).toBe(false);
  });

  /**
   * "At most once per run" has to hold on the failure path too, and that was unpinned — a mutant
   * latching only on success passed the whole suite. It matters most exactly here: a fork's token
   * is read-only, so every retry is a guaranteed 403, and an unlatched loop would spend the budget
   * making nineteen more of them.
   */
  it("asks only once even when every attempt fails", async () => {
    let attempts = 0;
    const result = await awaitRound({
      api: apiWith([]),
      requestRound: async () => {
        attempts += 1;
        throw new Error("GraphQL -> 403");
      },
      isRoundPending: notPending,
      sleep: noSleep,
      budgetMs: 300_000,
      pollMs: 30_000,
    });
    expect(result.polls).toBeGreaterThan(2);
    expect(attempts).toBe(1);
  });

  it("does not ask when the round has already landed", async () => {
    const s = spy();
    const result = await awaitRound({
      api: apiWith([review("Copilot", HEAD)]),
      requestRound: s.requestRound,
      isRoundPending: notPending,
      sleep: noSleep,
    });
    expect(result.state).toBe("landed");
    expect(s.asked).toBe(0);
  });

  // A draft is owed nothing, so asking would request a review the ruleset deliberately declines to.
  it("does not ask on a draft", async () => {
    const s = spy();
    const result = await awaitRound({
      api: async (suffix: string) =>
        suffix === "/reviews" ? [] : { head: { sha: HEAD }, draft: true },
      requestRound: s.requestRound,
      isRoundPending: notPending,
      sleep: noSleep,
    });
    expect(result.state).toBe("not-owed");
    expect(s.asked).toBe(0);
  });

  // Without `requestRound` the loop must behave exactly as it did before, which is what every
  // assertion in the `awaitRound` block below still exercises.
  it("still works with no requestRound supplied at all", async () => {
    const result = await awaitRound({ api: apiWith([]), sleep: noSleep, budgetMs: 0 });
    expect(result.state).toBe("expired");
  });

  // Supplied a request but no pending check, it must ask rather than skip: a missing check is not
  // evidence that a round is already on order.
  it("asks when no pending check is supplied at all", async () => {
    const s = spy();
    await awaitRound({
      api: apiWith([]),
      requestRound: s.requestRound,
      sleep: noSleep,
      budgetMs: 0,
    });
    expect(s.asked).toBe(1);
  });
});

/**
 * The permission is the enabling condition for all of the above. Reverted to `read`, the request
 * fails, the check waits out its budget and goes red — the exact symptom #44 describes, with the
 * fix still apparently in place. That is worth an assertion rather than a comment.
 */
/**
 * The half that actually runs in CI, and which had no test at all until this change.
 *
 * It used to live inside the `isMain` block, so every real network path — status handling, the
 * GraphQL error envelope, the node-id lookup — was beyond the suite's reach. `tests/release/cli.test.ts`
 * makes the same argument for the sibling scripts: an entry point is only meaningful if invoking it
 * runs something.
 */
describe("makeGithubIo", () => {
  /**
   * A `fetch` that answers from a queue and records what it was asked. `link` becomes the answer's
   * `Link` header, which is how a list says there is another page; a real `Response` always has
   * `headers`, so every answer here does too.
   */
  const fetchStub = (
    answers: Array<{ ok?: boolean; status?: number; body?: unknown; link?: string }>
  ) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const a = answers.shift() ?? { ok: true, body: {} };
      return {
        ok: a.ok ?? true,
        status: a.status ?? 200,
        headers: new Headers(a.link === undefined ? {} : { link: a.link }),
        json: async () => a.body ?? {},
      } as unknown as Response;
    };
    return { fetch, calls };
  };

  const io = (answers: Parameters<typeof fetchStub>[0]) => {
    const { fetch, calls } = fetchStub(answers);
    return {
      calls,
      ...makeGithubIo({
        fetch: fetch as unknown as typeof globalThis.fetch,
        token: "t",
        repo: "o/r",
        pr: "7",
      }),
    };
  };

  describe("api", () => {
    it("names the status when a read fails", async () => {
      await expect(io([{ ok: false, status: 404 }]).api("/reviews")).rejects.toThrow(
        "GET pulls/7/reviews -> 404"
      );
    });

    it("sends the token and reads the pull request path", async () => {
      const g = io([{ body: { head: { sha: "abc" } } }]);
      await expect(g.api("")).resolves.toEqual({ head: { sha: "abc" } });
      // `per_page` goes on every read, this one included. Measured, the single pull request
      // endpoint ignores it: the object came back identical, and with no `Link` header.
      expect(g.calls[0].url).toBe("https://api.github.com/repos/o/r/pulls/7?per_page=100");
      expect(g.calls).toHaveLength(1);
      expect((g.calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer t");
    });

    /**
     * A page link as GitHub writes it: under `/repositories/{id}/`, not the `/repos/{owner}/{name}/`
     * path the first request used. The id is this repository's, from the measured headers below.
     */
    const page = (n: number, rel: string) =>
      `<https://api.github.com/repositories/1191561833/pulls/7/reviews?per_page=100&page=${n}>; rel="${rel}"`;

    /*
     * Measured on 2026-09-14 on `GET /pulls/{n}/reviews`: 30 a page with no `per_page`, and
     * `per_page=101` served 100 — so 100 is the most a page holds, and asking for more buys nothing.
     */
    it("asks a list for the largest page GitHub serves", async () => {
      const g = io([{ body: [] }]);
      await g.api("/reviews");
      expect(REST_PAGE).toBe(100);
      expect(g.calls[0].url).toBe("https://api.github.com/repos/o/r/pulls/7/reviews?per_page=100");
    });

    /*
     * The defect. Reviews are listed oldest first by `submitted_at` — measured across all 511 on
     * nodejs/node#22712, and on #24's 18 here — so the ones this check waits for are the newest, at
     * the end of the list, and a read that stopped at the first page never saw them.
     */
    it("reads every page of a list, in order", async () => {
      const g = io([
        { body: [{ id: 1 }, { id: 2 }], link: `${page(2, "next")}, ${page(3, "last")}` },
        {
          body: [{ id: 3 }],
          link: `${page(1, "prev")}, ${page(3, "next")}, ${page(3, "last")}, ${page(1, "first")}`,
        },
        { body: [{ id: 4 }], link: `${page(2, "prev")}, ${page(1, "first")}` },
      ]);
      await expect(g.api("/reviews")).resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
      expect(g.calls).toHaveLength(3);
    });

    it("follows the link as given, with the token on every page", async () => {
      const g = io([{ body: [{ id: 1 }], link: page(2, "next") }, { body: [{ id: 2 }] }]);
      await g.api("/reviews");
      expect(g.calls[1].url).toBe(
        "https://api.github.com/repositories/1191561833/pulls/7/reviews?per_page=100&page=2"
      );
      for (const call of g.calls) {
        expect((call.init?.headers as Record<string, string>).authorization).toBe("Bearer t");
      }
    });

    it("names the page when a later one fails", async () => {
      const g = io([{ body: [{ id: 1 }], link: page(2, "next") }, { ok: false, status: 502 }]);
      await expect(g.api("/reviews")).rejects.toThrow("GET pulls/7/reviews (page 2) -> 502");
    });

    /*
     * The token rides on every request, so a next page off api.github.com is refused before it is
     * requested rather than after.
     */
    it("refuses to carry the token to a next page off api.github.com", async () => {
      const g = io([{ body: [{ id: 1 }], link: '<https://example.com/reviews?page=2>; rel="next"' }]);
      await expect(g.api("/reviews")).rejects.toThrow(
        "GET pulls/7/reviews (page 2) -> not followed: https://example.com/reviews?page=2 is off api.github.com"
      );
      expect(g.calls).toHaveLength(1);
    });
  });

  describe("graphql", () => {
    it("names the status when the transport fails", async () => {
      await expect(io([{ ok: false, status: 502 }]).graphql("query{x}", {})).rejects.toThrow(
        "GraphQL -> 502"
      );
    });

    /** GraphQL answers 200 with an `errors` array, so a non-ok status is not the only failure. */
    it("raises the errors array that arrives with a 200", async () => {
      const g = io([{ body: { errors: [{ message: "NOT_FOUND" }, { message: "and this" }] } }]);
      await expect(g.graphql("query{x}", {})).rejects.toThrow("NOT_FOUND; and this");
    });

    it("posts the query and variables as JSON", async () => {
      const g = io([{ body: { data: { ok: 1 } } }]);
      await expect(g.graphql("query{x}", { a: 1 })).resolves.toEqual({ ok: 1 });
      expect(JSON.parse(g.calls[0].init?.body as string)).toEqual({
        query: "query{x}",
        variables: { a: 1 },
      });
    });
  });

  describe("isRoundPending", () => {
    const withNodes = (nodes: unknown[]) => ({
      body: { data: { repository: { pullRequest: { reviewRequests: { nodes } } } } },
    });

    it("is true when the reviewer is on order", async () => {
      const g = io([withNodes([{ requestedReviewer: { login: COPILOT_BOT_LOGIN } }])]);
      await expect(g.isRoundPending()).resolves.toBe(true);
    });

    it("is false when nothing is on order", async () => {
      await expect(io([withNodes([])]).isRoundPending()).resolves.toBe(false);
    });

    // Slack, not a limit — but if the reviewer fell outside the page the check would read "nothing
    // pending" and ask for a round already on order.
    it("asks for a page wide enough that the reviewer cannot fall off it", async () => {
      const g = io([withNodes([])]);
      await g.isRoundPending();
      expect(REVIEWER_PAGE).toBeGreaterThanOrEqual(100);
      expect(JSON.parse(g.calls[0].init?.body as string).query).toContain(
        `reviewRequests(first:${REVIEWER_PAGE})`
      );
    });
  });

  describe("requestRound", () => {
    const BOT = { body: { node_id: "BOT_x" } };
    const PR_ID = { body: { data: { repository: { pullRequest: { id: "PR_x" } } } } };

    /** The mutation's answer, shaped as GitHub returns it. */
    const mutationSaying = (logins: string[]) => ({
      body: {
        data: {
          requestReviews: {
            pullRequest: {
              reviewRequests: { nodes: logins.map((login) => ({ requestedReviewer: { login } })) },
            },
          },
        },
      },
    });

    it("looks the bot up, then mutates with its node id", async () => {
      const g = io([BOT, PR_ID, mutationSaying([COPILOT_BOT_LOGIN])]);
      await g.requestRound();
      expect(g.calls[0].url).toContain("/users/copilot-pull-request-reviewer%5Bbot%5D");
      const mutation = JSON.parse(g.calls[2].init?.body as string);
      expect(mutation.query).toContain("requestReviews");
      // `union` is what stops the call evicting a human reviewer already on the pull request.
      expect(mutation.query).toContain("union:true");
      expect(mutation.variables).toEqual({ pullRequestId: "PR_x", botIds: ["BOT_x"] });
    });

    /*
     * #58 — the selection is the diagnosis. It used to ask for `pullRequest { id }`, the one field
     * that comes back whether or not the mutation did anything, and discarded the response. So a
     * mutation accepted-and-dropped looked exactly like one that worked.
     */
    it("asks the mutation to return the reviewers it just set", async () => {
      const g = io([BOT, PR_ID, mutationSaying([COPILOT_BOT_LOGIN])]);
      await g.requestRound();
      const mutation = JSON.parse(g.calls[2].init?.body as string);
      expect(mutation.query).toContain("reviewRequests");
      expect(mutation.query).not.toMatch(/pullRequest\{\s*id\s*\}/);
    });

    it("reports recorded when GitHub's answer lists Copilot", async () => {
      const g = io([BOT, PR_ID, mutationSaying([COPILOT_BOT_LOGIN])]);
      await expect(g.requestRound()).resolves.toEqual({ recorded: true });
    });

    /*
     * The measured Dependabot case: accepted, and Copilot is not in the resulting reviewer list.
     * A human reviewer in that list must not be mistaken for the round having been requested.
     */
    it("reports not-recorded when the answer comes back without Copilot", async () => {
      const g = io([BOT, PR_ID, mutationSaying([])]);
      await expect(g.requestRound()).resolves.toEqual({ recorded: false });
      const h = io([BOT, PR_ID, mutationSaying(["marius-cetanas"])]);
      await expect(h.requestRound()).resolves.toEqual({ recorded: false });
    });

    /*
     * `null`, not `false`: an absent field is "this response did not say", which is a different
     * claim from "GitHub says Copilot is not requested". Collapsing them would report a defect on
     * any future schema change.
     */
    it("reports unknown rather than not-recorded when the shape is unfamiliar", async () => {
      for (const answer of [{ body: { data: {} } }, { body: { data: { requestReviews: null } } }]) {
        const g = io([BOT, PR_ID, answer]);
        await expect(g.requestRound()).resolves.toEqual({ recorded: null });
      }
    });

    /**
     * The lookup used to parse without checking the status. On a 403 the body still parses,
     * `node_id` is simply absent, and the throw then blamed the account for not existing while the
     * truth was a rate limit — the misleading error this repository has a principle about.
     */
    it("names the status when the bot lookup fails, rather than blaming the account", async () => {
      const g = io([{ ok: false, status: 403 }]);
      await expect(g.requestRound()).rejects.toThrow(
        "GET users/copilot-pull-request-reviewer[bot] -> 403"
      );
    });

    it("says so distinctly when the lookup succeeds but carries no node id", async () => {
      const g = io([{ body: {} }]);
      await expect(g.requestRound()).rejects.toThrow(/no node id in the response/);
    });
  });
});

/**
 * `Link` headers exactly as GitHub sent them for `GET /pulls/24/reviews?per_page=5` on this
 * repository on 2026-09-14: the first page, a middle one, and the last, which names no `next`.
 */
const LINK_FIRST =
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=2>; rel="next", ' +
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=4>; rel="last"';
const LINK_MIDDLE =
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=1>; rel="prev", ' +
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=3>; rel="next", ' +
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=4>; rel="last", ' +
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=1>; rel="first"';
const LINK_LAST =
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=3>; rel="prev", ' +
  '<https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=1>; rel="first"';

describe("nextPageUrl", () => {
  it("reads the next page off the first page's header", () => {
    expect(nextPageUrl(LINK_FIRST)).toBe(
      "https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=2"
    );
  });

  /*
   * On a middle page `prev` comes first. A reader that took the first link would go from page 2
   * back to page 1, whose first link is page 2 again — round and round, never reaching the last.
   */
  it("finds next by name, wherever it sits", () => {
    expect(nextPageUrl(LINK_MIDDLE)).toBe(
      "https://api.github.com/repositories/1191561833/pulls/24/reviews?per_page=5&page=3"
    );
  });

  it("is null on the last page, which names no next", () => {
    expect(nextPageUrl(LINK_LAST)).toBe(null);
  });

  // A list that fits on one page sends no `Link` header at all — measured on #24's 18 reviews with
  // no `per_page` — and neither does the single pull request endpoint.
  it("is null when there is no header", () => {
    expect(nextPageUrl(null)).toBe(null);
    expect(nextPageUrl(undefined)).toBe(null);
    expect(nextPageUrl("")).toBe(null);
  });
});

/**
 * `awaitRound` over the `api` that `makeGithubIo` builds — the pairing the CLI arm wires, which the
 * suite cannot run — against a `fetch` that pages reviews the way GitHub was measured to.
 *
 * `api` used to read one page. Reviews come 30 a page by default, oldest first, so past 30 the
 * newest — Copilot's round on the head, and any human review of it — went unread, `classifyRound`
 * reported the head unreviewed, and the check would expire red with no push able to clear it. As of
 * 2026-09-14 no pull request here had got there — 18 reviews, on #24, was the most — but a reply to a
 * review thread is recorded as a review of its own: all 54 replies in this repository were, each
 * alone in its review, 5198788557 on #73 among them.
 */
describe("awaitRound over makeGithubIo when the round is past the first page", () => {
  /**
   * The pull request, and its reviews paged as measured on 2026-09-14: 30 a page with no `per_page`,
   * never more than 100, and each next page named by a `Link` header under `/repositories/{id}/`,
   * carrying `per_page` only when the request did.
   */
  const github = (reviews: object[]) => {
    const urls: string[] = [];
    const fetch = async (url: string) => {
      urls.push(url);
      const u = new URL(url);
      const headers = new Headers();
      if (!u.pathname.endsWith("/reviews")) {
        return { ok: true, status: 200, headers, json: async () => ({ head: { sha: HEAD } }) };
      }
      const perPage = Math.min(Number(u.searchParams.get("per_page") ?? 30), 100);
      const n = Number(u.searchParams.get("page") ?? 1);
      const last = Math.max(1, Math.ceil(reviews.length / perPage));
      const at = (p: number) =>
        `<https://api.github.com/repositories/1191561833/pulls/7/reviews?${
          u.searchParams.has("per_page") ? `per_page=${perPage}&` : ""
        }page=${p}>`;
      if (n < last) headers.set("link", `${at(n + 1)}; rel="next", ${at(last)}; rel="last"`);
      return {
        ok: true,
        status: 200,
        headers,
        json: async () => reviews.slice((n - 1) * perPage, n * perPage),
      };
    };
    return { urls, fetch: fetch as unknown as typeof globalThis.fetch };
  };

  const run = (gh: ReturnType<typeof github>) =>
    awaitRound({
      api: makeGithubIo({ fetch: gh.fetch, token: "t", repo: "o/r", pr: "7" }).api,
      sleep: async () => {},
      budgetMs: 0,
    });

  /** A thread reply as the reviews list shows one: `COMMENTED`, empty body — 5198788557 on #73. */
  const reply = {
    user: { login: "marius-cetanas", type: "User" },
    commit_id: OLDER,
    state: "COMMENTED",
    body: "",
  };

  /** 130 reviews before anything on the head: a round on an earlier commit, then the conversation. */
  const history = [round("Copilot", OLDER, REAL_BODY), ...Array.from({ length: 129 }, () => reply)];

  it("finds Copilot's round on the head", async () => {
    const gh = github([...history, round("Copilot", HEAD, REAL_BODY)]);
    const result = await run(gh);
    expect(result.state).toBe("landed");
    expect(result.reason).toMatch(/the commit being merged/);
    // 131 reviews at 100 a page is two reads. At the default 30 it would have been five.
    expect(gh.urls.filter((u) => new URL(u).pathname.endsWith("/reviews"))).toHaveLength(2);
  });

  it("finds a human review of the head, where Copilot declined the diff", async () => {
    const gh = github([
      ...history,
      round("Copilot", HEAD, DECLINED_BODY),
      {
        user: { login: "marius-cetanas", type: "User" },
        commit_id: HEAD,
        state: "COMMENTED",
        body: "Read the lockfile diff; the bump is the one the title names.",
      },
    ]);
    const result = await run(gh);
    expect(result.state).toBe("landed");
    expect(result.reason).toMatch(/1 human review\(s\) on it/);
  });
});

describe("the copilot review workflow grants what the request needs", () => {
  interface Workflow {
    permissions?: Record<string, string>;
    jobs: Record<string, { permissions?: Record<string, string> }>;
  }

  const workflow = parse(
    readFileSync(join(process.cwd(), ".github/workflows/copilot-review.yml"), "utf8")
  ) as Workflow;

  /**
   * The permissions the job's token actually gets.
   *
   * Asserting the workflow-level block alone was a hole, found by mutation: adding a job-level
   * `pull-requests: read` while the workflow level still said `write` left the suite green, because
   * GitHub has job-level **replace** workflow-level rather than merge with it. The token would have
   * been read-only, every request would have 403'd, and #44's symptom would have returned with this
   * very test still passing — which is the one thing its docstring promises cannot happen.
   */
  const effective = (job: string) =>
    workflow.jobs[job].permissions ?? workflow.permissions ?? {};

  it("grants pull-requests: write to the job that makes the request", () => {
    expect(effective("copilot-reviewed")["pull-requests"]).toBe("write");
  });

  it("keeps contents read-only, because the job checks nothing out", () => {
    expect(effective("copilot-reviewed").contents).toBe("read");
  });

  // The default the job widens from. Without it, a job added later inherits whatever GitHub's
  // repository-wide default happens to be rather than this file's answer.
  it("defaults the workflow itself to read-only", () => {
    expect(workflow.permissions?.contents).toBe("read");
    expect(workflow.permissions?.["pull-requests"]).toBeUndefined();
  });
});

describe("awaitRound", () => {
  const HEAD_B = "c".repeat(40);

  // The budget is a number the workflow comment also states, so it is asserted here rather than
  // left as two places that can disagree.
  it("waits ten minutes by default, polling every thirty seconds", () => {
    expect(DEFAULT_BUDGET_MS).toBe(10 * 60 * 1000);
    expect(DEFAULT_POLL_MS).toBe(30 * 1000);
  });

  /** Serves a scripted sequence of (pr, reviews) pairs, one per poll. */
  const apiFrom = (polls: Array<{ pr: object; reviews: object[] }>) => {
    let i = -1;
    return async (suffix: string) => {
      if (suffix === "") i += 1;
      const turn = polls[Math.min(i, polls.length - 1)];
      return suffix === "" ? turn.pr : turn.reviews;
    };
  };

  const noSleep = async () => {};

  it("returns as soon as the round is on the head, without sleeping", async () => {
    let slept = 0;
    const result = await awaitRound({
      api: apiFrom([{ pr: { head: { sha: HEAD } }, reviews: [review("Copilot", HEAD)] }]),
      sleep: async () => { slept += 1; },
    });
    expect(result).toMatchObject({ state: "landed", polls: 1 });
    expect(slept).toBe(0);
  });

  it("keeps polling until the round lands", async () => {
    const result = await awaitRound({
      api: apiFrom([
        { pr: { head: { sha: HEAD } }, reviews: [] },
        { pr: { head: { sha: HEAD } }, reviews: [] },
        { pr: { head: { sha: HEAD } }, reviews: [review("Copilot", HEAD)] },
      ]),
      sleep: noSleep,
    });
    expect(result).toMatchObject({ state: "landed", polls: 3 });
  });

  /**
   * The head is re-read every poll. A push mid-wait must not be answered against the head this run
   * started on — otherwise a round on the superseded commit would report success over a tree
   * nobody reviewed.
   */
  it("follows the head when the branch moves mid-wait", async () => {
    const result = await awaitRound({
      api: apiFrom([
        { pr: { head: { sha: HEAD } }, reviews: [] },
        // The branch moves. The only round so far describes the superseded commit.
        { pr: { head: { sha: HEAD_B } }, reviews: [review("Copilot", HEAD)] },
        {
          pr: { head: { sha: HEAD_B } },
          reviews: [review("Copilot", HEAD), review("Copilot", HEAD_B)],
        },
      ]),
      sleep: noSleep,
    });
    expect(result).toMatchObject({ state: "landed", polls: 3 });
    expect(result.reason).toContain(HEAD_B.slice(0, 8));
  });

  it("returns not-owed for a draft without waiting", async () => {
    const result = await awaitRound({
      api: apiFrom([{ pr: { head: { sha: HEAD }, draft: true }, reviews: [] }]),
      sleep: noSleep,
    });
    expect(result).toMatchObject({ state: "not-owed", polls: 1 });
  });

  // Expiry is the one red this check produces, and it means something went wrong rather than
  // something was slow.
  it("expires once the budget is spent, and says what it was still waiting for", async () => {
    const result = await awaitRound({
      api: apiFrom([{ pr: { head: { sha: HEAD } }, reviews: [] }]),
      sleep: noSleep,
      budgetMs: 60_000,
      pollMs: 30_000,
    });
    expect(result.state).toBe("expired");
    expect(result.reason).toContain("gave up after 60s");
  });

  it("logs each wait so a held job is legible while it runs", async () => {
    const lines: string[] = [];
    await awaitRound({
      api: apiFrom([
        { pr: { head: { sha: HEAD } }, reviews: [] },
        { pr: { head: { sha: HEAD } }, reviews: [review("Copilot", HEAD)] },
      ]),
      sleep: noSleep,
      log: (l: string) => lines.push(l),
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("waiting:");
  });
});
