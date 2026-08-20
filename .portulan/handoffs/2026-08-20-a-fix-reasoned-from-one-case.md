# Handoff — a fix reasoned from one case, three times, and the gate that could not be asked for

**State.** `macos-mail-mcp` at **1.3.2** on npm, published over OIDC with a provenance attestation.
Verified against the tag rather than the publish log: the tarball npm serves carries a handler
byte-identical to `v1.3.2` (`3405b2a0…`), and running that handler escapes the reported input
correctly. `main` green — 477 tests across 25 files, 100% statements/branches/functions/lines on
`src/`, 0 vulnerabilities. Zero open pull requests. Three issues open: #42, #44, and this repository
now has a review gate that works.

Six pull requests merged or closed this session: #36 (dependency sweep), #37 (CI hardening), #40
(AppleScript test harness), #41 (the escaping fix), #43 (changelog), plus #33 from an outside
contributor. #30, #34 and #35 closed as superseded.

## What shipped, and why 1.3.2 exists

`escapeForJson` threw `-1700` on any subject or sender containing a decomposed accent, a
variation-selector emoji or a ZWJ sequence. Because that handler is applied to every subject and
sender across 21 scripts, **one such message made `list_messages` fail entirely** — not just that
message. It was found by [@dessyd](https://github.com/dessyd) from outside the project (#33), which
is the part worth sitting with: nothing here could have caught it, because no test in this repository
had ever executed a line of AppleScript.

That gap is now closed as far as it can be. #40 added the first tests that run handlers through
`osascript` for real. They **run only on macOS and are skipped everywhere else, including CI** —
there is no `osascript` on the Linux runner, so these assertions never run in the merge gate. The
100% coverage figure covers `src/**/*.ts` and has never covered the AppleScript layer; `CLAUDE.md`
now says so next to the number.

## The defect that appeared three times in one handler

Worth recording as a pattern rather than three incidents, because the same shape produced all three
and none of them was carelessness.

- **#33** reasoned *"a real control character is always a single code point"*. True of the case
  measured; false in general — AppleScript clusters a control with a following combining mark into
  one character, so `id of` returns `{1, 769}` and the guard let a raw control through.
- **The first fix here** reasoned *"the text-item-delimiter phases are cluster-blind"*. Measured on
  combining marks, and **false for zero-width joiners**, where the phase splits the cluster and
  orphans the joiner. That regressed two inputs `main` had handled correctly — `"`+ZWJ and `\`+ZWJ
  went from valid JSON to invalid.
- **The supervisor's own suggested repair**, had it been applied as written, would have escaped
  quote and backslash wherever the loop met them, double-escaping every quoted string in the
  repository. It was measured wrong before being written, and refused.

Each generalised from one measured behaviour to a category, by someone who had genuinely measured.
**A measurement of one input reads like a measurement of the class, and it is not.**

The fix that survived is smaller than any of the arguments it replaced: `id of theString` returns the
string's code points flat — no clustering, no collation, no matching — so every code point is judged
once and no earlier phase can have altered it. The five delimiter phases are deleted. `"`+ZWNJ, which
was broken on `main` *and* on this branch's earlier heads, came out correct without being aimed at,
which is the sign the shape was wrong rather than the cases hard.

## The CI gate, and the hole in it

#37 ported Portulan's review gate: `copilot-reviewed` waits for a Copilot round on the exact head
being merged, so a verdict cannot predate the tree it judges — the rule this repository already had
in prose after PR #25, now a check. Also `branch-freshness` (drift bounded at five commits, with
`strict` off, because `strict` forced a rebase whenever `main` moved and each rebase costs a review
round), `pr-intake` (a held fork PR says so instead of showing nothing), and `ci-ok` renamed
`verify`.

**It caught something on its first PR**: #37 carried a Copilot round on a superseded head, and the
check refused it. That is the first time this rule caught a case rather than describing one.

**And it has a hole, filed as #44.** A pull request opened against a non-default branch never draws
a round, so the check can never go green. Measured on #41: zero reviews across three heads, three
runs each burning their budget. Retargeting does not repair it, rebasing does not, and the API
returns 200 while adding nobody. Only a maintainer clicking *Request Copilot review* worked. Stacked
pull requests are the natural shape when a fix needs its own test harness — exactly #40 and #41 — so
this will recur.

## For the next session

- **Verify a release against the tag, never the publish log.** A version number incrementing proves
  nothing about the artifact. Pull the tarball, compare the shasum to the tag, then run the thing.
- **`CHANGELOG.md` can only be written before the tag exists.** The release workflow never commits to
  `main`, so a missed window is permanent — 1.3.1 shipped with no entry and had to be backfilled from
  its own commits this session.
- **#42 is open and real**: `escapeForJson` is quadratic. The rewrite made it ~1.8× faster (20,000
  characters in 5.69s against 10.18s) and did not change the complexity. `DEFAULT_TIMEOUT` is 30s,
  so a body somewhere near 60,000 characters still times out.
- **Copilot and the fresh-context supervisor caught disjoint classes here, on ordinary source code.**
  Copilot returned two clean rounds on the diff the supervisor graded REQUEST-CHANGES for the ZWJ
  regression. Copilot could not have found it — nothing in the diff reads wrong. The supervisor
  found it by reproducing the verify recipe and probing inputs no test covered.
