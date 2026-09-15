// macos-mail-mcp — MIT License — https://github.com/marius-cetanas/macos-mail-mcp
//
// Builds the body of a GitHub release: the version's section of CHANGELOG.md,
// when one was recorded, followed by the commits since the last release grouped
// by conventional-commit type.
//
// The changelog is kept by hand and the release workflow never commits to main,
// so a version's section exists at release time only if it was recorded before
// the tag — the procedure CLAUDE.md gives. It leads because it is the sentence a
// consumer reads; the commit list beneath it is the audit trail. A version with
// no section gets the commit list alone and a warning on stderr, which is how
// 2.0.0 shipped: its build/ was byte-identical to 1.3.4's, the major was the
// Node floor, and the only way to learn that was to diff the tarballs (#96).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isMain } from "./is-main.mjs";

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

/**
 * The body of `## [version]` in a changelog: everything below its heading line up to the next
 * `## ` heading, trimmed, with the `###` subsections kept as they are. The heading is dropped because
 * the release page already names the version. `null` when the file has no such section; the empty
 * string when it has the heading and nothing under it.
 *
 * Matched on the whole bracket, so `2.0.0` does not read `## [12.0.0]` or `## [2.0.0-rc.1]` as its
 * own.
 *
 * @param {string} changelog the file's text
 * @param {string} version `2.0.0`
 * @returns {string | null}
 */
export function changelogSection(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) return null;
  let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join("\n").trim();
}

/**
 * The release body: the changelog section, then the grouped commits folded under a `Commits`
 * disclosure so the two sets of `###` headings do not read as one list. Either half may be absent;
 * the result is empty only when both are.
 *
 * @param {{ section: string | null, commits: { subject: string, body?: string }[] }} input
 * @returns {string} markdown
 */
export function releaseBody({ section, commits }) {
  const groups = buildNotes(commits);
  if (section === null || section === "") return groups;
  if (groups === "") return section;
  return [section, "", "<details>", "<summary>Commits</summary>", "", groups, "", "</details>"].join(
    "\n"
  );
}

/** Commits in `range`, newest first. */
export function commitsIn(range) {
  const RECORD = "\x1e";
  const FIELD = "\x1f";
  const raw = execFileSync("git", ["log", range, `--pretty=format:%s${FIELD}%b${RECORD}`], {
    encoding: "utf8",
    // execFileSync defaults to a 1 MB buffer and throws past it. A long range
    // with verbose commit bodies can exceed that, and failing to read the log
    // is not a failure anyone would expect at release time.
    maxBuffer: 64 * 1024 * 1024,
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

export const USAGE =
  "usage: release-notes.mjs <git-range> [--version X.Y.Z] [--changelog CHANGELOG.md]   e.g. v1.3.0..HEAD --version 1.3.1";

/**
 * The CLI's arguments: one git range, an optional version whose changelog section leads the body,
 * and the changelog to read it from, `CHANGELOG.md` in the working directory by default. Throws on
 * a flag with no value, an unknown flag, or a second range, naming the argument, so a mistyped
 * invocation cannot pass as one that simply had no section to show.
 *
 * @param {string[]} argv the arguments after the script
 * @returns {{ range: string | undefined, version: string | undefined, changelog: string }}
 */
export function parseArgs(argv) {
  const parsed = { range: undefined, version: undefined, changelog: "CHANGELOG.md" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--version" || arg === "--changelog") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      parsed[arg.slice(2)] = value;
      i += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown option ${arg}`);
    } else if (parsed.range === undefined) {
      parsed.range = arg;
    } else {
      throw new Error(`one git range only, got ${parsed.range} and ${arg}`);
    }
  }
  return parsed;
}

/* c8 ignore start -- CLI arm; parseArgs, changelogSection and releaseBody are exercised above */
if (isMain(import.meta.url)) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    process.exit(1);
  }
  if (args.range === undefined) {
    console.error(USAGE);
    process.exit(1);
  }

  let section = null;
  if (args.version !== undefined) {
    section = changelogSection(readFileSync(args.changelog, "utf8"), args.version);
    // A workflow command on stderr: stdout is the notes, and the runner reads both streams. A
    // warning rather than a failure, because the notes are still right — the commit list is
    // what every release carried before this — and the section can be backfilled, as 1.3.1's was.
    if (section === null) {
      console.error(
        `::warning::${args.changelog} has no [${args.version}] section, so these release notes carry the commit list only. Record the section before the tag exists, or backfill it afterwards.`
      );
    } else if (section === "") {
      console.error(
        `::warning::${args.changelog} has an empty [${args.version}] section, so these release notes carry the commit list only.`
      );
    }
  }

  const body = releaseBody({ section, commits: commitsIn(args.range) });
  console.log(body === "" ? "_No notable changes._" : body);
}
/* c8 ignore stop */
