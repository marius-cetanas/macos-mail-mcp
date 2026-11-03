import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { tmpdir } from "node:os";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { runAppleScript, EXTENDED_TIMEOUT } from "../../bridge/applescript-runner.js";
import { sanitize, toolError } from "../../utils.js";
import { searchInputSchema, searchMessages } from "./search-controller.js";
import { prepareSaveDirectory } from "./save-directory.js";

export async function handleListMessages(
  accountName: string,
  mailboxName: string,
  limit: number,
  offset: number,
  after?: string,
  before?: string
): Promise<unknown> {
  const hasDateFilter = after !== undefined || before !== undefined;
  return runAppleScript(
    "messages/scripts/list-messages.applescript",
    {
      accountName: sanitize(String(accountName)),
      mailboxName: sanitize(String(mailboxName)),
      limit: String(limit),
      offset: String(offset),
      hasDateFilter: hasDateFilter ? "true" : "false",
      afterSeconds: after !== undefined ? String(dateToSecondsFromNow(after)) : "0",
      beforeSeconds: before !== undefined ? String(dateToSecondsFromNow(before)) : "0",
    },
    { utcDates: true, ...(hasDateFilter ? { timeout: EXTENDED_TIMEOUT } : {}) }
  );
}

export async function handleGetMessage(
  messageId: number,
  accountName: string,
  mailboxName?: string
): Promise<unknown> {
  if (mailboxName !== undefined) {
    return runAppleScript("messages/scripts/get-message.applescript", {
      messageId: String(messageId),
      mailboxName: sanitize(String(mailboxName)),
      accountName: sanitize(String(accountName)),
    }, { utcDates: true });
  }
  return runAppleScript(
    "messages/scripts/get-message-by-id.applescript",
    {
      messageId: String(messageId),
      accountName: sanitize(String(accountName)),
    },
    { timeout: EXTENDED_TIMEOUT, utcDates: true }
  );
}

function dateToSecondsFromNow(isoDate: string): number {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${isoDate}`);
  return Math.floor((Date.now() - d.getTime()) / 1000);
}

export async function handleSearchMessages(
  field: string,
  query: string,
  mailboxName?: string,
  accountName?: string,
  limit?: number,
  after?: string,
  before?: string,
  allowSlow?: boolean,
  signal?: AbortSignal
): Promise<unknown> {
  return searchMessages({ field, query, mailboxName, accountName, limit, after, before, allowSlow }, signal);
}

export async function handleMoveMessage(
  messageId: number,
  mailboxName: string,
  toMailbox: string,
  accountName: string
): Promise<unknown> {
  return runAppleScript("messages/scripts/move-message.applescript", {
    messageId: String(messageId),
    mailboxName: sanitize(String(mailboxName)),
    toMailbox: sanitize(String(toMailbox)),
    accountName: sanitize(String(accountName)),
  });
}

export async function handleMoveMessages(
  accountName: string,
  mailboxName: string,
  messageIds: number[],
  toMailbox: string
): Promise<unknown> {
  return runAppleScript(
    "messages/scripts/move-messages.applescript",
    {
      accountName: sanitize(String(accountName)),
      mailboxName: sanitize(String(mailboxName)),
      toMailbox: sanitize(String(toMailbox)),
      messageIds: messageIds.join(","),
    },
    { timeout: EXTENDED_TIMEOUT }
  );
}

export async function handleDeleteMessage(
  messageId: number,
  mailboxName: string,
  accountName: string
): Promise<unknown> {
  return runAppleScript("messages/scripts/delete-message.applescript", {
    messageId: String(messageId),
    mailboxName: sanitize(String(mailboxName)),
    accountName: sanitize(String(accountName)),
  });
}

export async function handleFlagMessage(
  messageId: number,
  mailboxName: string,
  accountName: string,
  flagged: boolean,
  flagIndex: number = -1
): Promise<unknown> {
  return runAppleScript("messages/scripts/flag-message.applescript", {
    messageId: String(messageId),
    mailboxName: sanitize(String(mailboxName)),
    accountName: sanitize(String(accountName)),
    flagged: String(flagged),
    flagIndex: String(flagIndex),
  });
}

export async function handleMarkRead(
  messageId: number,
  mailboxName: string,
  accountName: string,
  read: boolean
): Promise<unknown> {
  return runAppleScript("messages/scripts/mark-read.applescript", {
    messageId: String(messageId),
    mailboxName: sanitize(String(mailboxName)),
    accountName: sanitize(String(accountName)),
    read: String(read),
  });
}

export async function handleListAttachments(
  messageId: number,
  mailboxName: string,
  accountName: string
): Promise<unknown> {
  return runAppleScript("messages/scripts/list-attachments.applescript", {
    messageId: String(messageId),
    mailboxName: sanitize(String(mailboxName)),
    accountName: sanitize(String(accountName)),
  });
}

export async function handleSaveAttachment(
  messageId: number,
  mailboxName: string,
  accountName: string,
  attachmentName: string,
  savePath: string
): Promise<unknown> {
  const preparedPath = await prepareSaveDirectory(String(savePath));
  const tempDir = await mkdtemp(join(tmpdir(), "mail-mcp-att-"));
  try {
    // Write attachment name to temp file to avoid AppleScript string escaping issues
    const attNameFile = join(tempDir, "attname.txt");
    await writeFile(attNameFile, attachmentName, "utf8");
    return await runAppleScript(
      "messages/scripts/save-attachment.applescript",
      {
        messageId: String(messageId),
        mailboxName: sanitize(String(mailboxName)),
        accountName: sanitize(String(accountName)),
        attNameFile,
        savePath: preparedPath,
      },
      { timeout: EXTENDED_TIMEOUT }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function handleSaveAllAttachments(
  messageId: number,
  mailboxName: string,
  accountName: string,
  savePath: string
): Promise<unknown> {
  const preparedPath = await prepareSaveDirectory(String(savePath));
  return runAppleScript(
    "messages/scripts/save-all-attachments.applescript",
    {
      messageId: String(messageId),
      mailboxName: sanitize(String(mailboxName)),
      accountName: sanitize(String(accountName)),
      savePath: preparedPath,
    },
    { timeout: EXTENDED_TIMEOUT }
  );
}

export async function handleReadAttachment(
  messageId: number,
  mailboxName: string,
  accountName: string,
  attachmentName: string
): Promise<unknown> {
  const tempDir = await mkdtemp(join(tmpdir(), "mail-mcp-att-"));
  try {
    // Write attachment name to temp file to avoid AppleScript string escaping issues
    const attNameFile = join(tempDir, "attname.txt");
    await writeFile(attNameFile, attachmentName, "utf8");
    return await runAppleScript(
      "messages/scripts/read-attachment.applescript",
      {
        messageId: String(messageId),
        mailboxName: sanitize(String(mailboxName)),
        accountName: sanitize(String(accountName)),
        attNameFile,
      },
      { timeout: EXTENDED_TIMEOUT }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function registerMessagesTools(server: McpServer): void {
  server.tool(
    "list_messages",
    "List messages in a mailbox with pagination. Provide accountName and mailboxName to scope the listing.",
    {
      accountName: z.string().describe("The name of the account containing the mailbox"),
      mailboxName: z.string().describe("The name of the mailbox to list messages from"),
      limit: z.number().int().positive().default(25).describe("Maximum number of messages to return (default 25)"),
      offset: z.number().int().min(0).default(0).describe("Number of messages to skip for pagination (default 0)"),
      after: z.string().optional().describe("Only return messages received after this ISO 8601 date (e.g. 2024-01-15T00:00:00Z)"),
      before: z.string().optional().describe("Only return messages received before this ISO 8601 date (e.g. 2024-12-31T23:59:59Z)"),
    },
    async ({ accountName, mailboxName, limit, offset, after, before }) => {
      try {
        const result = await handleListMessages(accountName, mailboxName, limit, offset, after, before);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "get_message",
    "Get the full details of a single message by its ID, including body, headers, recipients, and attachments. If mailboxName is omitted, searches all mailboxes in the account (slower but useful when you don't know which mailbox the message is in).",
    {
      messageId: z.number().int().describe("The numeric ID of the message"),
      accountName: z.string().describe("The name of the account containing the message"),
      mailboxName: z.string().optional().describe("The name of the mailbox containing the message (omit to search all mailboxes in the account)"),
    },
    async ({ messageId, accountName, mailboxName }) => {
      try {
        const result = await handleGetMessage(messageId, accountName, mailboxName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "search_messages",
    "Search one mailbox safely by default. Broad, content or large-mailbox searches require explicit allowSlow. Returns an object with messages and partial/timeout/skipped/error metadata within a 45 second server budget. Mail's queued Apple events can outlive process cancellation; wait or restart Mail after a timeout.",
    searchInputSchema.shape,
    async ({ field, query, mailboxName, accountName, limit, after, before, allowSlow }, extra) => {
      try {
        const result = await handleSearchMessages(field, query, mailboxName, accountName, limit, after, before, allowSlow, extra?.signal);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "move_message",
    "Move a message to a different mailbox. Gmail uses labels rather than folders. Moving a message adds the destination label but may not remove the original.",
    {
      messageId: z.number().int().describe("The numeric ID of the message"),
      mailboxName: z.string().describe("The name of the mailbox currently containing the message"),
      toMailbox: z.string().describe("The name of the destination mailbox"),
      accountName: z.string().describe("The name of the account containing the mailboxes"),
    },
    async ({ messageId, mailboxName, toMailbox, accountName }) => {
      try {
        const result = await handleMoveMessage(messageId, mailboxName, toMailbox, accountName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "move_messages",
    "Move multiple messages to a different mailbox in a single operation. More efficient than calling move_message multiple times.",
    {
      accountName: z.string().describe("The name of the account containing the mailboxes"),
      mailboxName: z.string().describe("The name of the mailbox currently containing the messages"),
      messageIds: z.array(z.number().int()).min(1).describe("Array of numeric message IDs to move"),
      toMailbox: z.string().describe("The name of the destination mailbox"),
    },
    async ({ accountName, mailboxName, messageIds, toMailbox }) => {
      try {
        const result = await handleMoveMessages(accountName, mailboxName, messageIds, toMailbox);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "delete_message",
    "Delete a message. Uses Mail's delete verb which routes to the correct Trash.",
    {
      messageId: z.number().int().describe("The numeric ID of the message"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z.string().describe("The name of the account containing the mailbox"),
    },
    async ({ messageId, mailboxName, accountName }) => {
      try {
        const result = await handleDeleteMessage(messageId, mailboxName, accountName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "flag_message",
    "Set or clear the flag on a message. Optionally specify a flag colour index.",
    {
      messageId: z.number().int().describe("The numeric ID of the message"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z.string().describe("The name of the account containing the mailbox"),
      flagged: z.boolean().describe("Whether to flag (true) or unflag (false) the message"),
      flagIndex: z.number().int().default(-1).describe("The flag colour index (optional, default -1)"),
    },
    async ({ messageId, mailboxName, accountName, flagged, flagIndex }) => {
      try {
        const result = await handleFlagMessage(messageId, mailboxName, accountName, flagged, flagIndex);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "mark_read",
    "Mark a message as read or unread.",
    {
      messageId: z.number().int().describe("The numeric ID of the message"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z.string().describe("The name of the account containing the mailbox"),
      read: z.boolean().describe("Whether to mark the message as read (true) or unread (false)"),
    },
    async ({ messageId, mailboxName, accountName, read }) => {
      try {
        const result = await handleMarkRead(messageId, mailboxName, accountName, read);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "list_attachments",
    "List all attachments for a message, including their name, MIME type, file size, and download status.",
    {
      messageId: z.number().int().describe("The numeric ID of the message"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z.string().describe("The name of the account containing the mailbox"),
    },
    async ({ messageId, mailboxName, accountName }) => {
      try {
        const result = await handleListAttachments(messageId, mailboxName, accountName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "save_attachment",
    "Save a specific attachment from a message to disk. Creates the destination directory recursively before contacting Mail.",
    {
      messageId: z.number().int().describe("The numeric ID of the message"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z.string().describe("The name of the account containing the mailbox"),
      attachmentName: z.string().describe("The name of the attachment to save"),
      savePath: z.string().default("~/Downloads").describe("The directory path to save the attachment to (default ~/Downloads)"),
    },
    async ({ messageId, mailboxName, accountName, attachmentName, savePath }) => {
      try {
        const result = await handleSaveAttachment(messageId, mailboxName, accountName, attachmentName, savePath);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "save_all_attachments",
    "Save all downloaded attachments from a message to disk. Creates the destination directory recursively before contacting Mail.",
    {
      messageId: z.number().int().describe("The numeric ID of the message"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z.string().describe("The name of the account containing the mailbox"),
      savePath: z.string().default("~/Downloads").describe("The directory path to save the attachments to (default ~/Downloads)"),
    },
    async ({ messageId, mailboxName, accountName, savePath }) => {
      try {
        const result = await handleSaveAllAttachments(messageId, mailboxName, accountName, savePath);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "read_attachment",
    "Read valid UTF-8 attachment text inline. Accepts text/*, application/json, application/xml, application/x-yaml MIME types or .txt, .csv, .json, .html, .md, .xml, .log extensions. Uses extension-based MIME fallback when unavailable. Use save_attachment for binary files.",
    {
      messageId: z.number().int().describe("The numeric ID of the message"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z.string().describe("The name of the account containing the mailbox"),
      attachmentName: z.string().describe("The name of the attachment to read"),
    },
    async ({ messageId, mailboxName, accountName, attachmentName }) => {
      try {
        const result = await handleReadAttachment(messageId, mailboxName, accountName, attachmentName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );
}
