# macos-mail-mcp

[![npm version](https://img.shields.io/npm/v/macos-mail-mcp.svg)](https://www.npmjs.com/package/macos-mail-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)
[![macOS](https://img.shields.io/badge/platform-macOS-blue.svg)](https://www.apple.com/macos/)

An MCP server for Apple Mail (macOS Mail.app) that connects Claude to your email via AppleScript. Provides 20 tools for reading, searching, managing, and composing emails.

## Supported Accounts

Works with **any email account configured in macOS Mail.app** — iCloud, Gmail, Outlook/Exchange, Yahoo, Fastmail, custom IMAP/POP, etc. No code changes needed; just add the account in Mail.app and it becomes available through all 20 tools.

## Requirements

- macOS with Mail.app configured (with at least one email account)
- Node.js 20+
- Claude Code or Claude Desktop app

## Installation

### Quick Install (npm)

The easiest way — no cloning or building required.

> **Claude Code and Claude Desktop use separate MCP configs.** The `claude mcp add` command below configures **Claude Code only** — it writes to `~/.claude.json`. **Claude Desktop and Cowork** read a different file (`claude_desktop_config.json`) and must be configured separately. Set up whichever you use, or both.

**Claude Code (CLI):**

```bash
claude mcp add --transport stdio --scope user macos-mail-mcp -- npx -y macos-mail-mcp@latest
```

`--scope user` makes the server available in every project — the default `local` scope only registers it for the directory you run the command in. `-y` lets `npx` install the package on first run without an interactive prompt. `@latest` makes the auto-update behaviour explicit — see [Staying up to date](#staying-up-to-date).

**Claude Desktop (and Cowork):**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "macos-mail-mcp": {
      "command": "/absolute/path/to/npx",
      "args": ["-y", "macos-mail-mcp@latest"],
      "env": { "PATH": "/absolute/path/to/node/bin:/usr/bin:/bin" }
    }
  }
}
```

Both paths above are placeholders. Use the **absolute path** to `npx` — GUI apps don't inherit your shell's `PATH`, so a bare `"npx"` usually fails to launch, and the correct path differs per install. Find yours with `which npx`:

- Apple Silicon Homebrew: `/opt/homebrew/bin/npx`
- Intel Homebrew: `/usr/local/bin/npx`
- nvm: `~/.nvm/versions/node/<version>/bin/npx`

The `env.PATH` entry lets `npx` locate `node` for the same reason. Then **fully quit** Claude (Cmd+Q — closing the window isn't enough) and reopen; the config is only read at startup. If the server doesn't appear, check `~/Library/Logs/Claude/mcp*.log` for spawn errors.

### Staying up to date

Installed copies update themselves. `npx` re-resolves the published version every time
the server starts, so a new release is picked up without you touching the config.

`@latest` in the commands above makes that explicit rather than changing it. A bare
package name already re-resolves today: npm skips the range-satisfies shortcut for a name
with no version and fetches the manifest with `preferOnline`, so the `"^1.3.0"` that
appears in the npx cache records the last install rather than pinning it. `@latest` takes
the tag branch instead, which does not depend on that heuristic — so if npm ever changes
it, the bare form would freeze on an old version silently. The cost is one extra download,
because the two forms hash to different cache keys.

Two consequences worth knowing:

- **Updates land at server start, not while it is running.** A long-running Claude Desktop
  keeps serving the version it launched with. Quit and reopen it to pick up a release.
- **The check is a registry round-trip.** With the registry unreachable the server fails to
  start rather than falling back to the cached copy. That is the price of always-current;
  pinning a version to avoid it gives up the updates.

### Install from Source

For working on the server itself. This path does **not** auto-update — it runs whatever
`npm run build` last produced in your working tree, which is exactly what you want while
developing and not what you want otherwise.

```bash
git clone https://github.com/marius-cetanas/macos-mail-mcp.git
cd macos-mail-mcp
npm install
npm run build
```

Then register with Claude Code. Use a distinct name so the local build does not shadow a
published copy you may also have registered:

```bash
claude mcp add --transport stdio --scope user macos-mail-mcp-dev -- node /path/to/macos-mail-mcp/build/index.js
```

Or add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "macos-mail-mcp-dev": {
      "command": "/absolute/path/to/node",
      "args": ["/path/to/macos-mail-mcp/build/index.js"]
    }
  }
}
```

Use the absolute path to `node` here too (find yours with `which node`) — same `PATH` reason as above. Then fully quit and reopen Claude.

### macOS Permissions

On first use, macOS will prompt to grant automation permission for controlling Mail.app. Go to **System Settings > Privacy & Security > Automation** to manage this.

## Tools

### Accounts (2)

| Tool | Description |
|---|---|
| `list_accounts` | List all mail accounts (name, type, enabled, full name, emails) |
| `get_account_detail` | Get full account details (server, port, SSL, mailbox count) |

### Mailboxes (3)

| Tool | Description |
|---|---|
| `list_mailboxes` | List mailboxes for an account or all accounts |
| `get_mailbox_info` | Get mailbox details (message count, unread count) |
| `create_mailbox` | Create a new mailbox (top-level or nested under a parent) |

### Messages (8)

| Tool | Description |
|---|---|
| `list_messages` | List messages with pagination (limit/offset) and optional date filtering (after/before) |
| `get_message` | Get full message content, headers, recipients, attachments. Mailbox name is optional — omit to search all mailboxes in the account. |
| `search_messages` | Search by subject, sender, or content with optional date filtering (after/before). Results include the mailbox name. |
| `move_message` | Move a message to a different mailbox |
| `move_messages` | Bulk move multiple messages to a different mailbox in a single operation |
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

All three accept an optional `fromAccount` to choose which account sends, and report
the account actually used — see [Choosing the sending account](#choosing-the-sending-account).

### Choosing the sending account

By default Mail sends from whichever account is set under **Settings → Composing →
"Send new messages from"**. Pass `fromAccount` to override it, using either the account
name or any address that account owns (matching is case-insensitive):

```jsonc
{ "to": "client@example.com", "subject": "Invoice", "body": "…",
  "fromAccount": "you@work.com" }
```

An unrecognised value is an error listing the accounts you can choose from — it never
silently falls back to the default. Only enabled accounts can be selected.

Every compose tool returns the account it actually sent from, whether or not you passed
`fromAccount`:

```json
{ "success": true, "sender": "Your Name <you@work.com>" }
```

Omitting `fromAccount` is still the way to accept Mail's own choice; the `sender` in the
result tells you what that choice was, so a wrong sending account is visible immediately
rather than only discoverable later in the Sent mailbox.

On `reply_to_message` and `forward_message`, note that `accountName` is not a sender
selector — it identifies where the *source* message lives. Use `fromAccount` to control
who the reply or forward comes from.

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
      sender.ts                     # Resolves fromAccount to a "Name <address>" sender
      scripts/*.applescript
tests/
  index.test.ts                     # Entry point: wiring, version, stdio
  utils.test.ts                     # Shared utility tests
  helpers/capture-tools.ts          # Stub server for exercising registered tools
  bridge/                           # Escaping/parsing + runAppleScript execution
  domains/*/                        # Handler and registration-layer tests
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
- **Mailbox management** — Creating mailboxes is supported, but deleting and renaming mailboxes is not possible via AppleScript (Mail.app limitation).

### Roadmap

- **`get_thread`** — Retrieve all messages in a conversation thread. Mail.app has no native threading support; implementation would require parsing RFC headers (`Message-ID`, `In-Reply-To`, `References`) which is slow on large mailboxes. Planned for v2.

## Development

```bash
npm run dev           # Watch mode (TypeScript compiler)
npm test              # Run tests
npm run test:coverage # Tests + coverage report
npm run test:watch    # Watch mode tests
npm run build         # Build for production
```

The suite covers `src/` fully, and `vitest.config.ts` enforces 100% statement,
branch, function and line thresholds. CI runs `test:coverage`, so new code
without tests fails the build.

## License

MIT
