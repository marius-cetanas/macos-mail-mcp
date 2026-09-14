# Rulesets

Repository rulesets are configured through the API, not through anything in this tree — GitHub reads
them from its own store. These files are the payloads that were applied, kept here so the
configuration is reviewable and reconstructable rather than existing only as clicks somebody once
made.

## `copilot-auto-review.json`

Requests a Copilot round on every non-draft pull request against the default branch, and again on
every push (`review_on_push`) — except on a pull request Dependabot opens, which draws none (#47).

**The `copilot-reviewed` check no longer depends on this.** The check waits for a round on the
commit being merged, and since #49 it also asks for one: whenever a round is owed and none is on
order, its job requests it, at most once per run. What this ruleset still buys is the earlier
request — within a second of the pull request opening, and again on every push — where the check can
ask only once its job is running. In the words of
[the gate map](../../.portulan/gate-map.md#the-platform-floor), it *"is faster on the common path,
and the check asking is the floor beneath it rather than a replacement."*

Without the ruleset, case by case:

- **A person's pull request, from a branch in this repository.** The check's own request records —
  the #49 timeline shows `review_requested` by `github-actions[bot]` — so a round is still
  requested, only later.
- **A Dependabot pull request.** Nothing changes, because the ruleset draws no round there either.
  The check's request is accepted and records nothing (#58); GitHub's own response to it says so,
  and the job logs that. Since #64 a person's review of the head then satisfies the check instead.
- **A pull request from a fork.** The job's token is read-only there, so the check's request is
  expected to fail. The log names the failure, `could not request a round (…) — waiting anyway`,
  and the check keeps waiting: a round requested by hand before the budget runs out still counts,
  and without one the check expires red. Expected, not measured — the only fork pull request here,
  #33, predates the check.

Apply with:

```sh
gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/copilot-auto-review.json
```

Read back what is actually live — this file is what was *sent*, which is not the same claim:

```sh
gh api repos/{owner}/{repo}/rulesets --jq '.[] | "\(.id) \(.name) \(.enforcement)"'
```
