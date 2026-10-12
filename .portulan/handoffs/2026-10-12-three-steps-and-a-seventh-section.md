# Handoff — three steps, and a seventh section the tool does not have

**State, dated 2026-10-12 — a snapshot, not a live claim.** `main` at `c12877d` (#118, the
scheduled audit, merged by the maintainer at 09:52Z). This branch, `claude/portulan-upgrade-steps`,
carries the three form steps `portulan upgrade` listed for Portulan 0.2.0. Its pull request was
opened after this file was written, and the figures for its head are in its description. **This
session merged nothing, and no release ran.**

Asked to take the three steps, working with an Opus 5.5 agent in the worktree
`serene-hodgkin-24709a`, on macOS under Node 26.10.0, so the `osascript` tests ran. The same day's
other handoff covers the dependency sweep and the scheduled audit.

## What the upgrade refused first

`npx portulan upgrade --write .portulan` exited 2 and wrote nothing:

> CHANGELOG.md line 22: `### Internal` under Unreleased is none of added, changed, deprecated,
> removed, fixed, security, so its entries have no fragment name — rename the heading or move them,
> then upgrade

A fragment is named `<slug>.<section>.md`, and the six sections are Keep a Changelog's. This
changelog has kept a seventh, `### Internal`, in seven of its eight releases since 1.3.0. The
refusal stops the whole chain, not only the changelog step, so the other two steps could not be
taken around it.

**The maintainer's decision: internal entries are filed under Changed.** The other two offered were
to stop logging internal work, and to keep the changelog hand-kept and apply the other two steps by
hand. `### Internal` survives in the releases that carry it, and no fragment can be named for it:
`portulan index --check --changes changes` refuses one, and `gate-policy` now runs that.

## What `upgrade --write` did

With the heading renamed it applied four steps and `doctor` was GREEN:

- **`0004-changelog-fragments`** — the three entries under `[Unreleased]` became
  `changes/1-….security.md`, `changes/2-….changed.md` and `changes/3-….changed.md`, numbered in the
  changelog's order; `changes/README.md` was written; `[Unreleased]` keeps a two-line pointer.
  `portulan index --changes changes` prints them back as the changelog held them.
- **`0006-boot-card`** — `.portulan/context/boot.md` drafted from the workspace's slots,
  `slots.context` declared, and the manifest's `spec` moved from 2.7 to 2.10, the version that key
  needs. The tool also rewrote `workspace.json`'s formatting.
- **`0007-guidance-compiled`**, owed once `0006` landed — the card compiled to
  `.claude/rules/portulan/boot.md`, with `.compiled` beside it listing what `compile` owns.
- **`0010-comment-rail`** — `.portulan/verify/comments.sh` drafted with `LIMIT=296`, the tree's
  count, and declared as the `comments` recipe.

## What was changed by hand after it, and why

**The drafted recipe carried this worktree's absolute path.** Two lines, marked
`# portulan:bundle-fallback`, named
`/Users/…/.claude/worktrees/serene-hodgkin-24709a/node_modules/@sleepy_panda_srl/portulan/cli/index.mjs`.
That is the shape `.portulan/gate-map.md` records about the hook path: true on one machine, and
here not even on that one once the worktree is removed. The recipe would then exit 2, could not
run. The marker is also what the repair step `0002` reads, so on every other checkout
`upgrade --check` would have reported the step owed and `--write` would have rewritten a committed
file to that machine's path. The lines now name `node_modules/@sleepy_panda_srl/portulan/cli`,
relative to the tree's root, and carry no marker.

**The pinned copy is looked for before one on PATH.** The draft tried a `portulan` on PATH first.
This machine has one, at `/opt/homebrew/bin/portulan`, and CI has none, so the count would have
been made by whichever version each happened to hold. Both are 0.2.0 today. What counts as a line
of history is the installed version's to say, so the lockfile's copy goes first. Measured with no
`portulan` on PATH: exit 0 with the dev dependency present, which is CI's case, and exit 2 with it
moved away.

**The merge gate runs both new checks**, as two steps in `gate-policy`, which `verify` already
depends on: `npx portulan index --check --changes changes`, and `./.portulan/verify/comments.sh`.
Portulan's own README says its workflows run every verify recipe the workspace yields; here the
default recipe is the `test` and `audit` jobs and this is the other one. Without it the limit would
be passed by the next change that cites a pull request in a comment, which is this repository's
habit, and the recipe would be red for everyone after.

**`scripts/changelog-sections.mjs` named a remedy that is no longer one.** Its refusal told the
author to put the entry under `## [Unreleased]`; it now names `changes/` and `changes/README.md`.
`CLAUDE.md` and `CONTRIBUTING.md` say how an entry is written and how a release is recorded:
insert the version heading below `[Unreleased]`, paste what `portulan index --changes changes`
prints, delete the fragments and keep the README.

`tests/portulan/workspace-form.test.ts` holds what the tool does not hold by itself. Each assertion
was shown to fail first: an entry written under `[Unreleased]`; either CI step replaced; the
drafted absolute path and marker put back; PATH tried before the pinned copy; the recipe made
non-executable; `.claude/rules/` ignored; and, in `changelog-sections.test.ts`, the old remedy put
back in the message.

## What it changes for whoever works here next

- **A comment that cites a pull request, a date or a review now costs one.** The rail counts 296
  such lines, by kind 48 dates, 111 reviews and 233 references, a line being able to be more than
  one. They are in the tests, the workflows, the scripts and `src/`. A pull request that adds one fails
  `gate-policy` unless it removes another, and `LIMIT` is only lowered.
- **Every session loads more.** `doctor` puts the always tier at about 12,000 tokens, from about
  8,200: the compiled card imports the identity, the principles and the definition of done in full,
  and `CLAUDE.md` grew by the paragraphs this change needed.
- **The changelog's next section will have no `### Internal`.** Its internal entries will read
  under Changed, in the package and at the top of the release notes.

## Not done, and why

- **The reading rules in the compiled rule still say `<plugin root>`.** That section is not the
  card's: `compile` writes it from the installed Portulan's own text, so editing it here would be
  drift. `CLAUDE.md` says what the placeholder stands for in this repository.
- **`sessions.cache_lifetime` was not declared.** `upgrade` offers five-minute cache writes and
  prints the trade-off; it is a choice about how sessions here are run.
- **No section of `CLAUDE.md` was marked `<!-- portulan: on-read -->`.** `doctor` names "Releasing"
  at about 3,000 tokens as the largest; step `0009` moves a marked section out of every context.

## Open questions *(human-owned)*

- Whether every session should end with a handoff, as `CLAUDE.md` and now the card say, or only one
  that leaves work uncommitted, which is what the 0.2.0 Stop gate enforces and the card was drafted
  to say.
- Whether the release notes' commit list should go on calling `chore`, `test`, `ci` and `style`
  Internal, now that the changelog files the same work under Changed.
- Whether to mark sections of `CLAUDE.md` on-read, now that the always tier is about 12,000 tokens.
- Whether Portulan should take a workspace's own section names, which would bring `Internal` back.
- Whether the cache lifetime should be declared.

**The branch was built on #118's head and rebased once #118 merged.** The work was done on top of
`fe5f8b3`, since both changes wrote under `[Unreleased]`. #118 merged as a squash, `c12877d`, with
the tree `fe5f8b3` had, and `git rebase --onto origin/main fe5f8b3` left this branch's own commits
on it with their content unchanged. The recipe was run again on the rebased head.

**The scheduled audit has run once, by hand.** Dispatched on `main` after #118 merged, run
38232970494 checked out `c12877d`, ran the four steps and passed: `found 0 vulnerabilities`. That is
the `workflow_dispatch` half; the first run the schedule itself starts is the next 05:23 UTC.

## Amended later on 2026-10-12: Copilot's rounds on #119, answered after it merged

**#119 merged as `9e91fa2` at 10:03Z, from `7679bb6`, and what follows is not in it.** Copilot's
round on `0234d64` landed at 09:58Z and recommended changes; its round on `7679bb6` at 10:01Z asked
for a closer look at the same things. The maintainer merged at 10:03:06Z. The fix was pushed
thirteen seconds later, to a branch the merge had already deleted, so the push made the branch
again and reached no pull request. It travels in the pull request this amendment is in.

Across the two rounds Copilot raised four things. Three were right:

- **The card and `CLAUDE.md` gave two handoff rules**, both loaded into every session. The card was
  drafted to ask for a handoff when work is left uncommitted and unpushed; `CLAUDE.md` asks for one
  from every session. The first version of this file listed that as an open question and left the
  card as drafted, on the guess that a later step might look for its text. Nothing does: the two
  lines are in `draftCard`'s template in `cli/form.mjs` and nowhere else. The card now states the
  contract this repository already had. Which rule it should be is still the maintainer's, above.
- **The closing command could not be run as written.** The card named
  `<plugin root>/cli/finish.mjs`, which only a session with the plugin installed can resolve. It
  names `node_modules/@sleepy_panda_srl/portulan/cli/finish.mjs` now, and `--help` was run from
  there.
- **The changelog and the release notes name internal work differently.** `scripts/release-notes.mjs`
  groups the commit list by type and puts `chore`, `test`, `ci` and `style` under Internal. That
  grouping is of commits, not of entries, and was left alone; `CLAUDE.md` said `### Internal`
  survives only in past releases, which was true of `CHANGELOG.md` and read as though it were true
  of the notes. It says both now.

One was not, and the card keeps its wording there. The second round said `git add <new files>`
stages only new paths and leaves modified and deleted ones out of the commit. `finish.mjs` stages
those itself, with `git add -u`, and stops on an untracked path nobody staged, so naming the new
files is the whole of what the caller owes it.

`tests/portulan/workspace-form.test.ts` holds the two corrected lines, shown to fail with the draft
put back.

**A mistake of this session's own, in a shape the 2026-09-15 handoff already names.** The reply to
Copilot's thread said the fix was in `ad4e621`, and the thread was resolved, in the same command as
the push. That push printed `* [new branch]`, which was the sign that the pull request was gone,
and nothing read it before the reply was sent. The reply named a commit no pull request held, on a
thread resolved over a finding `main` still had. It was edited to name the follow-up once that
existed. A reply chained to a push reports the push that was meant.

**Next action.** Read the follow-up pull request and its Copilot round; merging it is the maintainer's.

**Recoverability.** Nothing partial: every change is on the branch. The upgrade can be read back
with `npx portulan upgrade --check .portulan`, which answers that the workspace owes nothing.
