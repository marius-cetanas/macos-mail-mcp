# Create nested mailboxes using account-scoped full paths

Issue #88 is isolated on `codex/fix-nested-mailbox-creation`, based on `710ca67`, which includes
dependency updates, issues #84–#87 and removal of automated Copilot review. Root approved the
full-lane plan before edits: resolve the parent, use its full slash path at the account, validate
actual full-path readback, preserve root/full-path modes, and propagate errors through the
registered tool. Existing-name/status behavior remains a separate issue #89.

The creation template resolves `parentMailboxName` in the requested account before creation,
builds the child's path from `mailboxFullName(parentMbox)`, and performs one `make new mailbox`
at the account using that full name. With no parent, the requested root name or already-full
path is used directly. The new mailbox's full path is read back through `mailboxFullName`,
compared by code-point IDs with the requested path, and returned as `mailboxName`. A mismatch
raises an error instead of reporting success for a leaf or another parent. Shared numeric and
UTF-8 helpers are unchanged.

The red regression run recorded 18 failures and 15 passes in
`/private/tmp/macos-mail-mcp-issue88-red.log`. The final focused three-suite run passed 39 tests
in `/private/tmp/macos-mail-mcp-issue88-focused.log`. Tests assert parent resolution precedes
creation, account scoping, full readback/guard/response ordering, root/full-path modes, nested
and namespaced parents, Unicode/quotes/backslashes/spaces, delimiter preservation, mismatched
readbacks and registered-handler result/error propagation. Production pure path/guard helpers
and JSON response assembly execute through osascript; the complete substituted template with
all shared handlers compiles through osacompile without executing its Mail block.

The default verify recipe passed on 2026-11-03 with escalation and
`npm_config_cache=/private/tmp/macos-mail-mcp-npm-cache`:
`npm run build && npm run test:coverage && npm audit --audit-level=high`.
The record is `/private/tmp/macos-mail-mcp-issue88-verify.log`: 44 files and 978 tests passed;
source coverage is 100% statements (272/272), branches (106/106), functions (64/64) and lines
(271/271). Audit found zero vulnerabilities. Comments passed at 124/124, compile drift and
index validation for eleven one-bullet fragments were green, and `git diff --check` passed.

No native Mail lookup, mailbox creation or provider behavior was exercised, and no backend
integration claim is made. README, CLAUDE and the tool schema describe full-path behavior and
the verification boundary. CI/release settings and existing-name semantics are unchanged.

Changes are frozen and uncommitted pending fresh root pre-commit review. Root can finish this
issue as its own commit on the accumulating fixes branch/PR #132 before proceeding to #89.
Merging and publishing remain gated.
