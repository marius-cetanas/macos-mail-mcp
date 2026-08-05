// macos-mail-mcp — MIT License — https://github.com/marius-cetanas/macos-mail-mcp
//
// Guards the failure that cost the v1.3.0 release. `actions/setup-node` with
// `registry-url` writes `_authToken=${NODE_AUTH_TOKEN}` into a generated
// .npmrc; with no token set that expands to empty — and an empty token still
// reads to npm as configured auth, so it skips the OIDC exchange and publishes
// anonymously. The registry answers an anonymous publish with 404 rather than
// 401 so as not to leak package existence, which makes it look like a missing
// package rather than an auth failure. See actions/setup-node#1551.

import { existsSync, readFileSync } from "node:fs";

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

/** Check each path that exists; returns every offending file. */
export function checkFiles(paths) {
  const problems = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const hits = findAuthTokenAssignments(readFileSync(path, "utf8"));
    if (hits.length > 0) {
      problems.push({ path, hits });
    }
  }
  return problems;
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
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
