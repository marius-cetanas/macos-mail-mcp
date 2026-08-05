// macos-mail-mcp — MIT License — https://github.com/marius-cetanas/macos-mail-mcp
//
// Inserts a new release section into CHANGELOG.md, above the most recent one.
//
// Lives here rather than inline in the workflow so it can be tested. Every
// review finding against this pipeline so far has been in shell or node
// embedded in YAML, which nothing can exercise.

import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FIRST_SECTION = "\n## ";

/**
 * Insert a section for `version` above the newest existing one.
 *
 * A changelog with no release headings yet — a first release against nothing
 * but a Keep a Changelog preamble — appends instead. `indexOf` returning -1
 * would otherwise be used as a slice index, which silently drops the last
 * character and puts the entry in the wrong place.
 *
 * @returns {string} the updated changelog
 */
export function insertEntry(changelog, version, date, body) {
  const entry = `\n## [${version}] - ${date}\n\n### Changed\n\n${body}\n`;
  const marker = changelog.indexOf(FIRST_SECTION);
  const at = marker === -1 ? changelog.length : marker;
  return changelog.slice(0, at) + entry + changelog.slice(at);
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
  const [version, date, body, path = "CHANGELOG.md"] = process.argv.slice(2);
  if (version === undefined || date === undefined || body === undefined) {
    console.error("usage: changelog-entry.mjs <version> <date> <body> [changelog path]");
    process.exitCode = 1;
  } else {
    writeFileSync(path, insertEntry(readFileSync(path, "utf8"), version, date, body));
    console.log(`Added ${version} to ${path}.`);
  }
}
