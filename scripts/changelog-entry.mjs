// macos-mail-mcp — MIT License — https://github.com/marius-cetanas/macos-mail-mcp
//
// Inserts a new release section into CHANGELOG.md, above the most recent one.
//
// Lives here rather than inline in the workflow so it can be tested. Every
// review finding against this pipeline so far has been in shell or node
// embedded in YAML, which nothing can exercise.

import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HEADING = "## ";

/**
 * Insert a section for `version` above the newest existing one.
 *
 * Finds the first line that *is* a heading, rather than searching for "\n## ".
 * A substring search cannot see a heading on the very first line — a changelog
 * with no preamble — and would append there instead of inserting at the top.
 * Working line-wise also ignores "## [x]" appearing inside prose.
 *
 * A changelog with no release headings at all appends, which is correct for a
 * first release against a bare Keep a Changelog preamble.
 *
 * @returns {string} the updated changelog
 */
export function insertEntry(changelog, version, date, body) {
  const entry = `## [${version}] - ${date}\n\n### Changed\n\n${body}\n`;
  const lines = changelog.split("\n");
  const at = lines.findIndex((line) => line.startsWith(HEADING));

  if (at === -1) {
    const separator = changelog.endsWith("\n") ? "" : "\n";
    return `${changelog}${separator}\n${entry}`;
  }

  const before = lines.slice(0, at).join("\n");
  const after = lines.slice(at).join("\n");
  return `${before}${before === "" ? "" : "\n"}${entry}\n${after}`;
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
