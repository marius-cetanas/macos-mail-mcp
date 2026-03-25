# macos-mail-mcp

[![npm version](https://img.shields.io/npm/v/macos-mail-mcp.svg)](https://www.npmjs.com/package/macos-mail-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![macOS](https://img.shields.io/badge/platform-macOS-blue.svg)](https://www.apple.com/macos/)

An MCP server for Apple Mail (macOS Mail.app) that connects Claude to your email via AppleScript. Provides 18 tools for reading, searching, managing, and composing emails.

## Supported Accounts

Works with **any email account configured in macOS Mail.app** — iCloud, Gmail, Outlook/Exchange, Yahoo, Fastmail, custom IMAP/POP, etc. No code changes needed; just add the account in Mail.app and it becomes available through all 18 tools.

## Requirements

- macOS with Mail.app configured (with at least one email account)
- Node.js 18+
- Claude Code or Claude Desktop app

## Installation

### Quick Install (npm)

The easiest way — no cloning or building required:

**Claude Code (CLI):**

```bash
claude mcp add macos-mail-mcp -- npx macos-mail-mcp
```

**Claude Desktop:**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "macos-mail-mcp": {
      "command": "npx",
      "args": ["macos-mail-mcp"]
    }
  }
}
```

Restart the Claude desktop app after adding the config.

### Install from Source

If you prefer to build locally or want to contribute:

```bash
git clone https://github.com/marius-cetanas/macos-mail-mcp.git
cd macos-mail-mcp
npm install
npm run build
```

Then register with Claude Code:

```bash
claude mcp add --transport stdio --scope user macos-mail-mcp -- node /path/to/macos-mail-mcp/build/index.js
```

Or add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "macos-mail-mcp": {
      "command": "node",
      "args": ["/path/to/macos-mail-mcp/build/index.js"]
    }
  }
}
```

### macOS Permissions

On first use, macOS will prompt to grant automation permission for controlling Mail.app. Go to **System Settings > Privacy & Security > Automation** to manage this.

## Tools

### Accounts (2)

| Tool | Description |
|---|---|
| `list_accounts` | List all mail accounts (name, type, enabled, emails) |
| `get_account_detail` | Get full account details (server, port, SSL, mailbox count) |

### Mailboxes (2)

| Tool | Description |
|---|---|
| `list_mailboxes` | List mailboxes for an account or all accounts |
| `get_mailbox_info` | Get mailbox details (message count, unread count) |

### Messages (7)

| Tool | Description |
|---|---|
| `list_messages` | List messages with pagination (limit/offset) |
| `get_message` | Get full message content, headers, recipients, attachments |
| `search_messages` | Search by subject, sender, or content |
| `move_message` | Move a message to a different mailbox |
| `delete_message` | Delete a message (moves to Trash) |
| `flag_message` | Set/clear flag with optional color index (0-6) |
| `mark_read` | Mark message as read or unread |

### Attachments (4)

| Tool | Description |
|---|---|
| `list_attachments` | List attachments with filename, MIME type, size, download status |
| `save_attachment` | Save a specific attachment to disk |
| `save_all_attachments` | Save all attachments from a message |
| `read_attachment` | Read text-based attachment content inline (.txt, .csv, .json, .html, .md, .xml, .log) |

### Compose (3)

| Tool | Description |
|---|---|
| `send_message` | Send a new email with optional CC, BCC, and attachments |
| `reply_to_message` | Reply or reply-all to a message |
| `forward_message` | Forward a message to a new recipient |

## Architecture

```
src/
  index.ts                          # MCP server entry point
  types.ts                          # TypeScript interfaces
  utils.ts                          # Shared utilities (sanitize, expandTilde, toolError)
  bridge/
    applescript-runner.ts            # AppleScript execution engine
    escape-for-json.applescript      # Shared JSON escaping handler (auto-prepended)
  domains/
    accounts/
      accounts.tools.ts             # Tool registration & handlers
      scripts/*.applescript          # AppleScript templates
    mailboxes/
      mailboxes.tools.ts
      scripts/*.applescript
    messages/
      messages.tools.ts
      scripts/*.applescript
    compose/
      compose.tools.ts
      scripts/*.applescript
tests/
  utils.test.ts                     # Shared utility tests
  bridge/applescript-runner.test.ts  # Bridge unit tests
  domains/*/                         # Domain handler tests
```

**Domain-driven layered architecture:**
- **Tools layer** — Registers MCP tools with Zod schemas, validates input, calls the bridge
- **Bridge layer** — Reads AppleScript templates, substitutes parameters (with injection-safe escaping), prepends the shared `escapeForJson` handler, executes via `osascript`, parses JSON output
- **Script layer** — AppleScript templates with `{{param}}` placeholders, returning JSON strings. The `escapeForJson` handler is defined once in `bridge/escape-for-json.applescript` and automatically prepended to every script at runtime.

## Known Limitations

### AppleScript Foundation

This MCP communicates with Mail.app via AppleScript, which is a stable but legacy automation layer. Mail.app's scripting dictionary has been largely unchanged for years, but future macOS updates could require script adjustments. This is an inherent trade-off of the approach — AppleScript is the only officially supported way to automate Mail.app without writing a native plugin.

### Performance

- **Large mailbox searches** — `search_messages` uses Mail.app's `whose` clause, which performs a linear scan and loads all matching messages into memory before applying the limit. Searching by `content` (message bodies) on very large IMAP mailboxes (50K+ messages) can be slow or timeout. Prefer searching by `subject` or `sender` when possible, and narrow results with `accountName` and `mailboxName`.
- **IMAP attachment downloads** — Attachments on IMAP accounts may not be downloaded locally. The tools check download status and report clearly when an attachment needs to be opened in Mail.app first.

### Message IDs

Mail.app's internal message IDs are volatile — they can change when the app reindexes, or after move/delete operations. This means multi-step workflows (e.g., list → flag → move) should re-fetch message IDs between mutations. For single-step operations this is not an issue.

### Provider-Specific Behavior

- **Exchange accounts** — Server details (hostname, port, SSL) are not exposed via AppleScript for Exchange/EWS accounts. Mailbox and message operations work normally.
- **Gmail labels** — `move_message` adds the destination label but may not remove the original (Gmail uses labels, not folders).

### Other Limitations

- **Attachments on replies/forwards** — AppleScript does not support adding new attachments to reply/forward messages (Mail.app limitation).
- **MIME type detection** — Uses extension-based fallback when Mail.app's native MIME type property returns `missing value`.

## Development

```bash
npm run dev          # Watch mode (TypeScript compiler)
npm test             # Run tests
npm run test:watch   # Watch mode tests
npm run build        # Build for production
```

## License

MIT
