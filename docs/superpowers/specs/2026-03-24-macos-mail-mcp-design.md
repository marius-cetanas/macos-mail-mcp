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
  src/
    index.ts                          # Entry point: creates McpServer, wires domains, starts stdio
    types.ts                          # Shared return type interfaces
    bridge/
      applescript-runner.ts           # Shared: executes .applescript files with param substitution
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
- Substitute `{{paramName}}` placeholders with escaped values
- Write the interpolated script to a temp file and execute via `child_process.execFile("osascript", [tempFilePath])`. Using a temp file (rather than `-e`) avoids issues with very long scripts and makes debugging easier — the temp file can be inspected if execution fails.
- Parse JSON output from AppleScript into typed objects
- Catch and wrap errors (non-zero exit, stderr, timeout) into consistent error format
- Clean up temp files after execution

**Timeouts:**
- Default: 30 seconds for most operations
- Extended: 120 seconds for attachment operations (`save_attachment`, `save_all_attachments`, `read_attachment`) since large attachments over IMAP may need to be downloaded first

**Security note:** Uses `execFile` (not `exec`) to avoid spawning a shell, preventing shell metacharacter injection. Template parameters are escaped (quotes → `\"`, backslashes → `\\`) before substitution into the AppleScript string to prevent AppleScript injection.

**Output convention:**
- All AppleScript templates return JSON-formatted strings (built via string concatenation in AppleScript)
- The bridge parses this JSON and returns typed objects to tool handlers

### AppleScript Template Convention

All templates follow this pattern:

```applescript
-- list-accounts.applescript
-- Returns JSON array of account objects
tell application "Mail"
    try
        set accountList to ""
        set allAccounts to every account
        repeat with acct in allAccounts
            set acctName to name of acct
            set acctType to account type of acct as text
            set acctEnabled to enabled of acct
            set acctEmails to email addresses of acct
            -- Build JSON for this account
            set emailsJson to ""
            repeat with i from 1 to count of acctEmails
                if i > 1 then set emailsJson to emailsJson & ", "
                set emailsJson to emailsJson & "\"" & item i of acctEmails & "\""
            end repeat
            if accountList is not "" then set accountList to accountList & ", "
            set accountList to accountList & "{\"name\": \"" & acctName & "\", \"type\": \"" & acctType & "\", \"enabled\": " & acctEnabled & ", \"emails\": [" & emailsJson & "]}"
        end repeat
        return "[" & accountList & "]"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
```

Key conventions:
- All templates are wrapped in `try`/`on error` blocks
- Errors return `{"error": "...", "errorNumber": N}` — the bridge detects this and throws a typed error
- Parameters use `{{paramName}}` placeholders, substituted before execution
- JSON is built via string concatenation (AppleScript has no native JSON support)

## Message Identification

**`messageId`** refers to Mail.app's AppleScript `id` property — a unique integer assigned by Mail to each message. This ID is stable within a Mail session and across mailbox operations.

- `list_messages` and `search_messages` include `id` in their output so it can be passed to downstream tools
- The ID is used in AppleScript as: `message id {{messageId}} of mailbox "{{mailboxName}}" of account "{{accountName}}"`

## Return Types

```typescript
interface Account {
  name: string;
  type: "imap" | "pop" | "iCloud";
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
- String params escaped to prevent AppleScript injection

## Registration & Configuration

**Register in Claude Code (user scope, available globally):**

```bash
claude mcp add --transport stdio --scope user macos-mail-mcp -- node ~/Projects/macos-mail-mcp/build/index.js
```

**Resulting config in `~/.claude.json`:**

```json
{
  "mcpServers": {
    "macos-mail-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/mariuscetanas/Projects/macos-mail-mcp/build/index.js"]
    }
  }
}
```

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
