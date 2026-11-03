# Package updates and issue queue

The maintainer requested all open dependency updates, then each open issue one at a time.
The dependency branch combines Dependabot PRs #122–#130 from main at 861ffc5.
It changes the lockfile and pinned Actions, with no runtime source changes.

Dependency PR #131 is open at a99deb6; both recipes passed, audit reports zero vulnerabilities,
and CI passed on Node 22 and 24. Copilot review was pending when checked.

Issue #84: insert a paragraph into reply/forward rich text; validate prefix, retained original,
unchanged attachment count and recipients before send; reject a false send result.
Session-open approved with adjustments, incorporated into the implementation. The new tests
failed on the old code. Production guard execution and Mail dictionary compilation pass on macOS.
Native Mail insertion and delivered MIME remain unexercised; no messages were sent.
Full verification and fresh precommit review precede its commit.

Next: finish #84, then address issues #85–#95 in order, each in its own commit on the fixes branch.
Merging and publishing remain gated.
Keep the original dependency PRs open until their replacements reach main.
