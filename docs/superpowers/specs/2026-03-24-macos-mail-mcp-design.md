# macos-mail-mcp Design Spec

## Overview

An MCP (Model Context Protocol) server that connects Claude to the macOS Mail.app via AppleScript. Provides full read/write/manage capabilities: listing accounts and mailboxes, reading and searching messages, composing and sending emails, managing flags and read status, moving/deleting messages, and handling attachments.

**Language:** TypeScript
**MCP SDK:** `@modelcontextprotocol/sdk` v1.x (stdio transport)
**Mail integration:** AppleScript via `osascript`
**Project location:** `~/Projects/macos-mail-mcp`
**Package name:** `macos-mail-mcp`

## Architecture

**Domain-driven + layered AppleScript separation.** Four domain modules, each with its own tool registrations and `.applescript` template files. A shared bridge layer handles all AppleScript execution.

### Project Structure

```
~/Projects/macos-mail-mcp/
  package.json
  tsconfig.json
  CLAUDE.md                           # Project context for future Claude sessions
  src/
    index.ts                          # Entry point: creates McpServer, wires domains, starts stdio
    types.ts                          # Shared return type interfaces
    utils.ts                          # Shared utilities: sanitize(), expandTilde(), toolError()
    bridge/
      applescript-runner.ts           # Shared: executes .applescript files with param substitution
      escape-for-json.applescript     # Shared JSON escaping handler (auto-prepended to all scripts)
    domains/
      accounts/
        accounts.tools.ts             # Tool registrations for account operations
        scripts/
          list-accounts.applescript
          get-account-detail.applescript
      mailboxes/
        mailboxes.tools.ts            # Tool registrations for mailbox operations
        scripts/
          list-mailboxes.applescript
          get-mailbox-info.applescript
      messages/
        messages.tools.ts             # Tool registrations for message operations
        scripts/
          list-messages.applescript
          get-message.applescript
          search-messages.applescript
          move-message.applescript
          delete-message.applescript
          flag-message.applescript
          mark-read.applescript
          list-attachments.applescript
          save-attachment.applescript
          save-all-attachments.applescript
          read-attachment.applescript
      compose/
        compose.tools.ts              # Tool registrations for compose operations
        scripts/
          send-message.applescript
          reply-to-message.applescript
          forward-message.applescript
  build/                              # Compiled JS output
```

### AppleScript Bridge (`src/bridge/applescript-runner.ts`)

Single module responsible for all `osascript` interaction.

**Responsibilities:**
- Load `.applescript` template files from disk
- Prepend the shared `escape-for-json.applescript` handler to every script at runtime
- Substitute `{{paramName}}` placeholders with escaped values
- Write the interpolated script to a temp file and execute via `execFile("osascript", [tempFilePath])`. Using a temp file (rather than `-e`) avoids issues with very long scripts and makes debugging easier — the temp file can be inspected if execution fails.
- Parse JSON output from AppleScript into typed objects
- Catch and wrap errors (non-zero exit, stderr, timeout) into consistent error format
- Clean up temp files after execution

**Shared Utilities (`src/utils.ts`):**
- `sanitize(value)` — strips `\r` and `\n` from string params to prevent AppleScript syntax errors
- `expandTilde(path)` — expands `~/` to the user's home directory (done on the TypeScript side since AppleScript's `quoted form of` suppresses tilde expansion)
- `toolError(error)` — formats caught errors into MCP tool error response objects

**Timeouts:**
- Default: 30 seconds for most operations
- Extended: 120 seconds for attachment operations (`save_attachment`, `save_all_attachments`, `read_attachment`) and `search_messages` (content search on IMAP can be very slow)

**Security note:** Uses `execFile` (not `exec`) to avoid spawning a shell, preventing shell metacharacter injection. Template parameters are escaped (quotes → `\"`, backslashes → `\\`) before substitution into the AppleScript string to prevent AppleScript injection.

**Output convention:**
- All AppleScript templates return JSON-formatted strings (built via string concatenation in AppleScript)
- The bridge parses this JSON and returns typed objects to tool handlers

### AppleScript Template Convention

**Important:** The `escapeForJson` handler is defined once in `src/bridge/escape-for-json.applescript` and automatically prepended to every script at runtime by the bridge. Domain scripts must NOT define it locally — they call it via `my escapeForJson(...)`.

All templates follow this pattern:

```applescript
-- example.applescript
-- Note: escapeForJson is auto-prepended by the bridge — do not include it here
tell application "Mail"
    try
        set acct to account "{{accountName}}"
        set acctName to my escapeForJson(name of acct)
        -- ... build JSON using my escapeForJson() on all string values ...
        return "{\"name\": \"" & acctName & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
```

Key conventions:
- All templates are wrapped in `try`/`on error` blocks
- All string values in JSON output pass through `my escapeForJson(...)` to handle quotes, newlines, tabs, and C0 control characters
- All `errMsg` values in error handlers pass through `my escapeForJson(errMsg)` to prevent invalid JSON from Mail.app error messages containing quotes
- Errors return `{"error": "...", "errorNumber": N}` — the bridge detects this and throws a typed error
- Parameters use `{{paramName}}` placeholders, substituted before execution
- JSON is built via string concatenation (AppleScript has no native JSON support)
- Multi-line content (email body, attachment paths, attachment names) is passed via temp files — not template substitution — because AppleScript string literals cannot span multiple lines
- Exchange/EWS accounts may return `missing value` for server properties — wrap in `try`/`on error` blocks with safe defaults
- MIME type detection uses `mimeFromExtension()` fallback when Mail.app's native property returns `missing value`

## Message Identification

**`messageId`** refers to Mail.app's AppleScript `id` property — a unique integer assigned by Mail to each message. This ID is stable within a Mail session and across mailbox operations.

- `list_messages` and `search_messages` include `id` in their output so it can be passed to downstream tools
- The ID is used in AppleScript as: `message id {{messageId}} of mailbox "{{mailboxName}}" of account "{{accountName}}"`

## Return Types

```typescript
interface Account {
  name: string;
  type: "imap" | "pop" | "iCloud" | "unknown";
  enabled: boolean;
  emails: string[];
}

interface AccountDetail extends Account {
  serverName: string;
  port: number;
  usesSsl: boolean;
  userName: string;
  mailboxCount: number;
}

interface Mailbox {
  name: string;
  unreadCount: number;
  accountName: string;
}

interface MailboxDetail extends Mailbox {
  messageCount: number;
  container: string | null;  // parent mailbox name, if nested
}

interface MessageSummary {
  id: number;              // Mail.app's AppleScript id property
  subject: string;
  sender: string;
  dateReceived: string;    // ISO 8601
  readStatus: boolean;
  flagged: boolean;
  flagIndex: number;       // -1 = not flagged, 0-6 = flag colors
  hasAttachments: boolean;
}

interface MessageDetail extends MessageSummary {
  toRecipients: Recipient[];
  ccRecipients: Recipient[];
  bccRecipients: Recipient[];
  body: string;            // plain text via Mail's `content` property
  headers: string;         // raw header block via `all headers` property
  attachments: Attachment[];
}

interface Recipient {
  name: string;
  address: string;
}

interface Attachment {
  name: string;
  mimeType: string;
  fileSize: number;        // bytes
  downloaded: boolean;
}
```

**Notes on `MessageDetail`:**
- `body` is retrieved via Mail.app's `content` property, which returns plain text even for HTML emails. This is a Mail.app AppleScript limitation — the `html content` property is deprecated and non-functional.
- `headers` is retrieved via `all headers` (returns all headers as a single text block) rather than `every header` (which can throw -1728 errors on some messages). Callers can parse the raw header string as needed.

## Tools

### Accounts Domain (2 tools)

| Tool | Params | Description |
|---|---|---|
| `list_accounts` | none | List all mail accounts. Returns `Account[]`. |
| `get_account_detail` | `accountName` | Get full details for a specific account. Returns `AccountDetail`. |

### Mailboxes Domain (2 tools)

| Tool | Params | Description |
|---|---|---|
| `list_mailboxes` | `accountName` (optional) | List mailboxes for an account or all accounts. Returns `Mailbox[]`. |
| `get_mailbox_info` | `accountName`, `mailboxName` | Get details for a specific mailbox. Returns `MailboxDetail`. |

### Messages Domain (11 tools)

**Reading & Searching:**

| Tool | Params | Description |
|---|---|---|
| `list_messages` | `accountName`, `mailboxName`, `limit` (default 25), `offset` (default 0) | List messages with pagination. Returns `MessageSummary[]`. |
| `get_message` | `messageId`, `mailboxName`, `accountName` | Get full message content. Returns `MessageDetail`. |
| `search_messages` | `field` (subject/sender/content), `query`, `mailboxName` (optional), `accountName` (optional), `limit` (default 50) | Search messages using Mail's `whose` clause. Returns `MessageSummary[]`. Note: searching by `content` field requires Mail to have the message body available locally — IMAP lazy-loading may cause some messages to be missed. |

**Managing:**

| Tool | Params | Description |
|---|---|---|
| `move_message` | `messageId`, `mailboxName`, `toMailbox`, `accountName` | Move a message to a different mailbox. Uses AppleScript `set mailbox of msg to`. |
| `delete_message` | `messageId`, `mailboxName`, `accountName` | Delete a message. Uses Mail.app's `delete` verb, which automatically routes to the correct Trash mailbox regardless of provider (Gmail, Exchange, IMAP). |
| `flag_message` | `messageId`, `mailboxName`, `accountName`, `flagged` (bool), `flagIndex` (optional, 0-6) | Set/clear flag on a message. |
| `mark_read` | `messageId`, `mailboxName`, `accountName`, `read` (bool) | Mark message as read/unread. |

**Attachments:**

| Tool | Params | Description |
|---|---|---|
| `list_attachments` | `messageId`, `mailboxName`, `accountName` | List all attachments. Returns `Attachment[]`. |
| `save_attachment` | `messageId`, `mailboxName`, `accountName`, `attachmentName`, `savePath` (default `~/Downloads`) | Save a specific attachment to disk. Uses 120s timeout. |
| `save_all_attachments` | `messageId`, `mailboxName`, `accountName`, `savePath` (default `~/Downloads`) | Save all attachments from a message to disk. Uses 120s timeout. |
| `read_attachment` | `messageId`, `mailboxName`, `accountName`, `attachmentName` | Save to temp file, read and return text content inline. Supports: `.txt`, `.csv`, `.json`, `.html`, `.md`, `.xml`, `.log`. Returns error for binary files, suggesting `save_attachment` instead. Uses 120s timeout. |

### Compose Domain (3 tools)

| Tool | Params | Description |
|---|---|---|
| `send_message` | `to`, `subject`, `body`, `cc` (optional), `bcc` (optional), `attachmentPaths` (optional) | Compose and send a new email. Body is sent as plain text via the `content` property of `outgoing message`. |
| `reply_to_message` | `messageId`, `mailboxName`, `accountName`, `body`, `replyAll` (bool, default false) | Reply to a message. Does not support adding attachments — this is a Mail.app AppleScript limitation. |
| `forward_message` | `messageId`, `mailboxName`, `accountName`, `to`, `body` (optional) | Forward a message. Does not support adding new attachments — this is a Mail.app AppleScript limitation. |

**Compose limitations:** Mail.app AppleScript does not reliably support adding attachments to replies or forwards. Only `send_message` (new compositions) supports `attachmentPaths`. The `reply` and `forward` AppleScript commands return an `outgoing message`, but adding attachments to it often fails silently.

## Error Handling

**AppleScript failures:**
- Mail.app not running → "Mail.app is not running. Please open it first."
- Invalid message ID / mailbox name → "Message not found" / "Mailbox not found"
- Timeout (>30s / >120s for attachment ops) → process killed, timeout error returned

**Mail-specific edge cases:**
- IMAP attachments not yet downloaded → `list_attachments` shows `downloaded: false`; `save_attachment`/`read_attachment` report "Attachment not yet downloaded by Mail"
- Gmail label behavior → `move_message` tool description warns: "Gmail uses labels rather than folders. Moving a message adds the destination label but may not remove the original label. The message may remain visible in both locations."
- Large mailboxes → `search_messages` and `list_messages` tool descriptions warn that operations on mailboxes with thousands of messages may be slow
- Empty results → return empty arrays, not errors

**Parameter validation:**
- Zod schemas validate all inputs before AppleScript execution
- String params pass through `sanitize()` (strips newlines/CR) then `escapeForAppleScript()` (escapes `\` and `"`) before template substitution
- `save_all_attachments` deduplicates attachment filenames to prevent overwriting (e.g., `image.png`, `image (2).png`)

## Supported Accounts

Works with **any email account configured in macOS Mail.app** — iCloud, Gmail, Outlook/Exchange, Yahoo, Fastmail, custom IMAP/POP, etc. No code changes are needed to support new providers; just add the account in Mail.app's preferences and it becomes available through all 18 tools.

**Provider-specific notes:**
- **Exchange/EWS:** Server details (hostname, port, SSL) are not exposed via AppleScript. `get_account_detail` returns empty defaults for these fields. All other operations work normally.
- **Gmail:** Uses labels instead of folders. `move_message` adds the destination label but may not remove the original.

## Registration & Configuration

**Register in Claude Code (user scope, available globally):**

```bash
claude mcp add --transport stdio --scope user macos-mail-mcp -- node ~/Projects/macos-mail-mcp/build/index.js
```

**Register in Claude Desktop / Cowork:**

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

**macOS permissions:**
- First `osascript` call targeting Mail.app triggers a macOS automation permission prompt
- Parent process (Terminal / Claude Code) needs "control Mail.app" permission in System Settings > Privacy & Security > Automation
- No additional entitlements or signing required

## Dependencies

**Runtime:**
- `@modelcontextprotocol/sdk` — MCP server framework
- `zod` — input schema validation

**Dev:**
- `typescript`
- `@types/node`

No other runtime dependencies. `child_process`, `fs`, and `os` (for temp dir) are Node built-ins.

## Build & Run

```bash
npm run build    # tsc → build/
node build/index.js   # Run directly (or via Claude Code MCP config)
```

The compiled `build/index.js` includes a `#!/usr/bin/env node` shebang.
