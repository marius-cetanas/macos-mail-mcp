import { describe, it, expect } from "vitest";
import { buildNotes, describe as strip } from "../../scripts/release-notes.mjs";

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
