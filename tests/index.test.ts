import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const connect = vi.fn<() => Promise<void>>();
const McpServer = vi.fn();
const StdioServerTransport = vi.fn();

const registerAccountsTools = vi.fn();
const registerMailboxesTools = vi.fn();
const registerMessagesTools = vi.fn();
const registerComposeTools = vi.fn();

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    connect = connect;
    constructor(options: unknown) {
      McpServer(options);
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {
    constructor() {
      StdioServerTransport();
    }
  },
}));

vi.mock("../src/domains/accounts/accounts.tools.js", () => ({ registerAccountsTools }));
vi.mock("../src/domains/mailboxes/mailboxes.tools.js", () => ({ registerMailboxesTools }));
vi.mock("../src/domains/messages/messages.tools.js", () => ({ registerMessagesTools }));
vi.mock("../src/domains/compose/compose.tools.js", () => ({ registerComposeTools }));

const { version } = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8")
) as { version: string };

/** Import the entry point fresh — it wires everything up as a side effect. */
async function loadEntryPoint(): Promise<void> {
  vi.resetModules();
  await import("../src/index.js");
  // main() is not awaited by the module itself; let its microtasks settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("entry point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect.mockResolvedValue(undefined);
    vi.stubGlobal("console", { ...console, error: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("names the server and reports the version from package.json", async () => {
    await loadEntryPoint();
    expect(McpServer).toHaveBeenCalledWith({ name: "macos-mail-mcp", version });
  });

  it("does not hardcode a version that could drift from the package", async () => {
    await loadEntryPoint();
    const options = McpServer.mock.calls[0]![0] as { version: string };
    expect(options.version).toBe(version);
    expect(options.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("registers all four tool domains", async () => {
    await loadEntryPoint();
    expect(registerAccountsTools).toHaveBeenCalledTimes(1);
    expect(registerMailboxesTools).toHaveBeenCalledTimes(1);
    expect(registerMessagesTools).toHaveBeenCalledTimes(1);
    expect(registerComposeTools).toHaveBeenCalledTimes(1);
  });

  it("registers every domain against the same server instance", async () => {
    await loadEntryPoint();
    const server = registerAccountsTools.mock.calls[0]![0];
    expect(registerMailboxesTools).toHaveBeenCalledWith(server);
    expect(registerMessagesTools).toHaveBeenCalledWith(server);
    expect(registerComposeTools).toHaveBeenCalledWith(server);
  });

  it("connects over stdio", async () => {
    await loadEntryPoint();
    expect(StdioServerTransport).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("announces itself on stderr, keeping stdout free for the protocol", async () => {
    await loadEntryPoint();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(`macos-mail-mcp v${version} running on stdio`)
    );
  });

  describe("when the transport fails to connect", () => {
    it("logs the error and exits non-zero", async () => {
      const exit = vi
        .spyOn(process, "exit")
        .mockImplementation((() => undefined) as never);
      connect.mockRejectedValue(new Error("stdio unavailable"));

      await loadEntryPoint();

      expect(console.error).toHaveBeenCalledWith("Fatal error:", expect.any(Error));
      expect(exit).toHaveBeenCalledWith(1);
    });
  });
});
