import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What the tarball ships is decided by `files` in `package.json`, and until #96 the package said
 * nothing about what a version changed: 2.0.0's `build/` was byte-identical to 1.3.4's, the major
 * was the Node floor, and the only way to learn that was to diff the tarballs. `CHANGELOG.md` ships
 * now, and this measures the tarball rather than trusting the field — `npm pack --dry-run` lists
 * what `npm publish` would send.
 *
 * `.npmignore` is asserted absent. A root `.npmignore` does not override `files`, so it never
 * decided anything, and it listed `CHANGELOG.md` as excluded — a claim the tarball now contradicts.
 */
const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

/** What npm includes whatever `files` says, plus the one file this adds. */
const OUTSIDE_BUILD = ["CHANGELOG.md", "LICENSE", "README.md", "package.json"];

describe("the published package", () => {
  it("lists CHANGELOG.md in `files`, beside the build", () => {
    expect(pkg.files).toEqual(["build", "CHANGELOG.md"]);
  });

  it("has no root .npmignore, which `files` supersedes and which said the opposite", () => {
    expect(existsSync(join(root, ".npmignore"))).toBe(false);
  });

  it("ships CHANGELOG.md, and nothing outside build/ but the files npm always includes", () => {
    const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const [{ files }] = JSON.parse(out) as [{ files: { path: string }[] }];
    const paths = files.map((f) => f.path);
    expect(paths).toContain("CHANGELOG.md");
    for (const path of paths) {
      expect(
        path.startsWith("build/") || OUTSIDE_BUILD.includes(path),
        `${path} would ship; outside build/ only ${OUTSIDE_BUILD.join(", ")} should`
      ).toBe(true);
    }
  });
});
