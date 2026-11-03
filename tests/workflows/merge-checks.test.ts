import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

interface Workflow {
  jobs: Record<string, { name?: string; needs?: string[]; steps?: { run?: string }[] }>;
}

const workflows = readdirSync(join(root, ".github/workflows"))
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({ file, workflow: parse(read(`.github/workflows/${file}`)) as Workflow }));

describe("the merge checks after automated review is removed", () => {
  it.each([
    ["verify", "verify.yml"],
    ["branch-freshness", "branch-freshness.yml"],
    ["analyze", "codeql.yml"],
  ])("keeps one workflow producing %s", (context, file) => {
    const producers = workflows.flatMap(({ file, workflow }) =>
      Object.entries(workflow.jobs)
        .filter(([id, job]) => (job.name ?? id) === context)
        .map(() => file),
    );
    expect(producers).toEqual([file]);
  });

  it("keeps verify dependent on every existing verification job", () => {
    const ci = workflows.find(({ file }) => file === "verify.yml")!.workflow;
    expect(ci.jobs.verify.needs?.slice().sort()).toEqual(
      ["test", "audit", "gate-policy", "changelog"].sort(),
    );
  });

  it("ships no automated review workflow, ruleset payload or polling script", () => {
    for (const path of [
      ".github/workflows/copilot-review.yml",
      ".github/rulesets/copilot-auto-review.json",
      "scripts/copilot-round.mjs",
    ]) {
      expect(existsSync(join(root, path)), path).toBe(false);
    }
    for (const { file, workflow } of workflows) {
      expect(JSON.stringify(workflow), file).not.toMatch(/copilot|requestReviews/i);
    }
    for (const file of readdirSync(join(root, ".github/rulesets")).filter((f) => f.endsWith(".json"))) {
      expect(read(`.github/rulesets/${file}`), file).not.toContain("copilot_code_review");
    }
  });

  it("leaves no runtime import of the removed polling script", () => {
    for (const file of readdirSync(join(root, "scripts")).filter((f) => f.endsWith(".mjs"))) {
      expect(read(`scripts/${file}`), file).not.toMatch(
        /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'][^"']*copilot-round\.mjs["']/,
      );
    }
  });
});
