import { describe, it, expect } from "vitest";
import { findAuthTokenAssignments } from "../../scripts/check-npmrc.mjs";

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

    it("does not match a key ending in the word", () => {
      expect(findAuthTokenAssignments("legacy_authToken_backup=x\n")).toEqual([]);
    });
  });
});
