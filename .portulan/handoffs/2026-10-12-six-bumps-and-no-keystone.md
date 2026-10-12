# Handoff — six bumps, and no keystone among them

**State, dated 2026-10-12 — a snapshot, not a live claim.** `main` at `1b1f89c` (#109), and **red on
its own default recipe without a commit**: `npm audit --audit-level=high` exits 1 there. One branch,
`claude/dependabot-updates-b8a536`, carries a sweep that clears it and takes the place of the six
open Dependabot pull requests, #110 and #112 to #116. Its pull request was opened after this file
was written, and the figures for its head are in its description. **Nothing was merged, no
Dependabot pull request was closed, commented on or rebased, and no release ran.**

Asked to address all Dependabot updates, working with an Opus 5.5 agent in the worktree
`serene-hodgkin-24709a`. Local runs were on macOS under Node 26.10.0 and npm 11.19.1, so the
`osascript` tests ran.

## What was found first

The shape the 2026-09-14 handoff names, a second time: the audit turned red on `main`, where
nothing re-runs it, and every pull request inherited it. On the heads #110 and #113 have today,
`audit` passed on 2026-09-29 (17:25Z and 17:26Z) and failed on 2026-10-06 (both at 17:24Z): the
same commits, a week apart.

Measured against `main`'s lockfile on 2026-10-12, `npm audit` reports eight advisories in five
packages:

| Package | Held | Advisories | Severity | Fixed at |
|---|---|---|---|---|
| `proxy-addr` | 2.0.7 | GHSA-jqcg-44mw-7w3h | critical | 2.0.8 |
| `@modelcontextprotocol/sdk` | 1.30.0 | GHSA-6qxp-vccf-f47h | high | 1.31.0 |
| `source-map-js` | 1.2.1 | GHSA-68fv-2mgg-jv7q | high | 1.2.2 |
| `ip-address` | 10.4.0 | GHSA-rpw4-54j3-4h4q, GHSA-2vr4-cq9g-pvrc, GHSA-j6r3-76f7-8jcv, GHSA-h3mg-xc3c-68pw | moderate | 10.7.1 |
| `fast-uri` | 3.1.7 | GHSA-hrr3-gc8f-f4qj | moderate | 3.1.8 |

**The difference from 2026-09-14 is that no Dependabot pull request is the keystone.** Then, #67
alone cleared the high advisories, so it could merge first and the rest rebase onto it. Here the
three packages the `high` threshold fails on are `proxy-addr`, `source-map-js` and the SDK. No pull
request touches the first two, and **#115 proposes SDK 1.30.1, the last version the advisory
covers** — its range is 1.12.0 to 1.30.1, and there is no 1.30.2. Merging all six would have left
the audit red. The repository has two open Dependabot alerts, both `ip-address`, so nothing there
signals the other four packages either.

**#116 could not go green as Dependabot wrote it**, for a reason of its own. It moves Portulan
0.1.2 to 0.2.0, and `gate-policy` runs `portulan compile --check`. The 0.2.0 compiler emits more
from the same `gates.json`, so the committed `.claude/settings.json` reads as drifted until someone
recompiles it, and Dependabot does not run a compiler.

## What the branch carries

Seven commits and the one with this file, each a step that can be read alone:

- `zod` 4.6.2 → 4.6.5 and `ip-address` 10.4.0 → 10.7.2: **Dependabot's own commits from #112 and
  #114, cherry-picked**, so that part of the lockfile change keeps its author.
- `@modelcontextprotocol/sdk` 1.30.0 → 1.32.1, in place of #115's 1.30.1.
- `npm audit fix` for what was left: `proxy-addr` 2.0.8, `source-map-js` 1.2.2, `fast-uri` 3.1.8.
- The `vitest` group 5.0.0 → 5.0.3, in place of #110's 5.0.1. `npm update` leaves the pair where it
  is, since each peers on the other's exact version; both were installed at 5.0.3 and the ranges in
  `package.json` restored to `^5.0.0`. That re-resolved the subtree: vite 8.2.2 → 8.3.4, rolldown
  1.2.7 → 1.2.13, and `why-is-node-running` 2.3.0 → 3.2.1, which drops `siginfo` and `stackback`.
- Portulan 0.1.2 → 0.2.0 and `@types/node` 26.5.1 → 26.6.5, with `.claude/settings.json`
  recompiled. `package.json` changes in this one line only: `^0.1.2` to `^0.2.0`.
- `codeql-action` `init` and `analyze` 4.38.0 → 4.38.3, in place of #113's 4.38.1. `24c54180` is
  the commit the annotated tag dereferences to, read from the API; by the same reading #113's
  `1c5b6756` is v4.38.1's.
- `CHANGELOG.md`: a Security and an Internal entry under `[Unreleased]`.

**What the recompile adds to `.claude/settings.json`.** The policy is unchanged: the same six `ask`
permissions and the same two gate hooks. Portulan 0.2.0 also compiles its restart advisory: a
`PostToolUse` and a `UserPromptSubmit` hook, and a `statusLine`, all running `cli/advisory.mjs`.
The status line takes the place of one set in user settings, in this repository only, and
`statusLine` in `.claude/settings.local.json` outranks it. Read before it was committed: the script
imports Node built-ins and its own `ledger.mjs`, reads the session transcript, and writes its state
to the OS temp directory.

**How the lockfile was verified**, by the 2026-09-14 handoff's method. For each of the 40 lockfile
entries that differ from `main`'s, `resolved` is the registry tarball and `integrity` equals
`npm view <pkg>@<ver> dist.integrity`: 40 checked, 0 mismatches.

**What it changes for consumers: nothing.** The tarball ships no lockfile, and the ranges already
admitted every patched version: `package.json` takes the SDK at `^1.27.1`, `express@5.2.1` takes
`proxy-addr ^2.0.7`, `ajv@8.18.0` takes `fast-uri ^3.0.1`, `express-rate-limit@8.5.2` takes
`ip-address ^10.2.0`, and `source-map-js` is dev only. An install that resolved before a fix was
published keeps what it resolved until it is refreshed. The SDK advisory is in its OAuth client;
`src/` imports `McpServer` and `StdioServerTransport` and nothing else from the SDK.

## Decisions + why

- **One pull request rather than six**, the route #36 took and the opposite of the maintainer's
  choice on 2026-09-14. That choice had a Dependabot-authored keystone to merge first. With none,
  one-by-one would still have needed a session-authored pull request for the audit and another
  change for the recompile, then a rebase and a person's review of each of the rest. The cost is
  the one that handoff named: the lockfile change moves from Dependabot's authorship to the
  session's, which is what the integrity check above is for. **The six are untouched, so the other
  route is still open**: merge this as the keystone and the rest rebase or close themselves.
- **Current versions rather than Dependabot's targets**, where the two differ (the `vitest` group,
  `@types/node`, `codeql-action`), as #36 did, so that the next weekly run does not reopen the same
  three.
- **`zod` and `ip-address` held at Dependabot's targets.** `zod` 4.6.6 and `ip-address` 10.7.4 were
  both published on 2026-10-11, the day before this sweep. `npm outdated` therefore still lists
  `zod`, and nothing else. The youngest version the lockfile takes is `tinybench` 6.2.2, published
  2026-10-10, which arrived with the `vitest` subtree.
- **The Portulan workspace migration was not taken.** `portulan upgrade .portulan` lists three form
  steps owed on 0.2.0 — changelog fragments under `changes/`, a boot card, a `comments` recipe —
  and `doctor` is GREEN without them. The first would change how this repository keeps its
  changelog, which the release notes and two checks read.

## Found in passing *(not fixed here)*

- `actions/setup-node` v7.1.0 was released on 2026-10-08; every workflow here pins v7.0.0,
  `release.yml` among them. No Dependabot pull request proposes it yet.
- The 2026-09-14 handoff's question stands and has now cost a second batch: `main` does not re-run
  its audit, so a new advisory shows up inside the next unrelated pull request rather than where
  someone looks.

## Open questions *(human-owned)*

- Whether this pull request or the one-by-one route. Merging is Gated either way.
- Whether to take Portulan 0.2.0's status line here, or keep one in `.claude/settings.local.json`.
- Whether to take the three `portulan upgrade` steps, and the changelog one in particular.
- Whether `main` should audit on a schedule.

**Next action.** Read the pull request and its Copilot round; merging it is the maintainer's.
Dependabot closes a pull request whose update `main` already has, on its next run or on
`@dependabot rebase`. #112 and #114 are matched exactly, and each of the other four is matched or
passed by a version here.

**Recoverability.** Nothing partial: every change is on the branch and in its pull request. The
`refs/remotes/pr/112` and `refs/remotes/pr/114` refs fetched for the cherry-picks are local to this
worktree's repository and can be deleted with `git update-ref -d`.

## Amended later on 2026-10-12

The state paragraph above was true when written. Since then:

- **The sweep merged as #117**, `61a32f6`, by the maintainer at 09:34Z, from the head the recipe was
  run on, `11fb2a7`: the two trees are identical. CI passed on Node 22 and 24, which the local run
  had not covered. Copilot's round on that head had 0 findings and was headed "Needs a closer
  look", naming the dependency changes and the new hooks as the maintainer's to read;
  `copilot-reviewed` passed on it.
- **The six Dependabot pull requests were closed**, at the maintainer's instruction and after the
  merge rather than before, since Dependabot deletes a closed pull request's branch and it cannot
  then be reopened. Each carries a comment naming the version `main` holds. `main`'s push run was
  green on `audit`, and the repository's open Dependabot alerts went from two to none.
- **GitHub auto-merge is off for this repository**, so "merge once green" could not be armed from
  the session: `Auto merge is not allowed for this repository`. The setting was left as it is.

The maintainer then asked for two of the open questions above to be taken.

**The scheduled audit** is the pull request this amendment travels in.
`.github/workflows/scheduled-audit.yml` runs daily at 05:23 UTC and by hand, on `main`, and its
steps are the merge gate's `audit` job's, held equal by `tests/workflows/scheduled-audit.test.ts`.
Each assertion was shown to fail first: the threshold lowered to `critical`, the cron moved onto
the hour, the job renamed `audit`, a `pull_request` trigger added. What it does not do:

- **It has not run.** A `schedule` trigger fires only from the default branch, and so does
  `workflow_dispatch` for a workflow the default branch does not have yet, so nothing can run it
  before it merges. Its steps are the ones `audit` already runs on every pull request. The first
  evidence is a run dispatched by hand after the merge, or the next 05:23 UTC.
- **A red run opens nothing.** It fails, which shows on the run, on the commit of `main` it ran
  against, and in whatever notification GitHub sends for a failed scheduled run. Opening an issue
  would take `issues: write` and a script to keep from opening one a day; not built.
- **GitHub disables it after 60 days without repository activity**, as it does any scheduled
  workflow in a public repository. The workflow's comment says so.

**The three `portulan upgrade` steps** are a separate pull request with a handoff of its own, since
the first of them changes how the changelog is kept.

**Open questions** *(human-owned)*, as they stand now:

- Whether a red scheduled audit should open an issue.
- Whether to turn on "Allow auto-merge" for the repository.
- Whether to keep Portulan 0.2.0's status line here, or set one in `.claude/settings.local.json`.
