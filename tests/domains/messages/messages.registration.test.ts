import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdtemp: vi.fn().mockResolvedValue("/tmp/mail-mcp-att-abc123"),
  rm: vi.fn().mockResolvedValue(undefined),
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";
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
    args: { field: "subject", query: "invoice", limit: 50 },
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
    mockRunAppleScript.mockResolvedValue({ ok: true });
    tools = captureTools(registerMessagesTools);
  });

  it("registers all twelve message and attachment tools", () => {
    expect([...tools.keys()].sort()).toEqual([...TOOLS.map((t) => t.name)].sort());
  });

  describe.each(TOOLS)("$name", ({ name, args, script }) => {
    it("returns the handler result as JSON content", async () => {
      const result = await tools.get(name)!.handler({ ...args });
      expect(payload(result)).toEqual({ ok: true });
      expect(result.isError).toBeUndefined();
    });

    it("invokes its AppleScript template", async () => {
      await tools.get(name)!.handler({ ...args });
      // Arity varies — the slower tools pass a third timeout argument.
      expect(mockRunAppleScript.mock.calls.map((call) => call[0])).toContain(script);
    });

    it("surfaces a failure as an MCP error", async () => {
      mockRunAppleScript.mockRejectedValue(new Error("Mail.app is not running"));
      const result = await tools.get(name)!.handler({ ...args });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/Mail\.app is not running/);
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

  describe("read_attachment extension handling", () => {
    it("refuses a binary extension", async () => {
      const result = await tools.get("read_attachment")!.handler({
        ...ID,
        attachmentName: "photo.png",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/Binary file type not supported/);
    });

    it("refuses a name with no extension at all", async () => {
      const result = await tools.get("read_attachment")!.handler({
        ...ID,
        attachmentName: "README",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/Binary file type not supported/);
    });
  });

  describe("search_messages optional scoping", () => {
    it("accepts a search with neither mailbox nor account", async () => {
      const result = await tools.get("search_messages")!.handler({
        field: "sender",
        query: "bob@test.com",
        limit: 10,
      });
      expect(result.isError).toBeUndefined();
    });

    it("defaults the limit when none is supplied", async () => {
      await tools.get("search_messages")!.handler({ field: "subject", query: "x" });
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
      });
      expect(result.isError).toBeUndefined();
    });
  });
});
