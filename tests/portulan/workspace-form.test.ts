import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * `portulan upgrade` moved this workspace to the form Portulan keeps its own in: a changelog entry
 * is a file under `changes/`, a session boots from a compiled card, and a `comments` recipe holds
 * the comment lines that record a change's history at a count.
 *
 * Each of the three is a file a tool drafted and this repository then has to keep true. What is
 * asserted here is what the tool does not hold by itself: that the drafts are the same on every
 * machine, and that the merge gate runs the checks they come with.
 */
const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const manifest = JSON.parse(read(".portulan/workspace.json"));

const ci = parse(read(".github/workflows/verify.yml")) as {
  jobs: Record<string, { needs?: string[]; steps?: { run?: string }[] }>;
};

/** The jobs with a step running `command`, which `verify` has to depend on for the gate to cover it. */
const jobsRunning = (command: string): string[] =>
  Object.entries(ci.jobs)
    .filter(([, job]) => (job.steps ?? []).some((s) => s.run === command))
    .map(([id]) => id);

/** The two spellings a path true on one machine has taken here: a home directory, or a plugin cache. */
const MACHINE_LOCAL = /\/Users\/|\/home\/|\.claude\/plugins/;

describe("a changelog entry is a fragment", () => {
  const changelog = read("CHANGELOG.md");
  const from = changelog.indexOf("## [Unreleased]");
  const unreleased = changelog.slice(from, changelog.indexOf("\n## [", from + 1));

  it("keeps no entry under Unreleased, where two open changes would edit the same lines", () => {
    expect(from).toBeGreaterThan(-1);
    expect(unreleased).not.toMatch(/^[-*+][ \t]/m);
    expect(unreleased).not.toMatch(/^### /m);
  });

  it("says under Unreleased where an entry goes instead", () => {
    expect(unreleased).toContain("](changes/)");
  });

  // `scripts/changelog-sections.mjs` sends whoever it refuses to this file.
  it("explains the fragments beside them", () => {
    expect(existsSync(join(ROOT, "changes/README.md"))).toBe(true);
  });

  // Six sections, and this changelog kept a seventh, `Internal`, until the move. The CLI refuses a
  // fragment named for it, and that refusal reaches a pull request only if the gate runs it.
  it("has the merge gate check every fragment the cut will paste", () => {
    const jobs = jobsRunning("npx portulan index --check --changes changes");
    expect(jobs).toHaveLength(1);
    expect(ci.jobs.verify.needs).toContain(jobs[0]);
  });

  it("ships no fragment in the package, which carries the changelog they are pasted into", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.files).toContain("CHANGELOG.md");
    expect(pkg.files.some((f: string) => f.startsWith("changes"))).toBe(false);
  });
});

describe("the comments recipe", () => {
  const RECIPE = ".portulan/verify/comments.sh";
  const script = read(RECIPE);
  const PINNED = "node_modules/@sleepy_panda_srl/portulan/cli";

  it("is declared, beside the default recipe and not in place of it", () => {
    const recipe = manifest.verify.recipes.find((r: { id: string }) => r.id === "comments");
    expect(recipe.run).toBe(`./${RECIPE}`);
    expect(manifest.verify.default).toBe("repo");
  });

  it("is executable, since the manifest runs it by its path", () => {
    expect(statSync(join(ROOT, RECIPE)).mode & 0o111).not.toBe(0);
  });

  /**
   * `portulan upgrade` drafts the recipe with the absolute path of the checkout it ran in, on two
   * lines marked for a repair step to rewrite on each machine. Committed, that path is false
   * everywhere but where it was drafted, and the recipe then answers 2, could not run, which no
   * gate reads as a failure of the change in front of it.
   */
  it("finds the CLI by a path that is the same on every machine", () => {
    expect(script).not.toMatch(MACHINE_LOCAL);
    expect(script).not.toContain("portulan:bundle-fallback");
    expect(script).toContain(`${PINNED}/comments.mjs`);
  });

  // What counts as a line of history is the installed version's to say. A `portulan` on PATH is
  // whichever version that machine has, so the count would be one thing here and another in CI.
  it("looks for the version the lockfile pins before one on PATH", () => {
    const pinned = script.indexOf(`[ -f "${PINNED}/comments.mjs" ]`);
    const onPath = script.indexOf("command -v portulan");
    expect(pinned).toBeGreaterThan(-1);
    expect(onPath).toBeGreaterThan(pinned);
  });

  it("has a limit to hold", () => {
    expect(script).toMatch(/^LIMIT=\d+$/m);
  });

  it("is run by the merge gate, because a count nothing runs is exceeded by the next change", () => {
    const jobs = jobsRunning(`./${RECIPE}`);
    expect(jobs).toHaveLength(1);
    expect(ci.jobs.verify.needs).toContain(jobs[0]);
  });
});

describe("the boot card", () => {
  const RULES = ".claude/rules/portulan";

  it("is declared as the context slot", () => {
    expect(manifest.slots.context).toBe("context/");
    expect(existsSync(join(ROOT, ".portulan/context/boot.md"))).toBe(true);
  });

  // The host loads the compiled rule, not the card, so an ignored or uncommitted rule is a card
  // nobody boots from. `portulan compile --check` holds the two equal once both are in the tree.
  it("is compiled to a rule the host loads, and the rule is committed", () => {
    expect(existsSync(join(ROOT, RULES, "boot.md"))).toBe(true);
    expect(read(".gitignore")).not.toMatch(/^\.claude\/rules/m);
  });

  it("names nothing by a path that is true on one machine", () => {
    expect(read(`${RULES}/boot.md`)).not.toMatch(MACHINE_LOCAL);
    expect(read(".portulan/context/boot.md")).not.toMatch(MACHINE_LOCAL);
  });
});
