import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Run a script and capture stdout plus exit code.
 * The entrypoint guard is only meaningful if invoking the file actually runs it,
 * which no amount of importing the module proves.
 */
function run(script: string, args: string[]): { code: number; out: string; err: string } {
  try {
    const out = execFileSync("node", [join("scripts", script), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out, err: "" };
  } catch (error) {
    // `status` is null when the child died from a signal rather than exiting.
    // Returning that would break the `code: number` contract and make
    // assertions like toContain(code) behave strangely.
    const e = error as { status: number | null; stdout?: string; stderr?: string };
    return {
      code: typeof e.status === "number" ? e.status : 1,
      out: e.stdout ?? "",
      err: e.stderr ?? "",
    };
  }
}

describe("next-version CLI", () => {
  it("runs when invoked directly", () => {
    const { out } = run("next-version.mjs", ["--current", "1.3.0", "--force", "patch"]);
    expect(JSON.parse(out)).toMatchObject({ version: "1.3.1", bump: "patch" });
  });

  // Reads real git history, so it must not assume what that history contains.
  // CI checks out at fetch-depth 1 with no tags, where "nothing releasable"
  // (exit 2) is the correct answer — an earlier version of this test asserted
  // exit 0 and failed in CI while passing locally.
  it("reads real repository history and reports a well-formed result", () => {
    const { code, out } = run("next-version.mjs", ["--current", "1.3.0", "--force", "auto"]);
    expect([0, 2]).toContain(code);

    const result = JSON.parse(out);
    expect(result).toMatchObject({
      releasable: expect.any(Boolean),
      considered: expect.any(Number),
    });
    if (result.releasable) {
      expect(code).toBe(0);
      expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    } else {
      expect(code).toBe(2);
      expect(result.version).toBeNull();
    }
  });

  // Raised in review of #24: a missing --current threw a stack trace, while the
  // other two script CLIs print usage.
  describe("missing --current", () => {
    it("prints usage rather than a stack trace", () => {
      const { err } = run("next-version.mjs", ["--force", "patch"]);
      expect(err).toMatch(/usage: next-version\.mjs --current/);
      expect(err).not.toMatch(/at .*next-version\.mjs:\d+/);
    });

    it("exits 1, distinct from the 2 that means nothing releasable", () => {
      expect(run("next-version.mjs", ["--force", "patch"]).code).toBe(1);
    });
  });

  it("exits non-zero when nothing is releasable", () => {
    // HEAD..HEAD is empty, so there is nothing to release.
    const { code, out } = run("next-version.mjs", [
      "--current", "1.3.0", "--since", "HEAD", "--force", "auto",
    ]);
    expect(code).toBe(2);
    expect(JSON.parse(out).releasable).toBe(false);
  });
});

describe("check-npmrc CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "npmrc-cli-"));

  it("exits 0 on a file that only mentions the key in a comment", () => {
    const file = join(dir, "ok.npmrc");
    writeFileSync(file, "# never set _authToken=x here\nregistry=https://registry.npmjs.org\n");
    expect(run("check-npmrc.mjs", [file]).code).toBe(0);
  });

  it("exits 1 on a real assignment", () => {
    const file = join(dir, "bad.npmrc");
    writeFileSync(file, "//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n");
    expect(run("check-npmrc.mjs", [file]).code).toBe(1);
  });

  it("exits 0 when the file does not exist", () => {
    expect(run("check-npmrc.mjs", [join(dir, "absent.npmrc")]).code).toBe(0);
  });
});
