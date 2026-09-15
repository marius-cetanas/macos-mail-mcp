# Handoff — the questions #81 left open

Continues [the 2026-09-14 handoff](2026-09-14-the-newest-review-is-on-the-last-page.md), whose two open
questions the maintainer asked this session to close out, working with a Fable 5.1 agent. The session
ran past midnight: the measurements that decided both questions were taken on the evening of
2026-09-14, and the work after them on 2026-09-15.

**State, dated 2026-09-15, when the pull request was opened.** Branch
`claude/close-81-open-questions`, rebased onto `main` at `f6e1e9d` (#82) before its first push, and
opened as a pull request titled `ci: answer the two questions #81 left open`. Four commits — item 1's
test, item 2's tests, item 2's script and job, and the documentation — and this file after them. The
verify recipe at `ed8081b`, the head before this file was added: exit 0, **742 passed across 33
files**, 100% statements (263/263), branches (100/100), functions (64/64) and lines (262/262) on
`src/`, 0 vulnerabilities; `npx portulan compile --check` GREEN. Local runs were on macOS under Node
26.8.1; CI runs the new fetch test on Node 22 and 24.

## Item 1 — the off-host refusal stays, for a measured reason

`makeGithubIo`'s `api` refuses a `Link: rel="next"` off api.github.com before requesting it. The
2026-09-14 handoff called that defensive, not measured, and asked whether it was wanted. It stays,
and its reason is now measured: fetch drops a caller-set `authorization` header only when a redirect
crosses origins, and a next link is a fresh request, so without the refusal the token would go wherever
the link pointed. Measured on 2026-09-14 on Node 26.8.1 with two localhost origins, by Fable and again
independently; Fable also read the same redirect-only removal in the undici that Node 22 bundles.
`ae3bc85` adds a test that measures it on whichever Node runs the suite, and states the reason beside
the refusal.

Rejected: stopping at the last page read, which hands `classifyRound` a partial list — the defect #81
fixed — and following the link without the token, which merges a list from an unknown host into the
reviews.

## Item 2 — a tagged changelog section stays as its release shipped it

The hazard, measured on 2026-09-14: recording a release inserts its heading below `[Unreleased]`, so a
clean rebase or merge can file an in-flight entry under the released version, and no test notices.
`scripts/changelog-sections.mjs`, run by a new `changelog` job that `verify` depends on, compares the
base's `CHANGELOG.md` with the checkout's and fails a change to the section of a version whose tag
exists. New sections and untagged ones stay open, and a `changelog` scope in the subject overrides.

Why that rule, measured on 2026-09-14:

- Eight of nine tagged sections on `main` were byte-identical to their tags. 1.3.1 was absent at its
  tag and added whole later, in #43; a new section is free, so the rule allows it.
- `v2.0.0` points at `878af79` (#77), which added its entry under `[2.0.0]` fifteen seconds after #78
  recorded the heading, and before the tag. Keying on the tag rather than the heading keeps that green.
- Replayed over the 21 first-parent commits that had touched `CHANGELOG.md`, asking whether each
  changed version's tag was an ancestor of the commit's parent: 0 edits to a released section.
- CI checks out one commit and no tags, so the script asks the API for the raw file at the base, the
  merge commit's parents, and `git/ref/tags/v{version}`, which answers 200 or 404.

The base: on `pull_request`, the merge commit's first parent, which is exactly what merging would
change; on `push` to `main`, `github.event.before`. The push run exists because `strict` is off, so a
pull request checked before a release is tagged can merge after it. It can still miss one:
`verify.yml`'s `concurrency` cancels a run when another push to `main` arrives, and #78 and #77 merged
fifteen seconds apart.

**One measurement was not re-taken here.** The merge commit's parent order, `[base, head]`, was
measured by Fable on 2026-09-15 on #82 and #83 while both were open. By the time it was checked again,
#82 had merged, so its `merge_commit_sha` had become the one-parent squash, and #83 was no longer
mergeable, so GitHub computed no merge commit for it. This pull request's own `changelog` run is the
check in place: `resolveBase` refuses a commit with other than two parents, and says how many it saw.

## Working with Fable

Fable was given the two questions and the facts, not a preferred answer, and came back with
recommendations and evidence. The load-bearing measurements were then re-taken independently before
anything was built, except the one above. Fable wrote the script, its 40 tests and the job, red
first. Three mutations of the script were each caught: ignoring tags (4 red), reading every subject as
changelog-scoped (5 red), and keeping trailing blank lines (3 red). Review here changed three things:

- **A false sentence, twice.** The script and a test said every release had been recorded under a
  `changelog` scope. History says otherwise: `docs:`, `feat:` and `chore(release):` before 1.3.2, and
  `docs(changelog): record X.Y.Z` since. The rule never depended on it — a recording adds a section,
  which is free — but both sentences did.
- **A test that claimed more than it checked.** "drops trailing blank lines" passed with the trim
  mutated away, because both of its insertions kept the one blank line before the next heading. It now
  has the input that needs the trim, and that mutation is one of the three red above.
- **A promise the job could not keep.** Its comment said a misfiling on `main` turns `main` red.
  Cancellation can prevent that, and the comment now says so.

## Found in passing *(not fixed here)*

- `.portulan/dod.md` condition 7 says `strict` forces a rebase whenever `main` moves; the gate map
  records it as deliberately off. Flagged as a separate task.
- The stop gate warned that a second handoff dated 2026-09-15 could red `docs.sh`'s record check. This
  repository has no `docs.sh`, nothing in its tests reads handoff dates, and `main` already carries
  three handoffs dated 2026-09-14. The warning describes a check this repository does not have, as the
  gate map already notes of `verify/compile.sh`.
- The other session's branch named in the 2026-09-14 handoff became #82, which merged before this
  branch was pushed; this branch was rebased onto it without conflict.

## Open questions *(human-owned)*

- Whether the push run's cancellation gap is worth closing. Limiting `cancel-in-progress` to pull
  requests would let every run on `main` finish, at the cost of runner minutes on superseded pushes.

**Next action.** Nothing outstanding from this change beyond the open question above.

**Recoverability.** Nothing partial: every change is in the pull request titled above, and no tag,
release or publish was touched.
