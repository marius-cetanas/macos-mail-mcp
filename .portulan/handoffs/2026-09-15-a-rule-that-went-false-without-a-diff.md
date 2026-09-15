# Handoff — a rule that went false without a diff

**State, dated 2026-09-15, when the pull request was opened.** Branch
`claude/affectionate-almeida-876dbf`, cut from `main` at `c02b598` (#81) — a fetch first confirmed
that was `origin/main` — pushed and opened as a pull request titled `docs(portulan): the definition
of done no longer says strict forces a rebase`. The verify recipe at `b5c42cb`, the head before this
file was added: exit 0, **666 passed across 32 files** with none skipped, 100% statements (263/263),
branches (100/100), functions (64/64) and lines (262/262) on `src/`, 0 vulnerabilities;
`npx portulan compile --check` GREEN. Every local run was on macOS under Node 26.8.1, so neither of
CI's Node versions, 22 and 24, was exercised here. Nothing that ships is touched.

## The defect

Condition 7 of `dod.md` gave its reason as *"After a rebase — which `strict` forces whenever `main`
moves — re-request review before merging."* `strict` is off on `main`. A reviewer found it on
2026-09-14 while closing out #81's open questions. The rule stands; only the clause goes.

## Re-measured before relying on it

- **Reproduced: `strict` is off.** `required_status_checks.strict` on `main` reads `false`, with
  `verify`, `copilot-reviewed`, `branch-freshness` and `analyze` required, and the only ruleset rule
  that applies to `main` is `copilot_code_review` — nothing turns `strict` back on elsewhere.
- **Reproduced: the clause was true when it was written.** #29 (`1aeba7a`, 2026-08-06) wrote
  condition 7, and the 2026-08-05 handoff has `main` protected with `strict`. #37 (`b401089`,
  2026-08-20) wrote *"`strict` is off, deliberately"* into the gate map and added
  `branch-freshness`, and never touched `dod.md`, whose only other change is #74's org rename in its
  provenance link. The setting changed in one file's pull request; the rule citing it was in another.
- **Did not reproduce: that the suite pins the gate map's `false`.** The brief said so, and
  `gate-map.md` says the same of itself. Measured by making the map say `strict` is on in all three
  places it says off: the full suite stayed green, 666 of 666, and the file was restored
  byte-identical. `tests/portulan/gate-policy.test.ts` checks that the map names the setting and
  carries the import warning, and reads no value. Nothing here rested on it — the live setting is
  the evidence — and it is not fixed here.

## What changed

- **Condition 7 loses the clause and gains nothing.** It reads *"After a rebase, re-request review
  before merging."* Its first sentence, that a verdict post-dates the head it judges, is unchanged.

## Decisions + why

- **No true clause in place of the false one.** The obvious candidate, `branch-freshness`'s bound of
  five commits, is already stated by the gate map and pinned by the tests. A second copy in prose
  that nothing checks is the shape that went stale here.
- **The other hits were read in context, and are true.** `gate-map.md` says `strict` *forced* a
  rebase, in explaining why it was turned off. `scripts/branch-freshness.mjs` and
  `.github/workflows/branch-freshness.yml` say what `strict: true` would do, then that it is left
  off. The 2026-08-20, 2026-08-22 and 2026-09-14 handoffs say it is off.
- **The 2026-08-05 handoff is left as written.** *"`main` is protected with `strict`"* was true on
  the date the file carries, and the repository already treats handoffs as records rather than
  statements: `tests/helpers/documents.ts` excludes them from the documents it holds to the tree. A
  correction note would be a claim of its own, and one that goes stale if `strict` ever returns.
- **No changelog entry**, as no `docs(portulan):` pull request has carried one, and nothing here
  ships.
- **Triage lane.** One clause of prose, no code, and no new claim to assert.

## Found in passing *(not fixed here)*

- **The gate map claims a check that does not exist** — measured above. The fix is an assertion
  that parses the divergence table's row and requires `false` live and `true` exported, shown
  failing against a map that says otherwise.
- **A quote the gate map no longer contains.** `scripts/branch-freshness.mjs` quotes the gate map
  as saying a rebase "creates a new head after the last review". `git log -S` shows that phrase left
  `gate-map.md` in #37, the pull request that added the script, so it was stale on arrival.

## Open questions *(human-owned)*

- Whether the documents under `.portulan/` other than the gate map should state platform settings
  at all, rather than point at its table. Condition 7 is one instance, and nothing checks for the
  next.

**Next action.** Nothing outstanding from this change but its review and merge, and merging is
Gated. The two items found in passing and the open question are the maintainer's.

**Recoverability.** Nothing partial: one commit to `dod.md` and this file, on one branch. No tag,
release, publish or branch-protection change was touched. The measurement that edited `gate-map.md`
was undone before anything was committed, confirmed with `cmp`, and the tree was clean after.
