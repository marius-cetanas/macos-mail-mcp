import { describe, it, expect } from "vitest";
import { nextVersion } from "../../scripts/next-version.mjs";

/** Shorthand for a commit with no body. */
const c = (subject: string, body = "") => ({ subject, body });

describe("nextVersion", () => {
  describe("bump level from commit type", () => {
    it("treats feat: as a minor", () => {
      expect(nextVersion("1.3.0", [c("feat: add thing")])).toMatchObject({
        version: "1.4.0",
        bump: "minor",
      });
    });

    it("treats fix: as a patch", () => {
      expect(nextVersion("1.3.0", [c("fix: correct thing")])).toMatchObject({
        version: "1.3.1",
        bump: "patch",
      });
    });

    it("treats perf: as a patch", () => {
      expect(nextVersion("1.3.0", [c("perf: speed up thing")])).toMatchObject({
        bump: "patch",
      });
    });

    it("treats a ! marker as a major", () => {
      expect(nextVersion("1.3.0", [c("feat!: drop old thing")])).toMatchObject({
        version: "2.0.0",
        bump: "major",
      });
    });

    it("treats a scoped ! marker as a major", () => {
      expect(nextVersion("1.3.0", [c("feat(api)!: drop old thing")])).toMatchObject({
        bump: "major",
      });
    });

    it("treats BREAKING CHANGE in the body as a major", () => {
      expect(
        nextVersion("1.3.0", [c("fix: small thing", "BREAKING CHANGE: drops Node 18")])
      ).toMatchObject({ version: "2.0.0", bump: "major" });
    });

    it("accepts a scope on an ordinary type", () => {
      expect(nextVersion("1.3.0", [c("feat(compose): add fromAccount")])).toMatchObject({
        bump: "minor",
      });
    });
  });

  describe("accumulating across commits", () => {
    // A5 — the whole point of computing at release time rather than per push.
    it("consumes one version for many commits, not one each", () => {
      const result = nextVersion("1.3.0", [
        c("fix: one"),
        c("fix: two"),
        c("fix: three"),
      ]);
      expect(result.version).toBe("1.3.1");
    });

    it("takes the highest bump present", () => {
      expect(
        nextVersion("1.3.0", [c("fix: a"), c("feat: b"), c("chore: c")])
      ).toMatchObject({ version: "1.4.0", bump: "minor" });
    });

    it("lets a single breaking change outrank many features", () => {
      expect(
        nextVersion("1.3.0", [c("feat: a"), c("feat!: b"), c("feat: c")])
      ).toMatchObject({ version: "2.0.0", bump: "major" });
    });

    it("is order independent", () => {
      const a = nextVersion("1.3.0", [c("feat: x"), c("fix: y")]);
      const b = nextVersion("1.3.0", [c("fix: y"), c("feat: x")]);
      expect(a.version).toBe(b.version);
    });
  });

  describe("non-releasable commits", () => {
    // A7 — refusing beats silently re-releasing the current version.
    it("refuses when nothing is releasable", () => {
      const result = nextVersion("1.3.0", [c("chore: tidy"), c("docs: typo")]);
      expect(result.releasable).toBe(false);
      expect(result.version).toBeNull();
    });

    it("refuses on an empty commit list", () => {
      expect(nextVersion("1.3.0", []).releasable).toBe(false);
    });

    it("ignores chore/docs/test/ci when a real change is present", () => {
      expect(
        nextVersion("1.3.0", [c("chore: tidy"), c("fix: real")])
      ).toMatchObject({ version: "1.3.1", releasable: true });
    });

    it("does not treat a revert of a feat as a feature", () => {
      expect(nextVersion("1.3.0", [c("revert: feat: add thing")]).bump).not.toBe("minor");
    });
  });

  describe("version arithmetic", () => {
    it("zeroes patch on a minor bump", () => {
      expect(nextVersion("1.3.7", [c("feat: x")]).version).toBe("1.4.0");
    });

    it("zeroes minor and patch on a major bump", () => {
      expect(nextVersion("1.3.7", [c("feat!: x")]).version).toBe("2.0.0");
    });

    it("handles a two-digit component without string sorting it", () => {
      expect(nextVersion("1.9.0", [c("feat: x")]).version).toBe("1.10.0");
    });

    it("rejects a malformed current version", () => {
      expect(() => nextVersion("not-a-version", [c("feat: x")])).toThrow(/version/i);
    });
  });

  describe("explicit override", () => {
    it("honours a forced bump level regardless of commits", () => {
      expect(
        nextVersion("1.3.0", [c("chore: tidy")], { force: "major" })
      ).toMatchObject({ version: "2.0.0", releasable: true });
    });

    it("rejects an unknown forced level", () => {
      expect(() => nextVersion("1.3.0", [c("feat: x")], { force: "huge" })).toThrow();
    });
  });
});
