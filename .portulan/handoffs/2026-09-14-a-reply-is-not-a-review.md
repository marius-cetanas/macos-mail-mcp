# Handoff — a reply is not a review

**State, as of the end of 2026-09-14.** The session ran past midnight, and
[the 2026-09-15 handoff](2026-09-15-the-reply-auto-fix-posted.md) holds what followed. Pull request
#82 from `claude/goofy-nash-ee3861`, rebased
onto `main` after #81 merged. Merging it is Gated, as every merge here is. The branch keeps the
change's history: the failing tests alone first, then the fix, the adjustments an independent review
required, this handoff and its amendments, fixes for the notes in Copilot's rounds, and the change
#81's paging called for. Verify recipe on the head: exit 0, 32 files / 701 tests, 100% statements,
branches, functions and lines on `src/`, 0 vulnerabilities. No commit or base id appears in this
paragraph: the branch has been rebased three times, and each time the ids a State paragraph named went
stale. _Dated for the reason #65 recorded: a state sentence phrased as live goes false on merge._

## What was measured

- **The defect reproduces as described.** Review 5198788557 on #73 is `COMMENTED`, body `""`, commit
  `bee09b7f`, holding one comment, 4006098256, with `in_reply_to_id` 4006046306.
- **The field that separates a reply holds up through the endpoint the fix reads.** On all 54 reviews
  by a person that held comments, `GET /pulls/{n}/reviews/{id}/comments` agrees with GraphQL's
  `replyTo` count for count. A thread-starting comment has **no** `in_reply_to_id` key — measured on
  twelve of Copilot's reviews, and the reviewer found it true of all 39. No person here has left a
  top-level review comment, so that shape is unmeasured for people; if it differs, it fails closed.
- **Nothing merged through the hole.** 37 commits carry a reply-only review; 36 also carry a real
  Copilot round, which decides first, and the other is on #3, which predates the check.

## Decisions + why

- **The rule is positive and fails closed**: a verdict, a non-blank body or a top-level comment
  counts; anything else, unread included, is refused. The negative form — refuse only `COMMENTED`
  with an empty body and replies — would wave through a review whose `state` is missing or new, the
  reasoning that already has `isHumanReviewer` accept only the literal `User`.
- **It refuses more than replies, and the changelog says so**: an empty or whitespace-only review in
  any state but a verdict, a dismissed approval among them; one whose comments are unreadable or which
  has no id; and a read that fails outright ends the run red. A fourth — a top-level comment past a
  review's first hundred comments — went away when #81 made `api` read every page. My first draft of
  this file called the dismissed approval *the one* change outside replies. The independent review
  found the rest, and that sentence never reached the tree — the same shape as the last handoff's nine
  stale sentences, caught this time by a reviewer before anything merged.
- **Comments are read lazily, through the existing `api`**, which since #81 reads every page of a
  list. `classifyRound` stays pure and names the reviews in `unread`; the loop then reads the pull
  request's review comments once and gives each named review its own, and never reads on the path
  that waits for Copilot. Not extending `makeGithubIo`, as suggested, is deliberate: a new dependency
  would need wiring in the `c8 ignore`d CLI arm, where a forgotten wire would silently refuse every
  body-less review with a top-level comment.
- **A failed read throws**, like the loop's two other reads, rather than waiting under a reason that
  names the wrong thing.
- **One read of the pull request's comments, not one per review, and still no cache.** Read per
  review, each poll cost a request for every review waiting to be read and repeated them all, which a
  long conversation of replies on the head could turn into a spent allowance and a red check. An
  earlier version of this bullet judged those reads to fit; Copilot's third round showed how they need
  not. Grouping by `pull_request_review_id` was measured first: all 113 review comments here carry
  one, and the 110 GraphQL was also asked about fall into exactly the reviews it puts them in. A cache
  across polls is still not taken — it would rest on a submitted review never gaining a top-level
  comment, which nothing here measures.
- **The #58 log line now says which review satisfies the check**, because it prints on exactly the
  pull requests where a reply no longer does.
- **Copilot's notes on the reason line were right, both times.** First, it called a refused review
  "only thread replies or empty", which misdescribes one holding malformed comment entries, so the
  line became what every refused review lacks — no verdict, no body beyond whitespace, no top-level
  comment. Then it trailed every refused review with "a reply to a thread is not a review", which
  still read as a diagnosis of an empty or malformed one. That hint is now said only of a review whose
  comments are all replies — the shape all 54 of this repository's replies take — while malformed
  entries still get no category of their own, being a shape no measured payload has shown.
- **A top-level comment is an identified comment with no `in_reply_to_id` key at all.** An explicit
  `null` used to count, and an id of `0` or below passed as one GitHub sent; both are now refused,
  because absence is the one top-level shape measured — 58 of the 113 review comments here, with none
  holding `null` — and GitHub's ids start at 1. Copilot's third round found both.

## How it was verified

- **Test-first is in git.** The tests alone, measured as `c61564f` on `a1edc1f`: 14 failed, 110
  passed of 124. The eight new tests that passed pin what the fix keeps.
- **Verdict from a context that had not seen the implementation**: APPROVE-WITH-ADJUSTMENTS, on a tree
  whose `git diff a1edc1f` hashed `1b4ca21e…`, committed as-is. It re-ran the red run and the recipe,
  made fifteen mutations that each turned tests red, and replayed #73's reviews read-only through the
  script. On a second pass it confirmed the adjustments and the first rebase, leaving one adjustment:
  commit messages still carrying pre-rebase figures. Its verdict covers `git diff 878af79 7e2b30a`,
  sha256 `b35c965b…`. **Later commits were not re-reviewed locally**: the fixes for Copilot's notes,
  and the change #81's paging called for, which moved the comments read onto #81's `api`. Copilot's
  rounds on the heads after them are their review.
- **Copilot's rounds on `0b94e85`, `7151422` and `ded6fec`.** The first two said "Needs a closer look",
  the first adding that the gate change warrants final human review, each with one suppressed note on
  the reason line above. The third said "Changes recommended": of its four suppressed notes, two were
  already fixed by the next head, and two were new — the id check and the per-review read — beside one
  inline comment on the explicit `null`. Each new finding is fixed in its own commit.
- **The rebases moved no code of their own.** `main` gained #76, #78, #77, #80 and #81 during the
  session. Each time the rebased patches compared identical — `--full-index` on the first two,
  `git range-diff` on the third — except in `CHANGELOG.md`, which conflicted every time because #78,
  #80 and #81 each touched `[Unreleased]`, and, on the third, the test file's import list, where #81's
  `REST_PAGE` and `nextPageUrl` met this change's `COMMENT_PAGE`. The entry now follows #80's and
  #81's under `[Unreleased]` → Internal.

## Worth knowing next time

- **A background reviewer and the Stop hook share a worktree.** Ending a turn runs the verify recipe
  where the reviewer may be building, and demands a handoff; a state-only stub satisfied the hook
  without handing the reviewer this file's reasoning. `TaskOutput` on an agent prints its raw
  transcript — wait for the completion notice instead.
- **A rebase carries commit messages that state figures, and they go false with it** — here twice: a
  test count, and a diff hash taken against the old base. Both times `git commit-tree` reworded them on
  identical trees; since then each figure names the commit and base it was measured on, which no later
  rebase can falsify.
- **A rebase over a change to the same code can apply cleanly and still leave claims false.** #81 made
  `api` read every page of a list, and this change's comments read goes through `api`, so its refusal
  of a top-level comment past the first hundred became untrue in a doc comment, the changelog, this
  file and two test names. Of all that, only a test whose fake `fetch` no longer matched turned red.
  `git range-diff` shows what a rebase did to each commit; only reading the merged docs against the
  merged code shows what it did to the claims.

## Next action

Nothing outstanding from this change; merging it is the maintainer's decision. Of the two follow-ups
raised as tasks on 2026-09-14, paginating the reviews read merged as #81, which this change now builds
on, and correcting `.github/rulesets/README.md` — which says no round is requested without the ruleset,
false since #44 — was started in a separate session.

## Recoverability

Nothing partial: every change is in #82, and no tag, release or publish was touched.
