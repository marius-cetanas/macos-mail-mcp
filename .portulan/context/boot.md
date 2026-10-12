---
tier: always
---

# Portulan boot card

> Compiled by `portulan compile` from `.portulan/context/boot.md`. Each section names its file, and an
> import is here in full.

## Reading and the cache: Portulan's `core/operating/context.md`

<!-- engine: operating/context.md#every-request-pays-for-what-the-session-has-read -->

## Identity: `.portulan/identity.md`

@../identity.md

## Principles: `.portulan/principles.md`

@../principles.md

## Gates: `.portulan/gates.json`

<!-- gates: ../gates.json -->

**Open `.portulan/gate-map.md` before an act a gate names**: it holds each gate's conditions, and where no layer enforces one, so you hold it yourself.

## Done: `.portulan/dod.md`

On core's floor: a green verify, and nothing reported done that you could not explain.

@../dod.md

## Records

Close a change with `git add <new files> && node <plugin root>/cli/finish.mjs -m "<subject>" -m "<why>"` after writing its changelog entry, a one-bullet file `changes/<slug>.<section>.md`: it commits and pushes only when every verify recipe passes.
A session ending with work not committed and pushed leaves a dated handoff in `.portulan/handoffs/`.

## What is enforced here, and what is not

- **The verify recipes are real**: `.portulan/workspace.json` declares them, and a session's end runs
  the default; each exits 0 green, 1 red or 2 could not run, never a pass.
- **Gates are enforced where `portulan compile` has written `.claude/settings.json`**; without it, you
  hold every rule yourself.
