import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/**
 * An advisory is published against a version, so the lockfile on `main` can become vulnerable
 * without a commit, and CI audits only when something is pushed. `scheduled-audit.yml` audits
 * `main` every day so that the day it happens is the day `main` goes red.
 *
 * It is a second copy of the merge gate's `audit` job, and a copy drifts: a threshold lowered in
 * one and not the other would report a `main` that no pull request is held to, or hold pull
 * requests to something `main` is never measured against. So the copy is held to the original.
 */
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

const scheduled = workflow("scheduled-audit.yml");
const gate = workflow("verify.yml");

const job = scheduled.jobs["scheduled-audit"];

describe("scheduled-audit.yml — main is audited without a push", () => {
  describe("triggering", () => {
    it("runs on a schedule, and by hand", () => {
      expect(Object.keys(triggers(scheduled)).sort()).toEqual(["schedule", "workflow_dispatch"]);
    });

    // A pull_request or push trigger would report this check on a pull request's head, beside the
    // gate's own `audit`, where it is one more name to misread and no part of `verify`.
    it("never runs for a pull request or a push", () => {
      expect(triggers(scheduled)).not.toHaveProperty("pull_request");
      expect(triggers(scheduled)).not.toHaveProperty("push");
    });

    it("runs once a day, off the hour", () => {
      const crons: string[] = triggers(scheduled).schedule.map((s: { cron: string }) => s.cron);
      expect(crons).toHaveLength(1);

      const [minute, hour, dayOfMonth, month, dayOfWeek] = crons[0].split(" ");
      expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "*"]);
      expect(hour).toMatch(/^\d+$/);
      expect(minute).toMatch(/^\d+$/);
      expect(Number(minute)).not.toBe(0);
    });
  });

  describe("what it measures", () => {
    // Equal lists prove nothing if both are empty, or if the gate's job stopped auditing.
    it("finds the audit in the merge gate's job", () => {
      const runs: string[] = gate.jobs.audit.steps.map((s: { run?: string }) => s.run ?? "");
      expect(runs).toContain("npm audit --audit-level=high");
    });

    it("runs the steps of the merge gate's audit job, and no others", () => {
      expect(job.steps).toEqual(gate.jobs.audit.steps);
    });
  });

  it("reads the repository and can do nothing else", () => {
    expect(scheduled.permissions).toEqual({ contents: "read" });
    expect(job.permissions).toBeUndefined();
  });

  // CI's push run reports its checks on the same commit of `main` this one does.
  it("reports under a name no CI job uses", () => {
    const ci: string[] = Object.entries(gate.jobs).map(
      ([id, j]) => (j as { name?: string }).name ?? id
    );
    expect(ci).toContain("audit");
    expect(ci).not.toContain(job.name);
  });
});
