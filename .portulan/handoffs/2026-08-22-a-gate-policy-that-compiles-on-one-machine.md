# Handoff — a gate policy that compiles, an artifact that cannot be committed

**State.** The workspace was already GREEN and already curated; what it lacked was the half a machine
reads. `.portulan/gates.json` now exists — 16 rules and a floor, spec 2.2 — and `portulan compile`
**exits 0**, emitting six `ask` permissions, two hooks, and an importable GitHub ruleset. `doctor` GREEN, agent legibility **2 of 5 → 3 of 5**.
Verify green: **491 tests across 26 files** (477 + 14 new), 100% statements/branches/functions/lines on
`src/`, 0 vulnerabilities. Committed to a working branch and opened as a pull request.

## What was added, and the one thing that was deliberately not

Six Gated rows now compile to real matchers: `gh pr merge`, `gh workflow run`, `git push --tags`,
`npm publish`, `git push --force`, `git push --delete`. Two rules are declared and compile to nothing,
which is reported rather than hidden — `change-branch-protection` has no matchable prefix (`gh api` is
also how read-only queries are made, so gating it would train the approver to click through), and the
`auto`/`propose` tiers are not what a restriction-only compiler emits.

**The floor is declared, and it was written from the live settings rather than from memory.** Fetched
on 2026-08-22: `strict false`, four required checks, zero required approving reviews, conversation
resolution on, `enforce_admins` on, force-push and deletion off. The gate map's account of the floor
was accurate in every particular. The export
[`compile/github-ruleset.json`](../compile/github-ruleset.json) matches it on every parameter but one —
the compiler hard-codes `strict_required_status_checks_policy: true` and refuses to make it
declarable, which is the exact inverse of this repository's ruling. **The export must therefore not be
imported as-is**, and that divergence is pinned by a test rather than by a paragraph: flip the exported
value and the suite goes red.

**One live finding worth acting on.** `copilot-reviewed` is the only required check with no app pin —
`verify`, `branch-freshness` and `analyze` all carry `app_id 15368`, it carries `null`. A context with
no pin is satisfiable by any app reporting that name, so the check built to stop a stale verdict is the
least constrained of the four. The policy declares it as it is, not as it should be; pinning it is a
branch-protection change and therefore Gated.

## Three findings, one of them upstream

- **`portulan new gate-policy` emits a scaffold that `portulan compile` refuses.** Measured: the
  scaffold writes `"portulan": { "gates": "1.0" }`, the compiler validates `portulan.spec` against
  `{2.1, 2.2}`, so a freshly scaffolded policy dies on `gate-policy spec undefined` (exit 2). The
  scaffold's `floor` shape disagrees too — `require_pull_request` / `block_force_push` against the
  compiler's `reviews` / `resolve_conversations`. Worth filing against portulan 0.1.2. The policy here
  was written against the compiler's actual contract, not the scaffold.
- **The compiled artifact is pinned to one machine and is therefore not committed.** The runner is not
  under this project, so the hook command is an absolute path into the plugin cache including the
  version — `…/portulan/0.1.2/cli/gate.mjs`. On any other machine that path does not resolve, and **a
  missing hook fails open**: it would look like enforcement and be nothing. `.claude/settings.json` is
  git-ignored and regenerated with `portulan compile`. The consequence to hold onto is that **this
  repository's gates are enforced on one laptop**, and every other reader has the prose.
- **The prose/policy duplication is now a test, not a promise.** The Workspace Definition requires
  membership to hold both ways between `gates.json` and `gate-map.md`. That was prose; it is now
  `tests/portulan/gate-policy.test.ts`, which runs in CI. It was verified by mutation in both
  directions — a dropped citation and a phantom one each turn it red — because a check that has never
  failed has not been shown to work.

## For the next session

- **The pinning decision is the maintainer's and is still open.** `npm i -D @sleepy_panda_srl/portulan`
  would make the hook path `${CLAUDE_PROJECT_DIR}`-relative, which makes the artifact portable,
  committable, reviewable in a diff, and drift-checkable in CI. The cost is a dev dependency and its
  audit surface on a published package. Until that is taken, do not commit `.claude/settings.json`.
- **`compile --check` cannot go in the CI recipe** while the artifact is machine-specific: CI would
  recompile with a different runner path and report drift that is not drift. It is a local check.
- **Re-run `portulan compile` after any plugin upgrade.** The version is baked into the hook path, so
  an upgrade silently unhooks the gate. This is the failure the compiler itself warns about, and it
  fails open.
- #42 (quadratic `escapeForJson`) and #44 (no Copilot round on a non-default-branch PR) remain open and
  untouched by this session.
