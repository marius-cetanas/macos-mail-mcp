import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  awaitPublished,
  makeNpmView,
  ATTESTATION_READ_MS,
  DEFAULT_BUDGET_MS,
  DEFAULT_POLL_MS,
  GUIDANCE,
  USAGE,
} from "../../scripts/confirm-published.mjs";

/**
 * The registry confirmation the release runs between the publish and the tag. Ten reads six seconds
 * apart, in embedded shell, failed the 2.1.0 release on 2026-09-15: npm had accepted the publish at
 * 10:11:24Z and listed the version at 10:16:31Z, and the step gave up at 10:12:26Z, so the tag and
 * the GitHub release were skipped and made by hand. The budget, what the loop returns, and what it
 * says on giving up are held here; the network is injected, since the answer being waited for is
 * the registry's to give.
 */
/**
 * A clock the loop reads and a sleep that advances it. The budget is a wall-clock deadline, so time
 * spent inside a read counts too: a registry read may advance the clock by `readMs` to stand in
 * for one that hangs (raised by Copilot on #104).
 */
const clock = () => {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
};

/** A registry that lists the version from the nth read on, with or without an attestation. */
const listedFrom = (n: number, attested = true, tick?: (ms: number) => void, readMs = 0) => {
  let reads = 0;
  return async (field: string) => {
    if (tick && readMs > 0) tick(readMs);
    if (field === "version") {
      reads += 1;
      return reads >= n ? "2.1.0" : null;
    }
    if (field === "dist.attestations.url") {
      return attested ? "https://registry.npmjs.org/-/npm/v1/attestations/macos-mail-mcp@2.1.0" : "";
    }
    throw new Error(`unexpected field ${field}`);
  };
};

describe("awaitPublished", () => {
  // 2.1.0 took five minutes to be listed; a budget under that fails a publish that succeeded.
  it("defaults to a ten-minute budget, read every ten seconds", () => {
    expect(DEFAULT_BUDGET_MS).toBe(10 * 60 * 1000);
    expect(DEFAULT_POLL_MS).toBe(10 * 1000);
  });

  it("is published at once when the registry already lists the version", async () => {
    const lines: string[] = [];
    const c = clock();
    const result = await awaitPublished({ view: listedFrom(1), ...c, log: (l) => lines.push(l) });
    expect(result).toEqual({ state: "published", polls: 1, elapsedMs: 0, attested: true });
    expect(lines).toEqual([
      "published: the registry lists the version after 1 read, 0s.",
      "Provenance attestation present.",
    ]);
  });

  it("keeps reading until the version is listed, and says how long that took", async () => {
    const slept: number[] = [];
    const lines: string[] = [];
    const c = clock();
    const result = await awaitPublished({
      view: listedFrom(4),
      now: c.now,
      sleep: async (ms) => {
        slept.push(ms);
        c.advance(ms);
      },
      pollMs: 10_000,
      budgetMs: 600_000,
      log: (l) => lines.push(l),
    });
    expect(result).toMatchObject({ state: "published", polls: 4, elapsedMs: 30_000 });
    expect(slept).toEqual([10_000, 10_000, 10_000]);
    expect(lines[0]).toBe("published: the registry lists the version after 4 reads, 30s.");
  });

  it("gives up after the budget, saying the publish succeeded and what to do", async () => {
    const lines: string[] = [];
    const result = await awaitPublished({
      view: async (field) => (field === "version" ? null : ""),
      ...clock(),
      pollMs: 10_000,
      budgetMs: 60_000,
      log: (l) => lines.push(l),
    });
    expect(result).toEqual({ state: "absent", polls: 7, elapsedMs: 60_000, attested: null });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^::error::the registry has not listed the version after 7 reads, 60s\./);
    expect(lines[0]).toContain(GUIDANCE);
    expect(GUIDANCE).toContain("do not publish again");
    expect(GUIDANCE).toContain("push the tag and cut the release by hand");
    expect(lines[0]).not.toMatch(/publish failed/i);
  });

  // A read that hangs used to cost nothing against the budget, since only the sleeps were counted,
  // and `npm view` had no timeout to stop it. Now the clock decides, and each read is bounded to what
  // is left. (Raised by Copilot on #104.)
  it("counts the time a read takes against the budget", async () => {
    const c = clock();
    const result = await awaitPublished({
      view: listedFrom(99, true, c.advance, 400_000),
      ...c,
      pollMs: 10_000,
      budgetMs: 600_000,
    });
    expect(result).toMatchObject({ state: "absent", polls: 2, elapsedMs: 810_000 });
  });

  it("bounds each read to what is left of the budget, and the attestation read to a floor", async () => {
    const bounds: Array<[string, number]> = [];
    const c = clock();
    const view = async (field: string, bound: { timeoutMs: number }) => {
      bounds.push([field, bound.timeoutMs]);
      if (field === "version") return c.now() >= 590_000 ? "2.1.0" : null;
      return "https://registry.npmjs.org/-/npm/v1/attestations/macos-mail-mcp@2.1.0";
    };
    await awaitPublished({ view, ...c, pollMs: 10_000, budgetMs: 600_000 });
    expect(bounds[0]).toEqual(["version", 600_000]);
    expect(bounds[1]).toEqual(["version", 590_000]);
    expect(bounds[bounds.length - 2]).toEqual(["version", 10_000]);
    expect(bounds[bounds.length - 1]).toEqual(["dist.attestations.url", ATTESTATION_READ_MS]);
  });

  it("warns rather than fails when the listed version has no attestation", async () => {
    const lines: string[] = [];
    const result = await awaitPublished({ view: listedFrom(1, false), ...clock(), log: (l) => lines.push(l) });
    expect(result).toMatchObject({ state: "published", attested: false });
    expect(lines[1]).toMatch(/^::warning::No provenance attestation/);
  });

  // A network error is not "not published", so it is not waited out and not reported as absent.
  it("passes a read failure through rather than reading it as not published", async () => {
    await expect(
      awaitPublished({
        view: async () => {
          throw new Error("npm view macos-mail-mcp@2.1.0 version failed: ECONNRESET");
        },
        ...clock(),
      })
    ).rejects.toThrow("ECONNRESET");
  });
});

describe("makeNpmView", () => {
  it("runs npm view for the field, preferring the registry over the cache, bounded, and trims the answer", async () => {
    const calls: Array<[string, string[], object]> = [];
    const run = async (file: string, args: string[], options: object) => {
      calls.push([file, args, options]);
      return { stdout: "2.1.0\n" };
    };
    await expect(
      makeNpmView("macos-mail-mcp", "2.1.0", run)("version", { timeoutMs: 5_000 })
    ).resolves.toBe("2.1.0");
    expect(calls).toEqual([
      ["npm", ["view", "macos-mail-mcp@2.1.0", "version", "--prefer-online"], { timeout: 5_000 }],
    ]);
  });

  // What execFile reports when its timeout kills the child: `killed` and the signal, no exit code.
  it("names a read that ran out of its bound, rather than reading it as not published", async () => {
    const run = async () => {
      throw Object.assign(new Error("Command failed: npm view"), { killed: true, signal: "SIGTERM", code: null });
    };
    await expect(
      makeNpmView("macos-mail-mcp", "2.1.0", run)("version", { timeoutMs: 5_000 })
    ).rejects.toThrow("npm view macos-mail-mcp@2.1.0 version timed out after 5s");
  });

  // What npm prints for a version the registry does not have, measured on 2.1.0 at 10:13Z.
  it("is null on the registry's 404 for a version it does not have", async () => {
    const run = async () => {
      throw Object.assign(new Error("Command failed: npm view"), {
        stderr: "npm error code E404\nnpm error 404 No match found for version 2.1.0\n",
      });
    };
    await expect(makeNpmView("macos-mail-mcp", "2.1.0", run)("version")).resolves.toBeNull();
  });

  it("throws, naming the failure, on anything else", async () => {
    const run = async () => {
      throw Object.assign(new Error("Command failed: npm view"), { stderr: "npm error ECONNRESET\n" });
    };
    await expect(makeNpmView("macos-mail-mcp", "2.1.0", run)("version")).rejects.toThrow(
      "npm view macos-mail-mcp@2.1.0 version failed: npm error ECONNRESET"
    );
  });
});

describe("confirm-published CLI", () => {
  it("prints usage rather than a stack trace without a name and version, and exits 1", () => {
    const result = spawnSync("node", [join("scripts", "confirm-published.mjs")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(USAGE);
    expect(result.stderr).not.toMatch(/at .*confirm-published\.mjs:\d+/);
  });
});
