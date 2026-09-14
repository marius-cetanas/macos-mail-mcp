# Handoff — a tree that still counted eighteen

**State, dated 2026-09-14.** Opened as #77 from `docs/tool-counts-from-registrations` on `main` at
`b4ff80e`, and **merged by the maintainer at 15:27 UTC** as `878af79` — the head verified below,
merged after Copilot had reviewed that same head, with every check green, CI's runs on Node 22 and 24
included. The verify recipe at that head: exit 0, **654 passed across 32 files** with none skipped,
100% statements (263/263), branches (100/100), functions (64/64) and lines (262/262) on `src/`, 0
vulnerabilities; `npx portulan compile --check` GREEN. Every local run was on macOS under Node
26.8.1, so the `osascript` tests ran. `src/` is untouched and every commit in #77 is typed `docs`, so
nothing in it is releasable on its own. The first version of this paragraph said the pull request was
not merged; see *After the merge*.

## The defect, and how long it stood

`CONTRIBUTING.md`'s project tree said mailboxes had **2** tools and messages **7 + 4**. The source
registers **3** and **8 + 4**, and the tree's figures summed to 18 beside a README saying 20. They
were not a typo but 1.0.0's figures: the file was created with them on 2026-03-25; v1.1.0's commit
`0806c78` added `create_mailbox` and `move_messages` four days later and updated `README.md`,
`CLAUDE.md` and `CHANGELOG.md` but not the tree; and #21, #24, #27 and #73 each edited
`CONTRIBUTING.md` afterwards without reaching it. Every other count in the documentation was right.

It is the shape the previous handoff recorded nine times: a commit changes what is true, and a
sentence describing the old truth survives in a file the commit did not open.

## What changed

- **The two counts**, corrected.
- **`tests/domains/tool-counts.test.ts`**, which derives every figure from the registrations and holds
  every tracked Markdown file except `CHANGELOG.md` and the handoffs to them. Each domain's
  `register…Tools()` runs against the `captureTools()` stub, and the real entry point is imported
  with the SDK mocked; the two must agree tool for tool, so a domain that `src/index.ts` does not wire
  cannot move a count. It reads three shapes — a project tree's domain line, a heading such as
  `### Attachments (4)`, and prose such as `20 tools` or `four` and `domains` across a line break —
  and nothing may be left out: a document that counts domain by domain counts every domain, one that
  counts group by group counts every group, and a domain line split by group counts every group in
  its domain.
- **`tests/helpers/documents.ts`.** #73 merged during the session with an identical `documents()` in
  `tests/workflows/node-support.test.ts`. Two copies of *which documents state rather than record* are
  two places for the next exclusion to reach only one of, so both tests import it.
- **One step each** in the how-to-add sections of `CONTRIBUTING.md` and `CLAUDE.md`, saying to update
  the counts. Without it, following the documented procedure ends in a red suite.
- **An `[Unreleased]` → Internal changelog entry.**

## Decisions + why

- **Attachment tools are grouped by name.** The documents count them apart from the messages domain
  that registers them, and the source draws no such line — one function registers all twelve of that
  domain's tools. A name is the only separator, so it is the rule, and the test names it as the one
  judgement the registrations do not make.
- **Spelled-out numbers are read before *domains*, not before *tools*.** `.portulan/identity.md`'s
  "four domains" is the only spelled-out count the documents hold, and before *tools* a word is more
  often a handful than a total: "these two tools" read as a claim that the server has two, until
  review found it.
- **Counts, not names.** README's tool tables and `CLAUDE.md`'s name lists are not checked, and nor
  are counts phrased in ways the test does not read — "All three accept an optional `fromAccount`",
  `**20** tools`, `20 email tools`, a table cell. Left out to keep the test to what was asked; they
  are where this can still drift.
- **A changelog entry after all.** The first draft had none, on #59's precedent for a documentation
  correction. `CONTRIBUTING.md` asks every pull request for one, and #73 had since recorded
  `node-support.test.ts` under `[Unreleased]` → Internal, which is where this one went.
- **Shown to fail, not only to pass.** Red first against the uncorrected file, naming lines 29 and 30.
  Then mutations, each restored and the tree checked clean: five document edits at once — a wrong
  total, a wrong heading, a renamed heading, a deleted tree line, and `.portulan/identity.md`'s
  `four` → `five` across its line break — each reported by document and line; one extra tool in a
  real domain, reported as the seven counts it made stale; an unwired domain directory, which fails
  the entry-point cross-check; `messages/ # 8 message tools`, reported as leaving out attachments;
  and "These two tools share a script." added to the README, which passes, as it should.

## What the independent review changed

A reviewer in its own worktree returned **APPROVE-WITH-ADJUSTMENTS** on the pre-rebase head, whose
content the pushed commits carry forward. Each finding was reproduced before it was acted on:

- **"Three later edits" had gone false during the session.** It was true when written; #73 then merged
  and edited `CONTRIBUTING.md`, making it four. The test's docblock and the commit message now say
  *every later edit*, which a fifth cannot falsify. It is the pattern above a tenth time — a sentence
  true when written, made false by a merge this session did not make — and the reviewer found it,
  not a re-read.
- **A domain line could leave a group out and pass**, while the test's comment and the commit message
  said nothing could be left out. The behaviour was brought up to the sentence, not the sentence down
  to the behaviour.
- **The test depended on isolation.** With isolation off and file order shuffled, 8 of 10 seeds
  failed with `expected 0 to be greater than 0`: `tests/index.test.ts` had already loaded the entry
  point against its own mocks. With `vi.resetModules()` before the import — what that file does
  itself — all 10 pass.
- **`3 mailbox tools` became a group named `mailboxs`**, now matched against the domain's real groups;
  and the changelog entry above.
- **Not taken:** listing the new files in `CLAUDE.md`'s test tree, which already omits whole
  directories and does not claim to be complete.

## After the merge

The maintainer merged #77 while this session was still open — a request to turn on Auto-fix for it
was refused because it had already merged — and three things needed saying afterwards.

- **Three lines of this file were false.** It said the pull request was "not merged", that it
  "awaits review", and that every change was "on the pushed branch", which was deleted after the
  merge. It is the shape #65 corrected in the previous handoff, and the eleventh instance of the
  pattern recorded there: this file described the merge state of the pull request it travelled in, so
  the merge was certain to falsify it. The corrected lines state the merge as a dated fact and say
  nothing about the state of the follow-up that corrects them.
- **Copilot had found two gaps on the head that merged, and left both in its review's collapsed
  details** rather than as comments. Both reproduced:
  - *The check titled "exactly one domain" did not check it.* With one tool name registered by two
    domains, that check passed, and the only failure was the count check, reporting seven correct
    counts in four documents as wrong — a defect in the code blamed on the documents. The follow-up
    requires names to be unique before they are compared, and the same mutation then fails that check
    first, naming the duplicate. The duplicate finder is pinned, since one that found nothing would
    pass as well.
  - *The omission check had only ever passed.* It ran against complete documents alone, so one that
    stopped looking would have passed too. The follow-up makes it a function and also runs it against
    synthetic documents built from the registrations — a tree leaving out a domain, headings leaving
    out a group, a split domain line leaving out a group. Made to return nothing, those cases fail
    while the real-document case still passes.
- **#77's changelog entry sits under `[2.0.0] - 2026-09-14`.** #78 moved `[Unreleased]` beneath that
  heading minutes before #77 merged, and the entry went with it. When this was written, 2.0.0 had not
  been published — npm's latest was 1.3.4 and no v2.0.0 tag existed — though a Release run on
  `878af79` had succeeded. If 2.0.0 is cut from `878af79` or later, the placement is right.

## Found in passing *(not fixed here)*

- **This session's Portulan hooks could not start before `npm ci`, and may not have started after.**
  Both hook commands in `.claude/settings.json` are paths under `${CLAUDE_PROJECT_DIR}/node_modules/`.
  When the session began, neither this worktree nor the main checkout had a `node_modules/`, so the
  `PreToolUse` gate and the Stop gate could not run whichever of the two that variable names — and a
  hook that cannot start fails open, per the stop-gate's own header. `npm ci` then installed the
  runner in this worktree only. Which directory `${CLAUDE_PROJECT_DIR}` names in a worktree session was
  not determined — the variable is not exported to the shell — and if it is the main checkout, the
  hooks are still not running. The `permissions.ask` entries do not depend on `node_modules/`. The
  gate map's "`npm ci` puts the runner where the hook looks for it" holds only where the hook looks is
  where `npm ci` ran.
- **`origin/main` moved twice before this session's first push** — #74, #72, #68 and #73, then #69,
  #75 and #76 — because worktrees share refs and something else was fetching. Both rebases came
  before that push, where they cost no review round.
- **`npm ci` reported one high-severity vulnerability on the pre-rebase lockfile; `npm audit` shortly
  afterwards reported two moderates** (hono and qs, since bumped by #72 and #68). Not investigated;
  the advisory data changing between the two calls is the likeliest reading, not a verified one.
- **The task named `tests/workflows/node-support.test.ts` as an existing example. At session start it
  existed only on #73's branch**; #73 merged during the session.

## Open questions *(human-owned)*

- Whether the how-to-add steps are wanted, or the test's failure message is guidance enough.
- Whether tool names should be held to the registrations the way counts now are.
- Whether a worktree session's hooks should be made to find a runner before its first command, given
  the first finding above.
- Whether the count check should get the synthetic failure cases the omission check now has. Its
  failure path is exercised only by the mutations recorded here, not by the suite.

**Next action.** Nothing from #77 remains open. Its follow-up — the corrections above and Copilot's
two findings — is a pull request of its own, and merging it is the maintainer's call.

**Recoverability.** Nothing partial. #77 is on `main`, its follow-up travels as its own pull request,
and no tag, release or publish was touched by this session.
