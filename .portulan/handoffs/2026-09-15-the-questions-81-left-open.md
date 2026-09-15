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
exists — since refined to a tag the change's base contains; see below. New sections and untagged
ones stay open, and a `changelog` scope in the subject overrides.

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

## Copilot's round on #98 *(amended later on 2026-09-15)*

Copilot's review of the pull request's first head recommended changes, with five findings. Auto-fix
also reported a conflict with `main`, which had gained #83 and #97; `main` was merged in as `1bc902b`,
keeping #83's changelog entry beside this branch's two. Four findings were fixed in `175892f`, each
with a test that failed first (`0c6ff13`, 5 red of 195):

- **Redirects were followed, in both scripts.** The origin check on `next` read only the link, and
  fetch follows a 3xx on its own, so an api.github.com URL redirected to another origin would have
  come back `ok`, token dropped, and been read as a page — or, in the changelog check, as the file, the
  parents or the tag. Every request both scripts make now sets `redirect: "manual"`. Measured on Node
  26.8.1 before relying on it, and in the suite on the Node that runs it: the 3xx comes back, it is not
  `ok`, and nothing reaches the other origin. The changelog check's comment that no request "can leave
  api.github.com" had been false for the same reason, and is corrected.
- **Trailing spaces were trimmed.** `sectionsOf` removed all trailing whitespace, so a Markdown hard
  break added to a shipped section compared equal. It now drops blank lines only.
- **A title change ran nothing.** The override reads the pull request's title, and the bare
  `pull_request` trigger does not fire on a title edit, so a green status could outlive the title that
  earned it. `verify.yml` now also runs on `edited` and re-runs every job. Skipping jobs on an edit
  was considered and rejected, because a skipped job reports success to a required check and could
  stand in for a real failure.

**Declined, and accepted for now by the maintainer:** that the job runs the checker from the pull
request's own tree, so a pull request could change the checker to pass. True, and true of every check
here — `verify`'s tests, `copilot-reviewed` and `branch-freshness` all run from the checkout — while
the boundary `pr-intake.yml` draws is `pull_request_target`, which carries the base repository's
token; this workflow uses `pull_request`. Hardening one job alone would not change that, so it is
recorded as a question for the whole repository rather than patched here. Its thread was left
unresolved so the decision would not be taken by default, and was resolved once the maintainer
accepted it for now.

The verify recipe at `175892f`: exit 0, **767 passed across 34 files**, 100% statements (263/263),
branches (100/100), functions (64/64) and lines (262/262) on `src/`, 0 vulnerabilities;
`npx portulan compile --check` GREEN.

**Rebased afterwards, at the maintainer's request.** By then `main` had gained #99 (`aa3ca04`), and
the branch was rebased onto it rather than merged again, which drops the merge commit `1bc902b`.
`CHANGELOG.md` conflicted once, where this branch's entries meet `main`'s, and was resolved the same
way: #83's and #99's entries first, this branch's after. The rebased head differs from the pre-rebase
head, `a43023f`, only in #99's four files. The hashes above name the commits the measurements were
taken on, before the rebase, and so do the replies on #98's review threads. Their rebased counterparts:
`e0073b6` (`ae3bc85`), `5464a5b` (`b28a70a`), `9786a7a` (`1fb6f6a`), `c4ed677` (`ed8081b`), `22ad8a3`
(`bfc0102`), `ba9e8e0` (`0c6ff13`), `6a4575c` (`175892f`), `8f60a97` (`c55b5e9`) and `f293f79`
(`a43023f`). The verify recipe at `f293f79`, the head before this note: exit 0, **768 passed across 34
files**, 100% statements (263/263), branches (100/100), functions (64/64) and lines (262/262) on
`src/`, 0 vulnerabilities; `npx portulan compile --check` GREEN.

**Copilot's next comment, on the rebased head.** `edited` also fires on a change of base, and only
`verify.yml` re-ran on it: a retarget keeps the head, so the other required checks kept the statuses
they had against the old base. `branch-freshness` measures the branch against its base, so it now
re-runs on `edited` too, with a test that failed first. `copilot-reviewed` asks for a round on the
head, which a retarget does not change, so a re-run would give the same answer; and `analyze` runs
only for pull requests into `main`, so one retargeted into `main` has no status to reuse and waits
for a push. Whether `copilot-reviewed` should also judge the base is left open below.

**And one more, on the head after that.** `sectionsOf` kept sections in a `Map`, so a second section
of the same name overwrote the first, and an edit to a shipped section followed by an unchanged copy
of it passed. It now refuses a repeated name and says which file it was in, with tests that failed
first. Neither this branch's `CHANGELOG.md` nor `main`'s has a repeated heading, so no pull request
starts failing on it.

The same review's suppressed comment was about the report, not the rule. `changedSections` worked out
added and removed lines with a set difference, so a shipped section whose lines were only reordered or
repeated failed with "0 line(s) added, 0 removed" and no lines shown, and an added blank line was left
out of the report. It now diffs in order and counting repeats, and shows a blank line as
`(blank line)`, with tests that failed first.

**And a fourth, from the same round's suppressed comments.** The check asked whether a version's
tag existed when it ran, not whether the change's base already contained it. A release that tags
the very commit a push brought in, after that push, would then have turned `main` red over an entry
that is in that release: #77's timing, with the push run checked late. It now counts a section as
shipped only when GitHub's comparison of the tag with the base answers `ahead` or `identical`.
Measured on 2026-09-15 against `v2.0.0`, an annotated tag on `878af79`: `ahead` from a later commit,
`identical` from `878af79`, `behind` from the commit before it, and 404 for a tag that does not
exist. The tag's existence is read first, so a 404 from the comparison is refused rather than read
as "not shipped". The same round's wording nit is fixed too: `verify.yml` no longer says no pull
request run fires "when only the base moves", which read as a retarget.

## Found in passing *(not fixed here)*

- `.portulan/dod.md` condition 7 said `strict` forces a rebase whenever `main` moves; the gate map
  records it as deliberately off. Flagged as a separate task, which became #97 and fixed it.
- The stop gate warned that a second handoff dated 2026-09-15 could red `docs.sh`'s record check. This
  repository has no `docs.sh`, nothing in its tests reads handoff dates, and `main` already carries
  three handoffs dated 2026-09-14. The warning describes a check this repository does not have, as the
  gate map already notes of `verify/compile.sh`.
- The other session's branch named in the 2026-09-14 handoff became #82, which merged before this
  branch was pushed; this branch was rebased onto it without conflict.

## Open questions *(human-owned)*

- Whether the push run's cancellation gap is worth closing. Limiting `cancel-in-progress` to pull
  requests would let every run on `main` finish, at the cost of runner minutes on superseded pushes.
- Whether checks should run their checker from a trusted revision rather than the pull request's own
  tree. It would apply to every check here, not only `changelog`; raised by Copilot on #98, and
  accepted for now.
- Whether `copilot-reviewed` should judge the base as well as the head. A round on the head says
  nothing about the diff to a base the pull request was retargeted to afterwards; raised by
  Copilot on #98.

**Next action.** Nothing outstanding from this change beyond the open questions above.

**Recoverability.** Nothing partial: every change is in the pull request titled above, and no tag,
release or publish was touched.
