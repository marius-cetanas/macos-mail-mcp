import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";
const mockRunAppleScript = vi.mocked(runAppleScript);

describe("mailboxes tools", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("list_mailboxes with account passes accountName", async () => {
    mockRunAppleScript.mockResolvedValue([]);
    const { handleListMailboxes } = await import("../../../src/domains/mailboxes/mailboxes.tools.js");
    await handleListMailboxes("Gmail");
    expect(mockRunAppleScript).toHaveBeenCalledWith("mailboxes/scripts/list-mailboxes.applescript", { accountName: "Gmail" });
  });

  it("list_mailboxes without account passes __ALL__", async () => {
    mockRunAppleScript.mockResolvedValue([]);
    const { handleListMailboxes } = await import("../../../src/domains/mailboxes/mailboxes.tools.js");
    await handleListMailboxes();
    expect(mockRunAppleScript).toHaveBeenCalledWith("mailboxes/scripts/list-mailboxes.applescript", { accountName: "__ALL__" });
  });

  it("get_mailbox_info passes accountName and mailboxName", async () => {
    mockRunAppleScript.mockResolvedValue({ name: "INBOX", unreadCount: 5, accountName: "Gmail", messageCount: 120, container: null });
    const { handleGetMailboxInfo } = await import("../../../src/domains/mailboxes/mailboxes.tools.js");
    await handleGetMailboxInfo("Gmail", "INBOX");
    expect(mockRunAppleScript).toHaveBeenCalledWith("mailboxes/scripts/get-mailbox-info.applescript", { accountName: "Gmail", mailboxName: "INBOX" });
  });
});
