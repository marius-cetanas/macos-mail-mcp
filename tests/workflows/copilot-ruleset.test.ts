import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { awaitRound } from "../../scripts/copilot-round.mjs";
import { documents } from "../helpers/documents.js";

/**
 * What `copilot-reviewed` does without the `copilot auto-review on pull requests` ruleset, as
 * `.github/rulesets/README.md` states it, held to the code that decides it.
 *
 * The README used to say the check depended on the ruleset: delete it and no round is ever
 * requested, and the check fails with nothing explaining why. True when #37 wrote it on 2026-08-20;
 * false from 2026-08-26, when #49 had the check request the round itself and name a failed request
 * in its log. It went on saying so until the change that added this file. #49 changed the behaviour,
 * its tests and the gate map, the README was not among the files it opened, and nothing tied the two.
 *
 * So each thing the README says the check does is asserted here against `awaitRound`, driven the way
 * that case drives it. The log line it quotes is derived from the log, what it says of the ruleset is
 * held to the payload, and what it quotes from the gate map is held to the gate map. Change any of
 * them and this fails on the README, which is the tie #49 did not have.
 *
 * What no assertion here reaches is GitHub's half, and the README's sentences about it can change
 * without failing this: how soon the ruleset requests a round, and that it draws none for a pull
 * request Dependabot opens (#47); that the check's own request records on a person's pull request
 * (measured on #49, whose author holds a Copilot licence), records nothing on Dependabot's (#58), and
 * fails on a fork's read-only token (expected, never measured here). Injected I/O cannot see any of
 * those, as the `awaitRound` tests in `copilot-round.test.ts` already say of themselves.
 */
const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

/** Documents are hard-wrapped, and reflowing a paragraph moves every break, so prose is read flat. */
const flat = (text: string) => text.replace(/\s+/g, " ");

const README = ".github/rulesets/README.md";
const readme = flat(read(README));
const gateMap = read(".portulan/gate-map.md");
const payload = JSON.parse(read(".github/rulesets/copilot-auto-review.json"));

const HEAD = "a".repeat(40);
const noSleep = async () => {};
const nothingPending = async () => false;

/** A pull request at `HEAD` carrying the reviews given — the two reads the loop makes. */
const pullRequest =
  (reviews: object[] = []) =>
  async (suffix: string) =>
    suffix === "/reviews" ? reviews : { head: { sha: HEAD } };

/**
 * The claim that went false, in the shapes it was written and no wider. Read across every tracked
 * document rather than the README alone, because a list of files is where the one nobody named goes
 * unchecked (#73). No wider, because a broader shape reads true sentences as the claim: with `ever`
 * optional, "on a draft pull request no round is requested" failed this, and on a draft that is
 * exactly what happens. (Raised in an independent review of #83.) The third shape is the gate map's
 * word for the payload, which outlived the pairing it described. (Raised by Copilot on #83.)
 */
const STALE = [
  /no (?:Copilot )?round is ever requested/i,
  /`copilot-reviewed` check depends on (?:this[.,;]|the ruleset)/i,
  /so the dependency is reviewable/i,
];

describe("copilot-reviewed without the Copilot review ruleset", () => {
  it.each([
    "if this ruleset is deleted, no round is ever requested",
    "**The `copilot-reviewed` check depends on this.**",
    "The payload is kept at `.github/rulesets/copilot-auto-review.json` so the dependency is reviewable",
  ])("reads the stale claim in %j", (sentence) => {
    expect(STALE.some((pattern) => pattern.test(sentence))).toBe(true);
  });

  // A false red is what gets a check switched off, so true sentences that come close are pinned as
  // not matching: the README's replacement, the gate map's, what happens on a draft, and what the
  // check really does depend on.
  it.each([
    "**The `copilot-reviewed` check no longer depends on this.**",
    "The check no longer depends on that pairing",
    "On a draft pull request no round is requested, by the ruleset or by the check.",
    "The `copilot-reviewed` check depends on `pull-requests: write` to ask for the round.",
  ])("does not read %j as the stale claim", (sentence) => {
    expect(STALE.some((pattern) => pattern.test(sentence))).toBe(false);
  });

  it("finds the stale claim in no tracked document", () => {
    expect(documents()).toContain(README);
    for (const doc of documents()) {
      const text = flat(read(doc));
      for (const pattern of STALE) {
        expect(text, `${doc} still says ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("says the check asks for the round itself, at most once per run", async () => {
    let asked = 0;
    const result = await awaitRound({
      api: pullRequest(),
      requestRound: async () => {
        asked += 1;
      },
      isRoundPending: nothingPending,
      sleep: noSleep,
      budgetMs: 90_000,
      pollMs: 30_000,
    });
    expect(result.polls).toBeGreaterThan(1);
    expect(asked, `${README} says the check asks for the round, at most once per run`).toBe(1);
    expect(readme).toContain("The `copilot-reviewed` check no longer depends on this.");
    expect(readme).toContain("at most once per run");
  });

  /**
   * The job decides once. If a round is on order the first time it looks, it asks for nothing, and
   * does not look again when that round never comes — which "the first time" says and "whenever",
   * the README's first wording, did not. (Raised in an independent review of #83.)
   */
  it("says the job decides once, the first time it finds a round owed", async () => {
    let looks = 0;
    let asked = 0;
    const result = await awaitRound({
      api: pullRequest(),
      requestRound: async () => {
        asked += 1;
      },
      // On order at the first look only: the round requested before the job started never arrives.
      isRoundPending: async () => ++looks === 1,
      sleep: noSleep,
      budgetMs: 90_000,
      pollMs: 30_000,
    });
    expect(result.polls).toBeGreaterThan(1);
    expect(asked, `${README} says the job asks only when nothing is on order at its first look`).toBe(
      0
    );
    expect(result.state).toBe("expired");
    expect(readme).toContain(
      "the first time its job finds a round owed, it requests one unless one is already on order"
    );
  });

  /**
   * A fork's pull request, where the token is read-only and the request throws. The README quotes
   * the line that leaves in the log, so whoever reads an expired run knows what to look for — derived
   * from the line rather than retyped, so a reworded log fails here instead of surviving there.
   */
  it("quotes the line a failed request logs, and says what the check does after it", async () => {
    const failure = "GraphQL -> 403";
    const failing = async () => {
      throw new Error(failure);
    };

    const lines: string[] = [];
    const alone = await awaitRound({
      api: pullRequest(),
      requestRound: failing,
      isRoundPending: nothingPending,
      sleep: noSleep,
      budgetMs: 60_000,
      pollMs: 30_000,
      log: (line: string) => lines.push(line),
    });
    const named = lines.find((line) => line.includes(`(${failure})`));
    expect(named, "a failed request is named in the log").toBeDefined();
    expect(readme).toContain(`\`${named!.replace(`(${failure})`, "(…)")}\``);
    expect(alone.state, `${README} says the check expires red without a round`).toBe("expired");
    expect(readme).toContain("without one the check expires red");

    /*
     * A round requested by hand while the check waits, arriving at a given poll. Requesting it in time
     * is not what counts; landing in time is — a request at 570s whose round lands at 690s still
     * expires at 600s. (Raised in an independent review of #83.)
     */
    const round = { user: { login: "copilot-pull-request-reviewer[bot]" }, commit_id: HEAD };
    const landingAt = (poll: number) => {
      let reads = 0;
      return async (suffix: string) => {
        if (suffix !== "/reviews") return { head: { sha: HEAD } };
        reads += 1;
        return reads >= poll ? [round] : [];
      };
    };
    const wait = { requestRound: failing, isRoundPending: nothingPending, sleep: noSleep };
    const inTime = await awaitRound({ api: landingAt(2), ...wait, budgetMs: 60_000, pollMs: 30_000 });
    expect(inTime.state, `${README} says a round requested by hand counts when it lands in time`).toBe(
      "landed"
    );
    const late = await awaitRound({ api: landingAt(4), ...wait, budgetMs: 60_000, pollMs: 30_000 });
    expect(late.state, `${README} says the round has to land before the budget runs out`).toBe(
      "expired"
    );
    expect(readme).toContain(
      "a round requested by hand still counts if it lands before the budget runs out"
    );
  });

  /**
   * A Dependabot pull request, where the request resolves and GitHub's response does not list
   * Copilot (#58). The review carries a body, as a review somebody actually wrote does.
   */
  it("says a person's review of the head satisfies the check when the request does not record", async () => {
    const unrecorded = async () => ({ recorded: false });
    const person = {
      user: { login: "a-maintainer", type: "User" },
      commit_id: HEAD,
      body: "Read the diff.",
    };

    const reviewed = await awaitRound({
      api: pullRequest([person]),
      requestRound: unrecorded,
      isRoundPending: nothingPending,
      sleep: noSleep,
      budgetMs: 0,
    });
    expect(reviewed.state, `${README} says a person's review of the head satisfies the check`).toBe(
      "landed"
    );

    const unreviewed = await awaitRound({
      api: pullRequest(),
      requestRound: unrecorded,
      isRoundPending: nothingPending,
      sleep: noSleep,
      budgetMs: 0,
    });
    expect(unreviewed.state).toBe("expired");
    expect(readme).toContain("a person's review of the head then satisfies the check");
  });

  // The file is what was sent, not what is live — the README says as much — so this holds the README
  // to the payload and claims nothing about the repository's settings.
  it("describes the payload the ruleset was applied from, and the pull requests it does not reach", () => {
    expect(payload.rules).toHaveLength(1);
    const [rule] = payload.rules;
    expect(rule.type).toBe("copilot_code_review");
    expect(payload.conditions.ref_name.include).toEqual(["~DEFAULT_BRANCH"]);
    expect(rule.parameters.review_draft_pull_requests).toBe(false);
    expect(rule.parameters.review_on_push).toBe(true);

    /*
     * "Every non-draft pull request" is what the payload asks for, not what GitHub does: a pull request
     * Dependabot opens draws no round (#47). Nothing here can see that, so what this holds is
     * narrower — the sentence stating the ruleset's reach names the exception, which is the overclaim
     * that sentence carried before. (Raised by Copilot on #83.)
     */
    const reach = readme
      .split(/(?<=\.)\s+/)
      .find((sentence) =>
        sentence.includes(
          "every non-draft pull request against the default branch, and again on every push (`review_on_push`)"
        )
      );
    expect(reach, `${README} states the ruleset's reach`).toBeDefined();
    expect(reach, `${README} states the ruleset's reach without the Dependabot exception`).toContain(
      "except on a pull request Dependabot opens, which draws none (#47)"
    );
  });

  /**
   * The README quotes the gate map on why the ruleset stays rather than restating it, so the two
   * cannot come to give different reasons. Each quotation is held to the gate map, and the link to a
   * heading the gate map has.
   */
  it("quotes the gate map only with what the gate map says, and links a section it has", () => {
    const quotations = [...readme.matchAll(/\*"([^"]+?)[.,]?"\*/g)].map((match) => match[1]);
    expect(quotations.length).toBeGreaterThan(0);
    for (const quotation of quotations) {
      expect(flat(gateMap), `${README} quotes the gate map as saying "${quotation}"`).toContain(
        quotation
      );
    }
    expect(readme).toContain("(../../.portulan/gate-map.md#the-platform-floor)");
    expect(gateMap).toMatch(/^## The platform floor$/m);
  });
});
