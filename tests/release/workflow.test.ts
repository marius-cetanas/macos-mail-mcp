import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const DIR = join(process.cwd(), ".github/workflows");

function workflow(name: string): Record<string, any> {
  return parse(readFileSync(join(DIR, name), "utf8"));
}

/**
 * `on` is the YAML 1.1 boolean `true`, so a parser may key the triggers block
 * under either spelling depending on version and schema.
 */
function triggers(wf: Record<string, any>): Record<string, any> {
  return wf.on ?? wf[true as unknown as string] ?? {};
}

function steps(wf: Record<string, any>, job: string): Array<Record<string, any>> {
  return wf.jobs[job].steps;
}

function stepIndex(list: Array<Record<string, any>>, fragment: string): number {
  return list.findIndex((s) =>
    `${s.name ?? ""} ${s.run ?? ""} ${s.uses ?? ""}`.includes(fragment)
  );
}

describe("release-prepare.yml", () => {
  const wf = () => workflow("release-prepare.yml");

  it("exists", () => {
    expect(existsSync(join(DIR, "release-prepare.yml"))).toBe(true);
  });

  it("is triggered manually", () => {
    expect(triggers(wf())).toHaveProperty("workflow_dispatch");
  });

  it("defaults to a dry run so a mis-click cannot open a release", () => {
    const inputs = triggers(wf()).workflow_dispatch.inputs;
    expect(inputs.dry_run.default).toBe(true);
  });

  // Pushing the branch is all it needs. It deliberately does not open the PR:
  // a PR created with GITHUB_TOKEN does not trigger workflow runs, so `ci-ok`
  // would never report and branch protection would make it unmergeable. A
  // human opening the PR is what makes CI run.
  it("requests no more permission than pushing a branch needs", () => {
    const perms = wf().jobs.prepare.permissions;
    expect(perms).toMatchObject({ contents: "write" });
    expect(perms["id-token"]).toBeUndefined();
    expect(perms["pull-requests"]).toBeUndefined();
  });

  it("never publishes — preparing and publishing are separate concerns", () => {
    expect(JSON.stringify(wf())).not.toMatch(/npm publish/);
  });
});

describe("release.yml", () => {
  const wf = () => workflow("release.yml");

  // A8 — a tag that fails to publish leaves a permanent public tag pointing at
  // an unpublished version. That happened with v1.3.0.
  it("is no longer triggered by pushing a tag", () => {
    const push = triggers(wf()).push ?? {};
    expect(push.tags).toBeUndefined();
  });

  it("triggers on the release commit landing on main", () => {
    const push = triggers(wf()).push;
    expect(push.branches).toContain("main");
  });

  it("grants id-token so OIDC can be used", () => {
    expect(wf().jobs.publish.permissions["id-token"]).toBe("write");
  });

  it("does not set registry-url, which would disable OIDC", () => {
    const setupNode = steps(wf(), "publish").find((s) =>
      String(s.uses ?? "").includes("actions/setup-node")
    );
    expect(setupNode?.with?.["registry-url"]).toBeUndefined();
  });

  it("does not cache in a release build", () => {
    const setupNode = steps(wf(), "publish").find((s) =>
      String(s.uses ?? "").includes("actions/setup-node")
    );
    expect(setupNode?.with?.cache).toBeUndefined();
  });

  it("pins every action to a commit SHA rather than a mutable tag", () => {
    for (const step of steps(wf(), "publish")) {
      if (!step.uses) continue;
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  describe("the version guard", () => {
    // A3 — on #23 this was `if: github.ref_type == 'tag'`, so a dispatch
    // publish skipped it entirely. Copilot caught that.
    it("is not conditional on the trigger type", () => {
      const guard = steps(wf(), "publish").find((s) =>
        String(s.name ?? "").includes("version")
      );
      expect(guard).toBeDefined();
      expect(String(guard!.if ?? "")).not.toMatch(/ref_type/);
    });

    // A4 — ordering is the only thing that makes the guard meaningful.
    it("runs before anything publishes", () => {
      const list = steps(wf(), "publish");
      const guard = list.findIndex((s) => String(s.name ?? "").includes("version"));
      const publish = stepIndex(list, "npm publish");
      expect(guard).toBeGreaterThanOrEqual(0);
      expect(publish).toBeGreaterThan(guard);
    });

    it("runs the preflight before publishing too", () => {
      const list = steps(wf(), "publish");
      const preflight = stepIndex(list, "check-npmrc");
      expect(preflight).toBeGreaterThanOrEqual(0);
      expect(stepIndex(list, "npm publish")).toBeGreaterThan(preflight);
    });
  });

  it("verifies the publish actually landed", () => {
    expect(stepIndex(steps(wf(), "publish"), "Confirm")).toBeGreaterThanOrEqual(0);
  });
});

describe("ci.yml", () => {
  it("still gates on the aggregate ci-ok job", () => {
    expect(workflow("ci.yml").jobs["ci-ok"]).toBeDefined();
  });
});
