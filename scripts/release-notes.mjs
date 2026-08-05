// macos-mail-mcp — MIT License — https://github.com/marius-cetanas/macos-mail-mcp
//
// Builds the body of a GitHub release from the commits since the last release.
//
// Generated from git rather than read from CHANGELOG.md, because the release
// workflow never commits to main — the tag is the source of truth for what
// shipped, so there is no committed changelog entry for the version being cut.
// CHANGELOG.md is maintained by hand in ordinary pull requests.

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SECTIONS = [
  { heading: "Added", types: ["feat"] },
  { heading: "Fixed", types: ["fix", "perf"] },
  { heading: "Changed", types: ["refactor", "build", "revert"] },
  { heading: "Documentation", types: ["docs"] },
  { heading: "Internal", types: ["chore", "test", "ci", "style"] },
];

/** Strip the conventional-commit prefix and any trailing PR reference. */
export function describe(subject) {
  return subject
    .replace(/^\w+(\([^)]*\))?!?:\s*/, "")
    .replace(/\s*\(#\d+\)$/, "")
    .trim();
}

function typeOf(subject) {
  const m = /^(\w+)(\([^)]*\))?!?:/.exec(subject.trim());
  return m === null ? null : m[1];
}

function isBreaking({ subject, body = "" }) {
  return /^\w+(\([^)]*\))?!:/.test(subject.trim()) || /^BREAKING[ -]CHANGE:/m.test(body);
}

/**
 * Group commits into a Keep a Changelog-shaped release body.
 * @returns {string} markdown, empty when there is nothing to say
 */
export function buildNotes(commits) {
  const lines = [];

  const breaking = commits.filter(isBreaking);
  if (breaking.length > 0) {
    lines.push("### Breaking", "");
    for (const c of breaking) lines.push(`- ${describe(c.subject)}`);
    lines.push("");
  }

  for (const { heading, types } of SECTIONS) {
    const matched = commits.filter(
      (c) => types.includes(typeOf(c.subject)) && !isBreaking(c)
    );
    if (matched.length === 0) continue;
    lines.push(`### ${heading}`, "");
    for (const c of matched) lines.push(`- ${describe(c.subject)}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}

/** Commits in `range`, newest first. */
export function commitsIn(range) {
  const RECORD = "\x1e";
  const FIELD = "\x1f";
  const raw = execFileSync("git", ["log", range, `--pretty=format:%s${FIELD}%b${RECORD}`], {
    encoding: "utf8",
  });
  return raw
    .split(RECORD)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => {
      const [subject = "", body = ""] = entry.split(FIELD);
      return { subject: subject.trim(), body: body.trim() };
    });
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
  const range = process.argv[2];
  if (range === undefined) {
    console.error("usage: release-notes.mjs <git-range>   e.g. v1.3.0..HEAD");
    process.exitCode = 1;
  } else {
    const notes = buildNotes(commitsIn(range));
    console.log(notes === "" ? "_No notable changes._" : notes);
  }
}
