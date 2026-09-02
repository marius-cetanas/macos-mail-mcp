# Handoff — a fix that never worked where it was aimed

**State.** Three Dependabot pull requests opened and merged today: **#57** (`codeql-action` v4.37.8 →
v4.37.9, both `init` and `analyze`, SHA-pinned), **#55** (`@types/node` 26.2.0 → 26.4.0, dev) and
**#56** (`zod` 4.4.3 → 4.5.2, runtime). All three were lockfile- or workflow-only — neither
`package.json` range changed, since both caret ranges already admitted the new version. `main` is at
`4997f61`, three commits past `0bfa963`, and green: **536 passed / 51 skipped across 29 files**, 100%
statements/branches/functions/lines on `src/`, 0 vulnerabilities, `portulan compile --check` GREEN.
The 51 skips are the macOS-only AppleScript tests, as always off a Mac. Verified locally per branch
**and** on the three-way merge result before any of them landed. **The Dependabot queue is empty.**
Open issues: **#54** (already open, and it should have been read before this session touched the
gate — see below) and **#58**, filed here. #59 carried this file and the comment corrections and has
since merged. Nothing consumer-facing shipped, so no release is owed — all three are `chore`, which
the resolver types as no bump.

**All three were blocked by the same thing, and it was not the change.** Every check green except
`copilot-reviewed`, which is required, on all three, each burning the full 600s budget. That is the
**bot author** hole #44 named and #49 was written to close. It is not closed.

## The measurement, and the hypothesis it killed

`scripts/copilot-round.mjs` asks for the round when none is pending, and the job log says the ask
succeeded — that line is only reachable when `requestReviews` resolves without throwing. But the
timelines of #55, #56 and #57 carry **no `review_requested` event at all**, from any actor.

**My first explanation was wrong, and the log said so.** GitHub documents a read-only `GITHUB_TOKEN`
for Dependabot-triggered runs, which fit perfectly and would have been a satisfying answer. The head
of the same job log:

```
GITHUB_TOKEN Permissions
  Contents: read
  Metadata: read
  PullRequests: write
Secret source: Dependabot
```

The scope was granted. The mutation was accepted with everything it needed and recorded nothing —
a success code for an action that did not happen, which is the exact shape `COPILOT_REVIEWER`'s own
comment already documents for the REST endpoint it replaced. The lesson is not new here, it is just
newly mine: **a mechanism that explains the symptom is not thereby the mechanism.** Reading the top
of a log I had already read the bottom of cost thirty seconds and saved a wrong fix.

The controls, all measured today or read off timelines:

| PR author | Requester | `review_requested`? | Round? |
|---|---|---|---|
| Dependabot (#55/#56/#57) | `github-actions[bot]` | **no** | **no**, 600s |
| human (#49) | `github-actions[bot]` | yes | yes |
| Dependabot (#47) | `marius-cetanas` | yes | yes, 63s |
| Dependabot (#55/#56/#57) | `marius-cetanas` | yes | yes, **≤5s** |

So Copilot is not declining Dependabot — it reviewed all three within five seconds of a user-token
request. The failing combination is **bot-authored pull request asked by the Actions token**, and
which side GitHub keys on is *not established*. Recorded as unknown rather than guessed at.

**Decisions + why.**
- **Unblocked by requesting the round under a user token, then re-running the failed job** — because
  it is the only lever that works today, and it satisfies the gate honestly rather than around it:
  the round lands on the current head, which is the whole point of the check. Alternatives: widening
  the check to exempt bot authors (guts the guarantee), admin-merging past a red required check
  (routes around the floor, and `enforce_admins` is on for a reason).
- **Merged all three, squashed, after explicit approval** — merge is Gated; approval was asked for
  and given per the gate map, not assumed from "address the open PRs".
- **Did not build a mechanism fix** — I cannot distinguish author-keyed from requester-keyed from
  outside, and a speculative `pull_request_target` request workflow would be a change to a required
  check justified by a guess. It also may not help: a `pull_request_target` run's actor is still
  `github-actions[bot]`, the very side that fails.
- **Corrected the tree instead of only the record.** `copilot-round.mjs` said *"Asking here fixes
  both"*. It does not, and it has been false since #49 merged — DoD condition 4. The workflow's
  permissions rationale now also says the write scope is granted and insufficient, so nobody widens
  a scope that is already wide. The test file's `describe` comment now says what those assertions
  cover and what they cannot: injected I/O cannot observe a mutation that lies, which is why the
  suite was green for the six days between #49 merging and today while the thing it describes did
  not work.

**Open questions.** *(human-owned)*
- Does GitHub key the refusal on the pull request's author or on the requesting actor? Settling it
  needs an experiment on the live repository — e.g. a non-Dependabot bot-authored pull request, or
  the same ask from a PAT-backed step. Everything downstream waits on this.
- Should the check re-verify `isRoundPending()` after the mutation returns, so a request that did
  not take says so? It turns today's silent no-op loud — the first principle here — but it is a
  behaviour change to a required check, so it is proposed in #58 and not taken.
- **A lockfile-only pull request satisfies this gate with a round that reviewed nothing** — and
  this is **#54**, which was open before this session started and which I did not read. Copilot
  answered #55 and #56 with *"Copilot wasn't able to review any files in this pull request."* That
  is a landed round on the head, the check counts it, and I merged both on it. #54 describes the
  same fail-open with a different body (*"encountered an error and was unable to review"*) and
  judges it rare, needing Copilot to fail. The lockfile body is not rare: it is deterministic, and
  Dependabot produces it weekly. Measured today and written up on #54.
- **The two issues interact, and the order matters.** #58 fails closed and #54 fails open, on the
  same pull requests. Fixing #58 alone stops Dependabot bumps dying red and starts them sailing
  through #54's hole instead — so #54's policy question (is a diff Copilot will not read `not-owed`,
  or grounds for a human's yes?) wants settling first.

**The process note this session earns.** I listed open *pull requests* and reasoned as though that
were the repository's open work. #54 was sitting in the issue list the whole time, describing the
exact gate I spent the session inside, and I met its failure mode twice and merged on it. Reading
the open issues costs one call and would have changed what I looked at. _(The same shape as the
handoff's own "no open pull requests", written from a listing that was true when it ran.)_

**Next action.** #54 first, then #58 — the sequencing is on both threads. Nothing is blocked on it — Dependabot pull requests merge today
via request-by-hand then re-run, which is written into the workflow header so the next person meets
it before the red check rather than after.

**Recoverability.** Nothing partial. The three branches were deleted by the squash-merges; `main` is
green on `4997f61`; no tag was pushed and no release was run, so the published version is unchanged
at 1.3.3. The only edits outside `main` are the comment corrections on this branch, which are
documentation and carry no behaviour.
