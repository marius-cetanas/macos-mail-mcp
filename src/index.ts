#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAccountsTools } from "./domains/accounts/accounts.tools.js";
import { registerMailboxesTools } from "./domains/mailboxes/mailboxes.tools.js";
import { registerMessagesTools } from "./domains/messages/messages.tools.js";
import { registerComposeTools } from "./domains/compose/compose.tools.js";

const server = new McpServer({
  name: "macos-mail-mcp",
  version: "1.0.0",
});

registerAccountsTools(server);
registerMailboxesTools(server);
registerMessagesTools(server);
registerComposeTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("macos-mail-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
