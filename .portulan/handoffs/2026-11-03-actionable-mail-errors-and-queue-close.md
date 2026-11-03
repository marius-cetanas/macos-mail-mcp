# Prepare save destinations and explain missing message IDs

Issue #95 is isolated on `codex/actionable-mail-errors` at unchanged review base
`7d848ae884b04d3c80ee9af6d25c0b51e1216473`. Root approved the full-lane plan before source
edits, including destination character fidelity and narrow lookup classification. No native
Mail operations, Git mutations, CI settings or releases were performed by this implementation.

Both attachment save handlers call prepareSaveDirectory before Mail and before name-file temp
setup. It rejects empty/NUL paths, expands ~/bare~, resolves relative paths to absolute paths,
recursively creates directories, checks directory status and Node write/search access, and
wraps failures with the destination path. Existing directories and directory symlinks work;
regular-file destinations/ancestors and OS failures are actionable. Created directories remain
after later failures. The checks do not eliminate filesystem races or prove Mail's permissions.
Save timeouts, filename handling, collision behavior and public success results are unchanged.

The shared findMessageInMailbox validates the safe numeric ID, dereferences bulk list items,
performs first-ID lookup and forces ID evaluation. Only -1719/-1728 inside that boundary return
missing value. requireMessage raises -1728 with plain decimal ID and the requested account and
mailbox. All12scoped sites use it, including reply/forward, attachments and legacy single move.
Account-wide get uses findMessageInMailbox, continues only missing results, and reports the
requested account/all-mailboxes scope after exhaustion. Its narrowing as-integer coercion and
unescaped interpolated not-found JSON are removed. All human errors pass through existing JSON
escaping; lookup permission/timeouts, mailbox resolution and later property/action failures keep
their original errors. Bulk moves retain original IDs, partial counts and per-item errors.

Red evidence: `/private/tmp/macos-mail-mcp-issue95-red.log` (41failures), plus
`/private/tmp/macos-mail-mcp-issue95-callers-red.log` (6failures/109passes). The focused run then
passed185tests/5files. Production AppleScript helper/flow tests replace native transport and
execute actual scoped error assembly, account-wide search and partial bulk moves. They cover
both missing codes, forced ID evaluation, permission/timeout/native failures, later property
and action errors, all13lookup sites, zero/negative/large/safe-limit IDs and requested names
with quotes, backslashes, CR/LF, combining marks and ZWJ emoji. The existing MIME read-flow
fixture explicitly replaces the new lookup call and asserts it cannot execute native Mail.

Directory tests prepare real nested/relative/symlink paths, exercise regular files, invalid
paths and deterministic mkdir/stat/access/permission failures, and run both actual substituted
saveFolderPath initializations and JSON results with spaces, quotes, backslashes, Unicode and
CR/LF paths. Caller tests pin preflight ordering before Mail/temp setup and name-file cleanup;
registered message/compose routes preserve actionable lookup errors, and both save routes
return MCP path errors without any Mail call. All shared template contexts compile.

Final default verification passed on 2026-11-03 with escalation and
`npm_config_cache=/private/tmp/macos-mail-mcp-npm-cache`:
`npm run build && npm run test:coverage && npm audit --audit-level=high`.
Record: `/private/tmp/macos-mail-mcp-issue95-verify.log`; 52files/1,311tests, 100% statements
(407/407), branches (202/202), functions (80/80), lines (382/382), zero vulnerabilities.
Comments124/124, compile drift, index18fragments and diff check pass. Changes are frozen and
uncommitted for fresh pre-commit review. Root owns finish, individual PR publication and any
reviewed/green merge; #95 remains pending until that sequence completes.

Fresh review approved runtime behavior and requested one DoD3 regression-strength adjustment:
the real destination/AppleScript tests did not pass through the handlers' savePath bindings.
Parameterized tests now run both save handlers with an absolute prepared path containing
CR/LF, quotes, backslashes, combining Unicode and ZWJ emoji, and require exact bridge forwarding.
A controlled mutation of both bindings to sanitize(preparedPath) failed both new tests
(2failures/30skipped) in `/private/tmp/macos-mail-mcp-issue95-binding-mutant.log`. The production
file was restored byte-for-byte in a finally block; its SHA256 is
`f7e366e8ba68c8045b7bcd2fe83e06df9346ce79925863a6b7ce34de006bce5d`.
No runtime correction was needed. Revised default build/coverage/audit verification passed in
`/private/tmp/macos-mail-mcp-issue95-binding-verify.log`: 52files/1,313tests, the same100% source
coverage totals above, and zero vulnerabilities. Comments124/124, compile drift,
index18fragments and diff check pass. The revised tests/handoff are frozen for confirmation.

## Queue state and testing boundary

Root reports issues84–94 merged and closed on the base above, each published separately and
reviewed with green required checks. The completed source changes are:

- #84: reply/forward insertion and prepared-body/readback/send guards.
- #85: multiple attachment path parsing, file preflight and attachment/send checks.
- #86: valid UTF8 content/newline/BOM fidelity through file reads and JSON escaping.
- #87: locale-independent safe-integer JSON and preserved partial move results.
- #88: nested mailbox creation using resolved account-scoped paths and readback.
- #89: existing mailbox reuse with explicit created/alreadyExisted status.
- #90: missing recipient display names normalized while preserving literal names.
- #91: raw account type preservation and nullable unsupported/unavailable server metadata.
- #92: safe scoped search defaults, count gates, serial budgets, cancellation and partial results.
- #93: UTC seconds-Z message timestamps with isolated child environments and historical DST tests.
- #94: MIME-aware inline attachment admission, shared fallbacks and Unicode code-point scanning.

The local evidence across this queue executes production parsers, formatters, guards and flows
with generated values/replaced transports, plus complete Mail-dictionary compilation and mocked
MCP routes. It does not demonstrate native Mail/provider account reads, message lookups/searches,
mailbox creation, attachment enumeration/insertion/saving, compose readback or actual delivery.
Killing search osascript cannot cancel queued Apple events inside Mail. UTF8 readers do not
transcode arbitrary encodings or establish binary fidelity. MIME/filename admission does not
prove bytes are text. These boundaries remain explicit in current docs; a live end-to-end run
would be separate work. The authorized implementation queue ends at #95, with no release here.
