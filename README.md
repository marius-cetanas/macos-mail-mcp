# macos-mail-mcp

An MCP (Model Context Protocol) server that connects Claude to macOS Mail.app via AppleScript. Provides 18 tools for reading, searching, managing, and composing emails.

## Requirements

- macOS with Mail.app configured
- Node.js 18+
- Claude Code or Claude Desktop app

## Installation

```bash
cd ~/Projects/macos-mail-mcp
npm install
npm run build
```

### Register with Claude Code (CLI)

```bash
claude mcp add --transport stdio --scope user macos-mail-mcp -- node ~/Projects/macos-mail-mcp/build/index.js
```

### Register with Claude Desktop / Cowork

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "macos-mail-mcp": {
      "command": "node",
      "args": ["/Users/<your-username>/Projects/macos-mail-mcp/build/index.js"]
    }
  }
}
```

Restart the Claude desktop app after adding the config.

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
  bridge/
    applescript-runner.ts            # AppleScript execution engine
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
  bridge/applescript-runner.test.ts  # Bridge unit tests
  domains/*/                         # Domain handler tests
```

**Domain-driven layered architecture:**
- **Tools layer** — Registers MCP tools with Zod schemas, validates input, calls the bridge
- **Bridge layer** — Reads AppleScript templates, substitutes parameters (with injection-safe escaping), executes via `osascript`, parses JSON output
- **Script layer** — AppleScript templates with `{{param}}` placeholders, returning JSON strings

## Known Limitations

- **Message IDs are volatile** — Mail.app's internal IDs can change when the app reindexes. Operations on recently moved/deleted messages may need a fresh `list_messages` call.
- **Exchange accounts** — Server details (hostname, port, SSL) are not exposed via AppleScript for Exchange/EWS accounts. Mailbox and message operations work normally.
- **Gmail labels** — `move_message` adds the destination label but may not remove the original (Gmail behavior).
- **Attachments on replies/forwards** — AppleScript does not support adding new attachments to reply/forward messages (Mail.app limitation).
- **Large mailbox searches** — `search_messages` uses Mail.app's `whose` clause which loads all matching messages before applying the limit. Very large mailboxes may be slow.
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
