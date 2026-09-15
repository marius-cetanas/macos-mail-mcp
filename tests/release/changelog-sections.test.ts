import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  sectionsOf,
  isVersion,
  hasChangelogScope,
  changedSections,
  verdict,
  resolveBase,
  check,
  makeGithubIo,
} from "../../scripts/changelog-sections.mjs";

/**
 * `CHANGELOG.md` as #78 left `main` on 2026-09-14, trimmed to the lines that decide the answer:
 * `## [2.0.0]` inserted below the standing heading, so the `### Internal` list that had been
 * `[Unreleased]`'s is now 2.0.0's.
 */
const RECORDED = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "## [2.0.0] - 2026-09-14",
  "",
  "### Internal",
  "",
  "- Vitest 4 → 5, with `@vitest/coverage-v8` moved alongside it.",
  "",
  "## [1.3.4] - 2026-09-02",
  "",
  "### Internal",
  "",
  "- `copilot-reviewed` no longer counts a Copilot round that contains no review as a review.",
  "",
].join("\n");

/** The entry #81's branch had appended to `[Unreleased]` → Internal before 2.0.0 was recorded. */
const ENTRY =
  "- `copilot-reviewed` reads every page of a pull request's reviews, not only the first.";

/**
 * The silent merge, as `git merge-file` produced it on 2026-09-14: zero conflicts, and the entry
 * lands at the end of the list it was appended to — which is 2.0.0's now.
 */
const MISFILED = RECORDED.replace("moved alongside it.\n", `moved alongside it.\n${ENTRY}\n`);

/** Where the entry belongs. */
const FILED = RECORDED.replace(
  "## [Unreleased]\n",
  `## [Unreleased]\n\n### Internal\n\n${ENTRY}\n`
);

/** A recording: the next version's heading inserted below `[Unreleased]`, above its list. */
const RECORDING_NEXT = FILED.replace(
  "## [Unreleased]\n\n### Internal",
  "## [Unreleased]\n\n## [2.1.0] - 2026-09-20\n\n### Internal"
);

/** A backfill in the measured shape of 1.3.1's: a whole section inserted between two released ones. */
const BACKFILLED = RECORDED.replace(
  "## [1.3.4] - 2026-09-02",
  "## [1.3.5] - 2026-09-10\n\nRecorded after the fact.\n\n### Fixed\n\n- A thing.\n\n## [1.3.4] - 2026-09-02"
);

describe("sectionsOf", () => {
  it("keys each `## [name]` section by its name, heading line included, preamble left out", () => {
    const sections = sectionsOf(RECORDED);
    expect([...sections.keys()]).toEqual(["Unreleased", "2.0.0", "1.3.4"]);
    expect(sections.get("2.0.0")).toBe(
      "## [2.0.0] - 2026-09-14\n\n### Internal\n\n- Vitest 4 → 5, with `@vitest/coverage-v8` moved alongside it."
    );
  });

  // A section's text must not depend on what follows it, or inserting a neighbour — recording a
  // release, backfilling one — would read as a change to the section above the insertion.
  it("drops trailing blank lines, so an inserted neighbour leaves a section's text unchanged", () => {
    expect(sectionsOf(BACKFILLED).get("2.0.0")).toBe(sectionsOf(RECORDED).get("2.0.0"));
    expect(sectionsOf(RECORDING_NEXT).get("2.0.0")).toBe(sectionsOf(RECORDED).get("2.0.0"));
    // Both insertions above keep the one blank line before the next heading, so they pass without
    // the trim as well — measured by mutation. An insertion that leaves one more is what needs it.
    const roomier = RECORDED.replace("moved alongside it.\n", "moved alongside it.\n\n");
    expect(sectionsOf(roomier).get("2.0.0")).toBe(sectionsOf(RECORDED).get("2.0.0"));
  });

  // Only blank lines are dropped. A trailing space is content — two end a Markdown line in a hard
  // break — so a section that gains them has changed (raised by Copilot on #98).
  it("keeps trailing spaces on a line of content, so a hard break added to a section is a change", () => {
    const hardBreak = RECORDED.replace("moved alongside it.\n", "moved alongside it.  \n");
    expect(sectionsOf(hardBreak).get("2.0.0")).not.toBe(sectionsOf(RECORDED).get("2.0.0"));
    expect(changedSections(RECORDED, hardBreak)).toMatchObject([{ version: "2.0.0", kind: "changed" }]);
  });

  // A Map keeps the last value under a key, so a second section of the same name would hide a change
  // to the first. Refused rather than overwritten (raised by Copilot on #98).
  it("refuses two sections of the same name rather than keeping only the last", () => {
    const twice = `${RECORDED}## [2.0.0] - 2026-09-14\n\n- A copy.\n`;
    expect(() => sectionsOf(twice)).toThrow("more than one section is headed [2.0.0]");
  });

  it("returns nothing for a file with no headings", () => {
    expect(sectionsOf("# Changelog\n\nnothing yet\n").size).toBe(0);
  });
});

describe("isVersion", () => {
  it("is a three-part version and nothing else", () => {
    expect(isVersion("2.0.0")).toBe(true);
    expect(isVersion("1.10.3")).toBe(true);
    expect(isVersion("Unreleased")).toBe(false);
    expect(isVersion("2.0")).toBe(false);
  });
});

describe("hasChangelogScope", () => {
  // Every release since 1.3.2 has been recorded as `docs(changelog): record X.Y.Z` (#43, #50, #66,
  // #78). Earlier ones were not — 1.2.0 and 1.3.0 as `chore(release):` — which is why recording a
  // release must not depend on the scope, and does not: a new section is free.
  it("reads a `changelog` scope in a conventional subject", () => {
    expect(hasChangelogScope("docs(changelog): record 2.0.0 (#78)")).toBe(true);
    expect(hasChangelogScope("docs(changelog)!: rewrite the 1.3.3 entry")).toBe(true);
  });

  it("reads only the first line, which is the subject of a squash-merge message", () => {
    expect(hasChangelogScope("docs(changelog): fix a PR number\n\nbody")).toBe(true);
    expect(hasChangelogScope("fix(ci): a thing\n\ndocs(changelog): not the subject")).toBe(false);
  });

  it("rejects any other scope, no scope, and no subject", () => {
    expect(hasChangelogScope("fix(ci): copilot-reviewed reads every page (#81)")).toBe(false);
    expect(hasChangelogScope("docs: hold every documented tool count to the registered tools")).toBe(false);
    expect(hasChangelogScope("changelog: not a scope")).toBe(false);
    expect(hasChangelogScope(undefined)).toBe(false);
    expect(hasChangelogScope("")).toBe(false);
  });
});

describe("changedSections", () => {
  it("reports the misfiled entry as a change to [2.0.0], with the lines that arrived", () => {
    expect(changedSections(RECORDED, MISFILED)).toEqual([
      { version: "2.0.0", kind: "changed", added: [ENTRY], removed: [] },
    ]);
  });

  it("ignores [Unreleased], which is not a version", () => {
    expect(changedSections(RECORDED, FILED)).toEqual([]);
  });

  it("lets a release be recorded: a new heading is not a change to any section", () => {
    expect(changedSections(FILED, RECORDING_NEXT)).toEqual([]);
  });

  it("lets a release be backfilled as a whole new section, as 1.3.1's was", () => {
    expect(changedSections(RECORDED, BACKFILLED)).toEqual([]);
  });

  it("reports a section that is gone", () => {
    const gone = RECORDED.slice(0, RECORDED.indexOf("## [1.3.4]"));
    expect(changedSections(RECORDED, gone)).toMatchObject([{ version: "1.3.4", kind: "removed" }]);
  });

  it("reports a change to the heading line, since the date shipped with the section", () => {
    const redated = RECORDED.replace("## [2.0.0] - 2026-09-14", "## [2.0.0] - 2026-09-15");
    expect(changedSections(RECORDED, redated)).toMatchObject([
      { version: "2.0.0", kind: "changed", added: ["## [2.0.0] - 2026-09-15"], removed: ["## [2.0.0] - 2026-09-14"] },
    ]);
  });

  /*
   * The bypass the refusal closes: alter the shipped section, then append an unchanged copy of it.
   * Overwritten by the copy, the alteration would not be seen at all.
   */
  it("fails closed when a changed section is followed by an unchanged copy of itself", () => {
    const copy = sectionsOf(RECORDED).get("2.0.0");
    const hidden = `${MISFILED}\n${copy}\n`;
    expect(() => changedSections(RECORDED, hidden)).toThrow(
      "the checkout's CHANGELOG.md: more than one section is headed [2.0.0]"
    );
  });
});

/**
 * A set difference lost order and repetition, so a tagged section whose lines were only reordered or
 * repeated failed with "0 line(s) added, 0 removed" and no lines shown, and blank lines were dropped
 * from the report altogether (raised by Copilot on #98). The failure was right; the report was not.
 */
describe("changedSections reports what changed, in order and counting repeats", () => {
  const VITEST = "- Vitest 4 → 5, with `@vitest/coverage-v8` moved alongside it.";
  const SECOND = "- A second entry.";
  const TWO = RECORDED.replace("moved alongside it.\n", `moved alongside it.\n${SECOND}\n`);

  it("reports a reordered line as moved, rather than as nothing", () => {
    const swapped = TWO.replace(`${VITEST}\n${SECOND}\n`, `${SECOND}\n${VITEST}\n`);
    const [change] = changedSections(TWO, swapped);
    expect(change.added).toHaveLength(1);
    expect(change.removed).toEqual(change.added);
    expect([VITEST, SECOND]).toContain(change.added[0]);
  });

  it("reports a repeated line as added", () => {
    const repeated = TWO.replace(`${SECOND}\n`, `${SECOND}\n${SECOND}\n`);
    expect(changedSections(TWO, repeated)).toMatchObject([
      { version: "2.0.0", kind: "changed", added: [SECOND], removed: [] },
    ]);
  });

  it("counts and shows an added blank line in the failure", () => {
    const spaced = TWO.replace(`${VITEST}\n${SECOND}\n`, `${VITEST}\n\n${SECOND}\n`);
    const result = verdict({
      changes: changedSections(TWO, spaced),
      tagged: new Set(["2.0.0"]),
      subject: "fix(ci): a thing",
    });
    expect(result.ok).toBe(false);
    const text = result.messages.join("\n");
    expect(text).toContain("1 line(s) added, 0 removed");
    expect(text).toContain("(blank line)");
  });
});

describe("verdict", () => {
  const misfiled = changedSections(RECORDED, MISFILED);
  const subject = "fix(ci): copilot-reviewed reads every page of a pull request's reviews";

  it("fails the #78 shape once v2.0.0 is tagged, naming the section, the tag and the entry", () => {
    const result = verdict({ changes: misfiled, tagged: new Set(["2.0.0"]), subject });
    expect(result.ok).toBe(false);
    const text = result.messages.join("\n");
    expect(text).toContain("## [2.0.0]");
    expect(text).toContain("refs/tags/v2.0.0");
    expect(text).toContain(ENTRY);
    expect(text).toContain("## [Unreleased]");
  });

  /**
   * #77's case, measured on 2026-09-14: it filed its entry under `## [2.0.0]` fifteen seconds after
   * #78 recorded the version and four minutes before the tag. An entry merged before the tag is in
   * that release, so a recorded, untagged section is still open.
   */
  it("passes the same shape while the tag does not exist, and says so", () => {
    const result = verdict({ changes: misfiled, tagged: new Set(), subject });
    expect(result.ok).toBe(true);
    expect(result.messages.join("\n")).toMatch(/refs\/tags\/v2\.0\.0 does not exist/);
  });

  it("lets a changelog-scoped subject alter a shipped section, and logs that it did", () => {
    const result = verdict({
      changes: misfiled,
      tagged: new Set(["2.0.0"]),
      subject: "docs(changelog): move the paging entry into 2.0.0, which shipped it",
    });
    expect(result.ok).toBe(true);
    expect(result.messages.join("\n")).toMatch(/changelog scope/);
    expect(result.messages.join("\n")).toContain("## [2.0.0]");
  });

  it("fails a removed shipped section", () => {
    const result = verdict({
      changes: [{ version: "1.3.4", kind: "removed", added: [], removed: ["## [1.3.4] - 2026-09-02"] }],
      tagged: new Set(["1.3.4"]),
      subject,
    });
    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toMatch(/## \[1\.3\.4\].*removes it/);
  });

  it("passes when no version section changed", () => {
    const result = verdict({ changes: [], tagged: new Set(), subject });
    expect(result.ok).toBe(true);
    expect(result.messages).toHaveLength(1);
  });
});

/**
 * A `fetch` that answers by path under the repository and records what it was asked. A real
 * `Response` always has `headers`, `json` and `text`, so every answer here does too.
 */
const fetchStub = (routes: Record<string, { status?: number; body?: unknown; text?: string }>) => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const route = routes[url.replace("https://api.github.com/repos/o/r/", "")];
    const status = route ? (route.status ?? 200) : 404;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(),
      json: async () => route?.body ?? {},
      text: async () => route?.text ?? "",
    } as unknown as Response;
  };
  return { fetch, calls };
};

const io = (routes: Parameters<typeof fetchStub>[0]) => {
  const { fetch, calls } = fetchStub(routes);
  return {
    calls,
    ...makeGithubIo({ fetch: fetch as unknown as typeof globalThis.fetch, token: "t", repo: "o/r" }),
  };
};

const M = "m".repeat(40);
const B = "b".repeat(40);
const H = "h".repeat(40);
const headers = (call: { init?: RequestInit }) => call.init?.headers as Record<string, string>;

describe("makeGithubIo", () => {
  describe("file", () => {
    it("reads CHANGELOG.md raw at the ref, with the token", async () => {
      const g = io({ [`contents/CHANGELOG.md?ref=${B}`]: { text: RECORDED } });
      await expect(g.file(B)).resolves.toBe(RECORDED);
      expect(g.calls[0].url).toBe(`https://api.github.com/repos/o/r/contents/CHANGELOG.md?ref=${B}`);
      expect(headers(g.calls[0]).accept).toBe("application/vnd.github.raw+json");
      expect(headers(g.calls[0]).authorization).toBe("Bearer t");
    });

    it("names the status when the read fails", async () => {
      await expect(io({}).file(B)).rejects.toThrow(`GET contents/CHANGELOG.md?ref=${B} -> 404`);
    });
  });

  describe("parents", () => {
    // Measured on 2026-09-15 on #82 and #83: `GET commits/{merge_commit_sha}` returns the merge
    // commit, whose parents are `[base.sha, head.sha]` in that order.
    it("returns the commit's parent SHAs in order", async () => {
      const g = io({ [`commits/${M}`]: { body: { parents: [{ sha: B }, { sha: H }] } } });
      await expect(g.parents(M)).resolves.toEqual([B, H]);
      expect(g.calls[0].url).toBe(`https://api.github.com/repos/o/r/commits/${M}`);
      expect(headers(g.calls[0]).authorization).toBe("Bearer t");
    });

    it("names the status when the read fails", async () => {
      await expect(io({ [`commits/${M}`]: { status: 422 } }).parents(M)).rejects.toThrow(
        `GET commits/${M} -> 422`
      );
    });
  });

  describe("tagged", () => {
    // Measured on 2026-09-14: `git/ref/tags/v2.0.0` answered 200 and `git/ref/tags/v9.9.9` 404.
    it("is true on 200 and false on 404", async () => {
      const g = io({ "git/ref/tags/v2.0.0": { body: { ref: "refs/tags/v2.0.0" } } });
      await expect(g.tagged("2.0.0")).resolves.toBe(true);
      await expect(g.tagged("9.9.9")).resolves.toBe(false);
      expect(g.calls.map((c) => c.url)).toEqual([
        "https://api.github.com/repos/o/r/git/ref/tags/v2.0.0",
        "https://api.github.com/repos/o/r/git/ref/tags/v9.9.9",
      ]);
    });

    // Any other status is not an answer to "does the tag exist", and reading it as either would be
    // a wrong answer given silently.
    it("throws on any other status, naming it", async () => {
      await expect(io({ "git/ref/tags/v2.0.0": { status: 503 } }).tagged("2.0.0")).rejects.toThrow(
        "GET git/ref/tags/v2.0.0 -> 503"
      );
    });
  });

  // Built on api.github.com, a request can still be redirected elsewhere, and fetch would follow it
  // and hand back the other origin's answer. Each read refuses the redirect instead, so a 3xx is a
  // failed read naming its status (raised by Copilot on #98).
  it("follows no redirect on any read", async () => {
    const g = io({
      [`contents/CHANGELOG.md?ref=${B}`]: { text: RECORDED },
      [`commits/${M}`]: { body: { parents: [{ sha: B }, { sha: H }] } },
      "git/ref/tags/v2.0.0": { body: {} },
    });
    await g.file(B);
    await g.parents(M);
    await g.tagged("2.0.0");
    expect(g.calls.map((c) => c.init?.redirect)).toEqual(["manual", "manual", "manual"]);
    await expect(io({ [`commits/${M}`]: { status: 302 } }).parents(M)).rejects.toThrow(
      `GET commits/${M} -> 302`
    );
  });
});

describe("resolveBase", () => {
  it("on pull_request reads the merge commit's first parent, the base as it will be merged into", async () => {
    const g = io({ [`commits/${M}`]: { body: { parents: [{ sha: B }, { sha: H }] } } });
    await expect(resolveBase({ event: "pull_request", sha: M }, g)).resolves.toBe(B);
  });

  it("refuses a pull_request commit that is not a merge commit, naming what it saw", async () => {
    const g = io({ [`commits/${M}`]: { body: { parents: [{ sha: B }] } } });
    await expect(resolveBase({ event: "pull_request", sha: M }, g)).rejects.toThrow(
      `commits/${M} reports 1 parent, not the 2 of a merge commit`
    );
  });

  it("on push uses BEFORE, and asks nothing", async () => {
    const g = io({});
    await expect(resolveBase({ event: "push", sha: H, before: B }, g)).resolves.toBe(B);
    expect(g.calls).toHaveLength(0);
  });

  it("refuses a push with no BEFORE, or the null SHA of a new branch", async () => {
    await expect(resolveBase({ event: "push", sha: H }, io({}))).rejects.toThrow("BEFORE");
    await expect(resolveBase({ event: "push", sha: H, before: "0".repeat(40) }, io({}))).rejects.toThrow(
      "BEFORE"
    );
  });

  it("refuses any other event by name", async () => {
    await expect(resolveBase({ event: "schedule", sha: H }, io({}))).rejects.toThrow("schedule");
  });
});

describe("check over makeGithubIo", () => {
  const shipped = {
    [`contents/CHANGELOG.md?ref=${B}`]: { text: RECORDED },
    "git/ref/tags/v2.0.0": { body: { ref: "refs/tags/v2.0.0" } },
  };
  const subject = "fix(ci): copilot-reviewed reads every page of a pull request's reviews";

  it("fails the #78 shape, and probes only the version whose section changed", async () => {
    const g = io(shipped);
    const result = await check({ io: g, base: B, head: MISFILED, subject });
    expect(result.ok).toBe(false);
    expect(result.messages.join("\n")).toContain(ENTRY);
    const probes = g.calls.map((c) => c.url).filter((u) => u.includes("git/ref/tags/"));
    expect(probes).toEqual(["https://api.github.com/repos/o/r/git/ref/tags/v2.0.0"]);
  });

  it("passes the entry filed under [Unreleased], asking about no tag at all", async () => {
    const g = io(shipped);
    const result = await check({ io: g, base: B, head: FILED, subject });
    expect(result.ok).toBe(true);
    expect(g.calls.map((c) => c.url).filter((u) => u.includes("git/ref/tags/"))).toEqual([]);
  });

  it("passes a recorded, untagged section that gained an entry", async () => {
    const g = io({ [`contents/CHANGELOG.md?ref=${B}`]: { text: RECORDED } });
    const result = await check({ io: g, base: B, head: MISFILED, subject });
    expect(result.ok).toBe(true);
  });

  it("refuses the duplicated-section shape end to end, rather than passing it", async () => {
    const g = io(shipped);
    const copy = sectionsOf(RECORDED).get("2.0.0");
    await expect(check({ io: g, base: B, head: `${MISFILED}\n${copy}\n`, subject })).rejects.toThrow(
      "more than one section is headed [2.0.0]"
    );
  });
});

describe("verify.yml runs it", () => {
  const ci = parse(readFileSync(join(process.cwd(), ".github/workflows/verify.yml"), "utf8")) as {
    on: Record<string, unknown>;
    jobs: Record<
      string,
      {
        needs?: string[];
        permissions?: Record<string, string>;
        steps?: Array<{ run?: string; uses?: string; env?: Record<string, string> }>;
      }
    >;
  };
  const runsCheck = Object.entries(ci.jobs).filter(([, job]) =>
    (job.steps ?? []).some((s) => s.run?.includes("scripts/changelog-sections.mjs"))
  );

  it("in exactly one job, which the required aggregate depends on", () => {
    expect(runsCheck).toHaveLength(1);
    expect(ci.jobs.verify.needs).toContain(runsCheck[0][0]);
  });

  it("on both events the script accepts, so a merge that lands after a release is caught on main", () => {
    expect(Object.keys(ci.on)).toEqual(expect.arrayContaining(["push", "pull_request"]));
  });

  /*
   * The override reads the pull request's title, and the bare `pull_request` trigger does not fire
   * when only the title changes, so a green status could outlive the title that earned it. `edited`
   * re-runs the workflow on a title change, and the default types are listed beside it because naming
   * any type replaces them (raised by Copilot on #98).
   */
  it("re-runs when a pull request's title changes, as well as on the default events", () => {
    const types = (ci.on.pull_request as { types?: string[] } | null)?.types ?? [];
    expect(types).toEqual(expect.arrayContaining(["opened", "synchronize", "reopened", "edited"]));
  });

  it("hands the script the token, the push base and the subject through env, not shell", () => {
    const step = runsCheck[0][1].steps!.find((s) => s.run?.includes("scripts/changelog-sections.mjs"))!;
    expect(step.run!.trim()).toBe("node scripts/changelog-sections.mjs");
    expect(step.env?.GH_TOKEN).toContain("github.token");
    expect(step.env?.BEFORE).toContain("github.event.before");
    expect(step.env?.SUBJECT).toContain("github.event.pull_request.title");
    expect(step.env?.SUBJECT).toContain("github.event.head_commit.message");
  });

  it("installs nothing, since the script needs only Node", () => {
    const runs = runsCheck[0][1].steps!.map((s) => s.run ?? "");
    expect(runs.filter((r) => /^\s*npm\b/.test(r))).toEqual([]);
  });

  it("does not widen the read-only token", () => {
    expect(runsCheck[0][1].permissions).toBeUndefined();
  });
});

describe("changelog-sections CLI", () => {
  const run = (env: Record<string, string>) => {
    try {
      execFileSync("node", [join("scripts", "changelog-sections.mjs")], {
        env: { PATH: process.env.PATH ?? "", ...env },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: 0, err: "" };
    } catch (error) {
      const e = error as { status: number | null; stderr?: string };
      return { code: typeof e.status === "number" ? e.status : 1, err: e.stderr ?? "" };
    }
  };

  it("names every missing variable rather than throwing a stack trace", () => {
    const { code, err } = run({});
    expect(code).toBe(1);
    expect(err).toMatch(/need GH_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA and GITHUB_EVENT_NAME/);
    expect(err).not.toMatch(/at .*changelog-sections\.mjs:\d+/);
  });

  it("names only what is missing", () => {
    const { err } = run({ GH_TOKEN: "t", GITHUB_SHA: H });
    expect(err).toMatch(/need GITHUB_REPOSITORY and GITHUB_EVENT_NAME/);
  });

  // The event is refused before any request is made, so this needs no network and no real token.
  it("refuses an event it has no base for, before asking GitHub anything", () => {
    const { code, err } = run({
      GH_TOKEN: "t",
      GITHUB_REPOSITORY: "o/r",
      GITHUB_SHA: H,
      GITHUB_EVENT_NAME: "schedule",
    });
    expect(code).toBe(1);
    expect(err).toMatch(/schedule/);
    expect(err).not.toMatch(/at .*changelog-sections\.mjs:\d+/);
  });
});
