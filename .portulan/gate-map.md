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
| **Gated** | merge · run **Release** with `mode: publish` · push a tag · `npm publish` by hand · bare `--force` · branch delete · change branch protection |
| **Prohibited** | — |

**Publishing is Gated, and the tag with it.** The release workflow pushes the tag itself, after the
registry confirms; a human pushing one by hand routes around the ordering that stops a tag outliving
a failed publish.

**`npm publish` from a laptop is Gated, not Prohibited** — and the distinction is deliberate. It
produces a release with **no provenance attestation, permanently**: attestations attach at publish
time and cannot be added afterwards, which is why 1.3.0 has none and never will. That is a real cost
and the reason it needs approval. But if the OIDC pipeline is broken and a security fix has to ship,
it is the right call, and Prohibited compiles to deny — a tier nobody can approve is a tier nobody
can use in an emergency. An earlier draft of this table put it in Prohibited, which conflated
*dangerous* with *forbidden*, the failure `autonomy.md` names directly.

**No row is Prohibited here.** Nothing in this repository is an action that no approval could make
acceptable. An empty row is the honest answer; reaching for the tier because an action is merely
severe is how the tier stops meaning anything.

## The platform floor

| Setting | Value |
|---|---|
| Required status checks | `verify`, `copilot-reviewed`, `branch-freshness`, `analyze` |
| Branch protection | `main` — pull request required, no force-push, no deletion, `enforce_admins`, conversation resolution required, **not** strict |
| Required approvals | 0 — GitHub forbids self-approval, and any higher number deadlocks a sole maintainer |

The `copilot-reviewed` check and the `copilot auto-review on pull requests` ruleset are a pair: the
check waits for a round, the ruleset is what requests one. The payload is kept at
`.github/rulesets/copilot-auto-review.json` so the dependency is reviewable rather than remembered.

`verify` is an aggregate job in `.github/workflows/verify.yml` that depends on the test matrix and the
audit. It exists so branch protection has one stable context to require: matrix job names change
whenever the matrix does, and a required check naming a job that no longer reports blocks every
merge. Its job id and its `name:` are both `verify` so the reported context and the declared one
cannot drift.

**A rebase invalidates the verdict that preceded it**, and that rule is now a check rather than a
habit. `copilot-reviewed` matches every round against the pull request's *current* head, so a
verdict that predates the head cannot satisfy the gate — the re-request happens because the check is
still waiting, not because somebody remembered.
_(Provenance: `form=link` `href=https://github.com/marius-cetanas/macos-mail-mcp/pull/25` — merged
2026-08-05 on a verdict predating its head. Nothing rode in on it; the defect was the process. It
recurred on #37, which carried a round on a superseded head; the check refused it, which is the
first time this rule caught something instead of describing it.)_

**`strict` is off, deliberately.** It forced a rebase whenever `main` moved, and with a review round
gating the merge every unrelated commit to `main` then cost a full round on a branch whose contents
had not changed. `branch-freshness` replaces it with a bound that has a number in it: drift is
allowed up to `DEFAULT_LIMIT` commits (5), which the tests pin.

**Retire when:** this repository compiles a `gates.json`, at which point the compiled artifact is the
authority and this table becomes its rationale rather than its statement.
