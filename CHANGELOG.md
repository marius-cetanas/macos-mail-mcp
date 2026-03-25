# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
