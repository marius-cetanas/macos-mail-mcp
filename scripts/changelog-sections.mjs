#!/usr/bin/env node
/**
 * Does this change put an entry into a section of `CHANGELOG.md` that a tag has already shipped?
 *
 * ## The defect this exists for
 *
 * The changelog is kept by hand, and a release is recorded by inserting its heading below the
 * standing `## [Unreleased]` — so the list that was Unreleased's becomes the release's. A branch
 * that had appended an entry to that list then merges cleanly, and its entry lands under a release
 * it is not part of. Measured on 2026-09-14 with `git merge-file`, #81's entry over `main` as #78
 * left it: zero conflicts, the entry under `## [2.0.0]`, and both test files that read
 * `CHANGELOG.md` still passing, 12 of 12. It surfaced only because #77 had edited the same lines
 * and the rebase conflicted.
 *
 * ## The tag decides, not the heading
 *
 * A recorded section is not yet a shipped one. #77 filed its entry under `## [2.0.0]` fifteen
 * seconds after #78 recorded the version and four minutes before the tag — correctly, since an
 * entry merged before the tag is in that release. Over the 21 commits that had touched
 * `CHANGELOG.md` by 2026-09-14, "a tagged section is frozen" is red on none; "a recorded section is
 * frozen" is red on #77. So the script asks GitHub whether `refs/tags/v{version}` exists, and only
 * for a section that changed. CI cannot look itself: `actions/checkout` fetches one commit and no
 * tags.
 *
 * ## What is compared
 *
 * The base's file against the file in the checkout. On `pull_request` the checkout is the merge
 * commit and the base is its first parent — measured on 2026-09-15 on #82 and #83, where
 * `GET commits/{merge_commit_sha}` returned parents `[base.sha, head.sha]`. That is exactly what
 * merging would change, and the branch's own diff never shows it: against its merge-base, #81's
 * branch only ever added an entry under `[Unreleased]`. On `push` the base is
 * `github.event.before`, which also covers a push of several commits.
 *
 * ## New sections are free, and a `changelog` scope overrides
 *
 * Recording a release adds a heading; backfilling one adds a whole section, as 1.3.1's did in #43.
 * Neither alters a section the base has, so neither is a change here, and neither needs a subject of
 * any particular shape — which matters, because releases were recorded as `docs:`, `feat:` and
 * `chore(release):` before 1.3.2, and as `docs(changelog): record X.Y.Z` only since. A deliberate
 * change to a shipped section — a correction — says so with a `changelog` scope in the subject, as
 * those later recordings did, and the log says the scope allowed it.
 */
import { readFileSync } from "node:fs";
import { isMain } from "./is-main.mjs";

/**
 * The `## [name]` sections of a changelog, keyed by name: each from its heading line to the line
 * before the next heading, trailing blank lines dropped so that inserting a neighbour leaves a
 * section's text as it was. Text before the first heading belongs to no section. A name heading
 * more than one section throws, since keeping either copy could hide a change to the other.
 *
 * @param {string} text the changelog
 * @returns {Map<string, string>}
 */
export function sectionsOf(text) {
  const sections = new Map();
  let name = null;
  let lines = [];
  const close = () => {
    if (name === null) return;
    // Refused rather than written over: a Map keeps the last value under a key, so an unchanged copy
    // appended after an altered section would hide the alteration (raised by Copilot on #98).
    if (sections.has(name)) throw new Error(`more than one section is headed [${name}]`);
    // Blank lines only. A trailing space is content, and two of them end a Markdown line in a hard
    // break, so trimming them would let a shipped section change unseen (raised by Copilot on #98).
    let end = lines.length;
    while (end > 0 && lines[end - 1].trim() === "") end -= 1;
    sections.set(name, lines.slice(0, end).join("\n"));
  };
  for (const line of text.split("\n")) {
    const heading = /^## \[([^\]]+)\]/.exec(line);
    if (heading) {
      close();
      name = heading[1];
      lines = [line];
    } else if (name !== null) {
      lines.push(line);
    }
  }
  close();
  return sections;
}

/** A section name that is a version — `2.0.0` — as opposed to `Unreleased`. */
export function isVersion(name) {
  return /^\d+\.\d+\.\d+$/.test(name);
}

const firstLine = (subject) => String(subject ?? "").split("\n")[0];

/**
 * Does a subject carry the `changelog` scope — `docs(changelog): …`? Only the first line is read,
 * because on a push the subject is the whole squash-merge message.
 */
export function hasChangelogScope(subject) {
  return /^\w+\(changelog\)!?:/.test(firstLine(subject));
}

/**
 * The lines only one side has, in order and counting repeats: a longest-common-subsequence diff over
 * whole lines, blank ones included. A set difference lost order and repetition, so a shipped section
 * whose lines were only reordered or repeated failed with nothing reported as added or removed, and
 * a blank line was left out of the report (raised by Copilot on #98).
 *
 * @param {string[]} was
 * @param {string[]} is
 * @returns {{ added: string[], removed: string[] }}
 */
const lineDiff = (was, is) => {
  const common = Array.from({ length: was.length + 1 }, () => new Array(is.length + 1).fill(0));
  for (let i = was.length - 1; i >= 0; i -= 1) {
    for (let j = is.length - 1; j >= 0; j -= 1) {
      common[i][j] =
        was[i] === is[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const added = [];
  const removed = [];
  let i = 0;
  let j = 0;
  while (i < was.length && j < is.length) {
    if (was[i] === is[j]) {
      i += 1;
      j += 1;
    } else if (common[i + 1][j] >= common[i][j + 1]) {
      removed.push(was[i]);
      i += 1;
    } else {
      added.push(is[j]);
      j += 1;
    }
  }
  return { added: added.concat(is.slice(j)), removed: removed.concat(was.slice(i)) };
};

/** `sectionsOf`, with the file a refusal came from named in its message. */
const sectionsIn = (text, whose) => {
  try {
    return sectionsOf(text);
  } catch (error) {
    throw new Error(`${whose} CHANGELOG.md: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Every version section of `base` that `head` alters or lacks. `[Unreleased]` is not a version and
 * is free to change; a section only `head` has is new, and free too.
 *
 * @returns {Array<{ version: string, kind: "changed" | "removed", added: string[], removed: string[] }>}
 */
export function changedSections(baseText, headText) {
  const base = sectionsIn(baseText, "the base's");
  const head = sectionsIn(headText, "the checkout's");
  const changes = [];
  for (const [version, before] of base) {
    if (!isVersion(version)) continue;
    const after = head.get(version);
    const was = before.split("\n");
    if (after === undefined) {
      changes.push({ version, kind: "removed", added: [], removed: was });
    } else if (after !== before) {
      changes.push({ version, kind: "changed", ...lineDiff(was, after.split("\n")) });
    }
  }
  return changes;
}

// A blank line would print as nothing, and a report that shows nothing is what was being fixed.
const indent = (lines) =>
  lines.map((line) => `  ${line.trim() === "" ? "(blank line)" : line}`).join("\n");

/**
 * The answer, from what was measured: the version sections that changed, which of those versions
 * are tagged, and the subject. Pure, so every shape is a test.
 *
 * @param {{ changes: ReturnType<typeof changedSections>, tagged: Set<string>, subject?: string }} input
 * @returns {{ ok: boolean, messages: string[] }}
 */
export function verdict({ changes, tagged, subject }) {
  const messages = [];
  let shipped = 0;
  for (const { version, kind, added, removed } of changes) {
    const tag = `refs/tags/v${version}`;
    if (!tagged.has(version)) {
      messages.push(
        `## [${version}] ${kind === "removed" ? "is removed" : "changed"}, and ${tag} does not exist, so the section has not shipped: allowed.`
      );
      continue;
    }
    shipped += 1;
    if (kind === "removed") {
      messages.push(`## [${version}] is tagged (${tag} exists) and this change removes it.`);
    } else {
      messages.push(
        [
          `## [${version}] is tagged (${tag} exists) and this change alters it: ${added.length} line(s) added, ${removed.length} removed.`,
          ...(added.length ? ["  added:", indent(added)] : []),
          ...(removed.length ? ["  removed:", indent(removed)] : []),
        ].join("\n")
      );
    }
  }

  if (shipped === 0) {
    if (changes.length === 0) messages.push("no version section of CHANGELOG.md changed against the base.");
    return { ok: true, messages };
  }
  if (hasChangelogScope(subject)) {
    messages.push(`allowed: the subject carries the changelog scope — "${firstLine(subject)}".`);
    return { ok: true, messages };
  }
  messages.push(
    "A tag has shipped that section as it was. An entry for a change that has not shipped belongs " +
      "under ## [Unreleased]; a deliberate change to a shipped section says so with a changelog " +
      'scope in the subject, as in "docs(changelog): …".'
  );
  return { ok: false, messages };
}

const NULL_SHA = "0".repeat(40);

/**
 * The commit to compare the checkout against. On `pull_request` `GITHUB_SHA` is the merge commit
 * and the base is its first parent; on `push` it is `BEFORE`; any other event has no base here.
 *
 * @param {{ event: string, sha: string, before?: string }} run
 * @param {{ parents: (sha: string) => Promise<string[]> }} io
 */
export async function resolveBase({ event, sha, before }, io) {
  if (event === "pull_request") {
    const parents = await io.parents(sha);
    if (parents.length !== 2) {
      throw new Error(
        `commits/${sha} reports ${parents.length} parent${parents.length === 1 ? "" : "s"}, not the 2 of a merge commit; on pull_request GITHUB_SHA should be the merge commit`
      );
    }
    return parents[0];
  }
  if (event === "push") {
    if (!before) throw new Error("push event with BEFORE unset: nothing to compare against");
    if (before === NULL_SHA) throw new Error("push event with BEFORE the null SHA: nothing to compare against");
    return before;
  }
  throw new Error(`event ${event}: this check has a base on pull_request and push only`);
}

/**
 * The whole check over an `io`: the base's file, the sections that changed, one tag probe per
 * changed version and none otherwise, then the verdict.
 *
 * @param {{ io: ReturnType<typeof makeGithubIo>, base: string, head: string, subject?: string }} input
 */
export async function check({ io, base, head, subject }) {
  const changes = changedSections(await io.file(base), head);
  const tagged = new Set();
  for (const { version } of changes) {
    if (await io.tagged(version)) tagged.add(version);
  }
  return verdict({ changes, tagged, subject });
}

/**
 * The three reads, over an injected `fetch`. Every request carries the token and is built here from a
 * path on api.github.com, and none follows a redirect: fetch would otherwise follow a 3xx to another
 * origin and hand back that origin's answer as the file, the parents or the tag. Under
 * `redirect: "manual"` the 3xx comes back as a failed read that names its status (raised by Copilot
 * on #98).
 */
export function makeGithubIo({ fetch, token, repo }) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "macos-mail-mcp-changelog-sections",
  };
  const get = (path, accept = headers.accept) =>
    fetch(`https://api.github.com/repos/${repo}/${path}`, {
      headers: { ...headers, accept },
      redirect: "manual",
    });

  return {
    /** `CHANGELOG.md` as it is at `ref`, raw. Measured on 2026-09-14 at `17cc876`. */
    file: async (ref) => {
      const path = `contents/CHANGELOG.md?ref=${ref}`;
      const res = await get(path, "application/vnd.github.raw+json");
      if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
      return res.text();
    },

    /** The parent SHAs of a commit, in the order the commit records them. */
    parents: async (sha) => {
      const path = `commits/${sha}`;
      const res = await get(path);
      if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
      const { parents } = await res.json();
      return (parents ?? []).map((parent) => parent.sha);
    },

    /**
     * Does `refs/tags/v{version}` exist? 200 is yes and 404 is no — measured on 2026-09-14 with
     * `v2.0.0` and `v9.9.9`. Anything else is not an answer, and reading it as one would be a
     * wrong answer given silently.
     */
    tagged: async (version) => {
      const path = `git/ref/tags/v${version}`;
      const res = await get(path);
      if (res.status === 200) return true;
      if (res.status === 404) return false;
      throw new Error(`GET ${path} -> ${res.status}`);
    },
  };
}

/** `["a", "b", "c"]` → `a, b and c`. */
const spoken = (list) =>
  list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;

/* c8 ignore start -- CLI arm; everything it calls is exercised above */
if (isMain(import.meta.url)) {
  const { GH_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_EVENT_NAME, BEFORE, SUBJECT } = process.env;
  const missing = Object.entries({ GH_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_EVENT_NAME })
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    console.error(`need ${spoken(missing)}`);
    process.exit(1);
  }

  const io = makeGithubIo({ fetch, token: GH_TOKEN, repo: GITHUB_REPOSITORY });
  try {
    const base = await resolveBase({ event: GITHUB_EVENT_NAME, sha: GITHUB_SHA, before: BEFORE }, io);
    console.log(`${GITHUB_EVENT_NAME}: CHANGELOG.md in the checkout, against ${base}`);
    const head = readFileSync("CHANGELOG.md", "utf8");
    const { ok, messages } = await check({ io, base, head, subject: SUBJECT });
    console.log(messages.join("\n"));
    process.exit(ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
/* c8 ignore stop */
