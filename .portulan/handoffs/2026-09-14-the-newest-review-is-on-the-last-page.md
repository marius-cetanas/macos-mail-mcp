# Handoff — the newest review is on the last page

**State, dated 2026-09-14, when the pull request was opened.** Branch
`claude/serene-hodgkin-24709a`, rebased onto `main` at `878af79`, pushed and opened as a pull
request titled `fix(ci): copilot-reviewed reads every page of a pull request's reviews`. The verify
recipe at `824975e`, the head before this file was added:
exit 0, **665 passed across 32 files** with none skipped, 100% statements (263/263), branches
(100/100), functions (64/64) and lines (262/262) on `src/`, 0 vulnerabilities;
`npx portulan compile --check` GREEN. Every local run was on macOS under Node 26.8.1, so neither of
CI's Node versions, 22 and 24, was exercised here. `src/` is untouched: a release cut from this alone
would derive a patch from the `fix(ci):` subject for a change the published server does not contain,
which is the wart `CLAUDE.md` names and `bump` overrides.

**Amended later the same day — the session went on past the paragraph above.** Copilot's round on
`d9a1cb6` recommended approval with no comments, and `copilot-reviewed` landed on it in run
34864503913, the changed script's first live run. Auto-fix was switched on for the pull request;
auto-merge was asked for too and refused, because the repository does not allow it
(`allow_auto_merge: false`), and turning that on is a repository-wide decision for the maintainer.
Auto-fix then reported a conflict with `main`, which had gained #80: an `[Unreleased]` → Internal
entry where this branch's sat. `origin/main` at `f220fed` was merged in as `ef5732b` rather than
rebased onto, keeping both entries with #80's first. The verify recipe at `ef5732b`: exit 0,
**666 passed across 32 files**, the same 100% on `src/`, 0 vulnerabilities; `compile --check` GREEN.
The merge moved the head. Copilot's round on `82e40f1` again recommended approval, with no inline
comments, and every required check passed there. The maintainer then approved the merge; before it,
this paragraph and the closing lines were reworded to say nothing a merge makes false, the defect
#80 corrected in #77's handoff.

## The defect

`makeGithubIo`'s `api` returned `res.json()` from one request, so `awaitRound` read the first page of
`GET /pulls/{n}/reviews` and nothing after it. Reviews are listed oldest first, so past 30 the ones
the check waits for — Copilot's round on the head, and any human review of it — were on a page it
never read. `classifyRound` then reported the head unreviewed, and the required check would expire
red with no push able to clear it: fail-closed, and the symptom #44 describes. Composed over a
`fetch` that pages as GitHub does, the unchanged script answered a round on page 2 with *"1 Copilot
round(s), none on aaaaaaaa — the branch moved after the last one"*, and expired.

Latent: as of this date the most reviews on any pull request here was 18, on #24.

## Re-measured before relying on it

- **Reproduced.** A REST list defaults to 30 a page. #24's 18 reviews ascend by `submitted_at`.
  Review 5198788557 on #73 is `COMMENTED`, with an empty body and one comment carrying
  `in_reply_to_id`. The most reviews on any pull request is #24's 18, and 54 of the maintainer's
  reviews hold a reply.
- **Measured on the endpoint itself**, since nothing here reaches 30: nodejs/node#22712's 511 reviews
  come 30 a page by default and 100 for `per_page=101`, every page in `submitted_at` order.
- **Ordered by submission, not by id.** #24's ids ascend as well; nodejs/node#22712's do not — its
  23rd review has a lower id than its 22nd — so nothing should assume ids follow the list.
- **Every reply is a review of its own.** This repository's 110 review comments all carry a review
  id. Its 54 replies sit in 54 distinct reviews, none in the same review as the comment it answers,
  and none of those reviews holds a top-level comment. The brief had one example; this is all of them.
- **`Link` names pages under `/repositories/{id}/`**, not `/repos/{owner}/{name}/`, and a middle page
  lists `prev` before `next`. A one-page list sends no `Link`; neither does the single pull request
  endpoint, which returns the same bytes with `per_page=100` as without.
- **Did not reproduce: "76 pull requests existed".** Paginated, the pulls list held 70 — and since
  issues share the numbering, a pull request's number is not a count of them. Nothing rested on it.

## What changed

- **`api` reads every page**: `per_page=100` on every read, `rel="next"` followed as given until there
  is none, the page named when a later one fails, and a next page off api.github.com refused before
  it is requested. A resource still comes back as itself, in one request.
- **`REST_PAGE` and `nextPageUrl`**, exported, the parser tested against the three headers verbatim.
- **`awaitRound` composed over `makeGithubIo(...).api`** in the suite — the pairing the `c8 ignore`d
  CLI arm wires — against a fake that pages as measured. Two cases, each on page 2: a Copilot round,
  and a human review of a diff Copilot declined. The CLI arm needed no change.
- **Tests first.** `fe85ed2` is red on purpose: against the unchanged script, 12 failed | 101 passed
  (113), measured before the rebase, which changed neither the test file nor the script. The two
  composed tests read `expired`; the other ten failed for want of the paging and the two exports.
- **An `[Unreleased]` → Internal changelog entry.**

## Decisions + why

- **REST, not GraphQL.** `classifyRound` consumes the REST shape, so switching transport would have
  rewritten every fixture to fix a paging defect.
- **`per_page` on every read, not per path**, so `api` keeps no list of which paths are lists; the one
  object path it reads was measured unaffected.
- **The link is followed, not rebuilt.** The header states GitHub's URL format, and it is not the one
  `api` builds.
- **The origin check is defensive, not measured.** Every `Link` seen stayed on api.github.com. It is
  there because the token, which holds `pull-requests: write` in that job, rides on every request.
  _(Answered on 2026-09-15: kept, and now measured — see [the 2026-09-15 handoff](2026-09-15-the-questions-81-left-open.md).)_
- **No new wiring in the CLI arm**, as the brief preferred; the composed tests cover the pairing it
  wires instead.

## The changelog entry nearly filed itself under 2.0.0

`main` moved twice under this session: #78 recorded 2.0.0, #77 merged, and 2.0.0 was tagged and
released at 15:31Z. #78 inserted the version heading below `[Unreleased]`, so the `### Internal` list
this entry had been appended to became 2.0.0's. The rebase conflicted only because #77 had added a
bullet in the same place.

**Without #77 it would have been silent.** Measured with `git merge-file` on the three versions of
`CHANGELOG.md`: onto `main` as #78 left it, the entry merges with no conflict and lands under
`## [2.0.0]`, a release it is not in. Onto `878af79` the same merge has the one conflict the rebase
hit. With the entry under 2.0.0, both test files that read `CHANGELOG.md` still pass, 12 of 12.
Resolved by hand into `[Unreleased]` → Internal.

So for now it is a habit: after rebasing over a release being recorded, read where the entry landed
rather than trusting a clean rebase. A check is possible but not obvious — an entry under a released
version is sometimes backfilled on purpose, as 1.3.1's was — so it is left as a question below.
_(Answered on 2026-09-15: a check now holds a tagged version's section as it shipped — see [the 2026-09-15 handoff](2026-09-15-the-questions-81-left-open.md).)_

## Found in passing *(not fixed here)*

- **A green run on the wrong toolchain.** This worktree began with no `node_modules/`, and
  `npx vitest run` did not fail: it ran Vitest 4.1.11 and reported 102 passed, where `main` requires
  Vitest 5. 4.1.11 is what the main checkout has installed — that checkout is on
  `handoff/2026-08-20-escaping-a-gate-and-a-release` — and how `npx` reached it was not determined.
  `npm ci` fixed it here. The main checkout also has no `@sleepy_panda_srl/portulan`, which bears on
  #77's open question about where a worktree session's hooks look.
- **A docblock above the wrong `describe`.** In `tests/workflows/copilot-round.test.ts`, *"The
  permission is the enabling condition for all of the above"* sits directly above the `makeGithubIo`
  block's own docblock, while the block it describes, the workflow's permissions, comes later. Left
  alone to keep this diff to its defect.
- **The other branch the brief named.** `claude/goofy-nash-ee3861` — one test-only commit, red on
  purpose, about a thread reply satisfying the gate — had no pull request in any state and was not on
  origin when this session checked. Its one hunk sits after the #58 `describe` in the test file, apart
  from this change's hunks. Its fixtures give reviews a `comments` field, and `GET /pulls/{n}/comments`
  pages the same way (measured on #73), so if its fix reads comments through `api`, it gets every page
  from this change.

## Open questions *(human-owned)*

Both were answered on 2026-09-15, in [the 2026-09-15 handoff](2026-09-15-the-questions-81-left-open.md).

- Whether a check should keep entries out of a released version's section, given that backfilling
  one is sometimes right. _Yes: a tagged section stays as it shipped, and a new section — a
  backfill — is free._
- Whether the origin check on `next` is wanted. It is defensive, and it turns a `Link` off
  api.github.com into a red run. _Kept: without it, fetch would carry the token wherever the
  link pointed._

**Next action.** Nothing outstanding from this change; both open questions above are answered.

**Recoverability.** Nothing partial: every change is in #81, and no tag, release or publish was
touched.
