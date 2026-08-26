# Handoff — three claims that did not reproduce, and the reviews that caught them

**State.** `macos-mail-mcp` at **1.3.3** on npm, published over OIDC with a provenance attestation
and verified against the tag rather than the publish log: `v1.3.3` and `main` are both `aad758b`,
and the handler in the tarball npm serves is byte-identical to the tagged source
(`29223671…`). Running that published handler escapes 40,960 characters in **0.37s**, against ~25s
at 1.3.2 — the fix this release exists for. `main` green: **576 tests across 28 files**, 100%
statements/branches/functions/lines on `src/`, 0 vulnerabilities. **No open issues and no open pull
requests.**

**Five merged** — #47 (CodeQL bump), #49 (the Copilot gate, closing #44), #48 (`escapeForJson`,
closing #42), #50 (changelog for 1.3.3), on top of #46 from the previous session.

## The pattern, because it happened three times in one session

Every one of these was written by me, in prose, as a measured fact. None reproduced. They are worth
recording together because the shape is identical and the shape is what generalises: **a number that
sounds measured is not the same as a number that was measured, and the difference is invisible to
the person who wrote it.**

- **"Element access falls off a cliff between 50,000 and 100,000 elements — 0.08s to 86s."** Written
  into the header of `escape-for-json.applescript`. There is no cliff: re-measured, 3.36s at 20,000,
  10.16s at 35,000, 20.46s at 50,000, 35.01s at 65,000 — smooth quadratic throughout. The `0.08s`
  came from a benchmark whose 50,000-character **input file did not exist**, so `cat` failed and the
  loop timed an empty list. This went into the header of the very file whose reported bug was a
  false performance claim.
- **"Before the fix, a body of quotes cost an order of magnitude more than the same length of plain
  prose."** The shipped predecessor was flat — 21.26s plain against 27.31s at 50% quotes, at 40,960.
  The order-of-magnitude density curve belonged to **a candidate for the rewrite that was never
  shipped**, which sliced runs out of the full list. I conflated my own rejected draft with the
  code that was actually in `main`, in four places.
- **"Ten Dependabot pull requests have drawn zero automatic rounds."** The reproducible figure is
  **18**, and it is the weaker half of the argument rather than the stronger: 17 of them predate the
  ruleset, so their zero rounds are explained by its absence. Only **#47** is probative. The claim
  understated the count while overstating the evidence.

The first two were caught by a fresh-context reviewer, the third also. All three had survived my own
re-reading. The tell they share is that each was *derived from a real measuring session* — which is
exactly why re-reading did not catch them.

## Two real hazards, both introduced by the fix and neither shipped broken

- **`esc is ""` is a text comparison, and comparison attributes are dynamically scoped.** Under
  `ignoring punctuation`, both `"\\\"" is ""` and `"\\\\" is ""` are **true**, and the handler
  returned `say "hi" b\s` — raw quote and backslash, out of the function whose entire job is
  escaping them. The handler this replaced compared integers throughout and was immune by
  construction. Now `(length of esc) = 0`. Nothing in this repository sets those attributes today,
  so it is a guard rather than a fix — but the file is prepended into every script forever.
- **The flush boundary was pinned by nothing.** The rewrite converts runs every 500 code points, a
  failure surface with no analogue in the old shape, and every pre-existing correctness test used
  inputs far below 500. Thirteen deterministic boundary cases now cover it: cluster straddling a
  flush, escape at 499/500/501, astral across the buffer, 600 consecutive escapes crossing the
  second flush, inputs ending exactly on one.

Also recorded where the guard is: **`string id {}` does not raise, it segfaults `osascript`**
(exit 139) and `try` cannot catch it. The non-zero counts before each `string id runBuf` are
load-bearing against a crashed bridge process rather than an error.

## #44 was two holes, and only one of them was in the issue

`copilot-reviewed` waited for a round that something else was supposed to request. #44 identified
the ruleset's `~DEFAULT_BRANCH` condition — a pull request against another branch never draws one.
Measured this session, there is a second hole with a different cause: **a bot author**. #47 sat on
`main`, condition satisfied and not a draft, and drew nothing in 16 hours, while #43, #45, #46 and
#48 were each auto-requested **one second** after opening. Widening `ref_name`, which the issue
proposed first, would have fixed only the first hole.

So the check now requests the round itself. Two things that cost time to learn:

- **`POST /pulls/{n}/requested_reviewers` returns 201 Created and adds nobody.** Copilot is a
  **Bot**; that endpoint takes Users and Teams. #44 saw the same behaviour and concluded the API did
  not work — the narrower cause is what made it fixable. `requestReviews(input: {botIds: […],
  union: true})` works, and `union` is what stops it evicting a human reviewer.
- **REST `requested_reviewers` never lists a Bot at all.** It reported `users: []` on a pull request
  where Copilot was demonstrably requested and visible in GraphQL. Any pending-check built on REST
  would answer "nothing pending" every single time.

**The Actions token can do it, and that was demonstrated rather than assumed** — a Copilot request
could plausibly have needed a seat held by a person. Measured on run 32959250916, head `9fe2c9a1`:
the pending request was cleared before the job's first poll, the job logged `requested: no round was
on order`, and the timeline recorded `review_requested by github-actions[bot]`.

## Process notes worth keeping

- **Copilot and a fresh-context reviewer caught disjoint classes again**, as they did on #41.
  Copilot found what reads wrong in a diff — an inherited timeout, `err.message` on a non-Error, a
  literal `é` in a file that forbids literals, a matcher missing AppleScript's no-parens handler
  forms. The fresh-context reviewer found what reads *plausible* and is false, which is the class no
  diff review can catch because the diff looks fine.
- **A commit that was never pushed nearly merged.** `6eff0ca` — the fix for a real type-guard bug —
  sat local while #49 showed CLEAN on a head that did not contain it, and I had already told Copilot
  it was applied. What caught it was DoD's own rule: checking the required checks are green **on the
  current head** surfaced the gap between what was committed and what the pull request held.
- **Merging the first of two open pull requests conflicted the second**, both having added
  `## [Unreleased]`. Resolved with a merge rather than a rebase — a rebase re-conflicts on the same
  file once per commit, and the merge commit disappears in the squash anyway.
- **A wrong review finding can still be a right fix.** Copilot's `err.message` example (a thrown
  string) does not throw; `throw null` does. Its no-parens handler example is not valid AppleScript
  at all, but the labelled-parameter forms the error message names *are* valid and *do* collide.
  Both times the conclusion held and the stated reason did not, and both times chasing the real
  mechanism found something extra — a silent `(undefined)` log, and `throw ""` rendering as `()`.

## For the next session

- **The `[Unreleased]` convention is an open question and I decided it unilaterally.** Copilot asked
  for a standing empty `[Unreleased]` heading per Keep a Changelog; I declined on the measurement
  that no tagged release here has ever carried one (v1.2.0, v1.3.0, v1.3.1, v1.3.2 — all zero), and
  because an empty section asserts pending changes that do not exist. If the maintainer wants the
  Keep a Changelog form, it is a deliberate convention change deserving its own pull request.
- **`.claude/settings.json` is still machine-local** and the pinning decision from 2026-08-22 is
  still open. Unchanged this session.
- **The gate map now says the check and the ruleset are no longer a pair.** It claimed the ruleset
  was what requests the round; that is now only half true, and the paragraph records both holes and
  the REST trap.
- **`npm run test:coverage` before touching an `.applescript` file still cannot be delegated to
  CI.** This session took the executed-AppleScript assertions from 30 to 51 — the correctness file
  30 → 48, plus 3 in a new performance file — and **none of those 51 run in the merge gate**. The
  one new check in this area that *does* run there is
  `tests/bridge/prepended-handler-names.test.ts`, because it reads text rather than needing
  `osascript`.
- **Reserved handler names are four, not two** — `escapeForJson`, `joinStrings`, `resolveMailbox`,
  `mailboxFullName`. `resolve-mailbox.applescript` is prepended alongside the escaper, which the
  prose had not said.
