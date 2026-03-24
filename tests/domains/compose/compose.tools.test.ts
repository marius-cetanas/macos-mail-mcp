import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";
const mockRunAppleScript = vi.mocked(runAppleScript);

describe("compose tools", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("send_message passes to, subject, body", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleSendMessage("bob@test.com", "Hi", "Hello Bob");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/send-message.applescript",
      expect.objectContaining({ to: "bob@test.com", subject: "Hi", body: "Hello Bob" })
    );
  });

  it("send_message passes __NONE__ for omitted optional params", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleSendMessage("bob@test.com", "Hi", "Hello");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/send-message.applescript",
      expect.objectContaining({ cc: "__NONE__", bcc: "__NONE__", attachmentPaths: "__NONE__" })
    );
  });

  it("reply_to_message passes replyAll as string", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleReplyToMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleReplyToMessage(123, "INBOX", "Gmail", "Thanks!", true);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/reply-to-message.applescript",
      expect.objectContaining({ messageId: "123", replyAll: "true" })
    );
  });

  it("forward_message passes __NONE__ for omitted body", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleForwardMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleForwardMessage(123, "INBOX", "Gmail", "alice@test.com");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/forward-message.applescript",
      expect.objectContaining({ to: "alice@test.com", body: "__NONE__" })
    );
  });
});
