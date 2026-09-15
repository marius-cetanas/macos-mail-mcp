# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Internal

- The tool-count check now fails when a tool name is registered twice. It used to pass the check
  that every tool belongs to exactly one domain and count the name twice, so a duplicate surfaced
  only as correct counts in the documents reported wrong. The check that a document leaves nothing
  out is now also run against documents that do, so a check that stopped looking would fail.
- `copilot-reviewed` reads every page of a pull request's reviews, not only the first. GitHub
  serves them 30 a page by default and oldest first, so past 30 the reviews the check waits for —
  Copilot's round on the current head, and any human review of it — were on a page it never read,
  and it would have expired red with no push able to clear it. The check now asks for 100 a page
  and follows GitHub's `Link` header to the last. As of 2026-09-14 no pull request here had got
  there — the most was 18 reviews, on #24 — but a reply in a review thread is recorded as a review
  of its own, as all 54 in this repository were, so each reply in a long conversation adds one.
- `copilot-reviewed` no longer counts a reply to a review thread as a person's review. GitHub
  records a reply as a pull request review of its own — `COMMENTED`, empty body, nothing in it but
  the reply — and where no Copilot round is coming the check asked only whether a person had
  reviewed the head. So on a lockfile Copilot declines to read, or a Dependabot pull request it
  cannot be requested for, a reply to any thread from any account that is not a bot satisfied the
  gate that exists so a person reads the diff. Measured on #73, whose review 5198788557 is exactly
  that shape. No merge rested on one: of the 37 commits here that carried a reply-only review, 36
  also carried a real Copilot round, which decides first, and the other is on #3, which predates
  the check.

  A person's review now counts when it says something of its own — a verdict, a non-blank body, or
  a top-level comment. A `COMMENTED` review still counts, because GitHub refuses an approval on your
  own pull request and an approval-only rule would leave a sole maintainer unable to satisfy the
  check; on a pull request of your own that Copilot declines, that means submitting a review with a
  non-blank body or an inline comment rather than replying to a thread. Telling a reply apart takes
  one more read, of the pull request's review comments, which the check makes only where they decide
  the answer.

  That rule refuses more than replies. Each of these used to count and no longer does, failing
  closed: a review with no verdict, no body beyond whitespace and no comments at all, such as an
  empty dismissed approval; a review whose only body is whitespace; and a review whose comments do
  not come back as a list, or that has no id to read them by. A read that fails outright now ends
  the run red, where the review used to count. The only reviews of those shapes in this repository's
  history are two empty dismissed reviews, on #69 and #70, neither on its pull request's final head.
  They are read whole, every page, by the same reader #81 gave the reviews, as one list for the
  pull request rather than one read per review.
- `.github/rulesets/README.md` said the `copilot-reviewed` check depended on the Copilot review
  ruleset: delete the ruleset and no round is ever requested, and the check fails with nothing
  explaining why. That has been false since #49, which had the check request the round itself and
  name a failed request in its log, and which corrected the gate map but not the README. The README
  now says what the ruleset still buys — a request within a second of opening and on every push —
  and what the check does without it, for a person's pull request, a Dependabot one and a fork's.
  `tests/workflows/copilot-ruleset.test.ts` holds what the README says the check does to
  `awaitRound`, what it says of the ruleset to the payload, and what it quotes to the gate map, so a
  change to any of those fails on the README. What GitHub does with each request — how soon the
  ruleset asks, whether a request records — is measured rather than tested, and can change without
  failing it. The gate map no longer calls the payload a dependency of the check.
- The suite now reads the value the gate map gives for `strict` on `main`, not only the setting's
  name. The map says the suite fails if it ever stops saying the live value is `false`, but the
  test behind that claim checked only that the warning and the setting's name were present: on
  2026-09-15, turning all three of the map's statements of the live value to `true` left the suite
  green. The test now reads the map's table cell by cell, finding each column by its header, and
  fails unless the live column says `false` and the export column says `true`.
- `scripts/branch-freshness.mjs` no longer attributes to the gate map a sentence the gate map
  dropped in #37. It paraphrases what the map records instead of quoting it.
- A change to a released version's section of `CHANGELOG.md` now fails CI. Recording a release
  inserts its heading below `[Unreleased]`, so the list an in-flight branch had appended an entry to
  becomes the release's, and a clean rebase or merge then files that entry under a version it did
  not ship in — measured on 2026-09-14 with #81's entry, which merged with no conflict under
  `## [2.0.0]` while every test that reads this file still passed. A new `changelog` job, which
  `verify` depends on, fails a change that alters or removes the section of a version whose tag the
  change's base already contains. New sections — a recording, or a backfill such as 1.3.1's — and
  sections whose tag the base does not contain yet stay open, so a release that tags a commit after
  it was pushed does not turn `main` red. A pull request checked before a release is tagged can
  still merge after it, since nothing re-runs its check; the job then fails on `main`, after the
  entry has landed there. A pull request titled with a `changelog` scope, such as
  `docs(changelog): …`, overrides for a deliberate correction. On `main` the check reads the title
  of the pull request merged as the pushed commit, because that commit's message need not be the
  title, and only when the commit sits directly on the previous tip, since a push holding more than
  one merge has no one title; on a pull request it re-runs when the title changes. A file with two
  sections under the same heading is refused, because the second would hide a change to the first,
  and a change to a section too long to diff cheaply is reported by the section's length rather than
  its lines. Over the 21 commits that had touched this file by 2026-09-14, the rule fires on none.
- The refusal to follow a `Link: rel="next"` off api.github.com, which #81 added as a precaution,
  now rests on a measurement: fetch drops a caller-set `authorization` header only when a redirect
  crosses origins, so a next link, being a fresh request, would carry the token wherever it pointed.
  A test measures that on the Node running the suite. No request either check makes follows a
  redirect: fetch would follow a 3xx to another origin and hand back that origin's answer, so a
  redirect is now a failed read that names its status.
- `branch-freshness` now also re-runs when a pull request is edited, which includes a change of base.
  Its answer depends on the base, and a pull request retargeted to `main` keeps its head, so the
  freshness it had passed against the old base used to stand for the new one.
- The three GitHub readers in `scripts/` are one. `copilot-round.mjs`, `changelog-sections.mjs` and
  `check-freshness.mjs` each built their own headers and paging, the changelog check importing its
  page reader from the Copilot gate, and `check-freshness.mjs` made the one request in `scripts/` that
  still followed a redirect. `scripts/github-api.mjs` now carries the headers, the refusal of
  redirects, the refusal of a next page off api.github.com and the paged read, and every script reads
  through it; a resource that carries a `Link` header, as the compare endpoint does, is one request
  rather than every page of it. `check-npmrc.mjs` uses `scripts/is-main.mjs` rather than a copy of
  it, as `release-notes.mjs` does since #100.
- The jobs that run a script without `npm ci` — `changelog`, `copilot-reviewed`, `branch-freshness`
  and `intake` — are held to scripts that import Node built-ins and other files under `scripts/`
  only, by `tests/workflows/script-imports.test.ts`, which reads the jobs from the workflows. The
  claim was a sentence in `verify.yml`; one package import anywhere in that graph would have turned a
  required check red on every pull request at once.
- The `changelog` check no longer refuses every pull request once `main` carries two sections under
  one version heading. It refused a duplicate wherever it found it, the base included, so a duplicate
  that reached `main` — two pull requests recording the same release, the second merged on a check
  run before the first landed — would have failed every pull request after it, the one removing it
  among them, since every checkout inherits its base. A duplicate the checkout inherits unchanged is
  now passed over; a change that adds a copy or alters one is still refused, and one that resolves or
  drops the copies is a change to that version, reported by its copies and judged as any change to a
  shipped section is.
- Vitest runs the tree's own tests only. Without `include`, its default glob also collected the
  checkouts under `.claude/worktrees/`: measured on 2026-09-15 with six present, 263 files ran instead
  of 34, an older copy of one test failed against this tree's README, and eight copies of
  `tests/release/workflow.test.ts` raced on the one `package-lock.json` they all rewrite and left it
  dirty.
- `tests/release/changelog-sections.test.ts` now holds the push trigger to `main`, which its name
  said it did; and `verify.yml` names the handoff file it cites for its open questions, since four
  carry that date.

## [2.0.0] - 2026-09-14

### Changed

- **Breaking:** Node.js 22.12 or later is now required. `engines.node` moves from `>=20.0.0` to
  `>=22.12.0`, and CI no longer tests on Node 20. The cause is the test suite, not the server:
  Vitest 5 does not support Node 20, so a floor of 20 would have been a claim nothing here tests.
  The server's own code is unchanged, and npm warns rather than refuses on an engines mismatch by
  default, so an install on Node 20 may still run — but it is no longer supported. Node 20 has been
  end-of-life since 2026-04-30.

### Security

- The lockfile no longer carries the advisories in `fast-uri` (five high), `qs` (two moderate) and
  `hono` (three moderate), and `npm audit` reports 0 vulnerabilities (#67, #68, #72). `npm audit`
  reported four of the five `fast-uri` advisories; the fifth, GHSA-qw65-cvwx-89v3, is a repository
  advisory fast-uri published, which GitHub's global advisory database did not carry on 2026-09-14.
  3.1.7 also fixes GHSA-58mr-gqgx-xq4g, which affected only 3.1.6, a version this lockfile never
  held. The published package ships no lockfile and its dependency ranges already admitted the
  patched versions, so a fresh install was never exposed through this repository; what moved is
  this repository's own CI and development tree.

### Internal

- Vitest 4 → 5, with `@vitest/coverage-v8` moved alongside it. Dependabot's #71 bumped `vitest`
  alone, which cannot install: the coverage provider peers on the exact `vitest` version, so
  `npm ci` failed on ERESOLVE. `dependabot.yml` now groups the pair, so a major moves both, and
  `tests/workflows/dependabot.test.ts` asserts that no group can take half of it.
- `tests/workflows/node-support.test.ts` holds the supported Node version in agreement across
  `package.json`, the CI matrix and every tracked Markdown file except this changelog and the
  session handoffs, which record changes rather than state what is supported.
- `CONTRIBUTING.md`'s project tree said mailboxes had 2 tools and messages 7 + 4 — the figures of
  1.0.0, which v1.1.0's two new tools made stale — and now says 3 and 8 + 4.
  `tests/domains/tool-counts.test.ts` derives every tool count from what the server registers and
  holds the same documents to it, a set `tests/helpers/documents.ts` now defines once for both
  checks.

## [1.3.4] - 2026-09-02

### Internal

- `copilot-reviewed` no longer counts a Copilot round that contains no review as a review. Copilot
  submits one in two cases where nobody looked, and the check accepted both — so the merge gate was
  satisfied by the absence of a review, which is what it exists to prevent. Measured twice: an error
  round nearly merged #53, and two lockfile-only pull requests did merge on *"Copilot wasn't able to
  review any files in this pull request"* (#54).

  The two get different answers, because only one can be fixed by asking again. An error round is
  transient, so the check keeps waiting and asks for another. A diff Copilot will not read — a
  lockfile, which it excludes by documented policy — is permanent, so the review that is owed is a
  person's: the check waits for a human review of the same head. Any human review counts rather than
  only an approval, because GitHub forbids approving your own pull request and an approval-only rule
  would leave a maintainer-authored lockfile change unmergeable by anyone here.

- The check no longer reports a review request that GitHub silently discarded as a success. On a
  Dependabot pull request the `requestReviews` mutation resolves, records nothing, and the check
  used to expire red ten minutes later under a success line at the top of the log. The mutation now
  returns the pull request's requested reviewers, so GitHub's own answer says whether the request
  took (#58).

  The cause is documented and structural rather than a defect here: a Copilot review must be billed
  to a Copilot-licensed account, and where the author is a bot and the requester an app there is
  none. GitHub's remedy is an organization policy unavailable to a user-owned repository, and no
  workflow rearrangement reaches it — `pull_request_target` changes the token, not the actor.

  So the gate stops asking for a round it cannot get and asks for the review instead: when the
  request provably did not take, a human review of the head satisfies the check. A Dependabot bump
  used to cost four manual steps — hand-request the round, wait for it to be declined, review,
  re-run — of which the first two only ever produced a round already known to be empty.

## [1.3.3] - 2026-08-26

### Fixed

- Escaping a long message body no longer approaches the bridge's 30s timeout. `escapeForJson` was
  quadratic in the length of its input: 40,000 characters took ~25s, and a body somewhat larger
  than that would have failed as a timeout naming neither the tool nor the cause. The same input
  now escapes in ~0.3s (#42).

  Two quadratic sources had to go together. Element access on a large AppleScript list is O(n) per
  element — the read loop alone cost 20.46s at 50,000 code points — which the fix avoids by holding
  the list in a script object property; and unbounded appends grow the accumulator until it
  re-enters that same trap, which the fix avoids by flushing at a fixed threshold. Element access
  dominated, so replacing `copy … to end of` alone measured as no improvement at all (5.69s to
  5.71s at 20,000), which is what made the cause hard to see.

- Two latent hazards in the rewritten escaper, neither of which ever shipped broken, both now
  pinned by tests: the "needs no escape" check is an integer comparison, because a text comparison
  is subject to a caller's `ignoring punctuation` and under it the handler emitted raw quotes and
  backslashes; and the run buffer is never converted while empty, because `string id {}` segfaults
  `osascript` rather than raising, so `try` cannot catch it.

- Handler names the bridge prepends — `escapeForJson`, `joinStrings`, `resolveMailbox`,
  `mailboxFullName` — are now enforced as reserved by a test that runs in CI. Redefining one makes
  AppleScript refuse to compile the script (`-2752`), failing every call of that tool.

### Internal

- `copilot-reviewed` now requests the Copilot round it waits for, instead of depending on the
  `copilot auto-review on pull requests` ruleset to have requested one. The ruleset does not cover
  every pull request the check gates, and the ones it skips could never go green however long the
  check waited — the symptom in both cases was a red required check that no push could clear,
  reading as though the change were at fault (#44).

  Two holes, with different causes. The ruleset is conditioned on `~DEFAULT_BRANCH`, so a pull
  request opened against any other branch never drew a round. And a **bot author** drew none either:
  #47 was opened by Dependabot against `main` — condition satisfied, not a draft — and got nothing
  in 16 hours, where #43, #45, #46 and #48 were each requested one second after opening. Every
  Dependabot pull request here — 18 of them — has drawn zero automatic rounds, though 17 predate the
  ruleset, so #47 is the one that evidences the hole rather than merely illustrating it.

  Requesting it needs GraphQL. `POST /pulls/{n}/requested_reviewers` with
  `copilot-pull-request-reviewer[bot]` returns **201 Created and adds nobody**, because Copilot is a
  Bot and that endpoint takes Users and Teams. #44 observed the same behaviour and read it as the
  API not working; the narrower cause is what made the fix possible.

## [1.3.2] - 2026-08-20

### Fixed

- Reading a mailbox no longer fails when a message subject or sender contains emoji or accented
  text. AppleScript returns a *list* of code points rather than an integer for a multi-code-point
  grapheme cluster — an emoji with a variation selector (`❤️`), a ZWJ sequence (`👨‍👩‍👧`), or a
  decomposed accent — and comparing that list against the control-character range raised
  `Can't make {…} into type number, date or text (-1700)`. A single such message made
  `list_messages` fail outright, not just that message, because `escapeForJson` is applied to every
  subject and sender. Reported and first fixed by [@dessyd](https://github.com/dessyd) in #33.
- Characters that JSON requires escaping no longer reach the output raw when they sit next to a
  combining mark or a zero-width joiner. A control character, quote or backslash in that position
  was emitted unescaped, producing a JSON string no parser accepts — the tool then failed with a
  parse error naming neither the message nor the cause (#41).

### Changed

- `escapeForJson` now escapes by code point in a single pass, rather than by five text-item-delimiter
  passes followed by a per-character sweep. The delimiter approach had no consistent behaviour to
  reason from: measured, it was blind to a backslash followed by a combining mark, split a cluster
  containing one followed by a zero-width joiner, and refused to match a bare quote followed by a
  zero-width non-joiner. Also about 1.8× faster on long strings (#41).

### Internal

- First tests that execute AppleScript for real, through `osascript`. They cover the escaping
  handler across precomposed, decomposed, variation-selector, astral and ZWJ text. They **run only
  on macOS and are skipped everywhere else, including CI** — there is no `osascript` on the Linux
  runner (#40).
- Merges now wait for a Copilot review round on the exact commit being merged, branch drift behind
  `main` is bounded at five commits, a held fork pull request says so instead of showing nothing,
  and the aggregate status check `ci-ok` was renamed `verify` (#37).
- Dependency and action-pin sweep, clearing a high-severity `nanoid` advisory that was failing
  `npm audit` on every pull request (#36).
- The repository is governed by its own Portulan workspace at `.portulan/` (#29).

### Thanks

- [@dessyd](https://github.com/dessyd) reported the escaping bug and sent the fix in #33. It was a
  real one and it was found from outside: `escapeForJson` had no executable test coverage at all,
  because the bridge is mocked in every other test, so nothing here could have caught it. The
  diagnosis in that pull request was exact — AppleScript returns a list of code points for a
  multi-code-point grapheme cluster — and it is what the rest of this release was built on. Thank
  you for taking the time.

## [1.3.1] - 2026-08-05

Recorded after the fact — this entry was missing, and is written from the commits the tag carries.

### Fixed

- Publishing over OIDC no longer fails on an empty `_authToken`. `setup-node` writes one into
  `.npmrc`, which disabled trusted publishing and surfaced as `E404` — a message that reads as a
  missing package rather than an authentication failure (#23).
- The release now asserts the version it committed rather than the working tree, which a release
  rewrites before its checks run (#28).

### Changed

- The release is one workflow run, with the tag as the source of truth for what shipped. The
  version is computed at release time from the conventional commits since the last tag, and the tag
  is pushed only after the registry confirms the publish — so a failed publish cannot leave a tag
  pointing at a version that does not exist (#24, #27).

### Documentation

- README registers the server via `npx` rather than a frozen local build path (#25).

## [1.3.0] - 2026-08-04

### Added

- Sender account selection — `send_message`, `reply_to_message` and `forward_message` accept an
  optional `fromAccount`, given as either a Mail account name (`"Google"`) or any address that
  account owns (`"you@gmail.com"`), matched case-insensitively against the enabled accounts.
  Previously there was no way to choose the sending account: Mail silently used whatever is set
  under Settings → Composing, so a message meant to go out from a work address could be sent from
  a personal one with the tool still reporting `{"success": true}`. An unrecognised value is now
  an error naming the valid accounts rather than a silent fallback to the default.
- All three compose tools now return the account they actually sent from, e.g.
  `{"success": true, "sender": "Your Name <you@work.com>"}`. This is reported whether or not
  `fromAccount` was passed, so Mail's own choice of account is visible in the result instead of
  only being discoverable afterwards by finding the message in a Sent mailbox.
- `list_accounts` and `get_account_detail` now report each account's `fullName` — the display name
  Mail sends as, which is what the `"Name <address>"` sender string is built from.

### Changed

- **Minimum Node.js raised from 18 to 20.** Node 18 reached end of life and was never actually
  verified — CI builds and tests on 20, 22 and 24, so the `>=18` floor was an untested claim, and
  the current toolchain (TypeScript 7) is unlikely to support it. Installing on Node 18 now warns
  via `EBADENGINE` instead of appearing supported.
- `accountName` on `reply_to_message` / `forward_message` is documented as locating the source
  message only. It never controlled which account sends, and the name invited the opposite
  assumption; `fromAccount` is the sender selector.

### Internal

- Test suite raised from 74 to 280 tests, reaching 100% statement, branch, function and line
  coverage of `src/`. The MCP registration layer — the tool handlers themselves, as opposed to the
  `handleXxx` functions beneath them — had never been exercised, nor had the `osascript` execution
  path in the bridge or the entry point. Coverage thresholds are set to 100% and CI runs
  `test:coverage`, so untested new code fails the build instead of quietly lowering the number.
- CI, CodeQL and Dependabot added; `main` is branch-protected behind a required check. Actions are
  pinned to commit SHAs and workflows run with a read-only token. Releases publish from a tag via
  npm Trusted Publishing (OIDC), so no npm token is stored in the repository.
- Dependency updates: zod 3 → 4, TypeScript 6 → 7, `@types/node` 25 → 26, plus transitive fixes
  clearing several high-severity advisories in the MCP SDK's HTTP stack. `npm audit` reports 0
  vulnerabilities, and `audit` is part of the required CI gate.

### Notes

- Whether an unqualified reply or forward inherits the account that received the original message
  or falls back to Mail's global default is still unconfirmed, so the default behaviour is
  deliberately unchanged. The `sender` now returned in the result makes it directly observable.

## [1.2.0] - 2026-06-08

### Fixed

- Gmail special folders — `All Mail`, `Sent Mail`, and the other `[Gmail]/*` mailboxes (Drafts, Spam, Trash, Important, Starred) — are now reachable by every by-name tool (`list_messages`, `get_message`, `move_message`/`move_messages`, `delete_message`, `flag_message`, `mark_read`, `reply_to_message`, `forward_message`, the attachment tools, and `get_mailbox_info`). These live under Mail.app's `[Gmail]` container and could not be resolved by their leaf name (`mailbox "All Mail" of account` fails with `-1728`); only top-level labels worked. A new shared `resolveMailbox` handler resolves a mailbox by either its leaf name or full path, `list_mailboxes` now returns the full addressable path (e.g. `[Gmail]/All Mail`) so names round-trip into every other tool, and an ambiguous leaf name raises a clear error instead of silently resolving to the wrong mailbox.
- The server version reported over the MCP `initialize` handshake is now read from `package.json` instead of a hardcoded string, so it always matches the published package.

### Changed

- Dev tooling bumped: TypeScript 5.7 → 6, Vitest 3 → 4, `@types/node` 22 → 25 (`tsconfig` now declares `"types": ["node"]`).
- Documentation: clarified install instructions — `--scope user` and `npx -y` for Claude Code, absolute `npx`/`node` paths for Claude Desktop (GUI apps don't inherit the shell `PATH`), and that Claude Code and Claude Desktop/Cowork use separate MCP configs.

### Security

- Resolved 7 transitive dependency advisories (2 high) in the MCP SDK's HTTP-stack dependencies; `npm audit` now reports 0 vulnerabilities. (This stdio-only server never exercised those code paths.)

## [1.1.0] - 2026-03-29

### Added

- `create_mailbox` — Create new mailboxes (top-level or nested under a parent)
- `move_messages` — Bulk move multiple messages in a single operation (more efficient than repeated `move_message` calls)
- Date filtering on `search_messages` and `list_messages` — optional `after` and `before` ISO 8601 date params
- `search_messages` results now include `mailboxName` for each result
- `get_message` no longer requires `mailboxName` — omit it to search all mailboxes in the account
- `get_thread` added to roadmap (v2) in README
- 62 unit tests (up from 56)

### Changed

- Tool count: 18 → 20
- `search_messages` `query` param is now optional when using date filters

## [1.0.2] - 2026-03-25

### Fixed

- Gmail search deduplication — same message no longer appears twice when searching across all mailboxes (Gmail uses labels, so a message can exist in INBOX + All Mail simultaneously)

## [1.0.1] - 2026-03-25

### Fixed

- Attachment deduplication now checks the filesystem, preventing silent overwrites of existing files (e.g., if `~/Downloads/image.png` already exists, saves as `image (2).png`)
- Added `prepublishOnly` script to prevent broken npm releases

### Added

- Known Limitations section in README covering AppleScript foundation, search performance, volatile IDs, and provider behavior
- npm install instructions in README
- CONTRIBUTING.md and CHANGELOG.md
- `.npmignore` for clean npm packages
- GitHub badges (MIT, Node.js, macOS)

## [1.0.0] - 2026-03-25

### Added

- 18 MCP tools across 4 domains: accounts (2), mailboxes (2), messages (7), attachments (4), compose (3)
- Full email management: read, search, compose, reply, forward, move, delete, flag, mark read/unread
- Attachment handling: list, save, save all, read text-based attachments inline
- Support for all Mail.app account types: iCloud, Gmail, Outlook/Exchange, Yahoo, Fastmail, custom IMAP/POP
- Domain-driven layered architecture with shared utilities
- Shared `escapeForJson` AppleScript handler auto-prepended to all scripts
- Extension-based MIME type fallback when Mail.app returns `missing value`
- Robust parameter escaping to prevent AppleScript injection
- Multi-line content handling via temp files (email body, attachment paths, attachment names)
- 56 unit tests with mocked bridge (no real Mail.app required)
- Full documentation: README, CLAUDE.md, CONTRIBUTING.md
