# Remove automated Copilot review from CI

The maintainer requested: “Remove copilot review action from CI/CD.” This change is on
`codex/remove-copilot-review`, based on the consolidated dependency branch at `a99deb6` (PR #131).

The change deletes the review workflow, automatic review ruleset payload, polling script and its two
dedicated test suites. Shared GitHub API tests and script-import checks remain. The policy and its
generated export require exactly `verify`, `branch-freshness` and `analyze`, each pinned to GitHub
Actions (`15368`). The verify aggregate retains test, audit, gate-policy and changelog dependencies.
Historical handoffs and shipped changelog sections are unchanged.

Review freshness is human-held: the maintainer must check that a verdict post-dates the current
head, and obtain a new review after that head changes. Explicit merge approval remains required.
The export still hard-codes strict checks on while live protection deliberately has them off;
the generated ruleset must not be imported as-is.

## Live settings

On 2026-11-03 the root session removed only `copilot-reviewed` from the required status checks,
keeping the three remaining app pins and `strict: false`. Exact comparisons of saved before/after
responses confirmed that all other branch-protection fields were unchanged, including zero required
approvals, administrator enforcement, conversation resolution and the force-push/deletion bans.

The root session changed review ruleset `21079801` from active to disabled, retaining its name,
target, conditions, rules and bypass actors; GitHub also advanced its update timestamp. It disabled
the live `copilot-review.yml` workflow (`338405988`), with readback state
`disabled_manually`. Its source is deleted by this change; that deletion reaches the default branch
when the pull request merges. The existing run `41626405919` was cancelled; subsequent API readback
confirmed `status: completed` and `conclusion: cancelled`.

The live settings snapshots were kept under `/private/tmp/macos-mail-mcp-`, named
`protection-before.json`, `protection-after.json`, `copilot-ruleset-before.json` and
`copilot-ruleset-after.json`. The implementer also checked those saved protection and ruleset
comparisons. The workflow readback was recorded by the root session.

## Verification

The opening checkpoint approved the plan with four adjustments: record measured live settings,
pin the exact remaining floor, name human-held review freshness, and retain the shared API/import
protections. All four are included.

Before implementation, the targeted regression run failed three assertions: the old required-check
list, the map's automated-review claim and the existing workflow. After removal the targeted five
suites passed 47 assertions. A final run of the two new/expanded policy and workflow suites passed
29 assertions.

On macOS with Node `26.12.1` and npm `11.20.0`, the default recipe passed:
`npm run build && npm run test:coverage && npm audit --audit-level=high`. The suite passed **727
tests across 39 files**, with 100% source coverage: 263 statements, 100 branches, 64 functions and
262 lines. Audit reported zero vulnerabilities. The count reflects removal of the obsolete Copilot
suites, with nine assertions added for the remaining floor and removed automation; no replacement
tests were added merely to preserve the old total. CI's Node 22 and 24 matrix remains unchanged.

`portulan compile --check`, `portulan index --check --changes changes`, the comments recipe and
`git diff --check` passed. The comments rail was lowered from 296 to the measured remaining count,
124. The compile regenerated all outputs; only the GitHub export changed. No live Mail operations
were performed. The independent pre-commit checkpoint returned APPROVE after re-running the recipes,
testing mutations of the new rails and checking live settings. Merging and publishing remain gated.
