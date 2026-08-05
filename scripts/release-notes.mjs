// macos-mail-mcp — MIT License — https://github.com/marius-cetanas/macos-mail-mcp
//
// Extracts one version's section from CHANGELOG.md for the GitHub release body.
//
// Matching is fixed-string, never a regular expression. The awk form this
// replaces interpolated the version into a pattern, where the dots in a semver
// are wildcards — so `1.3.0` would also match a `## [1x3x0]` heading. Unlikely
// to bite, but the release body is the thing a reader trusts to say what
// changed, so silently emitting the wrong section is a bad failure.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HEADING = /^## /;

/**
 * The body of the `## [version]` section, without its heading.
 * @returns {string} trimmed section text, empty when the version is absent
 */
export function extractReleaseNotes(changelog, version) {
  const prefix = `## [${version}]`;
  const lines = changelog.split(/\r?\n/);

  const start = lines.findIndex((line) => line.startsWith(prefix));
  if (start === -1) {
    return "";
  }

  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING.test(line)) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

function isMain() {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const [version, path = "CHANGELOG.md"] = process.argv.slice(2);
  if (version === undefined) {
    console.error("usage: release-notes.mjs <version> [changelog path]");
    process.exitCode = 1;
  } else {
    const notes = extractReleaseNotes(readFileSync(path, "utf8"), version);
    if (notes === "") {
      console.error(`::warning::No changelog section found for ${version}.`);
    }
    console.log(notes);
  }
}
