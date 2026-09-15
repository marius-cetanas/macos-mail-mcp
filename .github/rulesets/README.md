# Rulesets

Repository rulesets are configured through the API, not through anything in this tree — GitHub reads
them from its own store. These files are the payloads that were applied, kept here so the
configuration is reviewable and reconstructable rather than existing only as clicks somebody once
made.

## `copilot-auto-review.json`

Requests a Copilot round on every non-draft pull request against the default branch, and again on
every push (`review_on_push`) — except on a pull request Dependabot opens, which draws none (#47).

**The `copilot-reviewed` check no longer depends on this.** The check waits for a round on the
commit being merged, and since #49 it also asks for one: the first time its job finds a Copilot
round owed, it requests one unless one is already on order — so at most once per run. Where a
person's review is owed instead, as on a diff Copilot declines to read, it asks Copilot for nothing.
What this ruleset still buys is the earlier request — within a second of the pull request opening,
and again on every push — where the check can ask only once its job is running. In the words of
[the gate map](../../.portulan/gate-map.md#the-platform-floor), it *"is faster on the common path,
and the check asking is the floor beneath it rather than a replacement."*

Without the ruleset, case by case:

- **A person's pull request, from a branch in this repository.** The check's own request records —
  the #49 timeline shows `review_requested` by `github-actions[bot]` — so a round is still
  requested, only later. That round is billed to the author's Copilot licence, so this holds for an
  author who has one, as #49's did.
- **A Dependabot pull request.** Nothing changes, because the ruleset draws no round there either.
  The check's request is accepted and records nothing (#58); GitHub's own response to it says so,
  and the job logs that. Since #64 a person's review of the head then satisfies the check instead,
  and since #82 only one that says something: a verdict, a non-blank body or a top-level comment.
- **A pull request from a fork.** The job's token is read-only there, so the check's request is
  expected to fail. The log names the failure, `could not request a round (…) — waiting anyway`,
  and the check keeps waiting: a round requested by hand still counts if it lands before the budget
  runs out, and without one the check expires red. Expected, not measured: GitHub's documentation
  gives a `pull_request` run from a public fork a read-only token whatever the workflow asks for, and
  the only fork pull request here, #33, predates the check. The measurement is the first fork pull
  request to run it, which takes a second account, since an owner cannot fork their own repository.
  Three things to read off it: whether the ruleset requested the round on opening, since a fork's
  pull request against `main` is neither a draft nor Dependabot's and nothing in the payload
  excludes it; whether the check then waited for that round rather than asking; and, where it did
  ask, that line in its log with a 403.
- **A pull request whose round never comes.** Copilot can hold a recorded request and deliver
  nothing: on 2026-09-15, #104 drew no round in the thirty-eight minutes between the ruleset's
  request and a fresh one by hand, while every other pull request that day drew one within seven
  minutes. After thirty minutes with no round on the head the check stops waiting for Copilot and
  waits for a person's review of the head instead, as it does where the request cannot record; a
  Copilot round arriving anyway still counts.

Apply with:

```sh
gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/copilot-auto-review.json
```

Read back what is actually live — this file is what was *sent*, which is not the same claim:

```sh
gh api repos/{owner}/{repo}/rulesets --jq '.[] | "\(.id) \(.name) \(.enforcement)"'
```
