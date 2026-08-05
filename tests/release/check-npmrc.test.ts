import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findAuthTokenAssignments, checkFiles } from "../../scripts/check-npmrc.mjs";

describe("checkFiles", () => {
  let dir: string;
  let bad: string;
  let good: string;
  let link: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "npmrc-"));
    bad = join(dir, "bad.npmrc");
    good = join(dir, "good.npmrc");
    link = join(dir, "link.npmrc");
    writeFileSync(bad, "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n");
    writeFileSync(good, "# _authToken is not set here\nregistry=https://registry.npmjs.org\n");
    symlinkSync(bad, link);
  });

  it("reports an offending file", () => {
    expect(checkFiles([bad])).toHaveLength(1);
  });

  it("ignores a clean file", () => {
    expect(checkFiles([good])).toEqual([]);
  });

  it("ignores paths that do not exist", () => {
    expect(checkFiles([join(dir, "absent.npmrc")])).toEqual([]);
  });

  // Raised in review of #24: release.yml passes both the defaulted
  // NPM_CONFIG_USERCONFIG and $HOME/.npmrc, usually the same file — one problem
  // annotated twice reads as two problems.
  it("reports a repeated path once", () => {
    expect(checkFiles([bad, bad])).toHaveLength(1);
  });

  it("collapses a symlink onto its target", () => {
    expect(checkFiles([bad, link])).toHaveLength(1);
  });

  it("still reports genuinely distinct offending files", () => {
    const other = join(dir, "other.npmrc");
    writeFileSync(other, "_authToken=abc\n");
    expect(checkFiles([bad, other])).toHaveLength(2);
  });

  it("keeps the path the caller gave it, not the resolved one", () => {
    expect(checkFiles([link])[0]!.path).toBe(link);
  });
});

describe("findAuthTokenAssignments", () => {
  // A1 — Copilot's finding on #23: a substring grep fails a release on a comment.
  describe("ignores mentions that are not assignments", () => {
    it("ignores a # comment mentioning _authToken", () => {
      expect(findAuthTokenAssignments("# do not set _authToken here\n")).toEqual([]);
    });

    it("ignores a ; comment mentioning _authToken", () => {
      expect(findAuthTokenAssignments("; _authToken=oops\n")).toEqual([]);
    });

    it("ignores an indented comment", () => {
      expect(findAuthTokenAssignments("   # _authToken=oops\n")).toEqual([]);
    });

    it("ignores a bare mention with no assignment", () => {
      expect(findAuthTokenAssignments("_authToken\n")).toEqual([]);
    });

    it("ignores an empty file", () => {
      expect(findAuthTokenAssignments("")).toEqual([]);
    });
  });

  // A2 — the real thing must still be caught; this is what broke v1.3.0.
  describe("catches real assignments", () => {
    it("catches a registry-scoped assignment", () => {
      const found = findAuthTokenAssignments(
        "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n"
      );
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ line: 1 });
    });

    it("catches an assignment even when the value is empty", () => {
      // The exact v1.3.0 failure: an empty token still reads as configured auth.
      expect(findAuthTokenAssignments("//registry.npmjs.org/:_authToken=\n")).toHaveLength(1);
    });

    it("catches a bare _authToken= assignment", () => {
      expect(findAuthTokenAssignments("_authToken=abc\n")).toHaveLength(1);
    });

    it("catches an assignment with surrounding whitespace", () => {
      expect(findAuthTokenAssignments("  _authToken = abc\n")).toHaveLength(1);
    });

    it("reports every offending line", () => {
      const found = findAuthTokenAssignments(
        ["# comment", "_authToken=a", "registry=https://x", "//y/:_authToken=b"].join("\n")
      );
      expect(found.map((f) => f.line)).toEqual([2, 4]);
    });

    it("is case-insensitive on the key", () => {
      expect(findAuthTokenAssignments("//r/:_authtoken=x\n")).toHaveLength(1);
    });
  });

  describe("leaves unrelated config alone", () => {
    it("ignores other settings", () => {
      expect(
        findAuthTokenAssignments("registry=https://registry.npmjs.org\nprovenance=true\n")
      ).toEqual([]);
    });

    it("does not match a differently named key containing the word", () => {
      expect(findAuthTokenAssignments("my_authTokenPath=/tmp/x\n")).toEqual([]);
    });

    // Raised in review of #24: accepting a preceding `/` made the pattern
    // broader than the rule it documents.
    it("does not match a path value that happens to contain the key", () => {
      expect(findAuthTokenAssignments("cafile=/etc/ssl/_authToken=oops\n")).toEqual([]);
    });

    // Raised again in review: a bare `:` was equally too broad.
    it("does not match a value containing a colon before the key", () => {
      expect(findAuthTokenAssignments("cafile=C:_authToken=oops\n")).toEqual([]);
    });

    it("requires the registry-scoped '/:' rather than any separator", () => {
      expect(findAuthTokenAssignments("some:_authToken=x\n")).toEqual([]);
      expect(findAuthTokenAssignments("//registry.npmjs.org/:_authToken=x\n")).toHaveLength(1);
    });

    it("does not match a key ending in the word", () => {
      expect(findAuthTokenAssignments("legacy_authToken_backup=x\n")).toEqual([]);
    });
  });
});
