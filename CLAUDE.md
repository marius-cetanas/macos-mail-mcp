# CLAUDE.md — macos-mail-mcp

## Project Overview

MCP (Model Context Protocol) server that connects Claude to macOS Mail.app via AppleScript. Provides 20 tools across 4 domains for full email management: reading, searching, composing, flagging, moving, deleting, and attachment handling.

Works with **any email account configured in Mail.app** — iCloud, Gmail, Outlook/Exchange, Yahoo, Fastmail, custom IMAP/POP, etc. No code changes needed when adding new accounts; just configure them in Mail.app.

## Tech Stack

- **Language:** TypeScript (ES2022, Node16 module resolution)
- **MCP SDK:** `@modelcontextprotocol/sdk` v1.x (stdio transport)
- **Mail integration:** AppleScript via `osascript` (execFile, not exec — prevents shell injection)
- **Validation:** Zod schemas on all tool inputs
- **Testing:** Vitest (280 unit tests at 100% coverage, mocked bridge — no real Mail.app needed)

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
    mailboxes/  — 3 tools: list_mailboxes, get_mailbox_info, create_mailbox
    messages/   — 8 message tools + 4 attachment tools (12 total in this domain)
    compose/    — 3 tools: send_message, reply_to_message, forward_message
                  sender.ts resolves the optional fromAccount to a sender string
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

### Sender Resolution

Compose tools take an optional `fromAccount` (account name or any address it owns).
`resolveSender()` in `src/domains/compose/sender.ts` reads the account list, matches
case-insensitively against **enabled** accounts only, and returns the `"Name <address>"`
string Mail expects in an outgoing message's `sender` property. It throws on no match or
on an ambiguous match — never falling back to the default account, since a silent fallback
sending mail from the wrong address is the bug this guards against.

Resolution runs *before* any temp-file setup so a bad value fails without leaving a
directory behind. Omitting `fromAccount` passes the `__NONE__` sentinel and the script
leaves `sender` alone, preserving Mail's own choice.

Every compose script reads `sender` back off the message **before** `send` and returns it,
so the result reports the account used even when the caller specified none.

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
- `EXTENDED_TIMEOUT` (120s) — attachment operations, search_messages, move_messages, get_message without mailboxName, date-filtered list_messages

### Date Filtering Pattern

ISO 8601 dates are converted to seconds-from-now in TypeScript (`dateToSecondsFromNow()`), passed as `{{afterSeconds}}`/`{{beforeSeconds}}` to AppleScript, then reconstructed: `set afterDate to (current date) - {{afterSeconds}}`. This avoids locale-dependent date parsing in AppleScript. Post-filtering is applied inside the repeat loop, not in the `whose` clause (which can't dynamically combine text and date criteria).

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
- **`full name` of an account** can be `missing value`; scripts wrap it in `try` and fall back to an empty string, which makes `resolveSender()` emit a bare address instead of `"Name <address>"`. Mail accepts both.
- **`accountName` on reply/forward is a lookup param**, not a sender selector — it feeds `resolveMailbox()` to find the source message. `fromAccount` controls who sends.
- **Reply/forward sender inheritance is unverified.** Whether Mail uses the receiving account or the global default when `sender` is unset has not been confirmed, so neither script sets a default. The `sender` returned in the result makes the actual behaviour observable.

## Build & Test

```bash
npm run build        # tsc + copy .applescript files to build/
npm test             # Run 280 unit tests
npm run test:coverage # Tests + coverage; fails below the 100% thresholds
npm run test:watch   # Watch mode
npm run dev          # TypeScript watch mode
```

## Registration

**Claude Code CLI:**
```bash
claude mcp add --transport stdio --scope user macos-mail-mcp -- node /path/to/macos-mail-mcp/build/index.js
```

**Claude Desktop:** Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
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
