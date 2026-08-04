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
import { registerComposeTools } from "../../../src/domains/compose/compose.tools.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

const ACCOUNTS = [
  {
    name: "Google",
    type: "imap",
    enabled: true,
    fullName: "Marius Cetanas",
    emails: ["marius.cetanas@gmail.com"],
  },
];

interface RegisteredTool {
  description: string;
  schema: Record<string, { isOptional(): boolean }>;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: true;
  }>;
}

/** Minimal stand-in for McpServer that captures what registerComposeTools registers. */
function captureTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    tool: (
      name: string,
      description: string,
      schema: RegisteredTool["schema"],
      handler: RegisteredTool["handler"]
    ) => {
      tools.set(name, { description, schema, handler });
    },
  };
  registerComposeTools(server as never);
  return tools;
}

/** Parse the JSON payload an MCP tool handler returns. */
function payload(result: { content: Array<{ text: string }> }): unknown {
  return JSON.parse(result.content[0]!.text);
}

describe("compose tool registration", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAppleScript.mockImplementation(async (script: string) =>
      script.includes("list-accounts")
        ? ACCOUNTS
        : { success: true, sender: "Marius Cetanas <marius.cetanas@gmail.com>" }
    );
    tools = captureTools();
  });

  it("registers all three compose tools", () => {
    expect([...tools.keys()].sort()).toEqual([
      "forward_message",
      "reply_to_message",
      "send_message",
    ]);
  });

  describe.each(["send_message", "reply_to_message", "forward_message"])(
    "%s",
    (toolName) => {
      it("exposes an optional fromAccount parameter", () => {
        const schema = tools.get(toolName)!.schema;
        expect(schema.fromAccount).toBeDefined();
        expect(schema.fromAccount!.isOptional()).toBe(true);
      });

      it("documents that the resolved sender is returned", () => {
        expect(tools.get(toolName)!.description).toMatch(/sender/i);
      });

      it("documents that an unknown fromAccount is an error, not a fallback", () => {
        const described = JSON.stringify(tools.get(toolName)!.schema.fromAccount);
        expect(described.length).toBeGreaterThan(0);
      });
    }
  );

  describe("reply_to_message and forward_message accountName", () => {
    it.each(["reply_to_message", "forward_message"])(
      "%s documents accountName as a lookup, not a sender selector",
      (toolName) => {
        const schema = tools.get(toolName)!.schema as unknown as Record<
          string,
          { description?: string }
        >;
        expect(schema.accountName!.description).toMatch(/does not control which account sends/);
      }
    );
  });

  describe("send_message handler", () => {
    it("returns the resolved sender in the result", async () => {
      const result = await tools.get("send_message")!.handler({
        to: "bob@test.com",
        subject: "Hi",
        body: "Hello",
        fromAccount: "Google",
      });
      expect(payload(result)).toMatchObject({
        success: true,
        sender: "Marius Cetanas <marius.cetanas@gmail.com>",
      });
      expect(result.isError).toBeUndefined();
    });

    it("reports the sender even when fromAccount was omitted", async () => {
      const result = await tools.get("send_message")!.handler({
        to: "bob@test.com",
        subject: "Hi",
        body: "Hello",
      });
      expect(payload(result)).toMatchObject({ sender: expect.any(String) });
    });

    it("forwards fromAccount down to the compose script", async () => {
      await tools.get("send_message")!.handler({
        to: "bob@test.com",
        subject: "Hi",
        body: "Hello",
        fromAccount: "marius.cetanas@gmail.com",
      });
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "compose/scripts/send-message.applescript",
        expect.objectContaining({ sender: "Marius Cetanas <marius.cetanas@gmail.com>" })
      );
    });

    it("returns an MCP error for an unknown fromAccount", async () => {
      const result = await tools.get("send_message")!.handler({
        to: "bob@test.com",
        subject: "Hi",
        body: "Hello",
        fromAccount: "typo@example.com",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/does not match any enabled Mail account/);
    });

    it("names the valid accounts in the error text", async () => {
      const result = await tools.get("send_message")!.handler({
        to: "bob@test.com",
        subject: "Hi",
        body: "Hello",
        fromAccount: "typo@example.com",
      });
      expect(result.content[0]!.text).toMatch(/Google/);
    });

    it("surfaces a compose failure as an MCP error", async () => {
      mockRunAppleScript.mockRejectedValue(new Error("Mail is not running"));
      const result = await tools.get("send_message")!.handler({
        to: "bob@test.com",
        subject: "Hi",
        body: "Hello",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/Mail is not running/);
    });
  });

  describe("reply_to_message handler", () => {
    const base = {
      messageId: 123,
      mailboxName: "INBOX",
      accountName: "Gmail",
      body: "Thanks!",
      replyAll: false,
    };

    it("returns the resolved sender", async () => {
      const result = await tools.get("reply_to_message")!.handler({
        ...base,
        fromAccount: "Google",
      });
      expect(payload(result)).toMatchObject({
        sender: "Marius Cetanas <marius.cetanas@gmail.com>",
      });
    });

    it("keeps the lookup account separate from the sender", async () => {
      await tools.get("reply_to_message")!.handler({ ...base, fromAccount: "Google" });
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "compose/scripts/reply-to-message.applescript",
        expect.objectContaining({
          accountName: "Gmail",
          sender: "Marius Cetanas <marius.cetanas@gmail.com>",
        })
      );
    });

    it("returns an MCP error for an unknown fromAccount", async () => {
      const result = await tools.get("reply_to_message")!.handler({
        ...base,
        fromAccount: "typo@example.com",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("forward_message handler", () => {
    const base = {
      messageId: 123,
      mailboxName: "INBOX",
      accountName: "Gmail",
      to: "alice@test.com",
    };

    it("returns the resolved sender", async () => {
      const result = await tools.get("forward_message")!.handler({
        ...base,
        fromAccount: "Google",
      });
      expect(payload(result)).toMatchObject({
        sender: "Marius Cetanas <marius.cetanas@gmail.com>",
      });
    });

    it("resolves the sender when a body is supplied", async () => {
      await tools.get("forward_message")!.handler({
        ...base,
        body: "FYI",
        fromAccount: "Google",
      });
      expect(mockRunAppleScript).toHaveBeenCalledWith(
        "compose/scripts/forward-message.applescript",
        expect.objectContaining({
          bodyFile: expect.stringMatching(/^\//),
          sender: "Marius Cetanas <marius.cetanas@gmail.com>",
        })
      );
    });

    it("returns an MCP error for an unknown fromAccount", async () => {
      const result = await tools.get("forward_message")!.handler({
        ...base,
        fromAccount: "typo@example.com",
      });
      expect(result.isError).toBe(true);
    });
  });
});
