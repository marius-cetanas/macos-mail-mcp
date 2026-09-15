# Handoff — a check that read the name, not the value

**State, dated 2026-09-15.** Branch `test/gate-map-live-strict-value` holds both fixes and this
file, rebased onto `main` at `c83d751`, and is open as a pull request against `main`. Merging it is
Gated. Verify recipe on the head: build exit 0, `test:coverage` exit 0 with 33 files / 721 tests at
100% statements, branches, functions and lines on `src/`, `npm audit --audit-level=high` 0
vulnerabilities, and `npx portulan compile --check` GREEN.

## What was asked

Two defects the maintainer reported, each a sentence in this repository that the tree contradicted.

1. `.portulan/gate-map.md` says the suite fails "if the exported artifact ever stops saying `true`,
   or this map ever stops saying the live floor is `false`". Nothing read the second value:
   `tests/portulan/gate-policy.test.ts` checked only that the map contained two strings.
2. `scripts/branch-freshness.mjs` quoted the gate map with a sentence the gate map lost in #37.

## Measured before anything was changed

The maintainer measured Defect 1 at `c02b598`. It reproduced one commit later, on `f6e1e9d`: with
three edits applied — the divergence row's live cell to `true`, "**not** strict" to "strict" in the
platform-floor table, "`strict` is off, deliberately." to "`strict` is on." — the full suite passed,
32 files and 701 tests. A script applied the edits and required each to match exactly once, because
a green run from an edit that silently missed would have proved nothing.

The same script then ran each edit against the test file, before the fix and after it, on
`f6e1e9d`. Every row was run again after rebasing onto `7b38e4c`, with the same outcome:

| Edit to the gate map | Before | After |
|---|---|---|
| live cell → `true` | green | **red** — full suite on the rebased head: 1 failed, 720 passed |
| export cell → `false` | green | **red** |
| the table's two headers swapped | green | **red** |
| all three statements of the live value | green (full suite) | **red** |
| the row deleted | red | red |
| the row stated twice, once each way | — | **red** |
| the row's code spans and bold removed | — | green |
| the platform-floor table alone → strict | — | green |
| the `strict` paragraph alone → on | — | green |

The map was restored with `git checkout` after every run, and compared equal to `HEAD` at the end.

## Decisions + why

- **Columns are found by header, not position** — because swapping the two headers changes what the
  table claims while every cell stays where it was, so a read by position would pass that edit; this
  one fails it, measured. Cells are compared as they render, code spans and bold stripped, so
  restyling a cell stays green: the test file's own rule against pinning one spelling.
- **The row must appear exactly once** — because a map stating the setting in two rows can state it
  both ways, and a read of the first row alone would pass whenever the `false` one came first.
- **Only the table row is held.** The other two statements of the live value are prose, and holding
  them means matching a phrase such as "**not** strict", the spelling pin the file avoids. The gap
  is written into the test's comment rather than left to be found, and the two edits that still
  pass are in the table above.
- **The gate map was not edited.** Its sentence is now true as written: the map stops saying the
  live floor is `false` only when the row stops saying it, and that turns the suite red. Leaving the
  file alone also stayed clear of #83, which edited line 141 of it.
- **Defect 2 paraphrases rather than quotes** — because a quote is exactly what drifted, and a quote
  is a machine-checkable claim DoD 3 would want a check for, where a paraphrase stays true for as
  long as the rule does. The comment now says a rebase invalidates the verdict that preceded it,
  since a verdict on an earlier head cannot satisfy `copilot-reviewed` — the map's rebase paragraph,
  restated.
- **`.github/workflows/branch-freshness.yml` is unchanged.** Its lines 3–7 paraphrase, and they
  still read true against the gate map's paragraphs on `strict` and on rebases.
- **Rebased onto `main` rather than merging it in, twice**, then pushed with `--force-with-lease`
  pinned to `05963ce`, the head first pushed — because no pull request or review existed on that
  head, so rewriting it cost nothing, and `gates.json` makes a leased force-push Auto.
- **Triage lane.** One assertion and one comment, reversible, no `src/` change, and the plan was a
  sentence. `workspace.json` composes no checkpoints pack, so the independent verdict is the pull
  request's Copilot round and the maintainer's review.

## Worth knowing next time

- **`main` moved twice between cutting this branch and opening its pull request.** #83 merged at
  06:48:26Z, twenty seconds before the branch was first pushed, and #97 at 06:50:30Z. The first was
  caught by a check placed immediately before `gh pr create`: the branch's merge-base against
  `origin/main`. The second arrived without this session fetching, because worktrees share
  remote-tracking refs and the reflog records a fetch this session did not run. Each time the branch
  was rebased and verified again before anything was opened.
- **#83's changelog entry conflicted with this branch's first bullet**, resolved in the rebase as
  #83's entry followed by this branch's two. #98, still open, also appends to `[Unreleased]` and
  conflicts with this branch in `CHANGELOG.md` alone; the `changelog-sections` check it adds passes
  an entry under `[Unreleased]`, so nothing else collides.
- **DoD 7 held a sentence of this session's shape**, calling a rebase one "which `strict` forces
  whenever `main` moves" while `strict` is off. #97 removed it while this session ran.
- **A sweep for other misquotes found none.** Every mention of the gate map outside the handoffs —
  `git grep -i` for `gate map` and `gate-map` — was read against the map: `copilot-round.mjs`,
  `copilot-review.yml`, `.gitignore` and the branch-freshness test all still hold.
- In this worktree, once `npm ci` had run, `npx vitest --version` reported 5.0.0, matching the local
  binary. The mutation runs called `./node_modules/.bin/vitest` by path regardless.

## Open questions *(human-owned)*

- **Whether the two prose statements of the live value should be held too.** Editing either alone
  still passes and leaves the map contradicting itself; holding them means pinning a phrase.

## Next action

Review the pull request carrying this file, and merge it once its checks pass — a Gated action, the
maintainer's. Whichever of it and #98 merges second needs a rebase for `CHANGELOG.md`.

## Recoverability

Nothing partial. The gate map was edited only inside measured runs and restored after each; the tree
is clean. No tag, release or publish was touched, and nothing was merged.
