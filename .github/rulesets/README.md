# GitHub rulesets

Automatic review is disabled in the repository settings. The disabled review ruleset is retained
there so the change is reversible; no automatic review payload is kept in this directory.

The required checks on `main` are `verify`, `branch-freshness` and `analyze`, each pinned to GitHub
Actions (`app_id 15368`). Pull requests, conversation resolution and administrator enforcement remain
required; force-pushes and branch deletion remain blocked. Required approvals stay at zero for this
single-maintainer repository.

Review freshness is human-held: before approving a merge, the maintainer checks that the review
verdict post-dates the current head, and requests a new review after the head changes.

[The gate map](../../.portulan/gate-map.md) and [policy](../../.portulan/gates.json) describe the floor.
The generated export is [`.portulan/compile/github-ruleset.json`](../../.portulan/compile/github-ruleset.json).
**Do not import it as-is:** the compiler exports strict status checks as `true`, while this
repository deliberately uses `strict: false` with the bounded `branch-freshness` check.
