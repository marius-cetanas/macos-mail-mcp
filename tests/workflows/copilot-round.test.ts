import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  classifyRound,
  isCopilotLogin,
  hasPendingRequest,
  awaitRound,
  DEFAULT_BUDGET_MS,
  DEFAULT_POLL_MS,
  COPILOT_LOGINS,
  COPILOT_REVIEWER,
  COPILOT_BOT_LOGIN,
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
    expect(hasPendingRequest([{ requestedReviewer: {} }] as never)).toBe(false);
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
  const HEAD_SHA = "a".repeat(40);

  /** Serves the two endpoints the loop reads. Pending state is injected separately, as in the CLI. */
  const apiWith = (reviews: object[], head = HEAD_SHA) => async (suffix: string) =>
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

  // The pending check is a network call too, and it failing must not be worse than the request
  // failing — same answer, same log, still waiting.
  it("keeps waiting when the pending check itself fails", async () => {
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
    expect(s.asked).toBe(0);
    expect(s.lines.some((l) => l.includes("could not request") && l.includes("502"))).toBe(true);
  });

  it("does not ask when the round has already landed", async () => {
    const s = spy();
    const result = await awaitRound({
      api: apiWith([review("Copilot", HEAD_SHA)]),
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
        suffix === "/reviews" ? [] : { head: { sha: HEAD_SHA }, draft: true },
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
describe("the copilot review workflow grants what the request needs", () => {
  const workflow = parse(
    readFileSync(join(process.cwd(), ".github/workflows/copilot-review.yml"), "utf8")
  ) as { permissions: Record<string, string> };

  it("grants pull-requests: write", () => {
    expect(workflow.permissions["pull-requests"]).toBe("write");
  });

  it("keeps contents read-only, because the job checks nothing out", () => {
    expect(workflow.permissions.contents).toBe("read");
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
