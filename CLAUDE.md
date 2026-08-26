# CLAUDE.md — macos-mail-mcp

## Project Overview

MCP (Model Context Protocol) server that connects Claude to macOS Mail.app via AppleScript. Provides 20 tools across 4 domains for full email management: reading, searching, composing, flagging, moving, deleting, and attachment handling.

Works with **any email account configured in Mail.app** — iCloud, Gmail, Outlook/Exchange, Yahoo, Fastmail, custom IMAP/POP, etc. No code changes needed when adding new accounts; just configure them in Mail.app.

## Operating layer

This repository governs itself: `.portulan/` is a `kind: repository` Portulan workspace, which the
boot skill finds automatically because it searches `${CLAUDE_PROJECT_DIR}/.portulan/`. It is not part
of the Sleepy Panda portfolio workspace.

- [`.portulan/identity.md`](.portulan/identity.md) — what this repository is, the stack, the
  three-layer shape, and the glossary. Start here.
- [`.portulan/gate-map.md`](.portulan/gate-map.md) — which actions are Auto, Propose, Gated,
  Prohibited. **Merge, publishing a release, pushing a tag, and `npm publish` by hand are Gated**:
  they need explicit approval, per action. No action is Prohibited.
- [`.portulan/dod.md`](.portulan/dod.md) — when a change is done here, including the 100% coverage
  bar and the rule that a verdict must post-date the head it judges.
- [`.portulan/principles.md`](.portulan/principles.md) — five principles, each naming the incident
  that produced it.
- [`.portulan/handoffs/`](.portulan/handoffs/) — the session record, dated `YYYY-MM-DD-{slug}.md`.
  Every session ends with one; read the most recent before starting.

It declares `tree: "../"`, so `doctor` lints the gate map's claims against this repository — it
checks that the required status check `verify` is one a workflow here actually reports. Nothing in
`.portulan/` ships to npm; `files: ["build"]` governs the tarball.

## Tech Stack

- **Runtime:** Node.js 20+ (`engines` floor; CI builds and tests on 20, 22 and 24)
- **Language:** TypeScript (ES2022, Node16 module resolution)
- **MCP SDK:** `@modelcontextprotocol/sdk` v1.x (stdio transport)
- **Mail integration:** AppleScript via `osascript` (execFile, not exec — prevents shell injection)
- **Validation:** Zod schemas on all tool inputs
- **Testing:** Vitest, mocked bridge — no real Mail.app needed. Coverage of `src/` is gated at
  **100%** (statements, branches, functions, lines) in `vitest.config.ts`, and CI runs
  `test:coverage`. The gate is the invariant; the raw test count is not tracked here because it goes
  stale on every change and nothing checks it.
- **The `.applescript` files are the exception, and it is a real one.** That 100% covers
  `src/**/*.ts` only. Because the bridge is mocked, the AppleScript templates are text handed to a
  mock rather than code that runs — which is how a handler that threw on any emoji subject shipped
  unexercised, found by an outside contributor (#33) rather than by the suite.
  `tests/bridge/escape-for-json.applescript.test.ts` executes the escaping handler through
  `osascript` for real. It **runs only on macOS and is skipped everywhere else, including CI**, so
  those assertions run on a maintainer's machine and never in the merge gate. Run
  `npm run test:coverage` locally before touching anything under `src/**/*.applescript`; the runner
  cannot do it for you.

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
  release-notes.mjs     — commit range → grouped GitHub release body
tests/
  index.test.ts                — Entry point: wiring, version, stdio, fatal path
  utils.test.ts                — Tests for sanitize, expandTilde
  helpers/capture-tools.ts     — Stub server for driving registered MCP tools
  bridge/                      — Escaping/parsing, and runAppleScript execution
  domains/*/                   — Handler and registration-layer tests
  release/                     — Version resolver, npmrc guard, release notes,
                                 workflow structure, and the script CLIs
```

Coverage thresholds apply to `src/` only, so `scripts/` does not count toward the 100%
gate — its tests are real tests and run in the same suite.

## Critical Patterns

### Shared escapeForJson Handler

The `escapeForJson` AppleScript function lives in `src/bridge/escape-for-json.applescript` and is **automatically prepended** to every script at runtime by the bridge. Domain scripts call it via `my escapeForJson(...)`. Never duplicate this handler into domain scripts.

That file defines **two** handlers — `escapeForJson` and its helper `joinStrings` — and prepending puts both into every script's namespace, alongside `resolveMailbox` and `mailboxFullName` from `resolve-mailbox.applescript`. All four are therefore reserved names in domain scripts. A script redefining one does **not** shadow it quietly: AppleScript refuses to compile the concatenated result — `The joinStrings handler is specified more than once. (-2752)` — so every call of that tool fails. Loud, which is the good outcome; the bad one is meeting -2752 with no idea why. `tests/bridge/prepended-handler-names.test.ts` enforces this, and it is the one check in this area that **runs in CI**, because it reads text rather than needing `osascript`.

Its shape is dictated by AppleScript's list performance rather than by taste (#42): the code-point list is held in a script object, and both accumulators are flushed at a fixed threshold so neither grows large. The header comment carries the measurements, including the ones that corrected an earlier draft of itself. **It is not O(n) and the comment does not claim it is** — a false complexity claim in that header was half of what #42 reported.

Two details in it are guards rather than optimisations, and both are pinned by tests. The "needs no escape" sentinel is compared with `(length of esc) = 0` rather than `esc is ""`, because `considering`/`ignoring` are dynamically scoped into called handlers and under `ignoring punctuation` a quote's escape compares equal to the empty string — measured, the handler then emitted raw quotes and backslashes. And every `string id runBuf` is guarded by a non-zero count because `string id {}` **segfaults `osascript`** (exit 139) rather than raising, so `try` cannot catch it.

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
npm test             # Run the suite
npm run test:coverage # Tests + coverage; fails below the 100% thresholds
npm run test:watch   # Watch mode
npm run dev          # TypeScript watch mode
```

## Releasing

**One run.** Actions tab → **Release** → Run workflow → `mode: publish`. That derives the
version, verifies everything, publishes to npm, pushes the tag and cuts the GitHub release.
`mode` defaults to `dry-run`, which does all of that except the irreversible parts.

### The tag is the source of truth

`package.json` in git holds **`0.0.0-development`** and is never updated by a release. The
version that ships is derived from the latest `v*` tag plus the conventional commits since
it, written into the working tree during the run, and never committed.

This is the standard `semantic-release` arrangement, and here it is what makes a single-run
release possible at all. `main` is protected with `enforce_admins`, so no actor can push a
commit to it — and on a **user-owned** repository GitHub Actions cannot be a ruleset bypass
actor (the API rejects it: the actor must belong to the owning organisation). Tags, by
contrast, are not branch-protected. So the release writes a tag and nothing else, and
branch protection stays fully intact with no bypass and no stored credential.

The consequence to remember: **the version in `package.json` is not the released version.**
Read the tag, the GitHub release, or npm.

`CHANGELOG.md` is maintained by hand in ordinary pull requests, since the workflow cannot
commit to it. GitHub release notes are generated from the commit range by
`scripts/release-notes.mjs`, grouped by conventional-commit type.

### Why the ordering is what it is

npm is published **first**; the tag is pushed only after the registry confirms the version
exists. Publishing is irreversible — npm will not reissue a version — while a tag is not.
So the reversible thing happens last, and only on success. A failed publish leaves no tag
behind, which is exactly the state v1.3.0 failed to achieve: it was tagged, then failed to
publish, and the tag outlived the attempt.

The version is derived once, from everything accumulated since the last tag — five merged
pull requests take 1.0.0 to 1.0.1, not 1.0.5. `scripts/next-version.mjs` is the resolver
(`feat` → minor, `fix`/`perf` → patch, `!` or `BREAKING CHANGE` → major, highest wins);
`tests/release/next-version.test.ts` is its spec. `bump` overrides it.

Note that the resolver types the bump from commit subjects, so a `feat(release):` touching
only the pipeline still reads as a minor even though nothing consumer-facing changed. That
is what the `bump` override is for.

**There is no tag trigger and no push trigger.** The tag is an output of a successful
publish, never its cause.

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

Register via `npx`, not a local build path. `npx` re-resolves the published version
at every server start, so an installed copy picks up each release on its own; a path
into `build/` is frozen at whatever was last compiled there.

**Claude Code CLI:**
```bash
claude mcp add --transport stdio --scope user macos-mail-mcp -- npx -y macos-mail-mcp@latest
```

**Claude Desktop:** Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
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

Both paths are placeholders on purpose. Claude Desktop needs the **absolute** path to
`npx` because GUI apps do not inherit the shell `PATH`, so a bare `"npx"` usually fails
to launch — and the right absolute path differs per install: `/opt/homebrew/bin/npx` on
Apple Silicon Homebrew, `/usr/local/bin/npx` on Intel, somewhere under `~/.nvm/versions`
with nvm. Find yours with `which npx`. The `env.PATH` entry exists so `npx` can then
locate `node`, for the same reason.

`@latest` is belt and braces rather than a fix. A bare package name already re-resolves
from the registry today: for a name with no version, npm skips the range-satisfies
shortcut and fetches the manifest with `preferOnline`, so the `"^1.3.0"` written into the
npx cache records the last install rather than pinning it. `@latest` takes the tag branch
instead, which re-resolves independently of that heuristic — so if npm ever changes it,
the bare form would freeze on an old version silently, with no signal. The cost is one
extra download, since the two forms hash to different cache keys.

Two consequences of resolving at start-up, both real:

- **An update only lands when the server process starts.** A long-running Claude Desktop
  keeps serving the version it launched with, however new the one on disk is. Restarting
  the app is what puts a new release live.
- **The check is a registry round-trip**, so with the registry unreachable the server
  fails to start at all rather than falling back to the cached copy. That is the trade-off
  of always-current; do not "fix" it by pinning a version.

**For development on this server**, register the local build instead — that is the point
of it, since you want the code in your working tree rather than the published release:

```bash
claude mcp add --transport stdio --scope user macos-mail-mcp-dev -- node /path/to/macos-mail-mcp/build/index.js
```

Register it under a different name so it does not shadow the published copy, and
remember it serves whatever `npm run build` last produced.
