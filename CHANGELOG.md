# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Internal

- `copilot-reviewed` now requests the Copilot round it waits for, instead of depending on the
  `copilot auto-review on pull requests` ruleset to have requested one. The ruleset does not cover
  every pull request the check gates, and the ones it skips could never go green however long the
  check waited — the symptom in both cases was a red required check that no push could clear,
  reading as though the change were at fault (#44).

  Two holes, with different causes. The ruleset is conditioned on `~DEFAULT_BRANCH`, so a pull
  request opened against any other branch never drew a round. And a **bot author** drew none either:
  #47 was opened by Dependabot against `main` — condition satisfied, not a draft — and got nothing
  in 16 hours, where #43, #45, #46 and #48 were each requested one second after opening. Ten
  Dependabot pull requests in this repository's history have drawn zero automatic rounds.

  Requesting it needs GraphQL. `POST /pulls/{n}/requested_reviewers` with
  `copilot-pull-request-reviewer[bot]` returns **201 Created and adds nobody**, because Copilot is a
  Bot and that endpoint takes Users and Teams. #44 recorded the same result and read it as the API
  not working; the narrower cause is what made the fix possible.

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
