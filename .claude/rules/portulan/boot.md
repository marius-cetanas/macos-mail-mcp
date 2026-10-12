# Portulan boot card

> Compiled by `portulan compile` from `.portulan/context/boot.md`. Each section names its file, and an
> import is here in full.

## Reading and the cache: Portulan's `core/operating/context.md`

- **Send independent tool calls in one request.**
- **Read a file once; reuse what your context holds.**
- **Open a file only when the task needs it, and one of 300 lines or more only where it does: `node <plugin root>/cli/symbols.mjs <file>` outlines it, and `<file>#<heading>` prints one section.**
- **Ask for only the output you need: a range, a count, the failures.**
- **The prompt cache lasts five minutes or an hour: a longer pause, or a fresh subagent where one could be resumed, writes the whole context again.**
- **Code should speak for itself: a comment is paid for on every read of its file, so add one only when truly needed, concise, meaningful and valuable (less is more), and keep a change's history in its commit message.**

## Identity: `.portulan/identity.md`

@../../../.portulan/identity.md

## Principles: `.portulan/principles.md`

@../../../.portulan/principles.md

## Gates: `.portulan/gates.json`

- **Auto**, unattended: `read-anything-in-the-repository`, `edit-on-a-working-branch`, `commit-to-a-working-branch`, `push-a-working-branch`, `open-or-update-a-draft`, `run-the-verify-recipe`.
- **Propose**, a human decides: `open-a-pull-request`, `request-a-review`, `reply-to-review-feedback`.
- **Gated**, a human's approval for each action, never inferred and never standing: `merge-a-pull-request`, `publish-a-release`, `push-a-tag`, `publish-to-npm-by-hand`, `force-push-without-a-lease`, `delete-a-remote-branch`, `change-branch-protection`.
- **Prohibited**, where no approval exists: none.

**Open `.portulan/gate-map.md` before an act a gate names**: it holds each gate's conditions, and where no layer enforces one, so you hold it yourself.

## Done: `.portulan/dod.md`

On core's floor: a green verify, and nothing reported done that you could not explain.

@../../../.portulan/dod.md

## Records

Close a change with `git add <new files> && node <plugin root>/cli/finish.mjs -m "<subject>" -m "<why>"` after writing its changelog entry, a one-bullet file `changes/<slug>.<section>.md`: it commits and pushes only when every verify recipe passes.
A session ending with work not committed and pushed leaves a dated handoff in `.portulan/handoffs/`.

## What is enforced here, and what is not

- **The verify recipes are real**: `.portulan/workspace.json` declares them, and a session's end runs
  the default; each exits 0 green, 1 red or 2 could not run, never a pass.
- **Gates are enforced where `portulan compile` has written `.claude/settings.json`**; without it, you
  hold every rule yourself.
