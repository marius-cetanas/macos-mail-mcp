# Handoff — a reply is not a review

**State, at session close on 2026-09-14.** Pull request #82 from `claude/goofy-nash-ee3861`, rebased
onto `main` after #81 merged. Merging it is Gated, as every merge here is. The branch keeps the
change's history: the failing tests alone first, then the fix, the adjustments an independent review
required, this handoff and its amendments, a fix for the one note in Copilot's round, and the change
#81's paging called for. Verify recipe on the head: exit 0, 32 files / 698 tests, 100% statements,
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
  list. `classifyRound` stays pure and names the reviews in `unread`; the loop reads those and decides
  again, and never on the path that waits for Copilot. Not extending `makeGithubIo`, as suggested, is
  deliberate: a new dependency would need wiring in the `c8 ignore`d CLI arm, where a forgotten wire
  would silently refuse every body-less review with a top-level comment.
- **A failed read throws**, like the loop's two other reads, rather than waiting under a reason that
  names the wrong thing.
- **Not taken: caching a refused review's comments across polls.** The GETs it saves are inside the
  allowance, and the cache would rest on a submitted review never gaining a top-level comment, which
  nothing here measures.
- **The #58 log line now says which review satisfies the check**, because it prints on exactly the
  pull requests where a reply no longer does.
- **Copilot's one note was right, and was fixed by wording rather than a new category.** The reason
  called a refused review "only thread replies or empty", which misdescribes one holding malformed
  comment entries. A separate count for those would add a branch for a shape no measured payload has
  shown; naming what every refused review lacks — no verdict, no body beyond whitespace, no top-level
  comment — is true of all three shapes at once, and the malformed-entry test now asserts it.

## How it was verified

- **Test-first is in git.** The tests alone, measured as `c61564f` on `a1edc1f`: 14 failed, 110
  passed of 124. The eight new tests that passed pin what the fix keeps.
- **Verdict from a context that had not seen the implementation**: APPROVE-WITH-ADJUSTMENTS, on a tree
  whose `git diff a1edc1f` hashed `1b4ca21e…`, committed as-is. It re-ran the red run and the recipe,
  made fifteen mutations that each turned tests red, and replayed #73's reviews read-only through the
  script. On a second pass it confirmed the adjustments and the first rebase, leaving one adjustment:
  commit messages still carrying pre-rebase figures. Its verdict covers `git diff 878af79 7e2b30a`,
  sha256 `b35c965b…`. **Two later commits were not re-reviewed locally**: the fix for Copilot's note,
  and the change #81's paging called for, which moved the comments read onto #81's `api`. Copilot's
  rounds on the heads after them are their review.
- **Copilot's round on `0b94e85`**, the head before the second rebase: "Needs a closer look" — the
  gate change warrants final human review — with no inline comments and one suppressed note, the
  reason wording above.
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
