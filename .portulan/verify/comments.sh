#!/usr/bin/env bash
# Comments rail: no more comment lines record a change's history than LIMIT. A comment is paid for on
# every read of its file, and a change's history goes in its commit message, so LIMIT is only lowered.
# Code not written here, vendored, is left out with `--exclude <dir>/` on the `node` line.
#
#   exit 0   green: the count is within LIMIT
#   exit 1   red: it is over, and the lines are listed
#   exit 2   could not run: git, node or the Portulan CLI is not reachable from here. NEVER a pass.
#
# The CLI is the dev dependency under this repository's node_modules, by a path relative to the
# tree's root, and it is looked for before a `portulan` on PATH: what counts as history is the
# installed version's to say, so the count is made by the version the lockfile pins, here and in CI.
# `portulan upgrade` drafted the absolute path of the checkout it ran in instead, true on one machine.

set -uo pipefail
cd -- "$(dirname -- "$0")"/../.. || exit 2

LIMIT=296

for need in git node; do
    command -v "$need" >/dev/null 2>&1 || {
        printf 'verify: %s is needed and is not on PATH, so the comments were NOT counted.\n' "$need" >&2
        exit 2
    }
done

if [ -n "${PORTULAN_CLI:-}" ]; then
    cli=$PORTULAN_CLI
elif [ -f "node_modules/@sleepy_panda_srl/portulan/cli/comments.mjs" ]; then
    cli=node_modules/@sleepy_panda_srl/portulan/cli
elif command -v portulan >/dev/null 2>&1 &&
    entry=$(node -e 'process.stdout.write(require("node:fs").realpathSync(process.argv[1]))' "$(command -v portulan)") &&
    [ -f "$(dirname -- "$entry")/comments.mjs" ]; then
    cli=$(dirname -- "$entry")
else
    printf 'verify: the Portulan CLI is not reachable, so the comments were NOT counted. Looked at\n' >&2
    printf 'verify: $PORTULAN_CLI, the dev dependency under node_modules, which npm ci installs, and a portulan on PATH holding comments.mjs.\n' >&2
    exit 2
fi
if [ ! -f "$cli/comments.mjs" ]; then
    printf 'verify: %s holds no comments.mjs, so the comments were NOT counted.\n' "$cli" >&2
    exit 2
fi

node "$cli/comments.mjs" --limit "$LIMIT"
status=$?
[ "$status" -le 2 ] && exit "$status"
printf 'verify: comments.mjs exited %s, which is no verdict, so the comments were NOT counted.\n' "$status" >&2
exit 2
