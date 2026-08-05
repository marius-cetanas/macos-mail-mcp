# CLAUDE.md — macos-mail-mcp

## Project Overview

MCP (Model Context Protocol) server that connects Claude to macOS Mail.app via AppleScript. Provides 20 tools across 4 domains for full email management: reading, searching, composing, flagging, moving, deleting, and attachment handling.

Works with **any email account configured in Mail.app** — iCloud, Gmail, Outlook/Exchange, Yahoo, Fastmail, custom IMAP/POP, etc. No code changes needed when adding new accounts; just configure them in Mail.app.

## Tech Stack

- **Runtime:** Node.js 20+ (`engines` floor; CI builds and tests on 20, 22 and 24)
- **Language:** TypeScript (ES2022, Node16 module resolution)
- **MCP SDK:** `@modelcontextprotocol/sdk` v1.x (stdio transport)
- **Mail integration:** AppleScript via `osascript` (execFile, not exec — prevents shell injection)
- **Validation:** Zod schemas on all tool inputs
- **Testing:** Vitest (330 unit tests; 100% coverage of `src/`, mocked bridge — no real Mail.app needed)

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
scripts/                — release tooling, not shipped in the package
  next-version.mjs      — conventional commits → next semver
  check-npmrc.mjs       — fails a release if anything would disable OIDC
tests/
  index.test.ts                — Entry point: wiring, version, stdio, fatal path
  utils.test.ts                — Tests for sanitize, expandTilde
  helpers/capture-tools.ts     — Stub server for driving registered MCP tools
  bridge/                      — Escaping/parsing, and runAppleScript execution
  domains/*/                   — Handler and registration-layer tests
  release/                     — Version resolver, npmrc guard, workflow structure
```

Coverage thresholds apply to `src/` only, so `scripts/` does not count toward the 100%
gate — its tests are real tests and run in the same suite.

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
npm test             # Run 330 unit tests
npm run test:coverage # Tests + coverage; fails below the 100% thresholds
npm run test:watch   # Watch mode
npm run dev          # TypeScript watch mode
```

## Releasing

Three steps, each requiring a human. Publishing to npm is a Gated action, and **nothing
publishes as a side effect of merging.**

1. **Run "Release prepare"** from the Actions tab. It derives the next version from the
   conventional commits since the last release tag, runs build, coverage and audit, and
   with `dry_run` (the default) reports the version and stops. Re-run with `dry_run`
   unchecked to push a `release/vX.Y.Z` branch carrying the bump and a changelog entry.
2. **Open the PR yourself** from the link the job prints, edit the changelog, and merge.
   This lands the version bump on `main`. It publishes nothing.
3. **Run "Release"** when you actually want to ship. It publishes whatever version is on
   `main` via OIDC, confirms the registry has it, then tags and cuts the GitHub release.
   It also takes a `dry_run` input that stops short of publishing.

Any number of pull requests may land on `main` between releases; merge volume never drives
the version number. The version is derived once, at prepare time, from everything
accumulated since the last release — so five merged PRs take 1.0.0 to 1.0.1, not 1.0.5.
`scripts/next-version.mjs` is the resolver (`feat` → minor, `fix`/`perf` → patch, `!` or
`BREAKING CHANGE` → major, highest bump wins, applied once);
`tests/release/next-version.test.ts` is its spec. The `bump` input overrides it when the
derived level is not what you want.

**The workflow does not open the PR** and must not be "improved" to do so: a pull request
created with `GITHUB_TOKEN` does not trigger workflow runs, so `ci-ok` would never report
and branch protection would leave it unmergeable.

**There is no tag trigger and no push trigger.** The tag is an output of a successful
publish, never its cause — so a failed publish cannot leave a tag pointing at a version
that does not exist on the registry. That happened to v1.3.0.

**Do not reintroduce `npm install -g npm@latest` into `release.yml`.** Upgrading the
toolchain mid-release makes the pipeline non-deterministic: a new npm major could change
publish behaviour on a run nobody touched. The workflow asserts the 11.5.1 floor instead
and fails if the pinned Node ships something older.

Before the first OIDC publish can work, npmjs.com → the package → Settings → Trusted
Publisher must name the org/user, the repo, the workflow **filename** (`release.yml`) and
allow `npm publish`. Renaming that file breaks publishing until the entry is updated.

**Do not add `registry-url` or `cache` to `actions/setup-node` in `release.yml`.**
`registry-url` writes `_authToken=${NODE_AUTH_TOKEN}` into a generated `.npmrc`; with no
token set that expands to empty, and an empty token still reads as configured auth, so npm
skips the OIDC exchange and publishes anonymously. The symptom is a bare `E404` on `PUT`,
which reads as a missing package rather than an auth failure. This cost the v1.3.0 release
(actions/setup-node#1551). `scripts/check-npmrc.mjs` fails the job on any real assignment —
matching assignments, not mentions, so a comment does not block a release.

Provenance attestations attach at publish time and cannot be added afterwards. A version
published outside OIDC has none, permanently; 1.3.0 is such a version.

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
