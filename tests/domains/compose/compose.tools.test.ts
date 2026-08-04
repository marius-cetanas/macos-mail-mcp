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

  it("reply_to_message forwards a [Gmail]/* mailbox path unchanged", async () => {
    const { handleReplyToMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleReplyToMessage(123, "[Gmail]/All Mail", "Gmail", "Thanks!", false);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/reply-to-message.applescript",
      expect.objectContaining({ messageId: "123", mailboxName: "[Gmail]/All Mail", accountName: "Gmail" })
    );
  });

  it("forward_message forwards a [Gmail]/* mailbox path unchanged", async () => {
    const { handleForwardMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleForwardMessage(123, "[Gmail]/Sent Mail", "Gmail", "alice@test.com");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/forward-message.applescript",
      expect.objectContaining({ mailboxName: "[Gmail]/Sent Mail", accountName: "Gmail", to: "alice@test.com" })
    );
  });

  describe("sender selection", () => {
    const ACCOUNTS = [
      {
        name: "Google",
        type: "imap",
        enabled: true,
        fullName: "Marius Cetanas",
        emails: ["marius.cetanas@gmail.com"],
      },
      {
        name: "iCloud",
        type: "iCloud",
        enabled: true,
        fullName: "Marius Cetanas",
        emails: ["marius.cetanas@icloud.com"],
      },
    ];

    /** Route list-accounts to fixture data, everything else to a success result. */
    function routeAccounts(accounts: unknown = ACCOUNTS): void {
      mockRunAppleScript.mockImplementation(async (script: string) =>
        script.includes("list-accounts") ? accounts : { success: true }
      );
    }

    function composeCall(scriptFragment: string) {
      return mockRunAppleScript.mock.calls.find(([script]) =>
        String(script).includes(scriptFragment)
      );
    }

    describe("defaults to Mail's own account when fromAccount is omitted", () => {
      it("send_message passes the __NONE__ sentinel", async () => {
        const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleSendMessage("bob@test.com", "Hi", "Hello");
        expect(mockRunAppleScript).toHaveBeenCalledWith(
          "compose/scripts/send-message.applescript",
          expect.objectContaining({ sender: "__NONE__" })
        );
      });

      it("reply_to_message passes the __NONE__ sentinel", async () => {
        const { handleReplyToMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleReplyToMessage(123, "INBOX", "Gmail", "Thanks!", false);
        expect(mockRunAppleScript).toHaveBeenCalledWith(
          "compose/scripts/reply-to-message.applescript",
          expect.objectContaining({ sender: "__NONE__" })
        );
      });

      it("forward_message passes the __NONE__ sentinel", async () => {
        const { handleForwardMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleForwardMessage(123, "INBOX", "Gmail", "alice@test.com");
        expect(mockRunAppleScript).toHaveBeenCalledWith(
          "compose/scripts/forward-message.applescript",
          expect.objectContaining({ sender: "__NONE__" })
        );
      });

      it("does not consult list_accounts", async () => {
        routeAccounts();
        const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleSendMessage("bob@test.com", "Hi", "Hello");
        expect(composeCall("list-accounts")).toBeUndefined();
      });
    });

    describe("resolves fromAccount to a sender string", () => {
      beforeEach(() => routeAccounts());

      it("send_message resolves an account name", async () => {
        const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleSendMessage("bob@test.com", "Hi", "Hello", undefined, undefined, undefined, "Google");
        expect(composeCall("send-message")?.[1]).toMatchObject({
          sender: "Marius Cetanas <marius.cetanas@gmail.com>",
        });
      });

      it("send_message resolves an email address", async () => {
        const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleSendMessage(
          "bob@test.com", "Hi", "Hello", undefined, undefined, undefined,
          "marius.cetanas@icloud.com"
        );
        expect(composeCall("send-message")?.[1]).toMatchObject({
          sender: "Marius Cetanas <marius.cetanas@icloud.com>",
        });
      });

      it("send_message keeps other params intact alongside the sender", async () => {
        const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleSendMessage("bob@test.com", "Hi", "Hello", "cc@t.com", "bcc@t.com", undefined, "Google");
        expect(composeCall("send-message")?.[1]).toMatchObject({
          to: "bob@test.com",
          cc: "cc@t.com",
          bcc: "bcc@t.com",
          sender: "Marius Cetanas <marius.cetanas@gmail.com>",
        });
      });

      it("reply_to_message resolves the sender", async () => {
        const { handleReplyToMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleReplyToMessage(123, "INBOX", "Gmail", "Thanks!", true, "Google");
        expect(composeCall("reply-to-message")?.[1]).toMatchObject({
          sender: "Marius Cetanas <marius.cetanas@gmail.com>",
        });
      });

      it("reply_to_message sender is independent of the lookup accountName", async () => {
        const { handleReplyToMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleReplyToMessage(123, "INBOX", "iCloud", "Thanks!", false, "Google");
        expect(composeCall("reply-to-message")?.[1]).toMatchObject({
          accountName: "iCloud",
          sender: "Marius Cetanas <marius.cetanas@gmail.com>",
        });
      });

      it("forward_message resolves the sender", async () => {
        const { handleForwardMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleForwardMessage(123, "INBOX", "Gmail", "alice@test.com", undefined, "Google");
        expect(composeCall("forward-message")?.[1]).toMatchObject({
          sender: "Marius Cetanas <marius.cetanas@gmail.com>",
        });
      });

      it("forward_message resolves the sender when a body is supplied", async () => {
        const { handleForwardMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleForwardMessage(123, "INBOX", "Gmail", "alice@test.com", "FYI", "Google");
        expect(composeCall("forward-message")?.[1]).toMatchObject({
          bodyFile: expect.stringMatching(/^\//),
          sender: "Marius Cetanas <marius.cetanas@gmail.com>",
        });
      });

      it("strips newlines that would break the AppleScript string literal", async () => {
        routeAccounts([
          { name: "Odd", type: "imap", enabled: true, fullName: "Marius\nCetanas", emails: ["m@x.com"] },
        ]);
        const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await handleSendMessage("bob@test.com", "Hi", "Hello", undefined, undefined, undefined, "Odd");
        expect(composeCall("send-message")?.[1]).toMatchObject({
          sender: "Marius Cetanas <m@x.com>",
        });
      });
    });

    describe("rejects an unresolvable fromAccount", () => {
      beforeEach(() => routeAccounts());

      it("send_message throws instead of falling back", async () => {
        const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await expect(
          handleSendMessage("bob@test.com", "Hi", "Hello", undefined, undefined, undefined, "typo@x.com")
        ).rejects.toThrow(/does not match any enabled Mail account/);
      });

      it("send_message never reaches the compose script", async () => {
        const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await expect(
          handleSendMessage("bob@test.com", "Hi", "Hello", undefined, undefined, undefined, "typo@x.com")
        ).rejects.toThrow();
        expect(composeCall("send-message")).toBeUndefined();
      });

      it("send_message leaves no temp directory behind", async () => {
        const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await expect(
          handleSendMessage("bob@test.com", "Hi", "Hello", undefined, undefined, undefined, "typo@x.com")
        ).rejects.toThrow();
        expect(mockMkdtemp).not.toHaveBeenCalled();
      });

      it("reply_to_message throws and never reaches the compose script", async () => {
        const { handleReplyToMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await expect(
          handleReplyToMessage(123, "INBOX", "Gmail", "Thanks!", false, "typo@x.com")
        ).rejects.toThrow();
        expect(composeCall("reply-to-message")).toBeUndefined();
        expect(mockMkdtemp).not.toHaveBeenCalled();
      });

      it("forward_message throws and never reaches the compose script", async () => {
        const { handleForwardMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await expect(
          handleForwardMessage(123, "INBOX", "Gmail", "alice@test.com", "FYI", "typo@x.com")
        ).rejects.toThrow();
        expect(composeCall("forward-message")).toBeUndefined();
        expect(mockMkdtemp).not.toHaveBeenCalled();
      });

      it("rejects a disabled account", async () => {
        routeAccounts([
          { name: "Off", type: "imap", enabled: false, fullName: "M", emails: ["off@x.com"] },
        ]);
        const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await expect(
          handleSendMessage("bob@test.com", "Hi", "Hello", undefined, undefined, undefined, "off@x.com")
        ).rejects.toThrow(/does not match any enabled Mail account/);
      });

      it("propagates a failure to read the account list", async () => {
        mockRunAppleScript.mockRejectedValue(new Error("Mail is not running"));
        const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
        await expect(
          handleSendMessage("bob@test.com", "Hi", "Hello", undefined, undefined, undefined, "Google")
        ).rejects.toThrow(/Mail is not running/);
      });
    });
  });
});
