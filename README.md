# macos-mail-mcp

[![npm version](https://img.shields.io/npm/v/macos-mail-mcp.svg)](https://www.npmjs.com/package/macos-mail-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 22.12+](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen.svg)](https://nodejs.org/)
[![macOS](https://img.shields.io/badge/platform-macOS-blue.svg)](https://www.apple.com/macos/)

An MCP server for Apple Mail (macOS Mail.app) that connects Claude to your email via AppleScript. Provides 20 tools for reading, searching, managing, and composing emails.

## Supported Accounts

Works with **any email account configured in macOS Mail.app** — iCloud, Gmail, Outlook/Exchange, Yahoo, Fastmail, custom IMAP/POP, etc. No code changes needed; just add the account in Mail.app and it becomes available through all 20 tools.

## Requirements

- macOS with Mail.app configured (with at least one email account)
- Node.js 22.12+
- An MCP client. Claude Code, Claude Desktop and Cowork are the ones set up below; any client
  that speaks MCP over stdio works.

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

`@latest` in the commands above makes that explicit rather than changing it. Why a bare
package name already re-resolves, why `@latest` is still worth writing, and what it costs are
in [CLAUDE.md](https://github.com/marius-cetanas/macos-mail-mcp/blob/main/CLAUDE.md#registration),
which the package does not ship.

Two consequences worth knowing:

- **Updates land at server start, not while it is running.** A long-running Claude Desktop
  keeps serving the version it launched with. Quit and reopen it to pick up a release.
- **The check is a registry round-trip.** With the registry unreachable the server fails to
  start rather than falling back to the cached copy. That is the price of always-current;
  pinning a version to avoid it gives up the updates.

What each version changed is in the [changelog](#changelog).

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

Account `type` is an open string: known IMAP/POP/iCloud/SMTP types use canonical names, and other
raw Mail type text is preserved. Backend-reported `unknown` remains `unknown`; the account's name
or email domain is not used to infer Exchange identity.

**Breaking account-detail contract:** `serverName`, `port` and `usesSsl` can now be `null` when
unsupported, missing or unavailable. Clients must handle null instead of relying on empty-string,
zero or false defaults. Genuine available values, including SSL `false` and port `0`, are preserved.

### Mailboxes (3)

| Tool | Description |
|---|---|
| `list_mailboxes` | List mailboxes for an account or all accounts |
| `get_mailbox_info` | Get mailbox details (message count, unread count) |
| `create_mailbox` | Ensure a mailbox exists (top-level or nested), reporting whether it was created or already existed |

For `create_mailbox`, `parentMailboxName` can be an existing parent name or full path. The tool
resolves that parent, checks the full slash path within the requested account, and reuses an
existing mailbox or creates an absent one. It returns the full path read back from Mail as
`mailboxName`, with `created: false, alreadyExisted: true` for an existing target and
`created: true, alreadyExisted: false` after creation. Lookup/permission failures return errors.
Omit the parent to address the account directly.

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

In `get_message` results, an absent recipient display name is the empty string in `name`.
The to/cc/bcc arrays preserve known names, addresses and recipient order.

`move_messages` validates every ID before looking up mailboxes or moving messages. Its result
reports `moved`, `failed` and an `errors` list containing each failed numeric ID and error text.
Dynamic integer fields use locale-independent decimal digits within JavaScript's safe integer range;
The shared formatter rejects invalid or out-of-range values. Account metadata treats an
unrepresentable port as unavailable and returns `port: null`.

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

For `send_message`, `attachmentPaths` must contain absolute paths to readable regular files;
paths containing CR, LF or NUL are rejected. Every file is checked before composing. The script
checks both the parsed path count and the outgoing content's attachment count against the number
requested before calling `send`. A mismatch fails without sending; Mail must also return `true`
from `send` before the tool reports success. This confirms Mail accepted the send command, not delivery.

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

Three layers, and the boundary between them is what keeps shell and AppleScript injection out.
**Tools** (`*.tools.ts`) validate input with Zod and register with MCP. The **bridge**
(`bridge/applescript-runner.ts`) loads a template, substitutes parameters with escaping, prepends
the shared `escapeForJson` handler and runs `osascript`, never a shell. **Scripts**
(`*.applescript`) are templates with `{{param}}` placeholders that return JSON. Handlers never
build script text themselves. The source tree and how to add a tool are in
[CONTRIBUTING.md](https://github.com/marius-cetanas/macos-mail-mcp/blob/main/CONTRIBUTING.md),
which the package does not ship either.

## Known Limitations

### AppleScript Foundation

This MCP communicates with Mail.app via AppleScript, which is a stable but legacy automation layer. Mail.app's scripting dictionary has been largely unchanged for years, but future macOS updates could require script adjustments. This is an inherent trade-off of the approach — AppleScript is the only officially supported way to automate Mail.app without writing a native plugin.

### Performance

- **Large mailbox searches** — `search_messages` uses Mail.app's `whose` clause, which performs a linear scan and loads all matching messages into memory before applying the limit. Searching by `content` (message bodies) on very large IMAP mailboxes (50K+ messages) can be slow or timeout. Prefer searching by `subject` or `sender` when possible, and narrow results with `accountName` and `mailboxName`. An unscoped or `content` search can outlast the client's timeout and leave Mail.app busy for around ten minutes afterwards, with nothing able to cancel it (#92).
- **IMAP attachment downloads** — Attachments on IMAP accounts may not be downloaded locally. The tools check download status and report clearly when an attachment needs to be opened in Mail.app first.

### Message IDs

Mail.app's internal message IDs are volatile — they can change when the app reindexes, or after move/delete operations. This means multi-step workflows (e.g., list → flag → move) should re-fetch message IDs between mutations. For single-step operations this is not an issue.

### Provider-Specific Behavior

- **Account connection details** — Server getters are used for reported IMAP/POP/iCloud/SMTP types;
  other types return null connection fields. The Mail dictionary inspected for this change declares
  pop/smtp/imap/iCloud/unknown, with no Exchange enumerator. If a backend reports Exchange as unknown,
  that value remains unknown; other raw type strings are preserved. Native Exchange/provider account
  retrieval has not been exercised by the local fixture tests.
- **Gmail labels** — `move_message` adds the destination label but may not remove the original (Gmail uses labels, not folders).

### Other Limitations

- **Attachments on replies/forwards** — AppleScript does not support adding new attachments to reply/forward messages (Mail.app limitation).
- **MIME type detection** — Uses extension-based fallback when Mail.app's native MIME type property returns `missing value`.
- **Mailbox management** — Creating mailboxes is supported, but deleting and renaming mailboxes is not possible via AppleScript (Mail.app limitation).

### Known issues

An end-to-end run of every tool against 2.0.0 filed twelve findings, #84 to #95; 2.1.0 changed
nothing in the server. The current source inserts reply/forward text and validates readback (#84),
and validates multiple attachment paths and prepared attachment counts (#85). File reads now
preserve valid UTF-8 text, line endings and trailing newlines (#86), and numeric JSON formatting
preserves mixed move results under comma-decimal coercion (#87). Nested mailbox creation uses
resolved full paths at the account and validates path readback (#88); existing targets are reused
with explicit status metadata (#89). Executable AppleScript
helper tests and Mail dictionary compilation cover these changes. Native Mail content
insertion, attachment enumeration and delivery still require an end-to-end check. Other findings:
`read_attachment` refuses a text attachment whose extension is not on its allowlist, `.ics` among
them (#94). The rest are in the [open issues](https://github.com/marius-cetanas/macos-mail-mcp/issues).

### Roadmap

- **`get_thread`** — Retrieve all messages in a conversation thread. Mail.app has no native threading support; implementation would require parsing RFC headers (`Message-ID`, `In-Reply-To`, `References`) which is slow on large mailboxes. Not scheduled: 2.0.0 and 2.1.0 shipped without it.

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

On macOS, `tests/domains/compose/send-attachments.applescript.test.ts` executes the production
attachment path parser and count/send guards and compiles the complete send template with its
shared handlers. It never creates or sends a Mail message. These executable AppleScript checks
are skipped on other platforms; the template wiring assertions still run there.

`tests/bridge/read-utf8-file.applescript.test.ts` executes the production body, attachment-path,
attachment-name and inline-content reads against local UTF-8 fixtures, checking JSON roundtrips
for LF, CRLF, CR, trailing newlines, empty files, Unicode, controls and BOMs. It also compiles all
affected templates. These macOS checks do not exercise Mail's attachment saving, content insertion
or delivery; other encodings and binary content are outside the UTF-8 reader's contract.

`tests/bridge/integer-for-json.applescript.test.ts` executes numeric formatting and partial move
result assembly with large IDs, audits every dynamic integer JSON field, and compiles all domain
templates. Its macOS checks use pure serialization fixtures; native Mail lookups and moves remain
unexercised.

`tests/domains/mailboxes/create-mailbox.applescript.test.ts` executes production path construction
and readback guards and compiles the complete creation template. It executes the production
existence/status branches and response assembly with fixture Mail primitives, checking existing/new
statuses and lookup/creation errors. Native mailbox creation and provider behavior remain unexercised.

`tests/domains/messages/recipient-names.applescript.test.ts` executes both production recipient
serializers and message JSON assembly using local recipient records, and compiles both lookup
templates. It does not read native Mail messages.

`tests/domains/accounts/account-metadata.applescript.test.ts` executes production type mapping and
account JSON with local records/getter fixtures, checks unavailable metadata and supported values,
and compiles both account templates. It does not query native accounts. SMTP server settings are
declared by Mail's dictionary; this does not establish that SMTP servers appear in account queries.

## Changelog

Every version's changes are in [CHANGELOG.md](CHANGELOG.md). It ships inside the npm package, so
an installed copy carries its own version's entries alongside its `package.json`; and each
GitHub release from 2.1.0 on opens its notes with that version's section, the commit list folded
beneath — when the section was recorded before the tag, which is the procedure here; a version
recorded late, as 1.3.1 was, gets the commit list alone. The 2.0.0 major changed only the Node.js
floor — the server itself was unchanged — which is the kind of fact this file exists to say, and
the reason it now ships (#96).

## License

MIT
