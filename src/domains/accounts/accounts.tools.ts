import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAppleScript } from "../../bridge/applescript-runner.js";
import { sanitize, toolError } from "../../utils.js";
import type { Account, AccountDetail } from "../../types.js";

export async function handleListAccounts(): Promise<unknown> {
  return runAppleScript("accounts/scripts/list-accounts.applescript", {});
}

export async function handleGetAccountDetail(
  accountName: string
): Promise<unknown> {
  return runAppleScript("accounts/scripts/get-account-detail.applescript", {
    accountName: sanitize(String(accountName)),
  });
}

export function registerAccountsTools(server: McpServer): void {
  server.tool(
    "list_accounts",
    "List all Mail.app accounts with their type, enabled status, and email addresses. Known types are canonicalized; other raw Mail type text is preserved, including backend-reported unknown.",
    {},
    async () => {
      try {
        const result = await handleListAccounts();
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "get_account_detail",
    "Get detailed information about a specific Mail.app account by name. Unavailable serverName, port and usesSsl values are null; account type preserves raw Mail values beyond known canonical types.",
    {
      accountName: z.string().describe("The name of the account to retrieve"),
    },
    async ({ accountName }) => {
      try {
        const result = await handleGetAccountDetail(accountName);
        return {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );
}
