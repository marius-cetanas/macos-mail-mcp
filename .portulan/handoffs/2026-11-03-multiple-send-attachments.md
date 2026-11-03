# Multiple attachment paths in send_message

Issue #85 work is isolated on `codex/fix-multiple-attachments`, based on dependency-update
commit `a99deb6`. The root session approved the full-lane plan with adjustments before edits:
check Mail's boolean send result, fail on invalid or mismatched expected counts, preflight before
Mail/temp setup, and distinguish executable helpers/compilation from native Mail integration.

The handler snapshots and validates every attachment path before sender lookup or temp creation.
Paths must be absolute readable regular files without CR, LF or NUL. The requested count is passed
separately from the newline path file. The AppleScript parser uses `paragraphs` after the shell's
LF-to-CR conversion and validates the parsed count. Attachment insertion now targets the outgoing
message's rich-text content; its `attachments` count is checked against the request before `send`.
The local Mail.sdef defines outgoing `content` as rich text with `attachment` elements; received
`mail attachment` elements are not used on outgoing messages. A non-true send result raises an
error. Body-file reading and issue #86 remain separate.

Red tests demonstrated absent preflight/count parameters, missing-file false success at the MCP
handler, and absent parsing/count/send guards. The final focused compose run passed 120 tests.
The default verify recipe passed with escalation on 2026-11-03:
`npm run build && npm run test:coverage && npm audit --audit-level=high`, with
`npm_config_cache=/private/tmp/macos-mail-mcp-npm-cache`.
Its record is `/private/tmp/macos-mail-mcp-issue85-verify.log`: 41 files and 936 tests passed,
100% statements/branches/functions/lines for `src/`, and zero vulnerabilities.
The comments recipe passed at 296/296 historical comment lines, compile drift check was green,
and `git diff --check` passed.

The macOS tests execute production path parsing and count/send guards through `osascript`, covering
one, two and three paths, special characters, order/duplicates, invalid counts, mismatches and
non-true send results. They compile the full substituted send template plus shared handlers via
`osacompile` without running it. Native Mail attachment insertion/enumeration and end-to-end sending
or delivery were not exercised; no live Mail operations were performed. Documentation states this
limit explicitly.

Changes are uncommitted pending a fresh root pre-commit checkpoint. Root will integrate issue #84
and this issue as separate commits on the accumulating fixes branch/PR #132, resolve shared docs,
and rerun combined verification. The separate CI-removal change is outside this worktree's scope.
