import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";
import { registerMailboxesTools } from "../../../src/domains/mailboxes/mailboxes.tools.js";
import { captureTools, payload, type RegisteredTool } from "../../helpers/capture-tools.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("mailboxes tool registration", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAppleScript.mockResolvedValue({ ok: true });
    tools = captureTools(registerMailboxesTools);
  });

  it("registers all three mailbox tools", () => {
    expect([...tools.keys()].sort()).toEqual([
      "create_mailbox",
      "get_mailbox_info",
      "list_mailboxes",
    ]);
  });

  describe("list_mailboxes", () => {
    it("returns the result as JSON content", async () => {
      const result = await tools.get("list_mailboxes")!.handler({ accountName: "Google" });
      expect(payload(result)).toEqual({ ok: true });
      expect(result.isError).toBeUndefined();
    });

    it("passes the requested account", async () => {
      await tools.get("list_mailboxes")!.handler({ accountName: "Google" });
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "mailboxes/scripts/list-mailboxes.applescript",
        { accountName: "Google" }
      );
    });

    it("uses the __ALL__ sentinel when no account is given", async () => {
      await tools.get("list_mailboxes")!.handler({});
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "mailboxes/scripts/list-mailboxes.applescript",
        { accountName: "__ALL__" }
      );
    });

    it("surfaces a failure as an MCP error", async () => {
      mockRunAppleScript.mockRejectedValue(new Error("Mail.app is not running"));
      const result = await tools.get("list_mailboxes")!.handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/Mail\.app is not running/);
    });
  });

  describe("create_mailbox", () => {
    it("creates a top-level mailbox with the __NONE__ parent sentinel", async () => {
      await tools.get("create_mailbox")!.handler({
        accountName: "Google",
        mailboxName: "Archive",
      });
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "mailboxes/scripts/create-mailbox.applescript",
        { accountName: "Google", mailboxName: "Archive", parentMailboxName: "__NONE__" }
      );
    });

    it("passes a parent mailbox when nesting", async () => {
      await tools.get("create_mailbox")!.handler({
        accountName: "Google",
        mailboxName: "2026",
        parentMailboxName: "Archive",
      });
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "mailboxes/scripts/create-mailbox.applescript",
        { accountName: "Google", mailboxName: "2026", parentMailboxName: "Archive" }
      );
    });

    it("strips newlines from names", async () => {
      await tools.get("create_mailbox")!.handler({
        accountName: "Goo\ngle",
        mailboxName: "Arch\nive",
      });
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "mailboxes/scripts/create-mailbox.applescript",
        expect.objectContaining({ accountName: "Goo gle", mailboxName: "Arch ive" })
      );
    });

    it("surfaces a failure as an MCP error", async () => {
      mockRunAppleScript.mockRejectedValue(new Error("mailbox exists"));
      const result = await tools.get("create_mailbox")!.handler({
        accountName: "Google",
        mailboxName: "Archive",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("get_mailbox_info", () => {
    it("passes account and mailbox through", async () => {
      await tools.get("get_mailbox_info")!.handler({
        accountName: "Google",
        mailboxName: "[Gmail]/All Mail",
      });
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "mailboxes/scripts/get-mailbox-info.applescript",
        { accountName: "Google", mailboxName: "[Gmail]/All Mail" }
      );
    });

    it("surfaces a failure as an MCP error", async () => {
      mockRunAppleScript.mockRejectedValue(new Error("no such mailbox"));
      const result = await tools.get("get_mailbox_info")!.handler({
        accountName: "Google",
        mailboxName: "Nope",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/no such mailbox/);
    });
  });
});
