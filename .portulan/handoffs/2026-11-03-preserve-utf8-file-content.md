# Preserve UTF-8 file content

Issue #86 is isolated on `codex/preserve-utf8-file-content` at base `f8c5374`, which already
contains dependency updates, issues #84/#85 and removal of automated Copilot review. The root
approved the full-lane plan before edits, requiring execution of production reads, preservation
of JSON escaping and existing attachment guards, error/descriptor checks, reserved-name invariants
and full affected-template compilation. No live Mail operations were authorized or performed.

All seven `do shell script "cat ..."` reads now use the shared native `readUtf8File` handler:
send/reply/forward bodies, the send attachment-path list, save/read attachment names and saved
inline attachment content. Other shell commands and base64 semantics are unchanged. The attachment
parser still uses paragraphs and checks the expected count. The reader uses native UTF-8 decoding
with implicit file access; missing-file errors propagate without creating a file, and tests verify
reads leave no open access handles.

The first regression run executed each production read expression against a real UTF-8 fixture,
then the production JSON escaper and JSON.parse, and demonstrated LF/CRLF conversion and trailing
newline removal at all seven sites. It recorded 27 failures and five compile passes at
`/private/tmp/macos-mail-mcp-issue86-red.log`.

Plain native UTF-8 reads exposed two further measured cases: empty files raise EOF, and the native
decoder removes a leading UTF-8 BOM. The helper handles empty files before reading and restores a
detected BOM from a native raw-prefix read. Production JSON escaping then discarded a leading
U+FEFF when a later newline required escaping. Root approved the narrow related adjustment:
escape U+FEFF explicitly, with leading/interior/buffer-boundary tests. The standalone red evidence
is `/private/tmp/macos-mail-mcp-issue86-bom-red.log`; the final focused run passed 151 tests across
five suites at `/private/tmp/macos-mail-mcp-issue86-focused.log`.

On 2026-11-03 the default recipe passed with escalation and
`npm_config_cache=/private/tmp/macos-mail-mcp-npm-cache`:
`npm run build && npm run test:coverage && npm audit --audit-level=high`.
The record is `/private/tmp/macos-mail-mcp-issue86-verify.log`: 42 files and 822 tests passed,
including the existing escaper performance suite. Source coverage is 100% for statements
(272/272), branches (106/106), functions (64/64) and lines (271/271); audit found zero vulnerabilities.
The comments recipe passed at 124/124, `portulan compile --check` was green,
`portulan index --check --changes changes` passed for nine one-bullet fragments, and
`git diff --check` passed.

The native tests compare valid UTF-8 content after the production read/JSON pipeline for LF, CRLF,
CR, mixed/trailing newlines, empty files, Unicode, quotes/backslashes, controls/NUL and single,
repeated and BOM-only inputs. All five affected templates compile with the shared handlers without
execution. This demonstrates text fidelity for valid UTF-8; other encodings and arbitrary binary
preservation are outside the contract. Native Mail saving, insertion, enumeration, send and delivered
MIME remain unexercised, as README and CLAUDE state.

Changes are frozen and uncommitted pending fresh root pre-commit review. Root can finish this issue
as its own commit on the accumulating fixes branch/PR #132, then proceed to #87. Merging and
publishing remain gated.
