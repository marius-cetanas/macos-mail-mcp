import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { homedir } from "node:os";
import { runAppleScript, EXTENDED_TIMEOUT } from "../../bridge/applescript-runner.js";

function expandTilde(p: string): string {
  if (p.startsWith("~/")) {
    return homedir() + p.slice(1);
  }
  return p;
}

export async function handleListMessages(
  accountName: string,
  mailboxName: string,
  limit: number,
  offset: number
): Promise<unknown> {
  return runAppleScript("messages/scripts/list-messages.applescript", {
    accountName: String(accountName),
    mailboxName: String(mailboxName),
    limit: String(limit),
    offset: String(offset),
  });
}

export async function handleGetMessage(
  messageId: number,
  mailboxName: string,
  accountName: string
): Promise<unknown> {
  return runAppleScript("messages/scripts/get-message.applescript", {
    messageId: String(messageId),
    mailboxName: String(mailboxName),
    accountName: String(accountName),
  });
}

export async function handleSearchMessages(
  field: string,
  query: string,
  mailboxName?: string,
  accountName?: string,
  limit?: number
): Promise<unknown> {
  return runAppleScript("messages/scripts/search-messages.applescript", {
    field: String(field),
    query: String(query),
    mailboxName: mailboxName !== undefined ? String(mailboxName) : "__ALL__",
    accountName: accountName !== undefined ? String(accountName) : "__ALL__",
    limit: limit !== undefined ? String(limit) : "50",
  });
}

export async function handleMoveMessage(
  messageId: number,
  mailboxName: string,
  toMailbox: string,
  accountName: string
): Promise<unknown> {
  return runAppleScript("messages/scripts/move-message.applescript", {
    messageId: String(messageId),
    mailboxName: String(mailboxName),
    toMailbox: String(toMailbox),
    accountName: String(accountName),
  });
}

export async function handleDeleteMessage(
  messageId: number,
  mailboxName: string,
  accountName: string
): Promise<unknown> {
  return runAppleScript("messages/scripts/delete-message.applescript", {
    messageId: String(messageId),
    mailboxName: String(mailboxName),
    accountName: String(accountName),
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
    mailboxName: String(mailboxName),
    accountName: String(accountName),
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
    mailboxName: String(mailboxName),
    accountName: String(accountName),
    read: String(read),
  });
}

const TEXT_EXTENSIONS = [".txt", ".csv", ".json", ".html", ".md", ".xml", ".log"];

export async function handleListAttachments(
  messageId: number,
  mailboxName: string,
  accountName: string
): Promise<unknown> {
  return runAppleScript("messages/scripts/list-attachments.applescript", {
    messageId: String(messageId),
    mailboxName: String(mailboxName),
    accountName: String(accountName),
  });
}

export async function handleSaveAttachment(
  messageId: number,
  mailboxName: string,
  accountName: string,
  attachmentName: string,
  savePath: string
): Promise<unknown> {
  return runAppleScript(
    "messages/scripts/save-attachment.applescript",
    {
      messageId: String(messageId),
      mailboxName: String(mailboxName),
      accountName: String(accountName),
      attachmentName: String(attachmentName),
      savePath: expandTilde(String(savePath)),
    },
    { timeout: EXTENDED_TIMEOUT }
  );
}

export async function handleSaveAllAttachments(
  messageId: number,
  mailboxName: string,
  accountName: string,
  savePath: string
): Promise<unknown> {
  return runAppleScript(
    "messages/scripts/save-all-attachments.applescript",
    {
      messageId: String(messageId),
      mailboxName: String(mailboxName),
      accountName: String(accountName),
      savePath: expandTilde(String(savePath)),
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
  const dotIndex = attachmentName.lastIndexOf(".");
  const ext = dotIndex >= 0 ? attachmentName.slice(dotIndex).toLowerCase() : "";
  if (!TEXT_EXTENSIONS.includes(ext)) {
    throw new Error(
      "Binary file type not supported for inline reading. Use save_attachment instead."
    );
  }
  return runAppleScript(
    "messages/scripts/read-attachment.applescript",
    {
      messageId: String(messageId),
      mailboxName: String(mailboxName),
      accountName: String(accountName),
      attachmentName: String(attachmentName),
    },
    { timeout: EXTENDED_TIMEOUT }
  );
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
    },
    async ({ accountName, mailboxName, limit, offset }) => {
      try {
        const result = await handleListMessages(accountName, mailboxName, limit, offset);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const err = error as Error;
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_message",
    "Get the full details of a single message by its ID, including body, headers, recipients, and attachments.",
    {
      messageId: z.number().int().describe("The numeric ID of the message"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z.string().describe("The name of the account containing the mailbox"),
    },
    async ({ messageId, mailboxName, accountName }) => {
      try {
        const result = await handleGetMessage(messageId, mailboxName, accountName);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const err = error as Error;
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "search_messages",
    "Search messages by subject, sender, or content. WARNING: searching by content on large mailboxes can be very slow and may time out. Narrow results with mailboxName or accountName when possible.",
    {
      field: z.enum(["subject", "sender", "content"]).describe("The field to search in"),
      query: z.string().describe("The search query string"),
      mailboxName: z.string().optional().describe("Limit search to a specific mailbox (omit to search all mailboxes)"),
      accountName: z.string().optional().describe("Limit search to a specific account (omit to search all accounts)"),
      limit: z.number().int().positive().default(50).describe("Maximum number of results to return (default 50)"),
    },
    async ({ field, query, mailboxName, accountName, limit }) => {
      try {
        const result = await handleSearchMessages(field, query, mailboxName, accountName, limit);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        const err = error as Error;
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true,
        };
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
        const err = error as Error;
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true,
        };
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
        const err = error as Error;
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true,
        };
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
        const err = error as Error;
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true,
        };
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
        const err = error as Error;
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true,
        };
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
        const err = error as Error;
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "save_attachment",
    "Save a specific attachment from a message to disk.",
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
        const err = error as Error;
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "save_all_attachments",
    "Save all downloaded attachments from a message to disk.",
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
        const err = error as Error;
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "read_attachment",
    "Read the text content of a text-based attachment inline. Supported types: .txt, .csv, .json, .html, .md, .xml, .log. Use save_attachment for binary files.",
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
        const err = error as Error;
        return {
          content: [{ type: "text", text: "Error: " + err.message }],
          isError: true,
        };
      }
    }
  );
}
