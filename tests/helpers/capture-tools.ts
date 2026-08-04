// Test helper: drive the real registerXxxTools() functions without a live MCP server.
export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: true;
}

export interface RegisteredTool {
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Run a domain's registration function against a stub server and return what it
 * registered, so the tool handlers themselves — not just the underlying
 * handleXxx functions — can be exercised.
 */
export function captureTools(
  register: (server: never) => void
): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    tool: (
      name: string,
      description: string,
      schema: Record<string, unknown>,
      handler: RegisteredTool["handler"]
    ) => {
      tools.set(name, { description, schema, handler });
    },
  };
  register(server as never);
  return tools;
}

/** Parse the JSON payload an MCP tool handler returns. */
export function payload(result: ToolResult): unknown {
  return JSON.parse(result.content[0]!.text);
}
