#!/usr/bin/env node
// macos-mail-mcp — MIT License — https://github.com/marius-cetanas/macos-mail-mcp
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAccountsTools } from "./domains/accounts/accounts.tools.js";
import { registerMailboxesTools } from "./domains/mailboxes/mailboxes.tools.js";
import { registerMessagesTools } from "./domains/messages/messages.tools.js";
import { registerComposeTools } from "./domains/compose/compose.tools.js";

// Read the version from package.json so the value reported over the MCP
// handshake can't drift from the published package. The compiled entry point
// lives at build/index.js — one level below the package root — so
// ../package.json resolves both in local dev and inside the installed tarball.
const { version } = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8"),
) as { version: string };

const server = new McpServer({
  name: "macos-mail-mcp",
  version,
});

registerAccountsTools(server);
registerMailboxesTools(server);
registerMessagesTools(server);
registerComposeTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`macos-mail-mcp v${version} running on stdio`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
