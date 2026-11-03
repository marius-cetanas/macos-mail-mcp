# Gate map — macos-mail-mcp

**type:** rule
**scope:** repository — `marius-cetanas/macos-mail-mcp`
**provenance:** `form=link` `href=https://github.com/sleepy-panda-srl/portulan/blob/main/core/operating/autonomy.md`

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
than from memory — `refs/heads/main`, the three required checks with their app pins, zero required
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

**The Claude Code artifact is committed, and drift-checked in CI.** It was not, and the reason was
real: the hook command was an absolute path into one maintainer's plugin cache, pinned to a plugin
version, because the runner did not live under this project. On any other machine that path does not
resolve, and **a missing hook fails open** — so committing it would have shipped a file that looked
like enforcement and was not.

`@sleepy_panda_srl/portulan` is now a dev dependency, which makes the hook command
`${CLAUDE_PROJECT_DIR}/node_modules/@sleepy_panda_srl/portulan/cli/gate.mjs` — a literal string,
identical on every machine, with no version baked into the path. Three consequences, and the third
is the one that matters:

- `.claude/settings.json` is in the tree, so a change to what this repository gates is **reviewable
  in a diff** rather than invisible.
- `npm ci` puts the runner where the hook looks for it, so a fresh clone is gated rather than
  failing open.
- **`portulan compile --check` runs in CI**, in the `gate-policy` job. That could not work while the
  artifact was machine-specific — CI would recompile with a different runner path and report drift
  that was not drift. Now it compares like with like, and an edit to `gates.json` that was never
  recompiled turns the merge gate red. The job joins `verify`'s dependencies rather than becoming a
  required check of its own, so the floor covers it **without a branch-protection change**.

`tests/portulan/gate-policy.test.ts` pins the conditions that made this possible — the
`${CLAUDE_PROJECT_DIR}` path, the absence of any absolute path or pinned version, the dev
dependency, and the CI check. If any regresses, the artifact is machine-specific again and
committing it is once more the wrong thing.

**One line in the generated artifact is wrong here, and cannot be fixed here.** Its `$portulan.warning`
reads *"Edit `.portulan/gates.json` and recompile; `verify/compile.sh` fails on drift."* There is no
`verify/compile.sh` in this repository — that is Portulan's own verify recipe, hard-coded into every
adopter's artifact. **Drift is enforced here by the `gate-policy` job**, which runs
`npx portulan compile --check`. The text cannot be corrected locally: it is generated, and
hand-editing it makes `compile --check` report drift (measured, exit 1), which would trade a
misleading sentence for a red merge gate. Recorded here so the repository's own prose corrects it;
the fix belongs upstream. _(Raised by Copilot on
[#52](https://github.com/marius-cetanas/macos-mail-mcp/pull/52).)_

**Retire when:** superseded. This table is now the artifact's rationale rather than its statement —
the artifact is the authority, it is in the tree, and CI holds the two in agreement. What remains
prose is only what compiles to nothing, which the two bullets above already name.

## The platform floor

| Setting | Value |
|---|---|
| Required status checks | `verify`, `branch-freshness`, `analyze` |
| Branch protection | `main` — pull request required, no force-push, no deletion, `enforce_admins`, conversation resolution required, **not** strict |
| Required approvals | 0 — GitHub forbids self-approval, and any higher number deadlocks a sole maintainer |

All three checks carry `app_id 15368` (GitHub Actions). Automated review is not part of the
required-check floor, and the repository ships no automatic review ruleset payload or workflow.
The disabled GitHub review ruleset is retained in settings so the change is reversible; it requests
no reviews.

`verify` is an aggregate job in `.github/workflows/verify.yml` that depends on the test matrix, the
audit, `gate-policy` and `changelog`. It exists so branch protection has one stable context to
require: matrix job names change whenever the matrix does, and a required check naming a job that no
longer reports blocks every merge. Its job id and its `name:` are both `verify` so the reported
context and the declared one cannot drift.

**A rebase invalidates the verdict that preceded it. Review freshness is human-held.** Before a
merge, the maintainer checks that the review verdict post-dates the current head and requests a new
review after a rebase or another change to that head. CI does not enforce review freshness. Merging
still requires explicit approval under `merge-a-pull-request`.

**`strict` is off, deliberately.** It would force a rebase whenever `main` moves.
`branch-freshness` instead allows drift up to `DEFAULT_LIMIT` commits (5), which the tests pin.

**Retire when:** the platform floor is superseded or the compiler can export this floor without the
strict-check divergence documented above.
