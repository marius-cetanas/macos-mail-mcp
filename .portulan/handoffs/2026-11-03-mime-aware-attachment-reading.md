# Admit inline attachment text from MIME metadata

Issue #94 is isolated on `codex/mime-aware-attachment-reading` at unchanged review base
`8ff909f32fa9d5e89defaeb04c6cd5d3b9827fc2`. Root approved the full-lane plan before source
edits. No native Mail operation, Git mutation, release or CI setting change was performed.

The TypeScript extension-only refusal is removed. The read script obtains MIME metadata from
the same selected attachment it will save and applies admission before creating its save temp
directory. Existing .txt/.csv/.json/.html/.md/.xml/.log extensions remain accepted. Otherwise,
the MIME base must be text/<nonempty token>, application/json, application/xml or application/x-yaml.
Matching ignores case, surrounding space/tab and parameters after the first semicolon. ASCII
type/subtype tokens use RFC2045 section5.1's exclusions; control characters other than tab reject
MIME admission, including controls in parameters. Unsupported-type errors name the effective
MIME and suggest save_attachment. The public success response remains {name,content}.

One shared attachment-mime helper now owns the existing extension mapping, extracted unchanged
from the three metadata serializers. List/get/get-by-ID/read all use attachmentMimeType with
native metadata or the shared fallback when MIME is missing, blank, the legacy literal sentinel,
or its getter fails. This includes .ics → text/calendar, matching the originally reported case
even when Mail's MIME property is unavailable. All previous binary and text extension mappings
remain covered. Native property evidence is Mail.sdef's received mail attachment MIME type
text property; MIME token/case rules are from https://www.rfc-editor.org/rfc/rfc2045#section-5.1.

Red evidence: `/private/tmp/macos-mail-mcp-issue94-red.log`, 45 failures/27 passes. The focused
production MIME/transport/TS/reserved-name run then passed94tests in3files. Executable tests
cover allowed MIME bases, case/parameters, missing/blank/getter-error fallbacks, legacy extension
compatibility, malformed prefixes/tokens/controls, rejection escaping, all32mapping cases and
all3actual metadata loops. The complete production read flow runs with only lookup/save/temp
transport replaced by local fixtures, selecting among multiple attachments. It demonstrates
guard-before-save, UTF8/JSON/line-ending readback, not-found/not-downloaded/name-file/save/read
errors and native temp cleanup. Node and registered MCP tests cover calendar/extensionless
responses, MIME/native errors and name-file cleanup. All shared template contexts compile.

Final default verification passed on 2026-11-03 with escalation and
`npm_config_cache=/private/tmp/macos-mail-mcp-npm-cache`:
`npm run build && npm run test:coverage && npm audit --audit-level=high`.
Record: `/private/tmp/macos-mail-mcp-issue94-verify.log` (completion output) and
`/private/tmp/macos-mail-mcp-issue94-audit.log`. 50files/1,235tests pass, with100% statements
(395/395), branches (192/192), functions (79/79), lines (371/371); audit found zero vulnerabilities.
Comments124/124, compile drift, index17fragments and diff check pass. The source coverage totals
decrease because the obsolete TypeScript extension gate and its branches are removed.

Fresh review requested one P2 correction: AppleScript characters may contain multiple Unicode
code points, so id of a character could return a list and raise -1700 during numeric comparison.
Both MIME scans now iterate flattened id of the full string, normalize scalar IDs to a list,
and dereference each point. No Unicode normalization is performed. Malformed decomposed/ZWJ
bases produce the normal escaped MIME-bearing error before saving; combining/ZWJ parameter
values remain accepted because parameters do not determine the MIME base. Controls inside
those parameters remain rejected. Empty and single-character inputs are covered explicitly.

The revision's red run is `/private/tmp/macos-mail-mcp-issue94-unicode-red.log` (9failures/56passes),
followed by65passing focused tests in `/private/tmp/macos-mail-mcp-issue94-unicode-focused.log`.
The revised full build/coverage/audit recipe passed in
`/private/tmp/macos-mail-mcp-issue94-unicode-verify.log`: 50files/1,249tests, unchanged100% source
coverage totals and zero vulnerabilities. Comments124/124, compile drift, index17fragments and
diff check remain green. The revised diff is frozen for review confirmation.

Admission uses filename/MIME metadata and does not prove that bytes contain text. The existing
reader contract remains valid UTF8; no transcoding, byte sniffing, streaming or size cap is added.
Mail's fileSize remains approximate metadata using integerForJson. Actual Mail attachment
retrieval/saving/provider behavior remains unexercised. Integer, UTC date, UTF8 and search rails
are preserved. Changes are frozen and uncommitted for fresh pre-commit review; root owns finish,
individual PR publication and any reviewed/green merge. Scope ends at #94.
