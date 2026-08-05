// macos-mail-mcp — MIT License — https://github.com/marius-cetanas/macos-mail-mcp
//
// Guards the failure that cost the v1.3.0 release. `actions/setup-node` with
// `registry-url` writes `_authToken=${NODE_AUTH_TOKEN}` into a generated
// .npmrc; with no token set that expands to empty — and an empty token still
// reads to npm as configured auth, so it skips the OIDC exchange and publishes
// anonymously. The registry answers an anonymous publish with 404 rather than
// 401 so as not to leak package existence, which makes it look like a missing
// package rather than an auth failure. See actions/setup-node#1551.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Matches an assignment, not a mention: the key must be at the start of the
// line or immediately after the `:` of a registry-scoped key
// (`//registry.npmjs.org/:_authToken=`), and be followed by `=`. A grep for the
// bare substring fails a release on a comment.
//
// Deliberately does not accept a preceding `/`: that would make the pattern
// broader than the rule it documents and would fire on a path value containing
// `/_authToken=`.
const ASSIGNMENT = /(^|:)_authtoken\s*=/i;

/**
 * Lines in an .npmrc that actually assign an auth token.
 * @returns {{line: number, text: string}[]} 1-indexed, empty when clean
 */
export function findAuthTokenAssignments(content) {
  const found = [];
  content.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) {
      return;
    }
    if (ASSIGNMENT.test(line)) {
      found.push({ line: index + 1, text: raw });
    }
  });
  return found;
}

/**
 * Check each path that exists; returns every offending file.
 *
 * Paths are de-duplicated by resolved real path. The workflow passes both
 * `${NPM_CONFIG_USERCONFIG:-$HOME/.npmrc}` and `$HOME/.npmrc`, which are usually
 * the same file, and annotating one problem twice reads like two problems.
 * Resolving rather than string-comparing also collapses symlinks.
 */
export function checkFiles(paths) {
  const problems = [];
  const seen = new Set();
  for (const path of paths) {
    if (!existsSync(path)) continue;
    let key = path;
    try {
      key = realpathSync(path);
    } catch {
      // Unresolvable: fall back to the literal path rather than skipping it.
    }
    if (seen.has(key)) continue;
    seen.add(key);

    const hits = findAuthTokenAssignments(readFileSync(path, "utf8"));
    if (hits.length > 0) {
      problems.push({ path, hits });
    }
  }
  return problems;
}

/**
 * True when this file was executed directly rather than imported.
 * Compares resolved real paths: matching on the basename would fire for any
 * same-named script, and splitting on "/" alone misses Windows separators.
 */
function isMain() {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const paths = process.argv.slice(2);
  const problems = checkFiles(paths);
  for (const { path, hits } of problems) {
    for (const hit of hits) {
      console.error(
        `::error file=${path},line=${hit.line}::${path}:${hit.line} assigns _authToken; ` +
          `npm will skip OIDC and publish anonymously. Remove registry-url from actions/setup-node.`
      );
    }
  }
  if (problems.length > 0) {
    process.exitCode = 1;
  } else {
    console.log(`No _authToken assignment in: ${paths.join(", ") || "(no files given)"}`);
  }
}
