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

## #54 is fixed (#61), and the gate now costs a review per bump

Done in the same session, after the sequencing argument above was written and accepted. The two
empty bodies get different answers, which is the half #54 did not have when it was filed:

- **an error round** is transient — `awaited`, and the loop asks again. #53 got a real verdict two
  minutes after a re-request. This is the fail-open that actually closes.
- **"wasn't able to review any files"** is permanent for that diff, so no round is ever coming and
  the review that is owed is a person's. `awaited` until a **human review of that head** exists,
  and the loop asks Copilot for nothing — another round would decline the same diff and the log
  would name the wrong thing as missing.

**The exemption was implemented first and rejected.** `not-owed`, the way a draft is exempt, was
the initial answer here and the maintainer's call overrode it: a lockfile is where a supply-chain
change arrives, so it is the diff least worth waving through, and the cost — one human review per
Dependabot bump, weekly — was judged worth paying. Recorded because the rejected branch is the one
a future reader will otherwise re-propose.

**Any human review counts, not only an approval**, and that is a deadlock guard. GitHub forbids
approving your own pull request, so an APPROVED-only rule would leave a maintainer-authored
lockfile change unmergeable by anyone here. A `COMMENTED` review is allowed on your own, so the
rule stays satisfiable in every case.

Copilot's round on #61 found three things and all three held: `isHumanReviewer` accepted any
`type` that was not `Bot` — an open set, so `Organization` and `Mannequin` would have read as
people on the one path where that predicate *is* the gate; one of four log branches broke the
`requested:` prefix, on the line most likely to be grepped; and a test comment still described the
`not-owed` exemption two lines above assertions that contradicted it.

**#58 is not fixed and stays open.** #61 fixes the *diagnosis* — `describeRequest` re-checks
`isRoundPending()` and refuses to call an unconfirmed request a success — not the mechanism. A
Dependabot pull request still needs the round requested by hand.

**Next action.** #58, whose open question is unchanged: does GitHub key the refusal on the pull
request's author or on the requesting actor? Nothing is blocked on it — a Dependabot pull request
merges today by requesting the round by hand, re-running the job, and now also reviewing it, all of
which the workflow header states.

**Recoverability.** Nothing partial. The three Dependabot branches were deleted by their
squash-merges; no tag was pushed and no release was run, so the published version is unchanged at
1.3.3. `main` was green at `4997f61` when this was written and has since taken #59, #60 and #61.
The first two are documentation; **#61 changes a required check**, and the next release derived
from `main` is `1.3.4` (patch, from #61's `fix(ci):` subject) for a change that ships nothing —
`src/` is untouched. That is the wart `CLAUDE.md` names, and `bump` is the override.
