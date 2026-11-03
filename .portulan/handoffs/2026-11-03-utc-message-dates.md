# Preserve message instants in UTC output

Issue #93 is isolated on `codex/utc-message-dates` at review base
`b6b1c85f168bbc2e2e35a2a5d7bb3bc94c67fe7c`. Root approved the full-lane plan before source
edits: explicit child-only UTC environments, a fail-closed native formatter, five production
assignments across four templates, and no native Mail reads or host timezone changes.

All list/search/get/get-by-ID callers opt into `utcDates:true`. The bridge copies the parent
environment and overrides only the child's TZ; other calls retain their original exec options.
The shared `dateToUtcIso` rejects non-date values or a non-UTC child and serializes native dates
as ISO seconds followed by Z. Both list paths and search/get/get-by-ID use it. Search discovery,
preflight, budgets, abort options and relative filter arithmetic remain unchanged.

Runtime probes motivated UTC processing before date retrieval/coercion: in America/New_York,
Foundation instants 2026-11-01T05:30:00Z and 06:30:00Z both became the same AppleScript 01:30
date when coerced through the repeated local hour. A UTC child preserves their 3,600-second
separation. Subtracting the current GMT offset also cannot account for historical DST. The
production helper needs no Foundation prelude. Apple's Date reference documents the native
date arithmetic used here; local tzset documentation and runtime probes establish child TZ
behavior. No host, Node or Mail timezone settings were changed.

Red evidence is `/private/tmp/macos-mail-mcp-issue93-red.log`: 22 failures and 23 passes before
implementation. Production helper tests construct actual AppleScript dates from known UTC
instants in a test-only Foundation prelude, covering negative/zero epochs, winter/summer,
offsets, both repeated-hour occurrences, and day/year boundaries. Strict seconds-Z strings
round-trip through Date.parse. C, en_US.UTF-8 and ro_RO.UTF-8 child locales pass. Missing,
non-date and non-UTC inputs fail clearly. Tests also execute all five production getter/JSON
expressions, production relative filter reconstruction, the registered result/error routes,
and selective child environment handling without logging the full inherited environment.

Final default verification passed on 2026-11-03 with escalation and
`npm_config_cache=/private/tmp/macos-mail-mcp-npm-cache`:
`npm run build && npm run test:coverage && npm audit --audit-level=high`.
Record: `/private/tmp/macos-mail-mcp-issue93-verify.log`; 49 files/1,176 tests, 100% statements
(400/400), branches (196/196), functions (79/79), lines (376/376), zero vulnerabilities. Existing
full-template compilation covers all shared contexts, including the four affected templates.
Comments pass124/124, compile drift and the index16fragments check pass, and diff check passes.

The demonstrated boundary is native date formatting, child environment control, production
wiring and filtering arithmetic with generated dates. Actual Mail date AppleEvent retrieval
and provider behavior remain unexercised. No end-to-end Mail claim is made. Existing unrelated
list filter zero-sentinel semantics were not changed; #92 search date validation and all
integer/UTF8 rails remain intact.

Changes are frozen and uncommitted for independent pre-commit review. Root owns finishing,
publishing an individual PR and any reviewed/green merge. No release or CI settings changed.
