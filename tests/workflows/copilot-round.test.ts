import { describe, it, expect } from "vitest";
import {
  classifyRound,
  isCopilotLogin,
  awaitRound,
  DEFAULT_BUDGET_MS,
  DEFAULT_POLL_MS,
  COPILOT_LOGINS,
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
