import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  classifyRound,
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
      isRoundPending: notPending,
      sleep: noSleep,
      budgetMs: 0,
      log: s.log,
    });
    expect(s.asked).toBe(1);
    expect(s.lines.some((l) => l.startsWith("requested:"))).toBe(true);
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
  /** A `fetch` that answers from a queue and records what it was asked. */
  const fetchStub = (answers: Array<{ ok?: boolean; status?: number; body?: unknown }>) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetch = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const a = answers.shift() ?? { ok: true, body: {} };
      return {
        ok: a.ok ?? true,
        status: a.status ?? 200,
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
      expect(g.calls[0].url).toBe("https://api.github.com/repos/o/r/pulls/7");
      expect((g.calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer t");
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

    it("looks the bot up, then mutates with its node id", async () => {
      const g = io([BOT, PR_ID, { body: { data: { requestReviews: { pullRequest: { id: "PR_x" } } } } }]);
      await g.requestRound();
      expect(g.calls[0].url).toContain("/users/copilot-pull-request-reviewer%5Bbot%5D");
      const mutation = JSON.parse(g.calls[2].init?.body as string);
      expect(mutation.query).toContain("requestReviews");
      // `union` is what stops the call evicting a human reviewer already on the pull request.
      expect(mutation.query).toContain("union:true");
      expect(mutation.variables).toEqual({ pullRequestId: "PR_x", botIds: ["BOT_x"] });
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
