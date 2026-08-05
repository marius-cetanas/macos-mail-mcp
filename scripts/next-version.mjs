// macos-mail-mcp — MIT License — https://github.com/marius-cetanas/macos-mail-mcp
//
// Derives the next version from the conventional commits accumulated since the
// last release. Deliberately computed at release time rather than per push: a
// per-push bump burns a version number for every merge, so a repo that merges
// three times and releases once would jump 1.3.0 -> 1.6.0 with 1.4.0 and 1.5.0
// never existing.

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RANK = { none: 0, patch: 1, minor: 2, major: 3 };
const FORCEABLE = ["patch", "minor", "major"];

function parseVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (m === null) {
    throw new Error(`Invalid version: ${version}`);
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Bump level implied by one commit, or "none" if it is not releasable. */
function classify({ subject = "", body = "" }) {
  const m = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject.trim());
  if (m === null) {
    return "none";
  }
  const [, type, , bang] = m;

  // A revert names the type it reverts ("revert: feat: …"); that inner type is
  // being undone, so it must not be read as the commit's own.
  if (type === "revert") {
    return "none";
  }
  if (bang !== undefined || /^BREAKING[ -]CHANGE:/m.test(body)) {
    return "major";
  }
  if (type === "feat") {
    return "minor";
  }
  if (type === "fix" || type === "perf") {
    return "patch";
  }
  return "none";
}

function applyBump({ major, minor, patch }, level) {
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * @param current  current version, e.g. "1.3.0"
 * @param commits  [{subject, body}] since the last release
 * @param options  {force} to override the derived level
 * @returns {{version: string|null, bump: string, releasable: boolean}}
 */
export function nextVersion(current, commits, options = {}) {
  const parts = parseVersion(current);

  let level = "none";
  if (options.force !== undefined && options.force !== null) {
    if (!FORCEABLE.includes(options.force)) {
      throw new Error(
        `Unknown bump level: ${options.force}. Expected one of ${FORCEABLE.join(", ")}.`
      );
    }
    level = options.force;
  } else {
    for (const commit of commits) {
      const candidate = classify(commit);
      if (RANK[candidate] > RANK[level]) {
        level = candidate;
      }
    }
  }

  if (level === "none") {
    return { version: null, bump: "none", releasable: false };
  }
  return { version: applyBump(parts, level), bump: level, releasable: true };
}

/** Commits since `since` (a tag or ref), newest first. */
export function commitsSince(since) {
  const RECORD = "\x1e";
  const FIELD = "\x1f";
  const range = since === null || since === undefined || since === "" ? "HEAD" : `${since}..HEAD`;
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

/**
 * Most recent v* tag, or null when the repo has never been released — which is
 * also what a shallow CI checkout looks like. stderr is discarded because
 * `git describe` writes "fatal: No names found" on a case this handles.
 */
export function lastReleaseTag() {
  try {
    return execFileSync("git", ["describe", "--tags", "--abbrev=0", "--match", "v*"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
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

// CLI: prints JSON for the workflow to consume.
//
// Exit codes are load-bearing — the workflow distinguishes them. 0 releasable,
// 2 nothing releasable (a normal answer), anything else a genuine failure.
if (isMain()) {
  const current = arg("current");
  if (current === undefined) {
    console.error(
      "usage: next-version.mjs --current <version> [--since <ref>] [--force patch|minor|major|auto]"
    );
    process.exitCode = 1;
  } else {
    const since = arg("since") ?? lastReleaseTag();
    const force = arg("force");
    const commits = commitsSince(since);
    const result = nextVersion(current, commits, { force: force === "auto" ? undefined : force });
    console.log(JSON.stringify({ ...result, since, considered: commits.length }, null, 2));
    if (!result.releasable) {
      process.exitCode = 2;
    }
  }
}
