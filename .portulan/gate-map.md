# Gate map — macos-mail-mcp

**type:** rule
**scope:** repository — `marius-cetanas/macos-mail-mcp`
**provenance:** `form=link` `href=https://github.com/sleepy-panda-works/portulan/blob/main/core/operating/autonomy.md`

Which actions sit in which autonomy tier for this repository. The tier vocabulary is the engine's
(`core/operating/autonomy.md`); which concrete action lands in which tier is this workspace's answer,
which is the split the cascade exists to keep.

| Tier | Actions |
|---|---|
| **Auto** | read anything · run the verify recipe · push a working branch · open or update a draft |
| **Propose** | open a pull request · request a review · reply to review feedback |
| **Gated** | merge · run **Release** with `mode: publish` · push a tag · bare `--force` · branch delete · change branch protection |
| **Prohibited** | publish from a laptop while the OIDC pipeline works — it produces a release without provenance, permanently |

**Publishing is Gated, and the tag with it.** The release workflow pushes the tag itself, after the
registry confirms; a human pushing one by hand routes around the ordering that stops a tag outliving
a failed publish. The one Prohibited row is narrow on purpose: `npm publish` from a laptop *works*,
which is exactly why it needs saying. Version 1.3.0 was published that way and has no provenance
attestation — attestations attach at publish time and cannot be added afterwards.

## The platform floor

| | |
|---|---|
| Required status check | `ci-ok` |
| Branch protection | `main` — pull request required, no force-push, no deletion, `enforce_admins`, strict (branch must be up to date) |
| Required approvals | 0 — GitHub forbids self-approval, and any higher number deadlocks a sole maintainer |

`ci-ok` is an aggregate job in `.github/workflows/ci.yml` that depends on the test matrix and the
audit. It exists so branch protection has one stable context to require: matrix job names change
whenever the matrix does, and a required check naming a job that no longer reports blocks every
merge. Its job id and its `name:` are both `ci-ok` so the reported context and the declared one
cannot drift.

**A rebase invalidates the verdict that preceded it.** `strict` forces a rebase whenever `main`
moves, which creates a new head *after* the last review — so a verdict that was valid stops being
so through no change the author made. Re-request review after any rebase, before merging.
_(Provenance: `form=link` `href=https://github.com/marius-cetanas/macos-mail-mcp/pull/25` — merged
2026-08-05 on a verdict predating its head. Nothing rode in on it; the defect was the process.)_

**Retire when:** this repository compiles a `gates.json`, at which point the compiled artifact is the
authority and this table becomes its rationale rather than its statement.
