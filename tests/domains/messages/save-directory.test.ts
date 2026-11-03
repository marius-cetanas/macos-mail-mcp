import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { constants } from "node:fs";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { composeScript, SHARED_HANDLER_FILES, substituteParams } from "../../../src/bridge/applescript-runner.js";
import { onMacOS } from "../../helpers/run-applescript.js";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, mkdir: vi.fn(actual.mkdir), stat: vi.fn(actual.stat), access: vi.fn(actual.access) };
});
import { mkdir, stat, access } from "node:fs/promises";

const prepare = async (path: string) => (await import("../../../src/domains/messages/save-directory.js")).prepareSaveDirectory(path);
let dir: string;
beforeEach(async () => { vi.clearAllMocks(); dir = await mkdtemp(join(tmpdir(), "mail-mcp-save-path-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("save-directory preparation", () => {
  it("recursively creates a missing nested directory and preserves an existing one", async () => {
    const path = join(dir, "new", "nested");
    expect(await prepare(path)).toBe(path);
    expect((await stat(path)).isDirectory()).toBe(true);
    expect(await prepare(path)).toBe(path);
    expect(access).toHaveBeenCalledWith(path, constants.W_OK | constants.X_OK);
  });

  it("resolves relative paths and accepts a symlink to a directory", async () => {
    const path = join(dir, "relative");
    expect(await prepare(relative(process.cwd(), path))).toBe(path);
    const link = join(dir, "link");
    await symlink(path, link);
    expect(await prepare(link)).toBe(link);
  });

  it.each(["~", "~/Downloads"])("expands %s without writing outside the fixture directory", async (path) => {
    vi.mocked(mkdir).mockResolvedValueOnce(undefined);
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true } as never);
    vi.mocked(access).mockResolvedValueOnce(undefined);
    expect(await prepare(path)).toBe(resolve(homedir(), path === "~" ? "" : "Downloads"));
  });

  it.each(["", "bad\u0000path"])("rejects invalid path %j before filesystem operations", async (path) => {
    await expect(prepare(path)).rejects.toThrow(/savePath/);
    expect(mkdir).not.toHaveBeenCalled();
    expect(access).not.toHaveBeenCalled();
  });

  it("reports a regular-file destination or ancestor with the requested path", async () => {
    const file = join(dir, "regular-file");
    await writeFile(file, "data");
    for (const path of [file, join(file, "child")]) await expect(prepare(path)).rejects.toThrow(`savePath ${JSON.stringify(path)}`);
  });

  it.each(["mkdir", "stat", "access", "not-directory", "non-Error"])("reports %s failures with path context", async (kind) => {
    const path = join(dir, "target");
    if (kind === "mkdir") vi.mocked(mkdir).mockRejectedValueOnce(new Error("EACCES: mkdir denied"));
    if (kind === "stat") vi.mocked(stat).mockRejectedValueOnce(new Error("ENOENT: stat raced"));
    if (kind === "access") vi.mocked(access).mockRejectedValueOnce(new Error("EACCES: write/search denied"));
    if (kind === "not-directory") vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false } as never);
    if (kind === "non-Error") vi.mocked(access).mockRejectedValueOnce("access denied");
    await expect(prepare(path)).rejects.toThrow(`Cannot prepare savePath ${JSON.stringify(path)}`);
  });

  it.skipIf(!onMacOS).each(["save-attachment", "save-all-attachments"])("preserves destination characters through actual %s initialization and JSON", async (file) => {
    const path = join(dir, 'nested spaces', 'quote " backslash \\ café e\u0301 👩‍💻\r\nlast');
    const prepared = await prepare(path);
    const template = readFileSync(`src/domains/messages/scripts/${file}.applescript`, "utf8");
    const initialization = template.split("\n")[0]!;
    const resultLine = template.split("\n").find((line) => line.includes('return "{\\"success\\": true'))!;
    const shared = SHARED_HANDLER_FILES.map((name) => readFileSync(join("src/bridge", name), "utf8"));
    const output = execFileSync("osascript", ["-"], {
      input: composeScript(shared, substituteParams([
        initialization, 'set fullSavePath to saveFolderPath & "/fixture.txt"', 'set savedFilesJson to ""', resultLine,
      ].join("\n"), { savePath: prepared })), encoding: "utf8", timeout: 20_000,
    });
    expect(JSON.parse(output)).toEqual(file === "save-attachment" ? { success: true, path: path + "/fixture.txt" } : { success: true, savePath: path, savedFiles: [] });
    expect((await stat(path)).isDirectory()).toBe(true);
  });
});
