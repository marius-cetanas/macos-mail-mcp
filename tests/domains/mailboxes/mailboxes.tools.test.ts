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

  it("create_mailbox passes accountName and mailboxName", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true, mailboxName: "Archive", accountName: "Gmail" });
    const { handleCreateMailbox } = await import("../../../src/domains/mailboxes/mailboxes.tools.js");
    await handleCreateMailbox("Gmail", "Archive");
    expect(mockRunAppleScript).toHaveBeenCalledWith("mailboxes/scripts/create-mailbox.applescript", { accountName: "Gmail", mailboxName: "Archive", parentMailboxName: "__NONE__" });
  });

  it("create_mailbox passes parentMailboxName when provided", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true, mailboxName: "Q2", accountName: "Gmail" });
    const { handleCreateMailbox } = await import("../../../src/domains/mailboxes/mailboxes.tools.js");
    await handleCreateMailbox("Gmail", "Q2", "Projects");
    expect(mockRunAppleScript).toHaveBeenCalledWith("mailboxes/scripts/create-mailbox.applescript", { accountName: "Gmail", mailboxName: "Q2", parentMailboxName: "Projects" });
  });

  it("get_mailbox_info passes accountName and mailboxName", async () => {
    mockRunAppleScript.mockResolvedValue({ name: "INBOX", unreadCount: 5, accountName: "Gmail", messageCount: 120, container: null });
    const { handleGetMailboxInfo } = await import("../../../src/domains/mailboxes/mailboxes.tools.js");
    await handleGetMailboxInfo("Gmail", "INBOX");
    expect(mockRunAppleScript).toHaveBeenCalledWith("mailboxes/scripts/get-mailbox-info.applescript", { accountName: "Gmail", mailboxName: "INBOX" });
  });

  it("get_mailbox_info forwards a full [Gmail]/* path unchanged", async () => {
    mockRunAppleScript.mockResolvedValue({ name: "Sent Mail", container: "[Gmail]" });
    const { handleGetMailboxInfo } = await import("../../../src/domains/mailboxes/mailboxes.tools.js");
    await handleGetMailboxInfo("Gmail", "[Gmail]/Sent Mail");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "mailboxes/scripts/get-mailbox-info.applescript",
      { accountName: "Gmail", mailboxName: "[Gmail]/Sent Mail" }
    );
  });
});
