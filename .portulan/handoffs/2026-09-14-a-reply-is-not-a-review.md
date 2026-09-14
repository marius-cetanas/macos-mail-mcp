# Handoff — a reply is not a review

**State, at session close on 2026-09-14.** Pull request #82 from `claude/goofy-nash-ee3861`, rebased
onto `f220fed` (#80) and **not merged** — merge is Gated. Six commits: the failing tests alone; the
fix; the adjustments an independent review required; this handoff; a fix for the one note in
Copilot's round; and this amendment. Verify recipe on the head: exit 0, 32 files / 687 tests,
100% statements, branches, functions and lines on `src/`, 0 vulnerabilities. Commit ids are kept out
of this paragraph on purpose: the branch has been rebased twice, and each time every id a State
paragraph named went stale. _Dated for the reason #65 recorded: a state sentence phrased as live goes
false on merge._

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
  any state but a verdict, a dismissed approval among them; a review whose top-level comment sits past
  its first hundred comments; one whose comments are unreadable or which has no id; and a read that
  fails outright ends the run red. My first draft of this file called the dismissed approval *the one*
  change outside replies. The independent review found the rest, and that sentence never reached the
  tree — the same shape as the last handoff's nine stale sentences, caught this time by a reviewer
  before anything merged.
- **Comments are read lazily, through the existing `api`.** `classifyRound` stays pure and names the
  reviews in `unread`; the loop reads those and decides again, and never on the path that waits for
  Copilot. Not extending `makeGithubIo`, as suggested, is deliberate: a new dependency would need
  wiring in the `c8 ignore`d CLI arm, where a forgotten wire would silently refuse every body-less
  review with a top-level comment.
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
  sha256 `b35c965b…`, and the code it judged is byte-identical through both rebases. **The commit for
  Copilot's note came after it and was not re-reviewed locally** — Copilot's round on the new head is
  its review.
- **Copilot's round on `0b94e85`**, the head before the second rebase: "Needs a closer look" — the
  gate change warrants final human review — with no inline comments and one suppressed note, the
  reason wording above.
- **The rebases moved no code.** `main` gained #76, #78, #77 and then #80 during the session. The code
  patches are byte-identical before and after each. `CHANGELOG.md` conflicted both times — first
  because #78 inserted `[2.0.0]` below `[Unreleased]`, then because #80 opened `[Unreleased]`'s
  Internal list — and the entry now follows #80's there.

## Worth knowing next time

- **A background reviewer and the Stop hook share a worktree.** Ending a turn runs the verify recipe
  where the reviewer may be building, and demands a handoff; a state-only stub satisfied the hook
  without handing the reviewer this file's reasoning. `TaskOutput` on an agent prints its raw
  transcript — wait for the completion notice instead.
- **A rebase carries commit messages that state figures, and they go false with it** — here twice: a
  test count, and a diff hash taken against the old base. Both times `git commit-tree` reworded them on
  identical trees; the second time each figure names the commit and base it was measured on, which no
  later rebase can falsify.

## Next action

Merge on approval, once `copilot-reviewed` has a round on the new head. Two follow-ups were raised as
tasks and started in separate sessions on 2026-09-14: reading every page of `api("/reviews")`, which
edits `scripts/copilot-round.mjs`, so whichever of it and #82 merges second will need a rebase; and
correcting `.github/rulesets/README.md`, which says no round is requested without the ruleset — false
since #44.

## Recoverability

Nothing partial. The work is on the branch and #82; no tag was pushed and no release run.
