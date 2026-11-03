# Normalize missing recipient display names

Issue #90 is isolated on `codex/normalize-recipient-names`, based on `105caa7`, which includes
dependency updates, issues #84–#89 and removal of automated Copilot review. Root approved a small
local triage plan: guard raw recipient names in both message lookup templates, preserve all
to/cc/bcc bindings and genuine data, and leave unrelated sender/shared semantics alone.

Both `buildRecipientsJson` handlers now initialize each name to empty, read the raw name once,
and coerce/escape only values other than the AppleScript `missing value` sentinel. A genuine
display name containing the text "missing value" is preserved. Addresses, order and JSON escaping
are unchanged, and property access errors still propagate. Existing account fullName and compose
sender missing-value guards were checked; they already cover their respective values.

The corrected red run recorded ten failures and 72 passes in
`/private/tmp/macos-mail-mcp-issue90-red.log`, reproducing literal sentinel text from both
production serializers and actual message JSON assembly. The focused two-suite run passed 82
tests in `/private/tmp/macos-mail-mcp-issue90-focused.log`. Two additional mixed known/missing
recipient regressions passed in the final full run, preventing display-name carryover.
Tests execute each production serializer on local Mail-term records, preserving empty/known/
literal names, quotes/backslashes/Unicode, addresses and ordering, and exercising empty lists
and property errors. Actual to/cc/bcc bindings and message JSON assembly execute with fixture
recipient collections. Registered MCP result/error paths cover both mailbox and by-ID routes.
Both complete templates compile with shared handlers without execution.

The default recipe passed on 2026-11-03 with escalation and
`npm_config_cache=/private/tmp/macos-mail-mcp-npm-cache`:
`npm run build && npm run test:coverage && npm audit --audit-level=high`.
The record is `/private/tmp/macos-mail-mcp-issue90-verify.log`: 45 files and 1015 tests passed;
source coverage is 100% statements (272/272), branches (106/106), functions (64/64) and lines
(271/271). Audit found zero vulnerabilities. Comments passed at 124/124; compile drift, index
validation for thirteen one-bullet fragments and `git diff --check` were green.

No native Mail reads or sends were performed. README, CLAUDE and the Recipient type comment state
the empty-name contract; README distinguishes local-record execution/template compilation from
native message reads. Shared helpers and CI/release settings are unchanged. Changes are frozen
and uncommitted for compact root review before a separate issue commit on PR #132. Next is #91.
Merging and publishing remain gated.
