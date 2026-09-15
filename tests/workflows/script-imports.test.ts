import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "yaml";

/**
 * Four jobs run a script from `scripts/` without `npm ci` — `changelog` and `copilot-reviewed`,
 * which are required checks, by way of `verify` and directly, and `branch-freshness` and `intake` —
 * and the release job runs `check-npmrc.mjs` before its own `npm ci`, as a preflight. They install
 * nothing first because the scripts need nothing installed. That is a claim about an import graph,
 * and until this test it was a sentence in `verify.yml`: the changelog check reads pages through a
 * module the Copilot gate also uses, so one package import anywhere in that graph would break a job
 * that installs nothing, and every pull request would go red on a required check at once.
 *
 * So the jobs are read from the workflows rather than listed here, step by step: a script run before
 * the job's first install — in an earlier step, or earlier in the same `run:` block — is held, and
 * every import reachable from it has to be a Node built-in or another file under `scripts/`. A
 * script run after the install is not, and the release job's `next-version.mjs` is asserted to be
 * one, so the query is known to be telling the two apart. (A first cut exempted a whole job on any
 * `npm ci` in it, which missed the preflight; raised by Copilot on #101.)
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

type Jobs = Record<string, { steps?: { run?: string }[] }>;

/**
 * Each script a workflow's jobs run before anything is installed. Steps are walked in order, and a
 * `run:` block is read in order too, so `npm ci && node scripts/x.mjs` runs `x.mjs` installed and
 * `node scripts/x.mjs && npm ci` does not.
 */
export function uninstalledIn(workflow: string, jobs: Jobs): Run[] {
  const found: Run[] = [];
  for (const [job, spec] of Object.entries(jobs)) {
    let installed = false;
    for (const step of spec.steps ?? []) {
      const run = String(step.run ?? "");
      const installAt = run.search(INSTALLS);
      for (const match of run.matchAll(RUNS_SCRIPT)) {
        const before = installAt === -1 || match.index! < installAt;
        if (!installed && before) found.push({ workflow, job, script: match[1] });
      }
      if (installAt !== -1) installed = true;
    }
  }
  return found;
}

function jobsOf(workflow: string): Jobs {
  const parsed = parse(readFileSync(join(WORKFLOWS, workflow), "utf8")) as { jobs?: Jobs };
  return parsed.jobs ?? {};
}

/** Each script any job here runs before anything is installed. */
function uninstalledRuns(): Run[] {
  return readdirSync(WORKFLOWS)
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((workflow) => uninstalledIn(workflow, jobsOf(workflow)));
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
  // would pass over an empty list. So the runs known to be uninstalled are named — the release job's
  // preflight among them, which a job-level exemption missed — and one known to come after an
  // install is shown to be told apart from them.
  it("finds the runs it is meant to be checking, and leaves out the ones after an install", () => {
    const found = uninstalledRuns().map((r) => `${r.job}:${r.script}`);
    expect(found).toEqual(
      expect.arrayContaining([
        "changelog:changelog-sections.mjs",
        "copilot-reviewed:copilot-round.mjs",
        "branch-freshness:check-freshness.mjs",
        "intake:pr-intake.mjs",
        "release:check-npmrc.mjs",
      ])
    );
    expect(found).not.toContain("release:next-version.mjs");
    expect(found).not.toContain("release:release-notes.mjs");
    expect(uninstalledRuns().map((r) => r.job)).not.toContain("test");
  });

  it("holds a script by where it runs relative to the install, step by step and within a step", () => {
    const jobs: Jobs = {
      preflight: {
        steps: [
          { run: "node scripts/before.mjs" },
          { run: "npm ci" },
          { run: "node scripts/after.mjs" },
        ],
      },
      oneStep: {
        steps: [
          { run: "node scripts/first.mjs && npm ci && node scripts/second.mjs" },
        ],
      },
      never: { steps: [{ run: "node scripts/alone.mjs" }] },
    };
    expect(uninstalledIn("x.yml", jobs).map((r) => `${r.job}:${r.script}`)).toEqual([
      "preflight:before.mjs",
      "oneStep:first.mjs",
      "never:alone.mjs",
    ]);
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
