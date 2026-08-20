# Rulesets

Repository rulesets are configured through the API, not through anything in this tree — GitHub reads
them from its own store. These files are the payloads that were applied, kept here so the
configuration is reviewable and reconstructable rather than existing only as clicks somebody once
made.

## `copilot-auto-review.json`

Requests a Copilot round on every non-draft pull request against the default branch, and again on
every push (`review_on_push`).

**The `copilot-reviewed` check depends on this.** That check waits for a round on the commit being
merged; if this ruleset is deleted, no round is ever requested, and the check waits out its budget
and fails with nothing explaining why. The two are a pair.

Apply with:

```sh
gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/copilot-auto-review.json
```

Read back what is actually live — this file is what was *sent*, which is not the same claim:

```sh
gh api repos/{owner}/{repo}/rulesets --jq '.[] | "\(.id) \(.name) \(.enforcement)"'
```
