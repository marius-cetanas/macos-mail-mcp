import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", async (original) => ({
  ...await original<typeof import("../../../src/bridge/applescript-runner.js")>(),
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
  access: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue("/tmp/mail-mcp-att-abc123"),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";
import { mkdir, mkdtemp } from "node:fs/promises";
import { registerMessagesTools } from "../../../src/domains/messages/messages.tools.js";
import { captureTools, payload, type RegisteredTool } from "../../helpers/capture-tools.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

const ID = { messageId: 1, mailboxName: "INBOX", accountName: "Google" };

const TOOLS = [
  {
    name: "list_messages",
    args: { accountName: "Google", mailboxName: "INBOX", limit: 25, offset: 0 },
    script: "messages/scripts/list-messages.applescript",
  },
  {
    name: "get_message",
    args: { messageId: 1, accountName: "Google", mailboxName: "INBOX" },
    script: "messages/scripts/get-message.applescript",
  },
  {
    name: "search_messages",
    args: { field: "subject", query: "invoice", limit: 50, accountName: "Google", mailboxName: "INBOX" },
    script: "messages/scripts/search-messages.applescript",
  },
  {
    name: "move_message",
    args: { ...ID, toMailbox: "Archive" },
    script: "messages/scripts/move-message.applescript",
  },
  {
    name: "move_messages",
    args: {
      accountName: "Google",
      mailboxName: "INBOX",
      messageIds: [1, 2],
      toMailbox: "Archive",
    },
    script: "messages/scripts/move-messages.applescript",
  },
  {
    name: "delete_message",
    args: ID,
    script: "messages/scripts/delete-message.applescript",
  },
  {
    name: "flag_message",
    args: { ...ID, flagged: true, flagIndex: -1 },
    script: "messages/scripts/flag-message.applescript",
  },
  {
    name: "mark_read",
    args: { ...ID, read: true },
    script: "messages/scripts/mark-read.applescript",
  },
  {
    name: "list_attachments",
    args: ID,
    script: "messages/scripts/list-attachments.applescript",
  },
  {
    name: "save_attachment",
    args: { ...ID, attachmentName: "a.pdf", savePath: "~/Downloads" },
    script: "messages/scripts/save-attachment.applescript",
  },
  {
    name: "save_all_attachments",
    args: { ...ID, savePath: "~/Downloads" },
    script: "messages/scripts/save-all-attachments.applescript",
  },
  {
    name: "read_attachment",
    args: { ...ID, attachmentName: "a.txt" },
    script: "messages/scripts/read-attachment.applescript",
  },
] as const;

describe("messages tool registration", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAppleScript.mockImplementation(async (script) => script.includes("get-mailbox-info") ? { messageCount: 10 } : script.includes("search-messages") ? [] : { ok: true });
    tools = captureTools(registerMessagesTools);
  });

  it("registers all twelve message and attachment tools", () => {
    expect([...tools.keys()].sort()).toEqual([...TOOLS.map((t) => t.name)].sort());
  });

  describe.each(TOOLS)("$name", ({ name, args, script }) => {
    it("returns the handler result as JSON content", async () => {
      const result = await tools.get(name)!.handler({ ...args });
      if (name === "search_messages") expect(payload(result)).toMatchObject({ messages: [], partial: false });
      else expect(payload(result)).toEqual({ ok: true });
      expect(result.isError).toBeUndefined();
    });

    it("invokes its AppleScript template", async () => {
      await tools.get(name)!.handler({ ...args });
      // Arity varies — the slower tools pass a third timeout argument.
      expect(mockRunAppleScript.mock.calls.map((call) => call[0])).toContain(script);
    });

    it("reports bridge failures through the tool contract", async () => {
      mockRunAppleScript.mockRejectedValue(new Error("Mail.app is not running"));
      const result = await tools.get(name)!.handler({ ...args });
      if (name === "search_messages") {
        expect(payload(result)).toMatchObject({ partial: true, errors: [{ message: "Mail.app is not running" }] });
        expect(result.isError).toBeUndefined();
      } else {
        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toMatch(/Mail\.app is not running/);
      }
    });

    it("has a non-empty description", () => {
      expect(tools.get(name)!.description.length).toBeGreaterThan(0);
    });
  });

  describe("get_message without a mailboxName", () => {
    it("falls back to the by-id lookup script", async () => {
      await tools.get("get_message")!.handler({ messageId: 1, accountName: "Google" });
      expect(mockRunAppleScript.mock.calls.map((call) => call[0])).toContain(
        "messages/scripts/get-message-by-id.applescript"
      );
    });
  });

  describe.each([
    ["list_messages", { accountName: "Google", mailboxName: "INBOX", limit: 50, offset: 0 }],
    ["get_message", { messageId: 1, accountName: "Google", mailboxName: "INBOX" }],
    ["get_message", { messageId: 1, accountName: "Google" }],
    ["search_messages", { field: "subject", query: "fixture", accountName: "Google", mailboxName: "INBOX", allowSlow: true }],
  ])("UTC dateReceived through registered %s", (name, args) => {
    it("preserves the UTC instant in the result", async () => {
      const message = { id: 1, subject: "fixture", sender: "fixture@example.invalid", dateReceived: "2026-11-01T06:30:00Z", readStatus: false, flagged: false, flagIndex: -1, hasAttachments: false, accountName: "Google", mailboxName: "INBOX" };
      mockRunAppleScript.mockResolvedValueOnce(name === "get_message" ? message : [message]);
      const result = await tools.get(name)!.handler(args);
      const value = payload(result) as { dateReceived?: string; messages?: Array<{ dateReceived: string }> } | Array<{ dateReceived: string }>;
      const timestamp = Array.isArray(value) ? value[0]!.dateReceived : name === "search_messages" ? value.messages![0]!.dateReceived : value.dateReceived;
      expect(timestamp).toBe(message.dateReceived);
      expect(result.isError).toBeUndefined();
    });

    it("propagates an invalid-date failure instead of returning an invented timestamp", async () => {
      mockRunAppleScript.mockRejectedValueOnce(new Error("Expected a Mail date for dateReceived."));
      const result = await tools.get(name)!.handler(args);
      if (name === "search_messages") expect(payload(result)).toMatchObject({ partial: true, errors: [{ message: "Expected a Mail date for dateReceived." }] });
      else expect(result.isError).toBe(true);
    });
  });

  describe.each(["INBOX", undefined])("get_message recipients with mailbox %s", (mailboxName) => {
    it("preserves normalized recipient names and addresses through MCP", async () => {
      const response = { toRecipients: [{ name: "", address: "to@example.invalid" }], ccRecipients: [], bccRecipients: [] };
      mockRunAppleScript.mockResolvedValueOnce(response);
      const result = await tools.get("get_message")!.handler({ messageId: 1, accountName: "Google", mailboxName });
      expect(payload(result)).toEqual(response);
      expect(result.isError).toBeUndefined();
    });

    it("propagates recipient property errors through MCP", async () => {
      mockRunAppleScript.mockRejectedValueOnce(new Error("recipient property unavailable"));
      const result = await tools.get("get_message")!.handler({ messageId: 1, accountName: "Google", mailboxName });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("recipient property unavailable");
    });
  });

  describe("read_attachment MIME handling", () => {
    it("reads calendar text through the unchanged public response", async () => {
      const expected = { name: 'calendar "quoted" \\ 😀.ics', content: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" };
      mockRunAppleScript.mockResolvedValueOnce(expected);
      const result = await tools.get("read_attachment")!.handler({ ...ID, attachmentName: expected.name });
      expect(result.isError).toBeUndefined();
      expect(payload(result)).toEqual(expected);
      expect(mockRunAppleScript).toHaveBeenCalledWith("messages/scripts/read-attachment.applescript", expect.objectContaining({ messageId: "1", accountName: "Google", mailboxName: "INBOX" }), { timeout: 120_000 });
    });

    it("propagates a binary MIME rejection with the reported type", async () => {
      mockRunAppleScript.mockRejectedValueOnce(new Error("Inline reading is not supported for MIME type image/png. Use save_attachment instead."));
      const result = await tools.get("read_attachment")!.handler({
        ...ID,
        attachmentName: "photo.png",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain("MIME type image/png");
      expect(result.content[0]!.text).toContain("save_attachment");
    });

    it("lets the script decide an extensionless attachment's MIME", async () => {
      mockRunAppleScript.mockResolvedValueOnce({ name: "README", content: "read me\n" });
      const result = await tools.get("read_attachment")!.handler({
        ...ID,
        attachmentName: "README",
      });
      expect(result.isError).toBeUndefined();
      expect(payload(result)).toEqual({ name: "README", content: "read me\n" });
    });

    it.each(["Attachment not found", "Attachment is not yet downloaded. Open the message in Mail.app first.", "UTF8 read failed", "save failed"])("propagates %s through MCP", async (message) => {
      mockRunAppleScript.mockRejectedValueOnce(new Error(message));
      const result = await tools.get("read_attachment")!.handler({ ...ID, attachmentName: "calendar.ics" });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain(message);
    });
  });

  it.each(["save_attachment", "save_all_attachments"])("%s reports path errors without contacting Mail", async (name) => {
    vi.mocked(mkdir).mockRejectedValueOnce(new Error("EACCES: create denied"));
    const result = await tools.get(name)!.handler({ ...ID, attachmentName: "file.txt", savePath: "/tmp/denied" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Cannot prepare savePath "/tmp/denied"');
    expect(result.content[0]!.text).toContain("create denied");
    expect(mockRunAppleScript).not.toHaveBeenCalled();
    expect(mkdtemp).not.toHaveBeenCalled();
  });

  it.each(TOOLS.filter(({ name }) => !["list_messages", "search_messages"].includes(name)))("$name preserves a canonical lookup error through MCP", async ({ name, args }) => {
    const message = 'Message 999999999 not found in account "Google", mailbox "INBOX".';
    mockRunAppleScript.mockRejectedValueOnce(new Error(message));
    const result = await tools.get(name)!.handler({ ...args });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe("Error: " + message);
  });

  describe("search_messages optional scoping", () => {
    it("refuses an unscoped search without explicit opt-in", async () => {
      const result = await tools.get("search_messages")!.handler({
        field: "sender",
        query: "bob@test.com",
        limit: 10,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/allowSlow/);
    });

    it("defaults the limit when none is supplied", async () => {
      await tools.get("search_messages")!.handler({ field: "subject", query: "x", accountName: "Google", mailboxName: "INBOX" });
      const params = mockRunAppleScript.mock.calls.find(([s]) =>
        String(s).includes("search-messages")
      )?.[1] as Record<string, string>;
      expect(params.limit).toBe("50");
    });

    it("rejects an unparseable date filter", async () => {
      const result = await tools.get("search_messages")!.handler({
        field: "subject",
        query: "x",
        limit: 10,
        after: "not-a-date",
        accountName: "Google", mailboxName: "INBOX",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/Invalid date: not-a-date/);
    });

    it("accepts date-filter-only searches", async () => {
      const result = await tools.get("search_messages")!.handler({
        field: "subject",
        query: "",
        limit: 10,
        after: "2026-01-01T00:00:00Z",
        accountName: "Google", mailboxName: "INBOX",
      });
      expect(result.isError).toBeUndefined();
    });
  });
});
