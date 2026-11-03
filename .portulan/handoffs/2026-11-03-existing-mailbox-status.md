# Report whether a mailbox already existed

Issue #89 is isolated on `codex/report-existing-mailboxes`, based on `6320f6e`, which includes
dependency updates, issues #84–#88 and removal of automated Copilot review. Root approved the
triage plan: this is a local additive status change with no shared lookup/API refactor.

After parent resolution and full-path construction, `create_mailbox` checks `exists mailbox`
for the constructed path in the selected account. An existing target is reused without `make`;
an absent target reaches one creation command. Both branches retain the full-path readback and
guard introduced by #88. The result has explicit JSON booleans: an existing target reports
`created:false, alreadyExisted:true`, and creation reports the inverse. The existence probe has
no inner catch; lookup/permission failures flow through the existing typed JSON/MCP error path.

The red run recorded seven failures and 35 passes in `/private/tmp/macos-mail-mcp-issue89-red.log`.
The final focused three-suite run passed 48 tests in `/private/tmp/macos-mail-mcp-issue89-focused.log`.
Tests execute the production existence/branch/status/JSON flow with only Mail primitives replaced
by fixture handlers: zero creates when existing, one when new, full-path/account scoping, explicit
boolean statuses, lookup errors -1743/-1728 and creation errors. Registered MCP handlers preserve
both responses and permission errors. Existing pure path/guard tests and complete template
compilation still pass; shared resolver, numeric and UTF-8 helpers are unchanged.

The default recipe passed on 2026-11-03 with escalation and
`npm_config_cache=/private/tmp/macos-mail-mcp-npm-cache`:
`npm run build && npm run test:coverage && npm audit --audit-level=high`.
The record is `/private/tmp/macos-mail-mcp-issue89-verify.log`: 44 files and 987 tests passed;
source coverage is 100% statements (272/272), branches (106/106), functions (64/64) and lines
(271/271). Audit found zero vulnerabilities. Comments passed at 124/124, compile drift and
index validation for twelve one-bullet fragments were green, and `git diff --check` passed.

No native Mail lookup or mailbox creation was performed. Provider behavior remains unexercised;
README and CLAUDE distinguish the fixture flow/compilation checks from native integration.
CI/release settings are unchanged. Changes are frozen and uncommitted for compact root diff
review before a separate issue commit on the accumulating fixes branch/PR #132. Next is #90.
Merging and publishing remain gated.
