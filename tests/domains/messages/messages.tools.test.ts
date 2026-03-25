import { describe, it, expect, vi, beforeEach } from "vitest";
import { homedir } from "node:os";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue("/tmp/mail-mcp-att-XXXXXX"),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";

const mockRunAppleScript = vi.mocked(runAppleScript);
const mockMkdtemp = vi.mocked(mkdtemp);
const mockWriteFile = vi.mocked(writeFile);
const mockRm = vi.mocked(rm);

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
      { field: "subject", query: "invoice", mailboxName: "__ALL__", accountName: "__ALL__", limit: "50" },
      { timeout: 120_000 }
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

describe("messages tools - attachments", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Restore fs mock implementations after clearAllMocks
    mockMkdtemp.mockResolvedValue("/tmp/mail-mcp-att-XXXXXX" as any);
    mockWriteFile.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
  });

  it("list_attachments passes correct params", async () => {
    mockRunAppleScript.mockResolvedValue([]);
    const { handleListAttachments } = await import("../../../src/domains/messages/messages.tools.js");
    await handleListAttachments(123, "INBOX", "Gmail");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/list-attachments.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail" }
    );
  });

  it("list_attachments returns MIME types from extension-based fallback", async () => {
    const mockAttachments = [
      { name: "report.pdf", mimeType: "application/pdf", fileSize: 1024, downloaded: true },
      { name: "photo.jpg", mimeType: "image/jpeg", fileSize: 2048, downloaded: true },
      { name: "data.csv", mimeType: "text/csv", fileSize: 512, downloaded: true },
      { name: "unknown.xyz", mimeType: "application/octet-stream", fileSize: 256, downloaded: false },
    ];
    mockRunAppleScript.mockResolvedValue(mockAttachments);
    const { handleListAttachments } = await import("../../../src/domains/messages/messages.tools.js");
    const result = await handleListAttachments(123, "INBOX", "Gmail") as typeof mockAttachments;
    expect(result).toHaveLength(4);
    expect(result[0].mimeType).toBe("application/pdf");
    expect(result[1].mimeType).toBe("image/jpeg");
    expect(result[2].mimeType).toBe("text/csv");
    expect(result[3].mimeType).toBe("application/octet-stream");
  });

  it("save_attachment uses extended timeout, expands tilde, and cleans up", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleSaveAttachment } = await import("../../../src/domains/messages/messages.tools.js");
    await handleSaveAttachment(123, "INBOX", "Gmail", "file.pdf", "~/Downloads");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/save-attachment.applescript",
      expect.objectContaining({
        messageId: "123", mailboxName: "INBOX", accountName: "Gmail",
        attNameFile: expect.stringContaining("attname.txt"),
        savePath: homedir() + "/Downloads",
      }),
      { timeout: 120_000 }
    );
    expect(mockRm).toHaveBeenCalledWith("/tmp/mail-mcp-att-XXXXXX", { recursive: true, force: true });
  });

  it("save_all_attachments uses extended timeout and expands tilde", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true, savedFiles: [] });
    const { handleSaveAllAttachments } = await import("../../../src/domains/messages/messages.tools.js");
    await handleSaveAllAttachments(123, "INBOX", "Gmail", "~/Downloads");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/save-all-attachments.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail", savePath: homedir() + "/Downloads" },
      { timeout: 120_000 }
    );
  });

  it("read_attachment calls runAppleScript for text files and cleans up", async () => {
    mockRunAppleScript.mockResolvedValue({ name: "data.csv", content: "a,b,c" });
    const { handleReadAttachment } = await import("../../../src/domains/messages/messages.tools.js");
    const result = await handleReadAttachment(123, "INBOX", "Gmail", "data.csv");
    expect(result).toEqual({ name: "data.csv", content: "a,b,c" });
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/read-attachment.applescript",
      expect.objectContaining({
        messageId: "123", mailboxName: "INBOX", accountName: "Gmail",
        attNameFile: expect.stringContaining("attname.txt"),
      }),
      { timeout: 120_000 }
    );
    expect(mockRm).toHaveBeenCalledWith("/tmp/mail-mcp-att-XXXXXX", { recursive: true, force: true });
  });

  it("read_attachment rejects binary file extensions", async () => {
    const { handleReadAttachment } = await import("../../../src/domains/messages/messages.tools.js");
    await expect(handleReadAttachment(123, "INBOX", "Gmail", "photo.jpg"))
      .rejects.toThrow("Binary file type");
  });
});
