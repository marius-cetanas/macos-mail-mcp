import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "yaml";

/**
 * Four jobs run a script from `scripts/` without `npm ci` — `changelog` and `copilot-reviewed`,
 * which are required checks, by way of `verify` and directly, and `branch-freshness` and `intake`.
 * They install nothing because the scripts need nothing installed. That is a claim about an import
 * graph, and until this test it was a sentence in `verify.yml`: the changelog check reads pages
 * through a module the Copilot gate also uses, so one package import anywhere in that graph would
 * break a job that installs nothing, and every pull request would go red on a required check at once.
 *
 * So the jobs are read from the workflows rather than listed here, the scripts they run are found in
 * their `run:` blocks, and every import reachable from each has to be a Node built-in or another file
 * under `scripts/`. A job that installs is not held to this, and `test` is asserted to be one, so the
 * query is known to be telling the two apart.
 */
const root = process.cwd();
const WORKFLOWS = join(root, ".github/workflows");
const SCRIPTS = join(root, "scripts");

interface Run {
  workflow: string;
  job: string;
  script: string;
}

const INSTALLS = /\bnpm (?:ci|install|i)\b/;
const RUNS_SCRIPT = /\bnode\s+scripts\/([\w.-]+\.mjs)\b/g;

/** Every `run:` block of a job, as text. */
function runsOf(workflow: string, job: string): string[] {
  const parsed = parse(readFileSync(join(WORKFLOWS, workflow), "utf8")) as {
    jobs: Record<string, { steps?: { run?: string }[] }>;
  };
  return (parsed.jobs[job]?.steps ?? []).map((step) => String(step.run ?? ""));
}

const installs = (workflow: string, job: string) => runsOf(workflow, job).some((run) => INSTALLS.test(run));

/** Each script a job runs without installing anything first. */
function uninstalledRuns(): Run[] {
  const found: Run[] = [];
  for (const workflow of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
    const parsed = parse(readFileSync(join(WORKFLOWS, workflow), "utf8")) as { jobs?: Record<string, unknown> };
    for (const job of Object.keys(parsed.jobs ?? {})) {
      if (installs(workflow, job)) continue;
      for (const run of runsOf(workflow, job)) {
        for (const match of run.matchAll(RUNS_SCRIPT)) found.push({ workflow, job, script: match[1] });
      }
    }
  }
  return found;
}

/**
 * The module specifiers a source file imports, in the three shapes ES modules write them:
 * `import … from "x"` (or the bare `import "x"`), `export … from "x"`, and `import("x")`. Comments are
 * dropped first, so a docblock that says "import" is not read as one; a `//` inside a string is left
 * alone, which is why only a line that starts as a comment is dropped whole.
 */
export function specifiersIn(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const shapes = [
    /\bimport\s+(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^'";]*?\s+from\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return shapes.flatMap((shape) => [...code.matchAll(shape)].map((m) => m[1]));
}

const isBuiltin = (specifier: string) =>
  specifier.startsWith("node:") || builtinModules.includes(specifier);
const isRelative = (specifier: string) => specifier.startsWith("./") || specifier.startsWith("../");

interface Edge {
  from: string;
  specifier: string;
}

/** Every import reachable from a script, each with the file that makes it; relative ones are followed. */
function importGraph(script: string): Edge[] {
  const edges: Edge[] = [];
  const seen = new Set<string>();
  const queue = [join(SCRIPTS, script)];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const from = relative(root, file);
    for (const specifier of specifiersIn(readFileSync(file, "utf8"))) {
      edges.push({ from, specifier });
      if (isRelative(specifier)) queue.push(resolve(dirname(file), specifier));
    }
  }
  return edges;
}

describe("the scripts CI runs without npm ci", () => {
  // A query that silently finds nothing reports green for the wrong reason: the assertions below
  // would pass over an empty list. So the jobs known to run uninstalled are named, and one known to
  // install is shown to be told apart from them.
  it("finds the jobs it is meant to be checking, and leaves out the ones that install", () => {
    const found = uninstalledRuns().map((r) => `${r.job}:${r.script}`);
    expect(found).toEqual(
      expect.arrayContaining([
        "changelog:changelog-sections.mjs",
        "copilot-reviewed:copilot-round.mjs",
        "branch-freshness:check-freshness.mjs",
        "intake:pr-intake.mjs",
      ])
    );
    expect(installs("verify.yml", "test")).toBe(true);
    expect(uninstalledRuns().map((r) => r.job)).not.toContain("test");
  });

  it("reads a specifier from each import shape, and none from a comment", () => {
    const source = [
      "/** Not an import: this docblock says import x from 'nowhere' */",
      "// import nothing from 'here-either'",
      'import { a } from "node:fs";',
      'import b from "./b.mjs";',
      'import "side-effect";',
      'export { c } from "../c.mjs";',
      'const d = await import("node:url");',
      'const url = "https://example.com/not/an/import";',
    ].join("\n");
    expect(specifiersIn(source).sort()).toEqual(
      ["../c.mjs", "./b.mjs", "node:fs", "node:url", "side-effect"].sort()
    );
  });

  it("imports Node built-ins and other files under scripts/, and nothing installed", () => {
    for (const { workflow, job, script } of uninstalledRuns()) {
      const edges = importGraph(script);
      expect(edges.length, `scripts/${script} imports nothing, which no script here does`).toBeGreaterThan(0);
      for (const { from, specifier } of edges) {
        expect(
          isBuiltin(specifier) || isRelative(specifier),
          `${workflow} runs scripts/${script} in job ${job} without npm ci, and ${from} imports ${JSON.stringify(specifier)}, which would need a package installed`
        ).toBe(true);
      }
    }
  });

  it("resolves every relative import to a file that exists under scripts/", () => {
    for (const { script } of uninstalledRuns()) {
      for (const { from, specifier } of importGraph(script)) {
        if (!isRelative(specifier)) continue;
        const target = resolve(root, dirname(from), specifier);
        expect(existsSync(target), `${from} imports ${specifier}, which does not exist`).toBe(true);
        expect(relative(SCRIPTS, target).startsWith(".."), `${from} imports ${specifier}, outside scripts/`).toBe(false);
      }
    }
  });
});
