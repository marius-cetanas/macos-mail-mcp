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
