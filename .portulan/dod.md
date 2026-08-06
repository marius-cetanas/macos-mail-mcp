# Definition of done — macos-mail-mcp

**type:** rule
**scope:** repository — `marius-cetanas/macos-mail-mcp`
**provenance:** `form=link` `href=https://github.com/sleepy-panda-works/portulan/blob/main/core/operating/verification.md`

A change is done when every condition holds. Numbered so a review can cite one.

1. The default verify recipe is **green**, and the run is recorded rather than remembered.
2. Coverage of `src/` is **100%** — statements, branches, functions and lines. `vitest.config.ts`
   enforces it and CI runs `test:coverage`, not `test`, so this is machinery rather than intent.
   `scripts/` is outside the threshold; its tests are still real tests in the same suite.
3. Nothing claims behaviour that does not exist, and **where the claim is machine-checkable, the
   check ships in the same change** — an assertion that fails, not a better sentence.
4. Nothing in this repository states a fact about the tree that the tree contradicts. Documentation
   drifting from the code it describes is the single most frequent defect found in review here.
5. **The tool handler is covered, not only the `handleXxx` beneath it.** Registering a tool adds a
   `catch` that turns a throw into an MCP `isError` result, and that path is reachable only through
   the registered handler. Use `captureTools()` from `tests/helpers/capture-tools.ts`.
6. Any Gated action in the change was surfaced and approved **before** it was taken.
7. A verdict cited as approval **post-dates the head it judges**. After a rebase — which `strict`
   forces whenever `main` moves — re-request review before merging.
8. Shell and Node embedded in workflow YAML is **tested or extracted**. Every review finding against
   the release pipeline was in embedded shell that nothing could exercise; three such blocks now
   live in `scripts/` with tests.

**Retire condition:** conditions 1 and 2 retire when a compiled Stop-gate enforces them, at which
point they stop being prose. Condition 8 retires when no workflow in `.github/` carries a `run:`
block longer than a single command.
