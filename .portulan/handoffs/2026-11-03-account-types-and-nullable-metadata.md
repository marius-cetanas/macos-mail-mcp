# Preserve account types and report unavailable connection metadata

Issue #91 is isolated on `codex/report-exchange-account-capabilities`, based on `9acb27b`, which
includes dependency updates, issues #84–#90 and removal of automated Copilot review. Root approved
the full-lane plan with four adjustments: canonical known/raw future types, dictionary-based
getter whitelist including SMTP nuance, explicit breaking nullable contract, and a narrow numeric
audit adaptation that still executes the shared integer encoding branch.

The local `/System/Applications/Mail.app/Contents/Resources/Mail.sdef` declares TypeOfAccount
pop/smtp/imap/iCloud/unknown, not Exchange. Pure enum coercion confirmed those spellings without
querying accounts. Both tools now canonicalize known type names and preserve every other raw
type text with JSON escaping. Backend-reported unknown stays unknown; no account name/domain
inference is made, and automatic Exchange identification has not been demonstrated.

Detail server getters are gated to canonical IMAP/POP/iCloud/SMTP types. The dictionary declares
server/port/SSL settings on receiving accounts and SMTP servers, so available SMTP settings are
preserved if that type is reported; this does not prove SMTP discovery through account queries.
Unsupported types, missing values and individual getter errors produce null connection fields.
Genuine available empty strings, zero ports and false SSL remain intact. Names, emails, enabled
status, fullName, userName, mailbox count and sender matching retain their behavior.

This is a **breaking public contract**: Account.type is an open string, and AccountDetail
serverName/port/usesSsl are nullable. README, tool descriptions, TypeScript declarations and the
fragment explicitly state it. Root must use a breaking conventional commit, for example
`fix(accounts)!: preserve raw account types and unavailable metadata`, with a `BREAKING CHANGE:`
body explaining nullable serverName/port/usesSsl and open account type text. No release occurs here.

The red run recorded 20 failures and 62 passes in `/private/tmp/macos-mail-mcp-issue91-red.log`.
The focused five-suite run passed 220 tests in `/private/tmp/macos-mail-mcp-issue91-focused.log`.
Production account source executes with local records/getter substitutions, proving raw type
preservation/escaping, canonical known values, zero unsupported getter calls, null missing/error
metadata, genuine false/zero values and intact identity fields. Both complete scripts compile
without execution. Registered responses/errors and exchange/future sender fixtures pass.
The one nullable account-port site in the integer JSON audit is explicitly identified by file
and field, and its actual production guarded integer assignment executes against a large value;
the remaining numeric sites keep their strict shared-formatter checks.

The default recipe passed on 2026-11-03 with escalation and
`npm_config_cache=/private/tmp/macos-mail-mcp-npm-cache`:
`npm run build && npm run test:coverage && npm audit --audit-level=high`.
The record is `/private/tmp/macos-mail-mcp-issue91-verify.log`: 46 files and 1059 tests passed;
source coverage is 100% statements (272/272), branches (106/106), functions (64/64) and lines
(271/271). Audit found zero vulnerabilities. Comments passed at 124/124; compile drift, index
validation for fourteen one-bullet fragments and `git diff --check` were green.

No native Mail account reads occurred. Native Exchange/provider behavior and SMTP discovery remain
unexercised, with that boundary stated in docs. Shared runtime helpers and CI/release settings are
unchanged. Changes are frozen and uncommitted for fresh root pre-commit review before a separate
breaking issue commit on PR #132. Next is #92. Merging and publishing remain gated.
## Published-head review follow-up

The fresh combined review of the individual PRs approved the source with one adjustment:
qualify the general numeric-error documentation for nullable account ports. The README now
states that exception, and production fixture cases cover fractional and unsafe ports becoming
null while other settings remain available. This follow-up is part of the same account fix.

