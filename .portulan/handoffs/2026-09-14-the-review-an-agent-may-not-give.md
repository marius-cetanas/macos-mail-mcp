# Handoff — the review an agent may not give

**State, dated 2026-09-14 at 15:35 UTC — a snapshot, not a live claim.** `main` at `878af79`, and
**2.0.0 is published** from it. Release run 34862520007 published at 15:31 UTC after a green dry-run
on the same commit: npm `latest` is 2.0.0, with `engines.node` `>=22.12.0` and an SLSA provenance
attestation; the annotated tag `v2.0.0` points at `878af79`; the GitHub release is marked latest.
Three separate runs verified that commit, and they checked different things. `main`'s CI run
34862265569 passed `test` on Node 22 and 24, `audit`, `gate-policy` and the `verify` aggregate. The
release run built it and ran `test:coverage` and `npm audit --audit-level=high` on Node 24 only, with
the version applied. Locally, on Node 26: `test:coverage` 32 files and 654 tests at 100%, 0
vulnerabilities, `portulan compile --check` green. No pull request was open.

Merged on this date, in order: #67 (`fast-uri`), #68 (`qs`), #72 (`hono`), #73 (Vitest 5 and the
Node 22.12 floor), #69 (`@types/node`), #75 (`zod`), #76 (`codeql-action`), #78 (the 2.0.0 changelog
record), #77 (tool counts). #71 was closed as superseded by #73, and Dependabot closed #70 as
superseded by #75. #74 merged in the same window and is not this session's work, and #77 came from a
separate session this one suggested. The maintainer merged most of the Dependabot pull requests by
hand while the session was still sequencing them; the session merged #69, #76 and #78 and ran the
release.

## What the session was asked, and what it found first

Asked to handle the six open Dependabot pull requests. The boot surfaced the thing that mattered
before any of them: **`main` was red on its own default recipe without a commit.**

`npm audit --audit-level=high` is part of the recipe, and four high-severity `fast-uri` advisories
(GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf, GHSA-jqff-g426-hqxp) reached the audit
database between #67's CI run (2026-09-03 02:47 UTC, `audit` green) and #70's (2026-09-08 17:24 UTC,
`audit` red). `main`'s last CI run was 2026-09-02, green, and nothing re-runs it without a push. So
every pull request opened in that window inherited a red `audit` and `verify` from its base rather than
from its change: no re-run could clear it, nor any push short of one carrying the `fast-uri` fix
itself, while `main` itself showed green. Dependabot alerts #21–#29 were the only standing signal.

## The pull requests

- **#67** `fast-uri` 3.1.7 — the keystone: the only one that clears the high advisories.
- **#68** `qs` 6.16.0 (with `side-channel`, `side-channel-list`, `hasown`, `es-object-atoms`) and
  **#72** `hono` 4.13.7 — moderate advisories.
- **#69** `@types/node`, **#70** `zod` — routine, until their rebases (below).
- **#71** `vitest` 5.0.0 — could never install: `@vitest/coverage-v8@4.1.11` peers on exactly
  `vitest@4.1.11`, so every job running `npm ci` died on ERESOLVE. The codeql-action shape again:
  `dev-dependencies` grouped minor and patch only, so a major arrived as half the pair.
- **#76** `codeql-action` 4.38.0 — opened mid-session; the grouping `dependabot.yml` already had for
  it moved `init` and `analyze` together, as intended.

**How the bumps were verified, reusable as is.** For every lockfile entry a Dependabot pull request
changed, `resolved` is the registry tarball and `integrity` equals `npm view <pkg>@<ver>
dist.integrity`; every one held, on every head, including each head a rebase produced. Before any
merge, the bumps were cherry-picked onto `main` in merge order in a scratch worktree and the whole
recipe run there — the picks applying cleanly is itself the evidence the lockfile hunks do not
conflict. For an action pin, resolve the tag through the API (`git/ref/tags/<tag>`, dereferencing an
annotated tag) and compare the commit: #76's `b96794f0` is v4.38.0's.

**Count advisories against the version held, not against a release note.** #78's Security entry
first said four `fast-uri` advisories — `npm audit`'s count — and Copilot's review said six, from
fast-uri's release notes. Measured against the lockfile's 3.1.5, it was five: GHSA-qw65-cvwx-89v3
affects `>= 3.0.0, < 3.1.7` but is a repository advisory that GitHub's global database did not carry,
so `npm audit` could not see it; GHSA-58mr-gqgx-xq4g affects exactly 3.1.6, which the bump skipped.

**What the lockfile bumps changed for consumers: nothing.** The tarball ships no lockfile, so what a
consumer installs comes from the package's dependency ranges, and those already admitted the fixed
releases: `ajv@8.18.0` takes `fast-uri ^3.0.1`, `express@5.2.1` and `body-parser@2.3.0` take
`qs ^6.14.0` / `^6.15.2`, the SDK takes `hono ^4.11.4`. That is not the same as consumers never being
exposed. Every `fast-uri` 3.x below 3.1.7 is affected by GHSA-qw65-cvwx-89v3, and 3.1.7 was published
on 2026-09-02, so an install that resolved `fast-uri` before then holds an affected version — and an
existing install or a consumer's own lockfile keeps what it resolved until it is refreshed. What the
bumps fixed is this repository's own CI and development tree, which is why they needed no release.

## The first live reading of `recorded`

The previous handoff said the first Dependabot batch after #64 would be the first live reading. It is
in. All six pull requests' `copilot-reviewed` had expired red; the two logs read, #67's and #72's, say
`no Copilot round can be requested for <sha> (#58) — waiting for a human review of it`, and once the
maintainer approved #67 a re-run logged `landed: … 1 human review(s) on it` within about fifteen
seconds. #75's log, later, carries the full sequence — `requested: … the request did not take (#58)`,
then `waiting`, then `landed`. #63 and #64 behave as designed on real bot pull requests: the standing
cost of a Dependabot pull request is one human review of its head and, if that review is slower than
the ten-minute budget, one re-run of the check.

## The review an agent may not give

The maintainer approved "all PRs and changes" in chat and asked for them to be merged. Posting that
approval as a review of #67 from their account was **refused by Claude Code's auto-mode classifier as
`[Self-Approval]`**, and so was a read-only `git grep` in the very next Bash call; the call after that
ran normally.

Two different mechanisms met here, and they should not be read as one. The classifier acted first, in
the agent's own tooling, before any review existed. `copilot-reviewed` only evaluates reviews already
recorded on the head, and what it requires is a qualifying human review there — not proof that anyone
read the diff, which the next paragraph shows it cannot give. What they share is the intent
`copilot-review.yml` states, that a person looks at a supply-chain change, and the classifier held to
it against the maintainer's own instruction relayed through the agent. A session asked to handle
Dependabot pull requests can verify, sequence, rebase and merge; the review of each head is the
maintainer's click.

**A thread reply reaches the same state by another route.** Measured on #73: review `5198788557` is
`COMMENTED`, empty-bodied, and holds only the reply `4006098256` — GitHub records a reply to a review
thread as a review. When the round is declined or unobtainable, `classifyRound` accepts a review on the
head from any account `isHumanReviewer` qualifies — not Copilot, not a `[bot]`, and of type `User`
where the payload reports one — and does not look at what the review contains. So on a Dependabot pull
request a bare reply from the maintainer's account would satisfy `copilot-reviewed`. Nothing here used
it: no reply was posted on a Dependabot pull request. Handed to a separate session rather than fixed
here.

## The order reviews are asked in

The Stop-gate refused three stops while this working copy carried `main`'s `fast-uri`, which was
right: the recipe was red and the only fix awaited a review this session could not give. The cap let
the session pause with the red printed, as the gate's header says it should.

The costlier lesson is sequencing. The maintainer approved the other four within 43 seconds of #67
merging (14:22:38 to 14:23:08), on heads whose `audit` had run against the base before it. A re-run
would not have helped — it reuses the event's merge commit, and so the old base. Close-and-reopen
would have re-run CI on the same heads and kept the approvals, but **Dependabot deleted #71's branch
nine seconds after it was closed** (closed 14:08:51, `head_ref_deleted` 14:09:00), and a pull request
without its branch cannot be reopened. So the only way forward was `@dependabot rebase`, which moved
every head.

**What the rebase did to those approvals was not uniform.** On #69 and #70, GitHub dismissed them. On
#68 and #72 it carried them to the new heads: #68's approval, submitted at 14:22:38 on `39866cf9`, now
reads `commit_id` `43d6d290`, a head Dependabot pushed after the rebase requests at 14:29, and #72's
moved the same way. Those two rebases left the pull request's diff as it was, while #69's and #70's
changed it, so GitHub appears to keep an approval across a push that leaves the diff unchanged —
inferred from these four cases, not from its documentation. `copilot-reviewed` accepted the carried
approvals, and #68 and #72 merged on them, **so those two merges did not meet DoD 7**: no verdict
post-dated the heads that merged. A separate fact limits what that cost without standing in for the
condition: each rebased commit changed exactly the lockfile entries the approved commit had, identical
in every field — measured afterwards, by comparing each commit against its own parent. That comparison
was mine, not a review. The gap it exposes is in the check, whose `commit_id === head` does not prove
what DoD 7 asks for.

And a Dependabot rebase is not only a new head. #69 came back as `@types/node` 26.5.1 rather than
26.4.1, and a minute after #73 changed `dependabot.yml`, Dependabot closed #70 and opened #75 at
`zod` 4.6.2. The review after a rebase can be of a different version, or a different pull request.
**When a keystone gates a batch: merge the keystone, let the rest rebase, and only then ask for their
reviews** — and re-verify what the rebase produced before asking.

## #73, and the miss Copilot found

Copilot's first two rounds found three real gaps: `CONTRIBUTING.md` still said Node 20+, because the
test named its documents and that one was not listed; the scan read only the `+` spelling; and nothing
asserted the Dependabot grouping. All fixed, each new test shown to fail on the defect it guards. One
suggestion was declined with reasons in its thread — scanning `CHANGELOG.md`'s `[Unreleased]` section,
since an entry for a floor change must be free to name the floor it replaces. The third round
recommended approval with no comments.

**The `CONTRIBUTING.md` miss was mine, and it has the shape of the 2026-09-02 handoff's mistake.** My
first search for Node 20 claims was scoped to a hand-picked list of files; the whole-tree `git grep`
that would have found `CONTRIBUTING.md` was the call the classifier refused, and I committed on the
partial result instead of running it again first. The habit was known, and a tool refusal skipped it.
The test now scans instead of listing, which is the mechanical version of that habit.

## The release

The dry-run ran on `878af79`, not on the `17cc876` that #78 had just produced: #77 merged fifteen
seconds after #78 and twenty-one seconds before the run was created, so `main` had already moved when
the run was dispatched, and I had not read it again. The watcher waiting for a run on `17cc876` would
never have fired; the one keyed on the run's id did. Nothing in the tarball changed, since #77 touched
no shipped path, but the publish was then gated on `main` still being the commit the dry-run verified.
Read `main` immediately before dispatching, key a watcher on the run id, and pin a publish to the
commit its dry-run saw.

## Decisions + why

- **One by one, #67 first** (maintainer's choice, matching #55–#57) over one combined pull request,
  which would have cost one review instead of five but moved authorship of the lockfile change from
  Dependabot to the session.
- **Node 20 dropped, Vitest 5 taken** — the maintainer's call, against my recommendation to defer.
  Both sides, for whoever revisits it: Vitest 5 declares `^22.12.0 || ^24.0.0 || >=26.0.0`, so keeping
  `engines` at `>=20` would claim support nothing here tests, and Node 20 has been end-of-life since
  2026-04-30; against that, a major version for a change with no `src/` diff. `engines` is `>=22.12.0`
  — the lowest version the suite can run on — rather than `>=22`.
- **`exclude-patterns` rather than group order** in `dependabot.yml`: the `vitest` group takes every
  update type for `vitest` and `@vitest/*`, and `dev-dependencies` excludes them. Relying on which
  group is listed first would rest on first-match semantics I did not verify against Dependabot's
  documentation; the exclusion makes the order irrelevant, and `tests/workflows/dependabot.test.ts`
  holds it.
- **A simulated merge for each merge CI had not seen**, because `main` moved under #73 and #75 while
  their checks were green against an older base and `strict` is off by design: each was squashed onto
  the current `main` in a scratch worktree and the recipe run on the result. Both came back green, and
  neither gated anything — the maintainer merged #73 before its simulation started and #75 while its
  run was in progress, so both confirmed the merged state after the fact.
- **2.0.0 rather than a minor.** Asked afterwards for a minor release with no breaking changes, the
  session measured what 2.0.0 would change for someone installing it: `src/` untouched since 1.3.4,
  the same 53-entry tarball, the built server answering `initialize` and listing its 20 tools — and
  `engines.node`, the one consumer-facing change and a breaking one. A minor needed Node 20 restored
  and Vitest 5 reverted; the maintainer chose the major instead.

## Handed to separate sessions

Both started by the maintainer from this session's suggestions:

- `CONTRIBUTING.md`'s per-domain tool counts, which summed to 18 against the 20 the README states —
  merged as #77, which also moved `node-support.test.ts`'s document set into
  `tests/helpers/documents.ts` and filed its entry under 2.0.0.
- Thread replies satisfying `copilot-reviewed`, above — #82, open and not yet merged when this was
  last revised.

## Open questions *(human-owned)*

- **Whether an approval GitHub carries across a content-identical rebase should satisfy
  `copilot-reviewed`.** It did twice today, on #68 and #72. The semantics are defensible — measured,
  the change the maintainer approved is the change that merged — but the check does not say that is
  what it accepts, and DoD 7 says a verdict must post-date its head. One of the two should change so
  that they agree.
- **Whether `main` should re-run its audit on a schedule**, so a newly published advisory turns `main`
  red where someone looks, rather than inside the next unrelated pull request.

## Next action

Answer the approval question above, and review #82, the thread-reply session's change. Apart from
merging the pull request that carries this file, nothing this session started is outstanding: 2.0.0 is
published, and every other pull request it opened is merged or closed.

## Recoverability

Nothing partial. Every pull request this session opened is merged or closed, apart from the one
carrying this file. The scratch worktrees are removed, and the `refs/remotes/pr/*` refs fetched for
review are deleted. The one irreversible action, publishing 2.0.0, was taken by the Release workflow on
the maintainer's instruction after a green dry-run on the same commit, and the tag it pushed is the
workflow's own.
