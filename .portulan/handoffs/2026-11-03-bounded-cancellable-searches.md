# Bound search scheduling and preserve completed scopes

Issue #92 is isolated on `codex/bound-and-cancel-searches` at unchanged review base
`9b6793b73179256e03bb307dd0cfba92b8094b25`. Root approved full-lane work with adjustments for a
1,000-message default count gate, explicit breaking result/limit contracts, hard process aborts,
late-promise cleanup and single-scope AppleScript defenses. No native Mail search was performed.

Default subject/sender searches require account+mailbox and a bounded mailbox-info preflight
with an available safe message count ≤1,000. `allowSlow:true` deliberately bypasses that gate and
permits account-wide/all-account metadata searches. Content requires both names and opt-in;
mailbox without account is rejected. Query text or a valid inclusive date filter is required.
Search limit is now 1–200/default50; other tools' limits/timeouts are unchanged.

The controller uses a monotonic 45s total deadline including discovery/preflight and at most10s
per stage. Calls are serial and stop at the first timeout, cancellation or operational failure,
retaining prior results. Discovery preserves Mail order and deduplicates scopes; malformed or
multiline discovered scopes fail without querying a different target. Results identify canonical
account/full mailbox path, retain first/native order and deduplicate account+ID (not ID globally).
Account-local numeric seen IDs are supplied to the next mailbox's script.

The breaking response object contains messages, partial, cancelled, limitReached, timedOut,
skipped, errors and warnings. Operational failures return structured partial results; invalid
input/count gates are MCP errors. Known skipped targets carry timeout/cancelled/error/limit reasons.
LimitReached means the requested cap was met, not that more matches definitely exist. Partial
marks interruption/failure/skipped scopes, not exhaustiveness inside a capped single mailbox.
Discovery scopes may have null account/mailbox names; undiscovered later scopes cannot be listed.

Installed SDK source confirms ToolCallback receives RequestHandlerExtra.signal, and protocol.js
suppresses responses after that signal aborts. The callback passes it to the controller. Bridge
checks abort before setup and before spawning, supplies execFile signal+SIGKILL for opted-in search
execution, and cleans temp directories. Other callers keep existing default timeout/kill behavior.
Typed bridge errors retain AppleScript errorNumber; native -1712 and child deadlines stop scheduling.
Raced operations retain completion/rejection handlers, and timer/listener cleanup is tested.

The AS template rejects broad/empty scopes, resolves one mailbox, limits its result loop and uses
a short Apple-event timeout. Killing osascript cannot cancel queued Apple events inside Mail.
Warnings say wait/restart Mail before retrying. Partial replies cannot be promised after SDK
cancellation; the server still stops scheduling and aborts its process.

Red evidence is in `/private/tmp/macos-mail-mcp-issue92-red.log` (33 failures/3 passes) and
`/private/tmp/macos-mail-mcp-issue92-bridge-red.log` (5 failures/35 passes). Fake-clock/bridge tests
cover safeguards, count validity, budgets including discovery, fast-then-stalled partials, wall-clock
changes, limits/dedup/order, error classes, pre-abort/in-flight cancellation, late completion/rejection,
and cleanup. Registered signal/result/error paths, pure production scope guards and full template
compilation pass. Native Mail queries or queued-event cancellation are not demonstrated.

Initial default verification passed on 2026-11-03 with escalation and
`npm_config_cache=/private/tmp/macos-mail-mcp-npm-cache`:
`npm run build && npm run test:coverage && npm audit --audit-level=high`.
Record: `/private/tmp/macos-mail-mcp-issue92-verify.log`; 48 files/1116 tests, 100% source statements
(393/393), branches (184/184), functions (79/79), lines (370/370), zero vulnerabilities.
Comments passed124/124, compile drift and index15fragments were green, and diff check passed.

Fresh review approved all other search/abort behavior and requested one P2 adjustment: Date.parse
normalizes impossible ISO calendar dates. The narrow revision validates year/month/day with a UTC
calendar round-trip before parsing the instant. Both after/before reject impossible non-leap/overflow
dates before all Mail IPC. Valid leap days, date-only/offset timestamps and previously accepted RFC
dates retain their instants. Date anchoring, other date helpers and UTC output semantics are unchanged.
The calendar red run recorded ten failures/sixteen passes in
`/private/tmp/macos-mail-mcp-issue92-calendar-red.log`; the focused controller run passed69tests.
Revised full verification is `/private/tmp/macos-mail-mcp-issue92-calendar-verify.log`: 48files/1142tests,
100% statements400/400, branches191/191, functions79/79 and lines376/376; audit found zero
vulnerabilities. Comments124/124, compile drift, index15fragments and diff check remain green.

Changes are frozen/uncommitted for review confirmation. This needs a breaking `fix(messages)!` commit
with a BREAKING CHANGE body for the response object, safer required scopes/opt-in and new200cap.
Do not finish against the closed aggregate PR. Root will publish an individual PR after review,
cherry-picking onto main `fc072905f43c85396492d00975cb0be387ac169b`, where issues84–91 are merged.
Preserve main's two invalid-port→null fixture cases and README numeric-port exception when resolving the
adjacent README insertion; they are absent only from this unchanged old review base. CI/release
settings are untouched. Merging/publishing remain gated; next is #93.
