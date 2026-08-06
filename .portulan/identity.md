# Identity — macos-mail-mcp

**type:** identity
**scope:** repository — `marius-cetanas/macos-mail-mcp`

An MCP server that connects Claude to macOS Mail.app through AppleScript. 20 tools across four
domains: accounts, mailboxes, messages (including attachments), and compose. Published to npm and
consumed via `npx -y macos-mail-mcp@latest`.

One maintainer, working with coding agents. This is a **personal** repository, not a Sleepy Panda
product — it is governed here rather than by the Sleepy Panda portfolio workspace, which is what
[proposal 0017](https://github.com/sleepy-panda-works/portulan/blob/main/.portulan/proposals/0017-one-repository-one-governing-workspace.md)
means by one repository, one governing workspace.

## Stack

TypeScript on Node 20+, ES2022, Node16 module resolution. `@modelcontextprotocol/sdk` over stdio,
Zod on every tool input. Mail is driven by `osascript` through `execFile` — never a shell, which is
what keeps shell metacharacters inert. Vitest for tests.

## The shape that matters

Three layers, and the boundary between them is the thing to preserve:

- **Tools** (`*.tools.ts`) — Zod schemas, MCP registration, handler functions.
- **Bridge** (`bridge/applescript-runner.ts`) — loads a template, substitutes params with escaping,
  runs `osascript`, parses JSON.
- **Scripts** (`*.applescript`) — templates with `{{param}}` placeholders.

Anything that reaches AppleScript goes through the bridge's escaping. Handlers never build script
text themselves.

## Glossary

- **PPG-free** — unlike the maintainer's other repositories, nothing here is StrongTie-shaped. Terms
  from that work do not apply.
- **The tag is the version.** `package.json` in git holds `0.0.0-development`. What shipped is the
  latest `v*` tag and what npm reports; the repository deliberately does not track it.
- **`fromAccount`** — the compose parameter selecting which Mail account sends. Distinct from
  `accountName` on reply/forward, which only locates the source message.

## Release

One run: Actions → **Release** → `mode: publish`. It derives the version from the conventional
commits since the last tag, verifies, publishes to npm over OIDC, then tags and cuts the GitHub
release. Nothing is pushed to `main`. `CLAUDE.md` carries the detail.
