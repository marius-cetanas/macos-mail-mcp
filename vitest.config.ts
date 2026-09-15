import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: ".",
    // The tree's own tests only. Without `include`, Vitest's default glob also collects the checkouts
    // under `.claude/worktrees/`, which are whole trees. Measured on 2026-09-15 with six of them
    // present: 263 files ran instead of 34, an older copy of one test failed against this tree's
    // README, and eight copies of `tests/release/workflow.test.ts` raced on the one
    // `package-lock.json` they all rewrite and left it dirty.
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html"],
      // The suite covers src/ fully. Thresholds keep it that way: new code
      // without tests fails the run rather than quietly lowering the number.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
