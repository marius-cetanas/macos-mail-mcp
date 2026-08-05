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

function steps(wf: Record<string, any>): Array<Record<string, any>> {
  return wf.jobs.release.steps;
}

function stepIndex(list: Array<Record<string, any>>, fragment: string): number {
  return list.findIndex((s) =>
    `${s.name ?? ""} ${s.run ?? ""} ${s.uses ?? ""}`.includes(fragment)
  );
}

const wf = () => workflow("release.yml");

describe("release.yml — the whole release in one workflow", () => {
  it("is the only release workflow", () => {
    expect(existsSync(join(DIR, "release-prepare.yml"))).toBe(false);
    expect(existsSync(join(DIR, "release.yml"))).toBe(true);
  });

  describe("triggering", () => {
    it("runs only when triggered by hand", () => {
      expect(triggers(wf())).toHaveProperty("workflow_dispatch");
    });

    // A tag that fails to publish leaves a permanent public tag pointing at an
    // unpublished version. That happened to v1.3.0.
    it("is not triggered by a tag", () => {
      expect((triggers(wf()).push ?? {}).tags).toBeUndefined();
    });

    it("is not triggered by any push", () => {
      expect(triggers(wf()).push).toBeUndefined();
    });
  });

  describe("inputs", () => {
    it("takes exactly bump and mode", () => {
      expect(Object.keys(triggers(wf()).workflow_dispatch.inputs).sort()).toEqual([
        "bump",
        "mode",
      ]);
    });

    it("defaults to a dry run so a careless click cannot ship", () => {
      expect(triggers(wf()).workflow_dispatch.inputs.mode.default).toBe("dry-run");
    });

    // A safe-by-default checkbox that cannot be toggled makes releasing
    // unreachable — a worse failure than the mis-click it guards against.
    it("has no boolean inputs at all", () => {
      const inputs = triggers(wf()).workflow_dispatch.inputs;
      for (const [name, spec] of Object.entries<any>(inputs)) {
        expect(spec.type, `input "${name}" is a boolean`).not.toBe("boolean");
      }
    });

    it("offers an explicit bump override alongside auto", () => {
      expect(triggers(wf()).workflow_dispatch.inputs.bump.options).toEqual([
        "auto",
        "patch",
        "minor",
        "major",
      ]);
    });
  });

  describe("permissions and pinning", () => {
    it("grants id-token so OIDC can be used", () => {
      expect(wf().jobs.release.permissions["id-token"]).toBe("write");
    });

    // contents:write is for the tag and the GitHub release only — the workflow
    // makes no commit and writes to no branch. See "never writes to main".
    it("grants contents write to push the tag and cut the release", () => {
      expect(wf().jobs.release.permissions.contents).toBe("write");
    });

    it("does not set registry-url, which would disable OIDC", () => {
      const setupNode = steps(wf()).find((s) =>
        String(s.uses ?? "").includes("actions/setup-node")
      );
      expect(setupNode?.with?.["registry-url"]).toBeUndefined();
    });

    it("does not cache in a release build", () => {
      const setupNode = steps(wf()).find((s) =>
        String(s.uses ?? "").includes("actions/setup-node")
      );
      expect(setupNode?.with?.cache).toBeUndefined();
    });

    it("pins every action to a commit SHA rather than a mutable tag", () => {
      for (const step of steps(wf())) {
        if (!step.uses) continue;
        expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
      }
    });

    it("does not mutate the toolchain during a release", () => {
      expect(JSON.stringify(wf())).not.toMatch(/npm install -g/);
    });

    it("asserts the npm floor trusted publishing needs", () => {
      const step = steps(wf()).find((s) =>
        String(s.name ?? "").includes("trusted publishing")
      );
      expect(String(step?.run)).toMatch(/11\.5\.1/);
    });

    it("refuses to run from anywhere but main", () => {
      const guard = steps(wf()).find((s) =>
        String(s.name ?? "").includes("default branch")
      );
      expect(String(guard?.run)).toMatch(/GITHUB_REF_NAME/);
    });
  });

  // The ordering is the whole safety argument: npm is irreversible, a tag is
  // not, so the reversible thing happens last and only on success.
  describe("ordering", () => {
    const order = (fragment: string) => stepIndex(steps(wf()), fragment);

    it("verifies the version is releasable before publishing", () => {
      expect(order("npm publish")).toBeGreaterThan(order("version is releasable"));
    });

    it("runs the OIDC preflight before publishing", () => {
      expect(order("npm publish")).toBeGreaterThan(order("check-npmrc"));
    });

    it("builds, tests and audits before publishing", () => {
      for (const check of ["npm run build", "npm run test:coverage", "npm audit"]) {
        expect(order("npm publish"), `${check} must precede publish`).toBeGreaterThan(
          order(check)
        );
      }
    });

    it("applies the version to the tree before the checks run", () => {
      expect(order("npm run test:coverage")).toBeGreaterThan(
        order("Apply the version to the tree")
      );
    });

    it("confirms the registry before pushing the tag", () => {
      expect(order("Tag and cut")).toBeGreaterThan(order("Confirm the registry has it"));
    });
  });

  describe("dry run", () => {
    it.each([
      "Publish to npm",
      "Confirm the registry has it",
      "Tag and cut the GitHub release",
    ])("skips %s unless mode is publish", (name) => {
      const step = steps(wf()).find((s) => s.name === name);
      expect(step, `no step named exactly "${name}"`).toBeDefined();
      expect(String(step!.if ?? "")).toMatch(/inputs\.mode == 'publish'/);
    });

    it("still runs every check, so a dry run is a real rehearsal", () => {
      for (const name of ["npm run build", "npm run test:coverage", "npm audit"]) {
        const step = steps(wf()).find((s) => String(s.run ?? "").startsWith(name));
        expect(step, `no unconditional step running "${name}"`).toBeDefined();
        expect(step!.if).toBeUndefined();
      }
    });

    it("keeps the version guard unconditional", () => {
      const guard = steps(wf()).find((s) =>
        String(s.name ?? "").includes("version is releasable")
      );
      expect(guard!.if).toBeUndefined();
    });

    it("does not push, tag or publish for real", () => {
      const dry = steps(wf()).find((s) => String(s.name ?? "").includes("Dry run"));
      expect(String(dry!.run)).toMatch(/npm publish --dry-run/);
      expect(String(dry!.run)).not.toMatch(/git push/);
    });
  });

  // Raised in review of #24: reporting every non-zero exit as "nothing to
  // release" misdiagnoses a malformed version or a git failure.
  describe("the derive-version step", () => {
    const derive = () =>
      String(steps(wf()).find((s) => String(s.name ?? "").includes("Derive"))?.run);

    it("treats exit 2 as the 'nothing releasable' answer specifically", () => {
      expect(derive()).toMatch(/-eq 2/);
    });

    it("reports other non-zero exits differently", () => {
      expect(derive()).toMatch(/-ne 0/);
      expect(derive()).toMatch(/not 'nothing to release'/);
    });

    it("captures the exit code rather than relying on `if !`", () => {
      expect(derive()).toMatch(/STATUS=\$\?/);
    });
  });

  // The tag is the source of truth, so main is never written to — which is what
  // lets branch protection stay fully intact with no bypass and no stored
  // credential. On a user-owned repo, GitHub Actions cannot be a ruleset bypass
  // actor, so pushing to main was never actually available.
  describe("never writes to main", () => {
    it("pushes no branch", () => {
      const yaml = JSON.stringify(wf());
      expect(yaml).not.toMatch(/HEAD:main/);
      expect(yaml).not.toMatch(/push origin main/);
    });

    it("makes no commit", () => {
      expect(JSON.stringify(wf())).not.toMatch(/git commit/);
    });

    it("pushes only the tag", () => {
      const tagStep = steps(wf()).find((s) => String(s.name ?? "").includes("Tag and cut"));
      const pushes = String(tagStep!.run).match(/git push \S+ \S+/g) ?? [];
      expect(pushes).toEqual(['git push origin "v$NEXT"']);
    });

    // Scoped to git: a bare /--force/ also matches next-version.mjs's --force
    // bump override, which has nothing to do with pushing.
    it("never force-pushes", () => {
      expect(JSON.stringify(wf())).not.toMatch(/git push[^"\\]*--force/);
    });

    it("derives the last released version from the tag, not package.json", () => {
      const derive = String(
        steps(wf()).find((s) => String(s.name ?? "").includes("Derive"))?.run
      );
      expect(derive).toMatch(/git describe --tags/);
      expect(derive).not.toMatch(/require\('\.\/package\.json'\)\.version/);
    });
  });

  describe("package.json version is a placeholder", () => {
    it("is not a release version", () => {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
      expect(pkg.version).toBe("0.0.0-development");
    });
  });
});

describe("nothing claims that merging publishes", () => {
  const FORBIDDEN = [/merging publishes/i, /is what publishes/i];
  const FILES = [
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
});

describe("ci.yml", () => {
  it("still gates on the aggregate ci-ok job", () => {
    expect(workflow("ci.yml").jobs["ci-ok"]).toBeDefined();
  });
});
