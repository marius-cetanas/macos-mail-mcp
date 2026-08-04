# Security Policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/marius-cetanas/macos-mail-mcp/security/advisories/new)
rather than opening a public issue.

Include what the issue allows an attacker to do, the steps to reproduce it, and
the version you tested. You can expect an initial response within a few days.

## Supported versions

Fixes are released against the latest published version on npm. There are no
long-term support branches.

## Scope and threat model

This is a local [MCP](https://modelcontextprotocol.io) server. It runs on the
user's own Mac over stdio, is driven by an MCP client such as Claude, and
controls Mail.app through AppleScript. It exposes no network listener and
performs no authentication of its own — anything able to speak to its stdin can
issue commands with the permissions of the user running it.

Relevant to that model:

- **AppleScript injection.** All parameters interpolated into AppleScript
  templates are escaped for embedding in double-quoted string literals
  (`escapeForAppleScript`) and stripped of newlines (`sanitize`). Scripts are
  executed with `execFile`, never a shell, so shell metacharacters are inert.
  A way to break out of a string literal or inject a statement is a
  vulnerability — please report it.
- **Filesystem writes.** Attachment tools write to caller-supplied paths. They
  are constrained only by the permissions of the invoking user.
- **Message content is untrusted input.** Email bodies, subjects and attachment
  names come from third parties. Treat anything this server returns as data,
  never as instructions.
- **Out of scope.** Mail.app's own behaviour and what an MCP client chooses to
  do with these tools are outside this project's control. The macOS permission
  prompts that gate AppleScript access to Mail are part of the trust boundary:
  this server relies on them and does not attempt to work around them.

## What this server can do

Every tool acts on the user's real mailboxes: reading, moving and deleting
messages, and sending mail as any configured account. Grant it only to clients
you trust, and review what you connect it to.
