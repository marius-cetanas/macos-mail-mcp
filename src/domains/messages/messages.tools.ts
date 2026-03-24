import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAppleScript } from "../../bridge/applescript-runner.js";

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
}
