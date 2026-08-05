import { describe, it, expect } from "vitest";
import { insertEntry } from "../../scripts/changelog-entry.mjs";

const PREAMBLE = ["# Changelog", "", "All notable changes are documented here.", ""].join("\n");
const EXISTING = [PREAMBLE, "## [1.2.0] - 2026-06-08", "", "### Fixed", "", "- the old thing", ""].join("\n");

describe("insertEntry", () => {
  it("inserts above the most recent release", () => {
    const out = insertEntry(EXISTING, "1.3.0", "2026-08-05", "- the new thing");
    expect(out.indexOf("## [1.3.0]")).toBeLessThan(out.indexOf("## [1.2.0]"));
  });

  it("keeps the preamble on top", () => {
    const out = insertEntry(EXISTING, "1.3.0", "2026-08-05", "- x");
    expect(out.indexOf("# Changelog")).toBeLessThan(out.indexOf("## [1.3.0]"));
  });

  it("preserves the existing entry intact", () => {
    expect(insertEntry(EXISTING, "1.3.0", "2026-08-05", "- x")).toContain("- the old thing");
  });

  it("includes the version, date and body", () => {
    const out = insertEntry(EXISTING, "1.3.0", "2026-08-05", "- the new thing");
    expect(out).toContain("## [1.3.0] - 2026-08-05");
    expect(out).toContain("- the new thing");
  });

  // Raised in review of #24: indexOf returning -1 was used as a slice index,
  // which drops the final character and misplaces the entry.
  describe("a changelog with no release headings yet", () => {
    it("does not lose a character from the preamble", () => {
      const out = insertEntry(PREAMBLE, "1.0.0", "2026-08-05", "- first");
      expect(out).toContain("All notable changes are documented here.");
      expect(out.startsWith(PREAMBLE)).toBe(true);
    });

    it("appends the entry rather than misplacing it", () => {
      const out = insertEntry(PREAMBLE, "1.0.0", "2026-08-05", "- first");
      expect(out).toContain("## [1.0.0] - 2026-08-05");
      expect(out.indexOf("# Changelog")).toBeLessThan(out.indexOf("## [1.0.0]"));
    });

    it("handles a completely empty file", () => {
      const out = insertEntry("", "1.0.0", "2026-08-05", "- first");
      expect(out).toContain("## [1.0.0] - 2026-08-05");
      expect(out).toContain("- first");
    });
  });

  it("does not match a heading that is not at the start of a line", () => {
    const inline = "# Changelog\n\nSee `## [1.0.0]` for the format.\n";
    const out = insertEntry(inline, "1.1.0", "2026-08-05", "- x");
    expect(out).toContain("See `## [1.0.0]` for the format.");
    expect(out).toContain("## [1.1.0]");
  });

  it("is idempotent in shape when applied twice", () => {
    const once = insertEntry(EXISTING, "1.3.0", "2026-08-05", "- a");
    const twice = insertEntry(once, "1.4.0", "2026-08-06", "- b");
    expect(twice.indexOf("## [1.4.0]")).toBeLessThan(twice.indexOf("## [1.3.0]"));
    expect(twice.indexOf("## [1.3.0]")).toBeLessThan(twice.indexOf("## [1.2.0]"));
  });
});
