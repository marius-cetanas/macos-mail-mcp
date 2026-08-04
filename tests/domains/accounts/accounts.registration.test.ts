import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";
import { registerAccountsTools } from "../../../src/domains/accounts/accounts.tools.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

const ACCOUNT = {
  name: "Google",
  type: "imap",
  enabled: true,
  fullName: "Marius Cetanas",
  emails: ["marius.cetanas@gmail.com"],
};

interface RegisteredTool {
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: true;
  }>;
}

function captureTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    tool: (
      name: string,
      description: string,
      schema: Record<string, unknown>,
      handler: RegisteredTool["handler"]
    ) => {
      tools.set(name, { description, schema, handler });
    },
  };
  registerAccountsTools(server as never);
  return tools;
}

describe("accounts tool registration", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAppleScript.mockResolvedValue([ACCOUNT]);
    tools = captureTools();
  });

  it("registers both account tools", () => {
    expect([...tools.keys()].sort()).toEqual(["get_account_detail", "list_accounts"]);
  });

  describe("list_accounts", () => {
    it("returns the account list, including the fullName senders are built from", async () => {
      const result = await tools.get("list_accounts")!.handler({});
      expect(JSON.parse(result.content[0]!.text)).toEqual([
        expect.objectContaining({ name: "Google", fullName: "Marius Cetanas" }),
      ]);
      expect(result.isError).toBeUndefined();
    });

    it("invokes the list-accounts script", async () => {
      await tools.get("list_accounts")!.handler({});
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "accounts/scripts/list-accounts.applescript",
        {}
      );
    });

    it("surfaces a failure as an MCP error", async () => {
      mockRunAppleScript.mockRejectedValue(new Error("Mail is not running"));
      const result = await tools.get("list_accounts")!.handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/Mail is not running/);
    });
  });

  describe("get_account_detail", () => {
    it("passes the requested account through", async () => {
      mockRunAppleScript.mockResolvedValue(ACCOUNT);
      await tools.get("get_account_detail")!.handler({ accountName: "Google" });
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "accounts/scripts/get-account-detail.applescript",
        { accountName: "Google" }
      );
    });

    it("strips newlines from the account name", async () => {
      mockRunAppleScript.mockResolvedValue(ACCOUNT);
      await tools.get("get_account_detail")!.handler({ accountName: "Goo\ngle" });
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "accounts/scripts/get-account-detail.applescript",
        { accountName: "Goo gle" }
      );
    });

    it("surfaces a failure as an MCP error", async () => {
      mockRunAppleScript.mockRejectedValue(new Error("no such account"));
      const result = await tools.get("get_account_detail")!.handler({
        accountName: "Nope",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/no such account/);
    });
  });
});
