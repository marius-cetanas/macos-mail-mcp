# Contributing to macos-mail-mcp

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

```bash
git clone https://github.com/marius-cetanas/macos-mail-mcp.git
cd macos-mail-mcp
npm install
npm run build
npm test
```

**Requirements:** macOS with Mail.app, Node.js 20+.

## Project Structure

```
src/
  index.ts                          # MCP server entry point
  types.ts                          # TypeScript interfaces
  utils.ts                          # Shared utilities (sanitize, expandTilde, toolError)
  bridge/
    applescript-runner.ts            # AppleScript execution engine
    escape-for-json.applescript      # Shared JSON escaping (auto-prepended to all scripts)
  domains/
    accounts/                        # 2 tools
    mailboxes/                       # 2 tools
    messages/                        # 7 message + 4 attachment tools
    compose/                         # 3 tools
tests/                               # Vitest unit tests (mocked bridge)
```

## How to Add a New Tool

1. **Choose the domain** (`accounts`, `mailboxes`, `messages`, or `compose`)
2. **Create the AppleScript template** at `src/domains/<domain>/scripts/<tool-name>.applescript`:
   - Use `{{param}}` placeholders for inputs
   - Call `my escapeForJson(...)` on any string going into JSON output
   - Return a JSON string with `on error` handler using `my escapeForJson(errMsg)`
   - Do NOT include `escapeForJson` handler — it's auto-prepended by the bridge
3. **Add the handler** in `src/domains/<domain>/<domain>.tools.ts`:
   - Import `sanitize`, `toolError` from `../utils.js`; `runAppleScript` from the bridge
   - Call `sanitize()` on all string params before passing to `runAppleScript`
   - Use `EXTENDED_TIMEOUT` for potentially slow operations
4. **Register the tool** with `server.tool(name, description, zodSchema, handler)`
5. **Add tests** in `tests/domains/<domain>/` — cover the registered tool handler, not just the handler function
6. **Verify:** `npm run build && npm run test:coverage`

## How to Add a New Domain

1. Create `src/domains/<name>/<name>.tools.ts` with a `registerXxxTools(server)` function
2. Create `src/domains/<name>/scripts/` for AppleScript templates
3. Import and call `registerXxxTools(server)` in `src/index.ts`
4. Add tests in `tests/domains/<name>/`

## Key Patterns

- **Multi-line content** (email body, attachment paths, attachment names) goes through temp files, not template substitution. See compose tools for examples.
- **`sanitize()`** strips newlines/carriage returns from string params to prevent AppleScript syntax errors.
- **`escapeForAppleScript()`** runs automatically via `substituteParams()` — don't call it in handlers.
- **Error handling:** Use `toolError()` for consistent MCP error formatting.

## Running Tests

```bash
npm test              # Run all tests
npm run test:coverage # Tests + coverage, enforcing the thresholds CI uses
npm run test:watch    # Watch mode
```

Tests mock the AppleScript bridge, so they don't require Mail.app or real email accounts.

**Coverage is gated at 100%** — statements, branches, functions and lines — in
`vitest.config.ts`, and CI runs `test:coverage` rather than `test`. Adding code
without covering it fails the build, so run `npm run test:coverage` before
opening a PR rather than finding out in CI.

Cover the tool handler, not only the `handleXxx` function beneath it. Registering
a tool adds a `catch` block that turns a thrown error into an MCP `isError`
result; that path is only reached by invoking the registered handler. Use
`captureTools()` from `tests/helpers/capture-tools.ts`, which runs the real
`registerXxxTools()` against a stub server.

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-new-tool`)
3. Make your changes
4. Run `npm run build && npm run test:coverage` to verify
5. Commit with a descriptive message
6. Open a Pull Request

## Reporting Bugs

Please open an issue with:
- macOS version
- Node.js version (`node --version`)
- Mail.app account type (iCloud, Gmail, Exchange, etc.)
- The exact error message
- Steps to reproduce
