# Preserve move results with locale-independent integer JSON

Issue #87 is isolated on `codex/fix-move-results`, based on `1433846`, which includes dependency
updates, issues #84–#86 and removal of automated Copilot review. Root approved the full-lane plan
before edits, requiring exact reconstruction at both safe-integer limits, full move-list validation
before Mail lookup, delimiter restoration, all sibling integer fields and affected-template
compilation. No live Mail operations or host locale/settings changes were performed.

Native AppleScript on this host coerces `999999999` to `9,99999999E+8`, reproducing the invalid
JSON. A dot decimal exponent token such as `9.99999999E+8` is valid JSON and parses to an
integer-valued JavaScript number; exponent notation itself was not the defect.

The shared reserved `integerForJson` handler accepts integral numeric values in JavaScript's safe
range, ±9007199254740991, and builds ASCII sign/digits using modulo and exact quotient arithmetic.
Only a single digit is coerced to AppleScript's 32-bit integer type for indexing. Text, booleans,
fractions and unsafe values raise an error. All 44 dynamic JSON integer sites now use it: message
IDs, attachment sizes, flag indices, ports, unread/message/mailbox counts, move counts and error
numbers. Boolean/string fields and unrelated filename numbering are unchanged.

`move_messages` parses and validates the complete token list before mailbox lookup or moves,
preserving order and avoiding 32-bit coercion of large IDs. Its parser restores caller delimiters
on both success and error. Each failed ID and final moved/failed counts pass through the shared
formatter, so per-item failure serialization preserves partial success.

The red run recorded 101 failures and 33 passes in `/private/tmp/macos-mail-mcp-issue87-red.log`,
including JSON.parse failure from actual production error/final-result assembly on the comma
locale. The final focused run passed 174 tests in three suites, recorded in
`/private/tmp/macos-mail-mcp-issue87-focused.log`. It exercises both safe limits and all nearby
last digits, negative/zero values, invalid classes/tokens, delimiter restoration, every audited
integer expression, mixed move results and compile-only checks for all 21 domain templates.

The default verify recipe passed on 2026-11-03 with escalation and
`npm_config_cache=/private/tmp/macos-mail-mcp-npm-cache`:
`npm run build && npm run test:coverage && npm audit --audit-level=high`.
The record is `/private/tmp/macos-mail-mcp-issue87-verify.log`: 43 files and 956 tests passed;
source coverage is 100% statements (272/272), branches (106/106), functions (64/64) and lines
(271/271). Audit found zero vulnerabilities. Comments passed at 124/124; compile drift, index
validation for ten one-bullet fragments and `git diff --check` were green.

Production serialization helpers and result assembly were executed, while domain templates were
compiled without execution. Native Mail lookups/moves and end-to-end mailbox results remain
unexercised. README and CLAUDE state that verification boundary. CI/release settings are unchanged.

Changes are frozen and uncommitted pending a fresh root pre-commit review. Root can finish this
issue as its own commit on the accumulating fixes branch/PR #132 before proceeding to #88.
Merging and publishing remain gated.
