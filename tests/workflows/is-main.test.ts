import { describe, it, expect } from "vitest";
import { isMain } from "../../scripts/is-main.mjs";

describe("isMain", () => {
  /**
   * The guard this replaced was `import.meta.url === \`file://${process.argv[1]}\``, which is string
   * equality between a URL and a path. Both of the cases below were measured failing under it, and
   * both fail silently — the CLI arm is skipped, the process exits 0, and a check that polled
   * nothing reports success.
   */
  it("is false for a module that is merely imported", () => {
    // This test file is what node is running, not the module under test.
    expect(isMain(import.meta.url)).toBe(false);
  });

  it("survives a path containing characters a URL must encode", () => {
    const argv = process.argv[1];
    try {
      // A raw space on one side, %20 on the other, is what broke the old guard.
      process.argv[1] = "/tmp/has space/does-not-exist.mjs";
      expect(isMain("file:///tmp/has%20space/does-not-exist.mjs")).toBe(false);
    } finally {
      process.argv[1] = argv;
    }
  });

  it("is false rather than throwing when the path cannot be resolved", () => {
    const argv = process.argv[1];
    try {
      process.argv[1] = "/definitely/not/here.mjs";
      expect(isMain("file:///definitely/not/here.mjs")).toBe(false);
    } finally {
      process.argv[1] = argv;
    }
  });

  it("is false when there is no argv[1] at all", () => {
    const argv = process.argv[1];
    try {
      // @ts-expect-error deliberately removing it, which is the REPL / -e case.
      delete process.argv[1];
      expect(isMain(import.meta.url)).toBe(false);
    } finally {
      process.argv[1] = argv;
    }
  });

  it("is true when the module really is the entry point", () => {
    const argv = process.argv[1];
    try {
      process.argv[1] = new URL(import.meta.url).pathname;
      expect(isMain(import.meta.url)).toBe(true);
    } finally {
      process.argv[1] = argv;
    }
  });
});
