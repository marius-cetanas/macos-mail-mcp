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

  // Preparing is one click. Every check runs before the branch is pushed either
  // way, so a dry run bought no safety here — and pushing a branch is
  // reversible. The irreversible step is publishing, guarded in release.yml.
  it("takes only a bump input, so preparing is one click", () => {
    expect(Object.keys(triggers(wf()).workflow_dispatch.inputs)).toEqual(["bump"]);
  });

  it("offers an explicit bump override alongside auto", () => {
    expect(triggers(wf()).workflow_dispatch.inputs.bump.options).toEqual([
      "auto",
      "patch",
      "minor",
      "major",
    ]);
  });

  it("pushes the branch unconditionally", () => {
    const push = steps(wf(), "prepare").find((s) => String(s.name ?? "").includes("Push"));
    expect(push).toBeDefined();
    expect(push!.if).toBeUndefined();
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

  // Raised in review of #24: reporting every non-zero exit as "nothing to
  // release" would misdiagnose a malformed version or a git failure — the same
  // misleading-error shape that made the v1.3.0 E404 look like a missing package.
  describe("the derive-version step", () => {
    const deriveStep = () =>
      String(steps(wf(), "prepare").find((s) => String(s.name ?? "").includes("Derive"))?.run);

    it("treats exit 2 as the 'nothing releasable' answer specifically", () => {
      expect(deriveStep()).toMatch(/STATUS.*-eq 2|-eq 2/);
    });

    it("reports other non-zero exits differently", () => {
      const run = deriveStep();
      expect(run).toMatch(/-ne 0/);
      expect(run).toMatch(/not 'nothing to release'/);
    });

    it("captures the exit code rather than relying on `if !`", () => {
      expect(deriveStep()).toMatch(/STATUS=\$\?/);
    });
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

  // Publishing is a deliberate act, not a consequence of merging. Any number of
  // PRs may land between releases without driving the version number.
  it("publishes only when triggered by hand", () => {
    expect(triggers(wf())).toHaveProperty("workflow_dispatch");
  });

  it("is not triggered by any push", () => {
    expect(triggers(wf()).push).toBeUndefined();
  });

  // Clicking "Run workflow" without reading the form must not ship, since npm
  // will not let a version be reissued.
  it("defaults to a dry run so a careless click cannot ship", () => {
    expect(triggers(wf()).workflow_dispatch.inputs.mode.default).toBe("dry-run");
  });

  // A boolean renders as a checkbox that can be impossible to toggle in some
  // clients — and a safe-by-default checkbox you cannot untick makes publishing
  // unreachable, a worse failure than the one it guards against.
  it("uses a selectable choice rather than a checkbox", () => {
    const mode = triggers(wf()).workflow_dispatch.inputs.mode;
    expect(mode.type).toBe("choice");
    expect(mode.options).toEqual(["dry-run", "publish"]);
  });

  it("has no boolean inputs at all", () => {
    const inputs = triggers(wf()).workflow_dispatch.inputs;
    for (const [name, spec] of Object.entries<any>(inputs)) {
      expect(spec.type, `input "${name}" is a boolean`).not.toBe("boolean");
    }
  });

  it("refuses to publish from anywhere but main", () => {
    const guard = steps(wf(), "publish").find((s) =>
      String(s.name ?? "").includes("default branch")
    );
    expect(guard).toBeDefined();
    expect(String(guard!.run)).toMatch(/GITHUB_REF_NAME/);
  });

  // Raised in review: upgrading npm mid-release makes the pipeline
  // non-deterministic — a new npm major could change publish behaviour on a run
  // nobody changed. Assert the floor instead of installing over it.
  it("does not mutate the toolchain during a release", () => {
    expect(JSON.stringify(wf())).not.toMatch(/npm install -g/);
  });

  it("still asserts the npm floor trusted publishing needs", () => {
    const step = steps(wf(), "publish").find((s) =>
      String(s.name ?? "").includes("trusted publishing")
    );
    expect(String(step?.run)).toMatch(/11\.5\.1/);
  });

  describe("dry run", () => {
    it.each(["Publish", "Confirm it landed", "Tag and cut the GitHub release"])(
      "skips %s unless mode is publish",
      (name) => {
        const step = steps(wf(), "publish").find((s) => s.name === name);
        expect(step, `no step named exactly "${name}"`).toBeDefined();
        expect(String(step!.if ?? "")).toMatch(/inputs\.mode == 'publish'/);
      }
    );

    it("runs the checks in both modes", () => {
      for (const name of ["npm run build", "npm run test:coverage", "npm audit"]) {
        const step = steps(wf(), "publish").find((s) => String(s.run ?? "").startsWith(name));
        expect(step, `no unconditional step running "${name}"`).toBeDefined();
        expect(step!.if).toBeUndefined();
      }
    });

    it("the version guard runs in both modes too", () => {
      const guard = steps(wf(), "publish").find((s) =>
        String(s.name ?? "").includes("version is releasable")
      );
      expect(guard!.if).toBeUndefined();
    });
  });

  // The head_commit gate raised in review of #24 is gone entirely: with no push
  // trigger there is no push payload to inspect, and a merge commit can no
  // longer cause a silent skip.
  it("does not gate the job on commit messages at all", () => {
    expect(String(wf().jobs.publish.if ?? "")).not.toMatch(/head_commit|commits/);
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

  // Raised in review of #24: "not published" was inferred from an npm view that
  // also fails on a network error, so the guard stated a conclusion it had not
  // established.
  it("does not claim a version is unpublished when it only failed to look it up", () => {
    const guard = String(
      steps(wf(), "publish").find((s) => String(s.name ?? "").includes("version"))?.run
    );
    expect(guard).not.toMatch(/is not published/);
    expect(guard).toMatch(/registry lookup itself failed|did not report/);
  });

  it("verifies the publish actually landed", () => {
    expect(stepIndex(steps(wf(), "publish"), "Confirm")).toBeGreaterThanOrEqual(0);
  });
});

// Raised in review of #24: the prepare workflow's own comment and its job
// summary still told the maintainer that merging publishes, after the trigger
// had moved to workflow_dispatch. The job summary is the instruction a
// maintainer actually reads mid-release, so a stale one strands the release.
describe("nothing claims that merging publishes", () => {
  const FORBIDDEN = [/merging publishes/i, /is what publishes/i];
  const FILES = [
    ".github/workflows/release-prepare.yml",
    ".github/workflows/release.yml",
    "CLAUDE.md",
    "CONTRIBUTING.md",
    "README.md",
  ];

  it.each(FILES)("%s", (file) => {
    const text = readFileSync(join(process.cwd(), file), "utf8");
    for (const pattern of FORBIDDEN) {
      expect(text, `${file} still claims merging publishes`).not.toMatch(pattern);
    }
  });

  it("release-prepare points at the Release workflow instead", () => {
    const text = readFileSync(join(DIR, "release-prepare.yml"), "utf8");
    expect(text).toMatch(/run the .?Release.? workflow/i);
  });
});

describe("ci.yml", () => {
  it("still gates on the aggregate ci-ok job", () => {
    expect(workflow("ci.yml").jobs["ci-ok"]).toBeDefined();
  });
});
