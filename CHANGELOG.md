# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

- `accountName` on `reply_to_message` / `forward_message` is documented as locating the source
  message only. It never controlled which account sends, and the name invited the opposite
  assumption; `fromAccount` is the sender selector.

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
