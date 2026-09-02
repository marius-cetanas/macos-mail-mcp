# Handoff — the selection was the diagnosis

Continues [yesterday's handoff](2026-09-01-a-fix-that-never-worked-where-it-was-aimed.md), which
this session ran past midnight UTC. That file holds the measurements and the reasoning; this one
holds what happened after them, and is deliberately short where it would otherwise repeat.

**State.** `main` at `94f1c63`, green: **570 passed / 51 skipped across 29 files**, 100%
statements/branches/functions/lines on `src/`, 0 vulnerabilities, `portulan compile --check` GREEN.
Merged on this date: **#59** and **#60** (correcting claims the tree contradicted), **#61** (the
`copilot-reviewed` fix, closing **#54**) and **#62** (the previous handoff's amendment). Published
version unchanged at **1.3.3**; the next derived release is **1.3.4**, a patch from #61's `fix(ci):`
subject for a change that ships nothing, `src/` being untouched — the wart `CLAUDE.md` names, with
`bump` as the override. **Open: #58 only.**

**In flight, committed and not pushed:** `ccd4793`, the #58 diagnosis below. A research agent was
still running when this was written; its findings are not in here.

## What #58 turned out to need first

The mutation was asking GitHub the wrong question, and had been since it was written:

```
requestReviews(input:{…}){ pullRequest{ id } }
```

`id` comes back whether or not the mutation did anything. So the response was discarded, and a
mutation **accepted and dropped** was indistinguishable from one that worked — which is the entire
symptom of #58 and cost #55, #56 and #57 a red required check each, under a success line at the top
of each log. Selecting `reviewRequests` back instead reads the post-mutation state **in the
mutation's own response**.

The distinction that makes this worth more than the poll added earlier the same session: the poll
asks again *afterwards* and races Copilot, so "nothing pending" has an innocent reading (Copilot
already took it up, measured on #49) and the message has to hedge. The mutation's own answer has no
innocent reading, so that line does not hedge and says the check will expire.

**This diagnoses #58; it does not fix it.** Nothing here makes GitHub honour the request. What it
buys is that the next Dependabot pull request states the failure in one line, where establishing it
this session took timeline archaeology across four pull requests.

## Decisions + why

- **`null`, not `false`, for an unfamiliar response shape** — because an absent field is *"this
  response did not say"*, which is a different claim from *"GitHub says Copilot is not requested"*.
  Collapsing them would report a defect on any future schema change.
- **Did not ship a mechanism fix** — the two candidates are not equivalent and the choice is not
  mine. `pull_request_target` gets a non-Dependabot token but keeps `github-actions[bot]` as the
  actor, so it helps only if the discriminator is the token context. A user-scoped PAT in Dependabot
  secrets would work under either discriminator and **introduces a stored credential**, which is
  exactly what the release design congratulates itself on not having. That is a gate-map decision.
- **Answered the stop-gate rather than working around it.** It asked for a handoff dated today and
  was right to: four of the session's merges carry this date and the series would have had nothing
  under it.

## Open questions *(human-owned)*

- **Whether a stored user token is acceptable.** Now the only question, and it is a real reversal of
  a stated design property. See below — the mechanism is no longer open.

## The mechanism is documented, and it is billing attribution

Answered after the above was written, from GitHub's documentation rather than by experiment — so
the "turns the next bump into the experiment" line above is superseded, and the instrumentation is
now belt-and-braces rather than the plan.

It is neither the author nor the requester alone, which is why the four-cell matrix looked
contradictory. A Copilot review has to be **charged to a Copilot-licensed account**: a manual
request by a *user* is attributed to that user, and a licensed human author covers the automatic
case. In the failing cell there is no such account — the requester is an app rather than a user,
and the author is a bot. GitHub's 2026-08-27 changelog names the case exactly, and its remedy is an
**organization policy on Copilot Business/Enterprise**.

**This repository is user-owned, so that policy does not exist for it.** Three consequences:

- The failure is **structural, not a bug**. No amount of workflow engineering reaches it.
- **`pull_request_target` would not have worked**, which was my leading candidate. It changes the
  token and the secret source; it does **not** change the actor, which stays `github-actions[bot]`
  — still not a user, still nothing to bill. Recorded because it is the plausible fix a future
  session will otherwise spend a day on.
- The only mechanism fix left is a **user-scoped token**, i.e. a stored credential, which the
  release design is built to avoid. Gate-map decision, and the only open question on #58.

Caveat kept deliberately: GitHub documents the attribution rule and does **not** document that a
request with nothing to bill is dropped *silently*, with no `review_requested` event and no GraphQL
error. That half is still ours, measured and not confirmed by any source. The citations, their
provenance, and the docs-vs-inference split are on #58.

**Next action.** #58 needs one decision — stored user token, or keep the manual step. Nothing else
about it is open.

**Recoverability.** Nothing partial on the remote: every merged pull request is squashed and its
branch deleted, no tag was pushed, no release was run. The only work not on `main` is `ccd4793` on
this branch, which is one commit, verified green, and carries no behaviour change beyond a log line
and a GraphQL selection.
