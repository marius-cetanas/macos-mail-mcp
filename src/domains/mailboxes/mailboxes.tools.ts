import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAppleScript } from "../../bridge/applescript-runner.js";
import { sanitize } from "../../utils.js";

export async function handleListMailboxes(
  accountName?: string
): Promise<unknown> {
  return runAppleScript("mailboxes/scripts/list-mailboxes.applescript", {
    accountName: accountName !== undefined ? sanitize(accountName) : "__ALL__",
  });
}

export async function handleGetMailboxInfo(
  accountName: string,
  mailboxName: string
): Promise<unknown> {
  return runAppleScript("mailboxes/scripts/get-mailbox-info.applescript", {
    accountName: sanitize(accountName),
    mailboxName: sanitize(mailboxName),
  });
}

export function registerMailboxesTools(server: McpServer): void {
  server.tool(
    "list_mailboxes",
    "List mailboxes in a Mail.app account, or all mailboxes across all accounts",
    {
      accountName: z
        .string()
        .optional()
        .describe("The name of the account to list mailboxes for; omit for all accounts"),
    },
    async ({ accountName }) => {
      try {
        const result = await handleListMailboxes(accountName);
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
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
    "get_mailbox_info",
    "Get detailed information about a specific mailbox in a Mail.app account",
    {
      accountName: z.string().describe("The name of the account that contains the mailbox"),
      mailboxName: z.string().describe("The name of the mailbox to retrieve"),
    },
    async ({ accountName, mailboxName }) => {
      try {
        const result = await handleGetMailboxInfo(accountName, mailboxName);
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
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
