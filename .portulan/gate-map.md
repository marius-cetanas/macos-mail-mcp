# Gate map — macos-mail-mcp

**type:** rule
**scope:** repository — `marius-cetanas/macos-mail-mcp`
**provenance:** `form=link` `href=https://github.com/sleepy-panda-works/portulan/blob/main/core/operating/autonomy.md`

Which actions sit in which autonomy tier for this repository. The tier vocabulary is the engine's
(`core/operating/autonomy.md`); which concrete action lands in which tier is this workspace's answer,
which is the split the cascade exists to keep.

| Tier | Actions, each naming the policy rule that states it |
|---|---|
| **Auto** | read anything (`read-anything-in-the-repository`) · edit on a working branch (`edit-on-a-working-branch`) · commit to one (`commit-to-a-working-branch`) · push one (`push-a-working-branch`) · open or update a draft (`open-or-update-a-draft`) · run the verify recipe (`run-the-verify-recipe`) |
| **Propose** | open a pull request (`open-a-pull-request`) · request a review (`request-a-review`) · reply to review feedback (`reply-to-review-feedback`) |
| **Gated** | merge (`merge-a-pull-request`) · run **Release** with `mode: publish` (`publish-a-release`) · push a tag (`push-a-tag`) · `npm publish` by hand (`publish-to-npm-by-hand`) · bare `--force` (`force-push-without-a-lease`) · branch delete (`delete-a-remote-branch`) · change branch protection (`change-branch-protection`) |
| **Prohibited** | — |

**Two rows in Auto are new words for an old rule, not a widening.** `edit-on-a-working-branch` and
`commit-to-a-working-branch` were implied by *push a working branch* and never written down — you
cannot push what you have not committed. Naming them was forced by `gates.json`, which has to state a
tier for an action or have none, and an unstated Auto reads identically to an oversight.

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

## The policy, and what compiles it

This map is the argument; [`gates.json`](gates.json) beside it is the policy. Two files state one
thing, which is a real defect and is contained rather than denied: **every rule carries an `id`, this
map cites every one of them in a code span, and where the two disagree the policy wins** — it is the
one that compiles. Sixteen rules, sixteen citations in the table above.

`portulan compile` turns the Gated rows into host enforcement. Six of them reach a matcher and become
`ask` permissions; the rest are reported rather than emitted, and the reporting is the point:

- **`change-branch-protection` compiles to nothing, and is declared anyway.** There is no matchable
  prefix — it is `gh api` against a rulesets endpoint, or the web UI. `gh api` is also how a read-only
  query is made, so gating that prefix would gate reads and train the approver to click through on
  sight, which buys less than the honest gap costs. It stays a habit, and it is visible as one.
- **`auto` and `propose` compile to nothing by design.** The compiler emits restriction only. Propose
  is enforced by the platform floor below; Auto is unattended by policy, not by permission.

**The floor is declared, and the export diverges from it in exactly one parameter.** `floor` in the
policy states this repository's live platform floor, and it was written from the live settings rather
than from memory — `refs/heads/main`, the four required checks with their app pins, zero required
approving reviews, conversation resolution on. [`compile/github-ruleset.json`](compile/github-ruleset.json)
is generated from it and matches the live configuration on every parameter but one:

| | live on `main` | generated export |
|---|---|---|
| `strict_required_status_checks_policy` | **`false`** | **`true`** |

The compiler hard-codes `true` and deliberately refuses to make it declarable, on the reasoning that a
declarable `strict` would let a policy edit undo a ruling with no diff anyone would read as one. That
is sound upstream and it is the opposite of the ruling recorded below, where `strict` was turned off
because it forced a rebase whenever `main` moved and every rebase costs a review round.

**So the export must not be imported as-is.** Importing it would silently re-enable `strict` and
reinstate the cost `branch-freshness` was built to remove. The divergence is pinned by
`tests/portulan/gate-policy.test.ts` rather than left to this paragraph: if the exported artifact ever
stops saying `true`, or this map ever stops saying the live floor is `false`, the suite fails. A
contradiction that is measured every run is a different thing from one nobody noticed.

Two further gaps the export carries, both reported by the compiler and neither hidden here:
`non_fast_forward` is **stricter** than the policy — it blocks every force-push including
`git push --force-with-lease`, which this map classifies Auto, because a ref rule cannot read a
command's flags. And `merge-a-pull-request` compiles to nothing on this backend: with zero required
approving reviews the floor constrains a merge but does not require a human's yes, which is what Gated
means. That gate lives in the Claude Code artifact and in habit, not in the ruleset.

**The Claude Code artifact is not committed.** The hook command is an absolute path into the
maintainer's plugin cache, pinned to a plugin version, because the runner does not live under this
project. On any other machine that path does not resolve, and **a missing hook fails open** — so
committing it would ship a file that looks like enforcement and is not. `.claude/settings.json` is
git-ignored and regenerated with `portulan compile`. The ruleset artifact beside it has no such
problem and is committed. Installing the CLI as a dev dependency would make the hook path
project-relative and that artifact portable too; that is a dependency decision the maintainer has not
taken.

**Retire when:** the compiled artifact becomes portable and committable, at which point it is the
authority and this table becomes its rationale rather than its statement. Until then the policy
compiles on one machine and this map is what every other reader has.

## The platform floor

| Setting | Value |
|---|---|
| Required status checks | `verify`, `copilot-reviewed`, `branch-freshness`, `analyze` |
| Branch protection | `main` — pull request required, no force-push, no deletion, `enforce_admins`, conversation resolution required, **not** strict |
| Required approvals | 0 — GitHub forbids self-approval, and any higher number deadlocks a sole maintainer |

**`copilot-reviewed` is the one required check with no app pin.** Measured live on 2026-08-22:
`verify`, `branch-freshness` and `analyze` each carry `app_id 15368` (GitHub Actions), and
`copilot-reviewed` carries `null`. A context with no pin is satisfiable by **any** app reporting that
name, so the check that exists to stop a stale verdict is itself the least constrained of the four.
The policy declares it unpinned because that is what is live, not because it should stay that way;
pinning it is a branch-protection change, which is Gated (`change-branch-protection`).

The `copilot-reviewed` check and the `copilot auto-review on pull requests` ruleset were a pair: the
check waited for a round, the ruleset requested one. The payload is kept at
`.github/rulesets/copilot-auto-review.json` so the dependency is reviewable rather than remembered.

**The check no longer depends on that pairing, because the ruleset does not cover every pull request
it gates (#44).** Two holes were measured, with different causes. The ruleset is conditioned on
`~DEFAULT_BRANCH`, so a pull request opened against any other branch never draws a round — #41 burned
three full budgets that way. And a **bot author** draws none either: #47 was opened by Dependabot
against `main`, condition satisfied and not a draft, and got nothing in 16 hours, where #43, #45, #46
and #48 were each requested one second after opening. Across this repository's history, ten
Dependabot pull requests have drawn zero automatic rounds. Both holes present identically — a red
required check that no push can turn green, reading as though the change were at fault.

So the check now requests the round itself when none is pending, which is why its workflow holds
`pull-requests: write`. That is enforcement moving from a ruleset that decides which pull requests to
notice, to a check that asks for what it is waiting on. The ruleset stays: it is faster on the common
path, and the check asking is the floor beneath it rather than a replacement.

**Requesting it takes GraphQL, and the REST spelling fails silently.**
`POST /pulls/{n}/requested_reviewers` with `copilot-pull-request-reviewer[bot]` returns **201 Created
and adds nobody** — measured on #48 on 2026-08-22's successor, 2026-08-26. Copilot is a **Bot**, and
that endpoint takes Users and Teams; a Bot matches neither, so it is accepted and dropped. The
working call is `requestReviews(input: {botIds: […], union: true})`. A success status for an action
that did not happen is exactly the failure *an error message that misleads costs more than one that
is missing* names, so it is recorded in `scripts/copilot-round.mjs` beside the constant rather than
left to be rediscovered.

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

**Retire when:** superseded by the retirement condition in *The policy, and what compiles it* above.
The original condition — *this repository compiles a `gates.json`* — was met on 2026-08-22 and was not
the finish line it read as: the policy compiles, and the artifact it produces is machine-local.
