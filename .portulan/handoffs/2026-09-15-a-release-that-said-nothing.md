# Handoff — a release that said nothing, and the four questions after it

**State, dated 2026-09-15, at session close.** `main` at `ef10b3e` (#98). Three pull requests are
open, none merged, and **no release ran, no tag was pushed, nothing was published**:

- **#100** `feat: ship CHANGELOG.md in the package, and open release notes with its section` — closes
  #96, and records `## [2.1.0] - 2026-09-15`. Verify recipe at `3808363`: exit 0, 35 files / 822
  tests, 100% statements (263/263), branches (100/100), functions (64/64) and lines (262/262) on
  `src/`, 0 vulnerabilities; `npx portulan compile --check` GREEN.
- **#101** `fix(ci): share one GitHub reader, and pass a duplicate heading main already carries`. At
  `d66984f`: exit 0, 36 files / 813 tests, the same coverage, 0 vulnerabilities, compile GREEN.
- **This branch**, `docs/the-floor-names-58-and-64`, opened after this file was written; its own
  figures are in its pull request.

The maintainer asked for four things and then a fifth, working with a Fable 5.1 agent: #96, a minor
release from what had merged since 2.0.0, four topics left open by the last two handoffs, and a
review of everything merged since 2.0.0 for coherence, stability and consolidation. Each pull request
was built in its own worktree under `.claude/worktrees/`, from `main` at `ef10b3e`; every local run
was on macOS under Node 26.8.1, so the `osascript` tests ran.

## The release, and why it did not run

`node scripts/next-version.mjs --current 2.0.0 --force auto` on `main` derives **2.0.1**: eight
commits since `v2.0.0`, two of them `fix(ci)`, none `feat`, and nothing under `src/`. `bump: minor`
would cut 2.1.0 with a `build/` byte-identical to 2.0.0's — the shape #96 was filed about. #100
carries the `feat`, so once it merges `auto` derives 2.1.0 and the tarball differs. Publishing is
Gated, and the compiled artifact asks on `gh workflow run`; this session ran neither a dry run nor a
publish, and the order below is the maintainer's to take:

1. Merge #100, #101 and this pull request, in any order — #100 before the release. The entries of
   the other two append to the list #100 moves under `[2.1.0]`, so all three ship in 2.1.0 if merged
   before the tag; one merged after it fails the `changelog` check on its own entry, which is the
   check working, and the fix is to move that entry under `[Unreleased]`.
2. If the release runs on a day other than 2026-09-15, correct the heading's date. Until the tag
   exists the section is open, so an ordinary pull request does it; after, a `docs(changelog)` title.
3. Actions → **Release** → `bump: auto`, `mode: dry-run`. The summary now previews the release notes,
   which open with 2.1.0's section. Then `mode: publish`.

Twelve functional findings from the same end-to-end test of 2.0.0, #84–#95, are open and untouched.
2.1.0 ships no change under `src/`; its consumer-facing change is the changelog in the package and
release notes a person wrote.

## #96 — the package said nothing about its versions

Diffing the 1.3.4 and 2.0.0 tarballs was the only way to learn the major was the Node floor. Measured
before anything was written: `npm pack --dry-run --json` on `main` lists `LICENSE`, `README.md`,
`package.json` and 50 files under `build/` — `files` said `build` alone, and the root `.npmignore`,
which cannot override `files`, said `CHANGELOG.md` was excluded anyway. The v2.0.0 GitHub release
lists commit subjects: "require Node.js 22.12 or later, the lowest Vitest 5 supports", under
Breaking, and nothing about the server being unchanged.

#100: `files` lists `CHANGELOG.md`; `.npmignore` is gone; `scripts/release-notes.mjs` takes
`--version` and opens the body with that version's section, the grouped commits folded beneath it,
and warns on stderr — a `::warning::` annotation in the run — when the section is missing or empty;
`release.yml` prepares the notes right after the version is known, so a dry run previews them and a
failure building them cannot follow the publish. The v2.0.0 release's notes were **not** edited:
that is public content, and the command is in #100's description.

## The four topics

**The stale-base gap** — a pull request checked before a release is tagged can merge after it, and
the push run then detects the misfiled entry rather than preventing it. Closing it needs the check
run again as the pull request merges. The options, for the decision only the maintainer can take:

| Option | Closes it | Cost | Note |
|---|---|---|---|
| Merge queue | Yes, fully | Every required workflow needs a `merge_group` trigger, and `copilot-reviewed` has no pull request to wait on in a merge group | GitHub's own announcement of merge queue's general availability (2023-07-12) reads: *"Merge queue is available on private and public repos on the GitHub Enterprise Cloud plan and all public repos owned by organizations."* This repository is user-owned. The live answer is whether **Require merge queue** appears in `main`'s branch protection settings; it was not checked from here, since reading that page is a click and changing it is Gated. |
| `strict` back on | Yes, for a `main` that moved; **not** for a tag cut on an unchanged `main`, since a tag moves no branch | A Copilot round on every rebase, the cost that turned it off | The narrower case it leaves open is exactly the release-tag case. |
| Re-run open pull requests' checks after the tag | Mostly — a window of seconds remains | `release.yml` would edit each open pull request after tagging to fire `edited`, which `verify.yml` already runs on; a re-run of an old run would not do, since its `GITHUB_SHA` is the old merge commit | Touches other people's pull requests from the release; not built. |
| Accept detection, and stop the cancellation gap | No — but detection then never misses | `cancel-in-progress` limited to pull requests, so every push run on `main` finishes; runner minutes on superseded pushes to `main`, which are merges and rare | Recommended. Recording and tagging here happen minutes apart (#78 to `v2.0.0`: four), so the window is small and always reported once the entry lands. |

Recommendation: the last row, revisited if GitHub extends merge queues to user-owned repositories.
Nothing was changed; the cancellation change is the other open question the last handoff left, and
was left as one.

**The new dependency** — `changelog-sections.mjs` imported `nextPageUrl` and `REST_PAGE` from
`copilot-round.mjs`, and the `changelog` job installs nothing, so a package import anywhere in that
graph would have turned `verify` red on every pull request. #101 does two things: the reads the
three checks share now live in `scripts/github-api.mjs`, so the changelog check imports nothing from
the Copilot gate; and `tests/workflows/script-imports.test.ts` reads every job that runs a script
without `npm ci` from the workflows and holds each import reachable from it to Node's built-ins and
files under `scripts/`. Shown to fail: `import "yaml"` in `scripts/is-main.mjs` names the workflow,
the job and the import.

**The platform floor and #58/#64** — this pull request adds one paragraph after "The ruleset stays":
asking closes the non-default-base hole and not the Dependabot one, since #63 the mutation says
whether the request recorded, and since #64 the check waits for a person's review instead, so on a
Dependabot pull request the floor beneath the ruleset is a person. The README's quotation of the
common-path sentence is untouched, and `tests/workflows/copilot-ruleset.test.ts` holds the new
sentence beside the README's Dependabot bullet.

**The fork case** — still expected, not measured, and now the README says why and what would
measure it: GitHub's documentation gives a `pull_request` run from a public fork a read-only token,
#33 predates the check, and the measurement takes a pull request from a second account's fork, since
an owner cannot fork their own repository. It names the three things to read off that run. No fork
pull request was manufactured: opening one needs an account this session does not have, and it
would sit behind the first-time-contributor hold until approved.

## The review of `v2.0.0..main`

A background reviewer read the eight merges for coherence, stability and consolidation, with the
verify recipe as its baseline. Its findings, and what became of each:

1. **A duplicate heading in the base failed every pull request, the fix included.** Confirmed by
   reading; the precondition is a race the check documents. Fixed in #101 with tests, including one
   that an unrelated change over a doubled base passes end to end. Shown to fail: refusing base
   duplicates again fails 3 of 73.
2. **The gate map claimed the suite reads a value it read in one of three places.** Fixed here:
   `tests/portulan/gate-policy.test.ts` now reads the platform-floor row and the paragraph too.
3. **A test name promised the push trigger it never asserted.** Fixed in #101: `push.branches` is
   held to `["main"]`.
4. **The top-level-comment path is measured on Copilot's comments only.** Not changed: `isTopLevel`
   refuses any present `in_reply_to_id`, a person's thread-starting comment has never been seen here,
   and changing a required check on a guess is what this repository refuses to do. The changelog
   entry now says "a comment that starts a thread" and that the shape is unmeasured for people.
5. **"The 2026-09-15 handoff" named four files.** Fixed in #101; `verify.yml` names the file. The
   same pass stopped `verify.yml` and `CLAUDE.md` attributing the stale-check window to `strict`
   alone.

Consolidation done: one GitHub reader for three scripts, `isMain` imported rather than copied in
`release-notes.mjs` (#100) and `check-npmrc.mjs` (#101), the two real-server fetch measurements and
the `nextPageUrl` tests moved beside the reader they measure, one `listen` helper instead of two.
Consolidation named and **not** done, because each is the maintainer's call:

- The reply-is-not-a-review rule is stated in six places, the #77/#78 misfiling story in six, and the
  `strict`-off rationale in five, with no contradiction among them today. Handoffs are records and
  stay; the YAML comments could point at the script headers instead of repeating them.
- `[Unreleased]` — 2.1.0's section once #100 merges — is nine `### Internal` entries of one to three
  paragraphs each, about CI internals, partly copied from YAML comments and handoffs. One line per
  entry with its pull request number would serve a consumer, who reads the release notes this file
  now opens, and would stop the copies drifting. The reasoning lives in the script headers and here.
- `fetchStub` exists in both `changelog-sections.test.ts` and `copilot-round.test.ts`, in two shapes
  (a queue and a route table); a shared helper would fit `tests/helpers/`.

The reviewer's baseline run also found the environment fault #101 fixes: run from the main tree,
Vitest collected the six stale worktrees under `.claude/worktrees/`, 263 files ran, one older copy
of `copilot-ruleset.test.ts` failed against the current README, and eight copies of
`workflow.test.ts` racing on `package-lock.json` left it dirty in the main tree. It was restored
with `git checkout -- package-lock.json` before anything else was done there.

## Found in passing *(not fixed here)*

- Five worktrees under `.claude/worktrees/` predate this session, each on a detached head from
  August or early September; nothing here deleted them. `git worktree list` names them. The
  sixth present during the review's run was this session's own, for #100.
- The main tree's `node_modules/` lacks `@sleepy_panda_srl/portulan`, so `npx portulan compile
  --check` there falls through to the registry and fails with a 404 on a package named `portulan`.
  `npm ci` fixes it; every worktree here had it after `npm ci`.
- `readPages` stops after a first page that is not a list and refuses a non-list page after a list
  one, where the old `api` followed a resource's `Link` and merged whatever came; and
  `check-freshness.mjs` reports a failed read as `GET compare/… -> status`. Neither reaches a
  measured endpoint.

## Open questions *(human-owned)*

- Which row of the stale-base table to take. The recommendation is the last; the first needs a
  settings page read first.
- Whether to edit the v2.0.0 GitHub release's notes to open with its section, which #96 asked for
  and #100 delivers only from 2.1.0 on.
- Whether to shorten the changelog entries to one line each before 2.1.0's release notes carry them.
- Whether to measure the fork case, which takes a second account.
- The date in `## [2.1.0] - 2026-09-15`, if the release runs later.

**Next action.** Merge #100, #101 and this pull request; then the release, dry run first.

**Recoverability.** Nothing partial: every change is on its branch and in its pull request, and no
tag, release or publish was touched. The three worktrees this session made —
`feat-changelog-in-the-package`, `ci-one-github-reader`, `docs-the-floor` — can be removed with
`git worktree remove` once their branches merge.
