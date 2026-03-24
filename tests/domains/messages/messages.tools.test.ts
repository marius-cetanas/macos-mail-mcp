import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";
const mockRunAppleScript = vi.mocked(runAppleScript);

describe("messages tools - reading", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("list_messages passes limit and offset as strings", async () => {
    mockRunAppleScript.mockResolvedValue([]);
    const { handleListMessages } = await import("../../../src/domains/messages/messages.tools.js");
    await handleListMessages("Gmail", "INBOX", 10, 5);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/list-messages.applescript",
      { accountName: "Gmail", mailboxName: "INBOX", limit: "10", offset: "5" }
    );
  });

  it("get_message passes messageId as string", async () => {
    mockRunAppleScript.mockResolvedValue({ id: 12345, subject: "Test" });
    const { handleGetMessage } = await import("../../../src/domains/messages/messages.tools.js");
    await handleGetMessage(12345, "INBOX", "Gmail");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/get-message.applescript",
      { messageId: "12345", mailboxName: "INBOX", accountName: "Gmail" }
    );
  });

  it("search_messages passes __ALL__ for omitted optional params", async () => {
    mockRunAppleScript.mockResolvedValue([]);
    const { handleSearchMessages } = await import("../../../src/domains/messages/messages.tools.js");
    await handleSearchMessages("subject", "invoice", undefined, undefined, 50);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/search-messages.applescript",
      { field: "subject", query: "invoice", mailboxName: "__ALL__", accountName: "__ALL__", limit: "50" }
    );
  });
});

describe("messages tools - managing", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("move_message passes all params", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleMoveMessage } = await import("../../../src/domains/messages/messages.tools.js");
    await handleMoveMessage(123, "INBOX", "Archive", "Gmail");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/move-message.applescript",
      { messageId: "123", mailboxName: "INBOX", toMailbox: "Archive", accountName: "Gmail" }
    );
  });

  it("delete_message passes correct params", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleDeleteMessage } = await import("../../../src/domains/messages/messages.tools.js");
    await handleDeleteMessage(123, "INBOX", "Gmail");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/delete-message.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail" }
    );
  });

  it("flag_message passes flagged and flagIndex", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleFlagMessage } = await import("../../../src/domains/messages/messages.tools.js");
    await handleFlagMessage(123, "INBOX", "Gmail", true, 2);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/flag-message.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail", flagged: "true", flagIndex: "2" }
    );
  });

  it("mark_read passes read status", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleMarkRead } = await import("../../../src/domains/messages/messages.tools.js");
    await handleMarkRead(123, "INBOX", "Gmail", true);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/mark-read.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail", read: "true" }
    );
  });
});
