import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runAppleScript } from "../../bridge/applescript-runner.js";

export async function handleSendMessage(
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
  attachmentPaths?: string[]
): Promise<unknown> {
  return runAppleScript("compose/scripts/send-message.applescript", {
    to: String(to),
    subject: String(subject),
    body: String(body),
    cc: cc !== undefined ? String(cc) : "__NONE__",
    bcc: bcc !== undefined ? String(bcc) : "__NONE__",
    attachmentPaths:
      attachmentPaths !== undefined ? attachmentPaths.join(",") : "__NONE__",
  });
}

export async function handleReplyToMessage(
  messageId: number,
  mailboxName: string,
  accountName: string,
  body: string,
  replyAll: boolean
): Promise<unknown> {
  return runAppleScript("compose/scripts/reply-to-message.applescript", {
    messageId: String(messageId),
    mailboxName: String(mailboxName),
    accountName: String(accountName),
    body: String(body),
    replyAll: String(replyAll),
  });
}

export async function handleForwardMessage(
  messageId: number,
  mailboxName: string,
  accountName: string,
  to: string,
  body?: string
): Promise<unknown> {
  return runAppleScript("compose/scripts/forward-message.applescript", {
    messageId: String(messageId),
    mailboxName: String(mailboxName),
    accountName: String(accountName),
    to: String(to),
    body: body !== undefined ? String(body) : "__NONE__",
  });
}

export function registerComposeTools(server: McpServer): void {
  server.tool(
    "send_message",
    "Compose and send a new email message as plain text.",
    {
      to: z.string().describe("The recipient email address"),
      subject: z.string().describe("The subject of the email"),
      body: z.string().describe("The plain text body of the email"),
      cc: z.string().optional().describe("CC recipient email address (optional)"),
      bcc: z.string().optional().describe("BCC recipient email address (optional)"),
      attachmentPaths: z
        .array(z.string())
        .optional()
        .describe("List of absolute file paths to attach (optional)"),
    },
    async ({ to, subject, body, cc, bcc, attachmentPaths }) => {
      try {
        const result = await handleSendMessage(
          to,
          subject,
          body,
          cc,
          bcc,
          attachmentPaths
        );
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
    "reply_to_message",
    "Reply to an existing email message. Does not support attachments (Mail.app limitation).",
    {
      messageId: z.number().int().describe("The numeric ID of the message to reply to"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z.string().describe("The name of the account containing the mailbox"),
      body: z.string().describe("The reply body text"),
      replyAll: z
        .boolean()
        .describe("Whether to reply to all recipients (true) or just the sender (false)"),
    },
    async ({ messageId, mailboxName, accountName, body, replyAll }) => {
      try {
        const result = await handleReplyToMessage(
          messageId,
          mailboxName,
          accountName,
          body,
          replyAll
        );
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
    "forward_message",
    "Forward an existing email message to a new recipient. Does not support adding new attachments (Mail.app limitation).",
    {
      messageId: z.number().int().describe("The numeric ID of the message to forward"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z.string().describe("The name of the account containing the mailbox"),
      to: z.string().describe("The recipient email address to forward to"),
      body: z
        .string()
        .optional()
        .describe("Optional text to prepend to the forwarded message body"),
    },
    async ({ messageId, mailboxName, accountName, to, body }) => {
      try {
        const result = await handleForwardMessage(
          messageId,
          mailboxName,
          accountName,
          to,
          body
        );
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
