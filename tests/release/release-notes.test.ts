import { describe, it, expect } from "vitest";
import {
  buildNotes,
  changelogSection,
  describe as strip,
  parseArgs,
  releaseBody,
} from "../../scripts/release-notes.mjs";

const c = (subject: string, body = "") => ({ subject, body });

describe("describe", () => {
  it("strips the conventional-commit type", () => {
    expect(strip("feat: add fromAccount")).toBe("add fromAccount");
  });

  it("strips a scope", () => {
    expect(strip("feat(compose): add fromAccount")).toBe("add fromAccount");
  });

  it("strips a breaking marker", () => {
    expect(strip("feat(api)!: drop Node 18")).toBe("drop Node 18");
  });

  it("strips a trailing PR reference", () => {
    expect(strip("fix: correct the guard (#24)")).toBe("correct the guard");
  });

  it("leaves an unconventional subject alone", () => {
    expect(strip("just some words")).toBe("just some words");
  });

  it("does not strip a mid-subject issue reference", () => {
    expect(strip("fix: correct #24 in the guard")).toBe("correct #24 in the guard");
  });
});

describe("buildNotes", () => {
  it("groups features under Added", () => {
    const notes = buildNotes([c("feat: add a thing")]);
    expect(notes).toContain("### Added");
    expect(notes).toContain("- add a thing");
  });

  it("groups fixes and perf under Fixed", () => {
    const notes = buildNotes([c("fix: a"), c("perf: b")]);
    expect(notes).toContain("### Fixed");
    expect(notes).toContain("- a");
    expect(notes).toContain("- b");
  });

  it("groups docs separately from internal churn", () => {
    const notes = buildNotes([c("docs: explain"), c("chore: tidy")]);
    expect(notes.indexOf("### Documentation")).toBeLessThan(notes.indexOf("### Internal"));
  });

  it("puts breaking changes first and only once", () => {
    const notes = buildNotes([c("feat: ordinary"), c("feat!: drastic")]);
    expect(notes.indexOf("### Breaking")).toBe(0);
    expect(notes).toContain("- drastic");
    expect(notes.match(/- drastic/g)).toHaveLength(1);
  });

  it("recognises BREAKING CHANGE in the body", () => {
    const notes = buildNotes([c("fix: small", "BREAKING CHANGE: drops Node 18")]);
    expect(notes).toContain("### Breaking");
    expect(notes).toContain("- small");
  });

  it("omits sections with nothing in them", () => {
    const notes = buildNotes([c("fix: only this")]);
    expect(notes).not.toContain("### Added");
    expect(notes).not.toContain("### Internal");
  });

  it("ignores commits with no conventional type", () => {
    expect(buildNotes([c("merge branch whatever")])).toBe("");
  });

  it("returns empty for no commits", () => {
    expect(buildNotes([])).toBe("");
  });

  it("orders sections Added, Fixed, Changed, Documentation, Internal", () => {
    const notes = buildNotes([
      c("chore: e"),
      c("docs: d"),
      c("refactor: c"),
      c("fix: b"),
      c("feat: a"),
    ]);
    const at = (h: string) => notes.indexOf(`### ${h}`);
    expect(at("Added")).toBeLessThan(at("Fixed"));
    expect(at("Fixed")).toBeLessThan(at("Changed"));
    expect(at("Changed")).toBeLessThan(at("Documentation"));
    expect(at("Documentation")).toBeLessThan(at("Internal"));
  });

  it("does not leave trailing whitespace", () => {
    const notes = buildNotes([c("feat: a")]);
    expect(notes).toBe(notes.trim());
  });
});

/** A changelog in the shape `CHANGELOG.md` keeps: a standing Unreleased, then dated versions. */
const CHANGELOG = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "### Internal",
  "",
  "- pending",
  "",
  "## [2.0.0] - 2026-09-14",
  "",
  "### Changed",
  "",
  "- **Breaking:** Node.js 22.12 or later is now required.",
  "",
  "### Security",
  "",
  "- fewer advisories",
  "",
  "## [1.3.4] - 2026-09-02",
  "",
  "### Internal",
  "",
  "- older",
  "",
].join("\n");

/**
 * The section a release's notes open with (#96). Read from the file's text rather than from git,
 * because the section exists at release time only if it was recorded before the tag — the workflow
 * never commits — and the notes have to say so when it was not.
 */
describe("changelogSection", () => {
  it("returns the section's body without its heading, subsections kept", () => {
    expect(changelogSection(CHANGELOG, "2.0.0")).toBe(
      [
        "### Changed",
        "",
        "- **Breaking:** Node.js 22.12 or later is now required.",
        "",
        "### Security",
        "",
        "- fewer advisories",
      ].join("\n")
    );
  });

  it("reads the last section of the file to its end", () => {
    expect(changelogSection(CHANGELOG, "1.3.4")).toBe("### Internal\n\n- older");
  });

  it("is null for a version the file has no section for", () => {
    expect(changelogSection(CHANGELOG, "9.9.9")).toBeNull();
  });

  // `## [12.0.0]` and `## [2.0.0-rc.1]` both begin with the characters of `## [2.0.0`; the closing
  // bracket is what makes the match whole.
  it("matches the whole version, not a prefix of a longer one", () => {
    const longer = CHANGELOG.replace("## [2.0.0]", "## [12.0.0]").replace(
      "## [1.3.4]",
      "## [2.0.0-rc.1]"
    );
    expect(changelogSection(longer, "2.0.0")).toBeNull();
    expect(changelogSection(longer, "12.0.0")).toContain("### Changed");
  });

  it("is empty, not null, for a heading with nothing under it", () => {
    const empty = "## [Unreleased]\n\n## [2.0.0] - 2026-09-14\n\n## [1.3.4] - 2026-09-02\n\n- x\n";
    expect(changelogSection(empty, "2.0.0")).toBe("");
  });
});

describe("releaseBody", () => {
  const section = "### Changed\n\n- **Breaking:** the floor moved.";
  const commits = [c("feat!: move the floor"), c("docs: record it")];

  it("opens with the section and folds the commits beneath it", () => {
    const body = releaseBody({ section, commits });
    expect(body.startsWith(section)).toBe(true);
    expect(body).toContain("<details>\n<summary>Commits</summary>\n\n### Breaking\n\n- move the floor");
    expect(body.endsWith("</details>")).toBe(true);
    expect(body.indexOf("### Documentation")).toBeGreaterThan(body.indexOf("<summary>"));
  });

  it("is the grouped commits alone when there is no section, or an empty one", () => {
    expect(releaseBody({ section: null, commits })).toBe(buildNotes(commits));
    expect(releaseBody({ section: "", commits })).toBe(buildNotes(commits));
  });

  it("is the section alone when there are no commits to list", () => {
    expect(releaseBody({ section, commits: [] })).toBe(section);
  });

  it("never wraps an empty commit list in a disclosure", () => {
    expect(releaseBody({ section, commits: [c("merge branch whatever")] })).toBe(section);
  });

  it("is empty when there is neither, for the CLI to name", () => {
    expect(releaseBody({ section: null, commits: [] })).toBe("");
  });
});

describe("parseArgs", () => {
  it("takes the range, and defaults the changelog to CHANGELOG.md", () => {
    expect(parseArgs(["v1.3.0..HEAD"])).toEqual({
      range: "v1.3.0..HEAD",
      version: undefined,
      changelog: "CHANGELOG.md",
    });
  });

  it("reads --version and --changelog wherever they sit", () => {
    expect(
      parseArgs(["--version", "1.3.1", "v1.3.0..HEAD", "--changelog", "notes/CHANGES.md"])
    ).toEqual({ range: "v1.3.0..HEAD", version: "1.3.1", changelog: "notes/CHANGES.md" });
  });

  it("leaves the range undefined when none is given, for the CLI to report", () => {
    expect(parseArgs(["--version", "1.3.1"]).range).toBeUndefined();
  });

  // Refused rather than read as a call that simply had no section to show, which is the wrong
  // answer given silently.
  it.each([
    [["v1.3.0..HEAD", "--version"], /--version needs a value/],
    [["--version", "--changelog", "x"], /--version needs a value/],
    [["v1.3.0..HEAD", "--verison", "1.3.1"], /unknown option --verison/],
    [["v1.3.0..HEAD", "v1.2.0..HEAD"], /one git range only/],
  ])("refuses %j and names the argument", (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });
});
