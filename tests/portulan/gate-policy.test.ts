import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

interface Rule {
  id: string;
  tier: string;
  reason: string;
  action: Record<string, string>;
}

interface Floor {
  branch: string;
  checks: { context: string; integration_id?: number }[];
  reviews: number;
  resolve_conversations: boolean;
}

const policy: { portulan: { spec: string }; why: string; rules: Rule[]; floor?: Floor } =
  JSON.parse(read(".portulan/gates.json"));
const map = read(".portulan/gate-map.md");
const manifest = JSON.parse(read(".portulan/workspace.json"));

/**
 * `gates.json` and `gate-map.md` state one policy in two files — the JSON is what compiles,
 * the Markdown is why. The Workspace Definition contains that duplication by requiring
 * membership to hold BOTH ways: a rule nothing cites, or a citation backing no rule, fails.
 * These tests are that requirement, which was prose until this change.
 *
 * Only the four tier rows are parsed. The platform-floor table below them also uses code
 * spans, so sweeping the whole file would read `verify` and `enforce_admins` as rules that
 * had gone missing — a false red, and a false red is what gets a check switched off.
 */
const TIERS = ["Auto", "Propose", "Gated", "Prohibited"] as const;

const rowFor = (tier: string): string => {
  const row = map.split("\n").find((l) => l.startsWith(`| **${tier}**`));
  if (!row) throw new Error(`gate-map.md has no \`${tier}\` row in the tier table`);
  return row;
};

/**
 * A citation is a code span shaped like a rule id. `npm publish`, `mode: publish` and
 * `--force` all appear as code spans in the same rows and none of them can match: the
 * shape admits no spaces, no colons and no leading dash.
 */
const citedIn = (tier: string): string[] =>
  [...rowFor(tier).matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)*)`/g)].map((m) => m[1]);

const cited = new Map<string, string>();
for (const tier of TIERS) for (const id of citedIn(tier)) cited.set(id, tier.toLowerCase());

describe("the gate policy and the gate map state one policy", () => {
  it("cites every rule in the map, in the row for its own tier", () => {
    for (const rule of policy.rules) {
      expect(cited.get(rule.id), `rule \`${rule.id}\` is cited by no row in gate-map.md`).toBe(
        rule.tier,
      );
    }
  });

  it("backs every citation in the map with a rule of that tier", () => {
    const byId = new Map(policy.rules.map((r) => [r.id, r.tier]));
    for (const [id, tier] of cited) {
      expect(byId.get(id), `gate-map.md cites \`${id}\`, which no rule in gates.json declares`).toBe(
        tier,
      );
    }
  });

  it("cites each rule exactly once, so a tier cannot be claimed twice", () => {
    const all = TIERS.flatMap((t) => citedIn(t));
    expect(all.length).toBe(new Set(all).size);
    expect(all.length).toBe(policy.rules.length);
  });
});

describe("the policy is well formed", () => {
  it("gives every rule a unique id", () => {
    const ids = policy.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every rule a reason, because a gate with no sentence to show a human is not finished", () => {
    for (const rule of policy.rules) expect(rule.reason.trim().length).toBeGreaterThan(0);
  });

  it("declares no prohibited rule, and the map's Prohibited row cites none", () => {
    expect(policy.rules.filter((r) => r.tier === "prohibited")).toEqual([]);
    expect(citedIn("Prohibited")).toEqual([]);
  });
});

describe("the workspace wires the policy in", () => {
  it("declares the policy on the top-level `gates` key, not in `slots`", () => {
    expect(manifest.gates).toBe("gates.json");
    expect(existsSync(join(ROOT, ".portulan", manifest.gates))).toBe(true);
  });

  it("keeps `slots.gates` pointed at the prose, which is the other question", () => {
    expect(manifest.slots.gates).toBe("gate-map.md");
  });

  it("ignores the compiled artifact, which is machine-specific and fails open when stale", () => {
    expect(read(".gitignore")).toContain(".claude/settings.json");
  });
});

/**
 * The floor compiles to an importable GitHub ruleset. It matches the live configuration on
 * `main` in every parameter but one: the compiler hard-codes `strict` and refuses to make it
 * declarable, while this repository deliberately runs with `strict` off. That contradiction
 * cannot be removed from this side, so it is measured instead of described — the failure mode
 * being an export somebody imports, silently re-enabling a setting a ruling turned off.
 */
const ruleset = JSON.parse(read(".portulan/compile/github-ruleset.json"));
const ruleOf = (type: string) =>
  ruleset.rules.find((r: { type: string }) => r.type === type)?.parameters ?? {};

describe("the exported ruleset and the floor it came from", () => {
  it("protects exactly the branch the policy names", () => {
    expect(ruleset.conditions.ref_name.include).toEqual([`refs/heads/${policy.floor!.branch}`]);
  });

  it("carries the declared checks, pins and all, in order", () => {
    expect(ruleOf("required_status_checks").required_status_checks).toEqual(policy.floor!.checks);
  });

  it("carries the declared review count and conversation resolution", () => {
    expect(ruleOf("pull_request").required_approving_review_count).toBe(policy.floor!.reviews);
    expect(ruleOf("pull_request").required_review_thread_resolution).toBe(
      policy.floor!.resolve_conversations,
    );
  });

  it("exports `strict` on, which the live floor deliberately has off", () => {
    expect(ruleOf("required_status_checks").strict_required_status_checks_policy).toBe(true);
    expect(policy.floor).not.toHaveProperty("strict");
  });

  it("warns, in the map, that the export must not be imported as-is", () => {
    expect(map).toContain("must not be imported as-is");
    expect(map).toContain("strict_required_status_checks_policy");
  });
});
