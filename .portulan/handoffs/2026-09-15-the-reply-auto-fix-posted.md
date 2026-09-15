# Handoff — the reply Auto-fix posted

Continues [the 2026-09-14 handoff](2026-09-14-a-reply-is-not-a-review.md), which holds this change's
measurements and decisions. The session ran past midnight; this file holds what followed, and is short
where it would otherwise repeat.

**State, dated 2026-09-15.** Pull request #82 from `claude/goofy-nash-ee3861`, on `main` after #81.
Merging it is Gated, as every merge here is. Auto-fix was switched on for it on 2026-09-14. Verify
recipe on the head: exit 0, 32 files / 701 tests, 100% statements, branches, functions and lines on
`src/`, 0 vulnerabilities.

## The reply Auto-fix posted has the defect's shape

Answering Copilot's inline comment on 2026-09-14, Auto-fix posted one reply through the maintainer's
credentials, as its protocol asks. GitHub recorded that reply as review 5202095119: `COMMENTED`, an
empty body, on the head it answered, `9541bcf`, holding only the reply 4008901951, whose
`in_reply_to_id` is 4008806695. That is the shape of review 5198788557 on #73 again — the shape this
change stops counting — made by the routine that answers review feedback.

On #82 it decided nothing: Copilot's rounds on its heads decide first, and the script that check runs
there is this change's own, which refuses it. Posted on a pull request whose Copilot round could not
come, the old check would have counted it as the human review it waits for.

## What followed, and why

- **Copilot's round on `3f74373`** left three notes. Two described code already changed on the next
  head. The third was right: the #58 log line said a review with "a body" satisfies the check, though
  a body of only whitespace does not, so following it literally could leave someone waiting on a gate
  that cannot pass. It now says a non-blank body, and so do the workflow comment and the changelog.
- **Copilot's round on `9541bcf`** repeated that note, its head predating the fix, and added one that
  was also right: `isReply` took any non-null `in_reply_to_id` for a reply, so a malformed parent such
  as `0` or a string earned a review the "only replies to threads" hint. A parent now has to be a
  GitHub id, like the comment's own. The gate was never affected — `isTopLevel` refuses any present
  key — only what the reason said.
- **Each fix is its own commit, pushed as a fast-forward**, as Auto-fix's protocol asks, rather than
  folded into an earlier commit by a rewrite.

## Worth knowing next time

- **An automated reply is a review too.** An agent answering review threads through a person's
  credentials adds a `COMMENTED`, empty-bodied review on the head with every reply. This change makes
  those not count; before it, each would have satisfied a gate waiting for a person wherever no
  Copilot round was coming.
- **Fixing review notes one push at a time draws a round per push.** Each push moved the head and
  drew a fresh Copilot round, and each round found something the one before had not — five rounds
  before this file was written. Several notes described code already changed on a later commit, so
  read the `commit_id` a review judged before acting on it.

## Next action

Nothing outstanding from this change; merging it is the maintainer's decision.

## Recoverability

Nothing partial: every change is in #82, and no tag, release or publish was touched.
