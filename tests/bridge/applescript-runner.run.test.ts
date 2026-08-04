import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// execFileAsync is promisify(execFile) at module load, so the mock must carry a
// promisify.custom hook — otherwise promisify wraps it callback-style and the
// {stdout, stderr} shape is lost. Both values are hoisted because vi.mock
// factories are lifted above ordinary top-level declarations.
const { mockExec, PROMISIFY_CUSTOM } = vi.hoisted(() => ({
  mockExec:
    vi.fn<(cmd: string, args: string[], opts: { timeout: number }) => Promise<{ stdout: string; stderr: string }>>(),
  PROMISIFY_CUSTOM: Symbol.for("nodejs.util.promisify.custom"),
}));

vi.mock("node:child_process", () => {
  const execFile = ((..._args: unknown[]) => undefined) as unknown as Record<symbol, unknown>;
  execFile[PROMISIFY_CUSTOM] = (cmd: string, args: string[], opts: { timeout: number }) =>
    mockExec(cmd, args, opts);
  return { execFile };
});

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue("/tmp/macos-mail-mcp-test"),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import {
  runAppleScript,
  DEFAULT_TIMEOUT,
  SHARED_HANDLER_FILES,
} from "../../src/bridge/applescript-runner.js";

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdtemp = vi.mocked(mkdtemp);
const mockRm = vi.mocked(rm);

/** The script text handed to osascript. */
function writtenScript(): string {
  return String(mockWriteFile.mock.calls[0]![1]);
}

describe("runAppleScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Shared handlers first (in SHARED_HANDLER_FILES order), then the template.
    mockReadFile.mockImplementation(async (path: unknown) => {
      const p = String(path);
      const shared = SHARED_HANDLER_FILES.find((f) => p.endsWith(f));
      return shared ? `-- handler ${shared}` : "-- template {{name}}";
    });
    mockMkdtemp.mockResolvedValue("/tmp/macos-mail-mcp-test" as never);
    mockWriteFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
    mockExec.mockResolvedValue({ stdout: '{"ok": true}', stderr: "" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("happy path", () => {
    it("returns the parsed AppleScript output", async () => {
      await expect(runAppleScript("accounts/scripts/x.applescript")).resolves.toEqual({
        ok: true,
      });
    });

    it("runs osascript against the temp script file", async () => {
      await runAppleScript("accounts/scripts/x.applescript");
      expect(mockExec).toHaveBeenCalledWith(
        "osascript",
        ["/tmp/macos-mail-mcp-test/script.applescript"],
        expect.objectContaining({ timeout: DEFAULT_TIMEOUT })
      );
    });

    it("prepends every shared handler ahead of the template", async () => {
      await runAppleScript("accounts/scripts/x.applescript");
      const script = writtenScript();
      for (const handler of SHARED_HANDLER_FILES) {
        expect(script).toContain(`-- handler ${handler}`);
      }
      expect(script.indexOf("-- handler")).toBeLessThan(script.indexOf("-- template"));
    });

    it("substitutes params when given", async () => {
      await runAppleScript("accounts/scripts/x.applescript", { name: "Google" });
      expect(writtenScript()).toContain("-- template Google");
    });

    it("leaves the template untouched when no params are given", async () => {
      await runAppleScript("accounts/scripts/x.applescript");
      expect(writtenScript()).toContain("-- template {{name}}");
    });

    it("honours an explicit timeout", async () => {
      await runAppleScript("accounts/scripts/x.applescript", undefined, { timeout: 5_000 });
      expect(mockExec).toHaveBeenCalledWith(
        "osascript",
        expect.any(Array),
        expect.objectContaining({ timeout: 5_000 })
      );
    });

    it("removes the temp directory afterwards", async () => {
      await runAppleScript("accounts/scripts/x.applescript");
      expect(mockRm).toHaveBeenCalledWith("/tmp/macos-mail-mcp-test", {
        recursive: true,
        force: true,
      });
    });
  });

  describe("stderr on a successful run", () => {
    it("warns but still returns the parsed result", async () => {
      const warn = vi.fn();
      vi.stubGlobal("console", { ...console, warn });
      mockExec.mockResolvedValue({ stdout: '{"ok": true}', stderr: "  some warning  " });

      await expect(runAppleScript("accounts/scripts/x.applescript")).resolves.toEqual({
        ok: true,
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("some warning"));
    });

    it("does not warn on whitespace-only stderr", async () => {
      const warn = vi.fn();
      vi.stubGlobal("console", { ...console, warn });
      mockExec.mockResolvedValue({ stdout: '{"ok": true}', stderr: "   " });

      await runAppleScript("accounts/scripts/x.applescript");
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("execution failures", () => {
    it("reports a timeout in seconds when the process was killed", async () => {
      mockExec.mockRejectedValue(Object.assign(new Error("killed"), { killed: true }));
      await expect(
        runAppleScript("accounts/scripts/x.applescript", undefined, { timeout: 45_000 })
      ).rejects.toThrow("AppleScript timed out after 45 seconds");
    });

    it("translates a 'is not running' stderr into actionable guidance", async () => {
      mockExec.mockRejectedValue(
        Object.assign(new Error("boom"), { stderr: 'Application "Mail" is not running.' })
      );
      await expect(runAppleScript("accounts/scripts/x.applescript")).rejects.toThrow(
        "Mail.app is not running. Please open it first."
      );
    });

    it("surfaces stderr for any other failure", async () => {
      mockExec.mockRejectedValue(
        Object.assign(new Error("boom"), { stderr: "syntax error: expected end" })
      );
      await expect(runAppleScript("accounts/scripts/x.applescript")).rejects.toThrow(
        "AppleScript execution failed: syntax error: expected end"
      );
    });

    it("falls back to the error message when stderr is empty", async () => {
      mockExec.mockRejectedValue(Object.assign(new Error("spawn ENOENT"), { stderr: "" }));
      await expect(runAppleScript("accounts/scripts/x.applescript")).rejects.toThrow(
        "AppleScript execution failed: spawn ENOENT"
      );
    });

    it("falls back to the error message when there is no stderr at all", async () => {
      mockExec.mockRejectedValue(new Error("spawn EACCES"));
      await expect(runAppleScript("accounts/scripts/x.applescript")).rejects.toThrow(
        "AppleScript execution failed: spawn EACCES"
      );
    });

    it("still cleans up the temp directory when execution fails", async () => {
      mockExec.mockRejectedValue(Object.assign(new Error("boom"), { stderr: "nope" }));
      await expect(runAppleScript("accounts/scripts/x.applescript")).rejects.toThrow();
      expect(mockRm).toHaveBeenCalledWith("/tmp/macos-mail-mcp-test", {
        recursive: true,
        force: true,
      });
    });

    it("still cleans up when the output is not valid JSON", async () => {
      mockExec.mockResolvedValue({ stdout: "not json", stderr: "" });
      await expect(runAppleScript("accounts/scripts/x.applescript")).rejects.toThrow();
      expect(mockRm).toHaveBeenCalled();
    });

    it("throws the AppleScript error shape returned by a script", async () => {
      mockExec.mockResolvedValue({
        stdout: '{"error": "no such mailbox", "errorNumber": -1728}',
        stderr: "",
      });
      await expect(runAppleScript("accounts/scripts/x.applescript")).rejects.toThrow(
        /no such mailbox/
      );
    });
  });
});
