import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue("/tmp/mail-mcp-body-abc123"),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";

const mockRunAppleScript = vi.mocked(runAppleScript);
const mockMkdtemp = vi.mocked(mkdtemp);
const mockWriteFile = vi.mocked(writeFile);
const mockRm = vi.mocked(rm);

describe("compose tools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Restore mock implementations after clearAllMocks
    mockRunAppleScript.mockResolvedValue({ success: true });
    mockMkdtemp.mockResolvedValue("/tmp/mail-mcp-body-abc123" as any);
    mockWriteFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
  });

  it("send_message passes bodyFile instead of body and cleans up temp dir", async () => {
    const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleSendMessage("bob@test.com", "Hi", "Hello Bob");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/send-message.applescript",
      expect.objectContaining({
        to: "bob@test.com",
        subject: "Hi",
        bodyFile: expect.stringMatching(/^\//)
      })
    );
    expect(mockRm).toHaveBeenCalledWith("/tmp/mail-mcp-body-abc123", { recursive: true, force: true });
  });

  it("send_message passes __NONE__ for omitted optional params", async () => {
    const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleSendMessage("bob@test.com", "Hi", "Hello");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/send-message.applescript",
      expect.objectContaining({ cc: "__NONE__", bcc: "__NONE__", attachmentPathsFile: "__NONE__" })
    );
  });

  it("send_message writes attachmentPaths to temp file", async () => {
    const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleSendMessage("bob@test.com", "Hi", "Hello", undefined, undefined, ["/tmp/a.pdf", "/tmp/b.pdf"]);
    expect(mockWriteFile).toHaveBeenCalledWith(
      "/tmp/mail-mcp-body-abc123/attachments.txt",
      "/tmp/a.pdf\n/tmp/b.pdf",
      "utf8"
    );
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/send-message.applescript",
      expect.objectContaining({ attachmentPathsFile: "/tmp/mail-mcp-body-abc123/attachments.txt" })
    );
  });

  it("reply_to_message passes bodyFile and replyAll as string and cleans up", async () => {
    const { handleReplyToMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleReplyToMessage(123, "INBOX", "Gmail", "Thanks!", true);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/reply-to-message.applescript",
      expect.objectContaining({
        messageId: "123",
        replyAll: "true",
        bodyFile: expect.stringMatching(/^\//)
      })
    );
    expect(mockRm).toHaveBeenCalledWith("/tmp/mail-mcp-body-abc123", { recursive: true, force: true });
  });

  it("forward_message passes __NONE__ bodyFile for omitted body", async () => {
    const { handleForwardMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleForwardMessage(123, "INBOX", "Gmail", "alice@test.com");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/forward-message.applescript",
      expect.objectContaining({ to: "alice@test.com", bodyFile: "__NONE__" })
    );
  });
});
