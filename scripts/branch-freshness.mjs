#!/usr/bin/env node
/**
 * How far behind `main` a pull request is allowed to be.
 *
 * ## Why this is a check and not a branch-protection setting
 *
 * GitHub's `strict` is binary: a branch must be exactly up to date, or there is no requirement at
 * all. Neither answer is the one this repository wants.
 *
 * `strict: true` forces a rebase every time `main` moves, and the gate map already records what that
 * costs: "A rebase invalidates the verdict that preceded it… which creates a new head *after* the
 * last review." With a Copilot round gating the merge, every unrelated commit to `main` therefore
 * spends a full review cycle on a branch whose contents did not change. `strict: false` alone
 * removes the churn and the bound together, and a branch can then drift arbitrarily far from the
 * tree it claims to be tested against.
 *
 * So the bound is expressed where a bound with a number in it can live — a check — and `strict` is
 * left off. Some drift is fine. Too much is not.
 */

/**
 * The default ceiling. A branch this far behind still merges cleanly in practice, while the drift
 * stays small enough that CI's merge-commit result resembles the branch that was reviewed.
 */
export const DEFAULT_LIMIT = 5;

/**
 * @param {{behindBy: number, limit?: number}} input
 * @returns {{ok: boolean, message: string}}
 */
export function classifyFreshness({ behindBy, limit = DEFAULT_LIMIT }) {
  if (!Number.isInteger(behindBy) || behindBy < 0) {
    throw new Error(`behindBy must be a non-negative integer, got ${JSON.stringify(behindBy)}`);
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error(`limit must be a non-negative integer, got ${JSON.stringify(limit)}`);
  }

  if (behindBy === 0) {
    return { ok: true, message: "up to date with main" };
  }
  if (behindBy <= limit) {
    return {
      ok: true,
      message: `${behindBy} commit(s) behind main, within the ${limit} allowed`,
    };
  }
  return {
    ok: false,
    // Names the remedy, because a check that reports only a number leaves the reader to guess
    // whether they should rebase, merge main in, or wait.
    message:
      `${behindBy} commit(s) behind main, over the ${limit} allowed — ` +
      `rebase onto main and push, which re-runs the review round against the new head`,
  };
}

/* c8 ignore start -- CLI arm; the decision above is what the tests exercise */
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? fallback : Number(process.argv[i + 1]);
  };
  const { ok, message } = classifyFreshness({
    behindBy: arg("--behind", NaN),
    limit: arg("--limit", DEFAULT_LIMIT),
  });
  process.stdout.write(`${message}\n`);
  process.exit(ok ? 0 : 1);
}
/* c8 ignore stop */
