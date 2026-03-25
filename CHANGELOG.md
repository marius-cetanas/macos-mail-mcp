# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
