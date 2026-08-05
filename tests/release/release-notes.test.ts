import { describe, it, expect } from "vitest";
import { extractReleaseNotes } from "../../scripts/release-notes.mjs";

const CHANGELOG = [
  "# Changelog",
  "",
  "Some preamble.",
  "",
  "## [1.3.0] - 2026-08-04",
  "",
  "### Added",
  "",
  "- the new thing",
  "",
  "## [1.2.0] - 2026-06-08",
  "",
  "### Fixed",
  "",
  "- the old thing",
  "",
].join("\n");

describe("extractReleaseNotes", () => {
  it("returns just the requested section", () => {
    const notes = extractReleaseNotes(CHANGELOG, "1.3.0");
    expect(notes).toContain("- the new thing");
    expect(notes).not.toContain("- the old thing");
  });

  it("drops the heading itself", () => {
    expect(extractReleaseNotes(CHANGELOG, "1.3.0")).not.toContain("## [1.3.0]");
  });

  it("stops at the next version heading", () => {
    expect(extractReleaseNotes(CHANGELOG, "1.3.0")).not.toContain("1.2.0");
  });

  it("reads a section that is not the first", () => {
    expect(extractReleaseNotes(CHANGELOG, "1.2.0")).toContain("- the old thing");
  });

  it("does not leak the preamble", () => {
    expect(extractReleaseNotes(CHANGELOG, "1.3.0")).not.toContain("Some preamble");
  });

  it("returns empty for a version that is not there", () => {
    expect(extractReleaseNotes(CHANGELOG, "9.9.9")).toBe("");
  });

  // Raised in review of #24: the awk form interpolated the version into a
  // regex, where the dots in a semver match any character.
  describe("fixed-string matching", () => {
    it("does not treat dots in the version as wildcards", () => {
      const tricky = ["## [1x3x0] - 2026-01-01", "", "- wrong section", ""].join("\n");
      expect(extractReleaseNotes(tricky, "1.3.0")).toBe("");
    });

    it("picks the exact version when a lookalike precedes it", () => {
      const both = [
        "## [1x3x0] - 2026-01-01",
        "",
        "- wrong section",
        "",
        "## [1.3.0] - 2026-08-04",
        "",
        "- right section",
        "",
      ].join("\n");
      expect(extractReleaseNotes(both, "1.3.0")).toBe("- right section");
    });

    it("does not match a longer version that starts with the same digits", () => {
      const later = ["## [1.3.01] - 2026-01-01", "", "- not this one", ""].join("\n");
      expect(extractReleaseNotes(later, "1.3.0")).toBe("");
    });
  });

  it("tolerates CRLF line endings", () => {
    const crlf = CHANGELOG.split("\n").join("\r\n");
    expect(extractReleaseNotes(crlf, "1.3.0")).toContain("- the new thing");
  });

  it("handles a section with no body", () => {
    const empty = ["## [2.0.0] - 2026-01-01", "", "## [1.0.0] - 2025-01-01", "", "- x"].join("\n");
    expect(extractReleaseNotes(empty, "2.0.0")).toBe("");
  });
});
