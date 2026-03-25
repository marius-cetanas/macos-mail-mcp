# CLAUDE.md — macos-mail-mcp

## Project Overview

MCP (Model Context Protocol) server that connects Claude to macOS Mail.app via AppleScript. Provides 18 tools across 4 domains for full email management: reading, searching, composing, flagging, moving, deleting, and attachment handling.

Works with **any email account configured in Mail.app** — iCloud, Gmail, Outlook/Exchange, Yahoo, Fastmail, custom IMAP/POP, etc. No code changes needed when adding new accounts; just configure them in Mail.app.

## Tech Stack

- **Language:** TypeScript (ES2022, Node16 module resolution)
- **MCP SDK:** `@modelcontextprotocol/sdk` v1.x (stdio transport)
- **Mail integration:** AppleScript via `osascript` (execFile, not exec — prevents shell injection)
- **Validation:** Zod schemas on all tool inputs
- **Testing:** Vitest (56 unit tests, mocked bridge — no real Mail.app needed)

## Architecture

Domain-driven layered design with 3 layers:

```
Tools layer (*.tools.ts)     → Zod validation, MCP registration, handler functions
Bridge layer (applescript-runner.ts) → Template loading, param substitution, osascript execution, JSON parsing
Script layer (*.applescript)  → AppleScript templates with {{param}} placeholders
```

### Key Directories

```
src/
  index.ts              — Entry point: creates McpServer, wires 4 domains, starts stdio
  types.ts              — TypeScript interfaces (Account, Mailbox, MessageSummary, etc.)
  utils.ts              — Shared utilities: sanitize(), expandTilde(), toolError()
  bridge/
    applescript-runner.ts       — Core engine: loads scripts, substitutes params, runs osascript
    escape-for-json.applescript — Shared JSON escaping handler (auto-prepended to every script)
  domains/
    accounts/   — 2 tools: list_accounts, get_account_detail
    mailboxes/  — 2 tools: list_mailboxes, get_mailbox_info
    messages/   — 11 tools: list, get, search, move, delete, flag, mark_read, + 4 attachment tools
    compose/    — 3 tools: send_message, reply_to_message, forward_message
tests/
  utils.test.ts                — Tests for sanitize, expandTilde
  bridge/applescript-runner.test.ts — Tests for escaping, param substitution, JSON parsing
  domains/*/                   — Handler tests with mocked bridge
```

## Critical Patterns

### Shared escapeForJson Handler

The `escapeForJson` AppleScript function lives in `src/bridge/escape-for-json.applescript` and is **automatically prepended** to every script at runtime by the bridge. Domain scripts call it via `my escapeForJson(...)`. Never duplicate this handler into domain scripts.

### Multi-line Content via Temp Files

AppleScript string literals cannot span multiple lines. Any content that may contain newlines is written to a temp file in TypeScript and read via `do shell script "cat ..."` in AppleScript:
- **Email body** — compose tools write to `body.txt`
- **Attachment paths** — send_message writes to `attachments.txt` (one path per line)
- **Attachment names** — save/read_attachment write to `attname.txt`

Always clean up temp files in a `finally` block.

### sanitize() Function

All string parameters injected into AppleScript string literals (account names, mailbox names, subjects, etc.) must be passed through `sanitize()` from `src/utils.ts`. This strips `\r` and `\n` that would break AppleScript syntax. Import from utils, never redefine locally.

### Parameter Escaping

`escapeForAppleScript()` in the bridge escapes `\` and `"` for safe embedding in AppleScript double-quoted strings. This runs automatically via `substituteParams()` — tool handlers don't call it directly.

### Error Handling

- AppleScript scripts use `try`/`on error` blocks, returning `{"error": "...", "errorNumber": N}`
- The bridge detects this shape and throws a typed Error
- Tool registrations use `toolError()` from utils.ts to format errors for MCP
- All `errMsg` values in AppleScript are passed through `my escapeForJson(errMsg)` to prevent invalid JSON

### Timeouts

- `DEFAULT_TIMEOUT` (30s) — most operations
- `EXTENDED_TIMEOUT` (120s) — attachment operations + search_messages (content search on IMAP can be slow)

## How to Add a New Tool

1. Choose the domain (`accounts`, `mailboxes`, `messages`, or `compose`)
2. Create `src/domains/<domain>/scripts/<tool-name>.applescript`:
   - Use `{{param}}` placeholders for inputs
   - Call `my escapeForJson(...)` on any string going into JSON output
   - Return JSON string, use `on error` with escaped errMsg
   - Do NOT include `escapeForJson` handler — it's auto-prepended
3. Add handler function in `src/domains/<domain>/<domain>.tools.ts`:
   - Import `sanitize`, `toolError` from utils; `runAppleScript` from bridge
   - Call `sanitize()` on all string params before passing to runAppleScript
   - Use `EXTENDED_TIMEOUT` for potentially slow operations
4. Register the tool with `server.tool(name, description, zodSchema, handler)`
5. Add unit test in `tests/domains/<domain>/`
6. Run `npm run build && npm test`

## How to Add a New Domain

1. Create `src/domains/<name>/<name>.tools.ts` with `registerXxxTools(server)` function
2. Create `src/domains/<name>/scripts/` directory for AppleScript templates
3. Import and call `registerXxxTools(server)` in `src/index.ts`
4. Add tests in `tests/domains/<name>/`

## Known Gotchas

- **Exchange accounts** return `missing value` for server/port/SSL properties. Always wrap these in `try`/`on error` in AppleScript.
- **Message IDs are volatile** — Mail.app can reassign IDs after reindexing. Always fetch fresh IDs before operating on messages.
- **Gmail labels vs folders** — `move_message` adds the destination label but may not remove the original.
- **MIME type** often returns `missing value` from Mail.app. Scripts use `mimeFromExtension()` as fallback.
- **Attachment names with quotes/backslashes** — handled via temp file matching to avoid escaping mismatches.
- **`whose` clause performance** — Mail.app loads ALL matching messages into memory before applying limits. Warn users to scope searches by account/mailbox.

## Build & Test

```bash
npm run build        # tsc + copy .applescript files to build/
npm test             # Run 56 unit tests
npm run test:watch   # Watch mode
npm run dev          # TypeScript watch mode
```

## Registration

**Claude Code CLI:**
```bash
claude mcp add --transport stdio --scope user macos-mail-mcp -- node ~/Projects/macos-mail-mcp/build/index.js
```

**Claude Desktop / Cowork:** Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "macos-mail-mcp": {
      "command": "node",
      "args": ["/Users/<username>/Projects/macos-mail-mcp/build/index.js"]
    }
  }
}
```
