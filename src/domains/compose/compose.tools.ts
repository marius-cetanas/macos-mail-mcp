import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runAppleScript } from "../../bridge/applescript-runner.js";
import { sanitize, toolError } from "../../utils.js";
import { NO_SENDER, resolveSender } from "./sender.js";

/**
 * Resolve an optional caller-supplied account into the sentinel or sender string
 * the AppleScript templates expect. Runs before any temp-file setup so a bad
 * value fails without leaving a directory behind.
 */
async function senderParam(fromAccount?: string): Promise<string> {
  if (fromAccount === undefined) {
    return NO_SENDER;
  }
  return sanitize(await resolveSender(fromAccount));
}

export async function handleSendMessage(
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
  attachmentPaths?: string[],
  fromAccount?: string
): Promise<unknown> {
  const sender = await senderParam(fromAccount);
  const tempDir = await mkdtemp(join(tmpdir(), "mail-mcp-body-"));
  try {
    // Write body to temp file so AppleScript can read it with proper newlines
    const bodyFile = join(tempDir, "body.txt");
    await writeFile(bodyFile, body, "utf8");
    // Write attachment paths to temp file (one per line) to avoid multi-line AppleScript string
    let attachmentPathsFile = "__NONE__";
    if (attachmentPaths !== undefined && attachmentPaths.length > 0) {
      attachmentPathsFile = join(tempDir, "attachments.txt");
      await writeFile(attachmentPathsFile, attachmentPaths.join("\n"), "utf8");
    }
    return await runAppleScript("compose/scripts/send-message.applescript", {
      to: sanitize(String(to)),
      subject: sanitize(String(subject)),
      bodyFile,
      cc: cc !== undefined ? sanitize(String(cc)) : "__NONE__",
      bcc: bcc !== undefined ? sanitize(String(bcc)) : "__NONE__",
      attachmentPathsFile,
      sender,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function handleReplyToMessage(
  messageId: number,
  mailboxName: string,
  accountName: string,
  body: string,
  replyAll: boolean,
  fromAccount?: string
): Promise<unknown> {
  const sender = await senderParam(fromAccount);
  const tempDir = await mkdtemp(join(tmpdir(), "mail-mcp-body-"));
  try {
    const bodyFile = join(tempDir, "body.txt");
    await writeFile(bodyFile, body, "utf8");
    return await runAppleScript("compose/scripts/reply-to-message.applescript", {
      messageId: String(messageId),
      mailboxName: sanitize(String(mailboxName)),
      accountName: sanitize(String(accountName)),
      bodyFile,
      replyAll: String(replyAll),
      sender,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function handleForwardMessage(
  messageId: number,
  mailboxName: string,
  accountName: string,
  to: string,
  body?: string,
  fromAccount?: string
): Promise<unknown> {
  const sender = await senderParam(fromAccount);
  let tempDir: string | undefined;
  if (body !== undefined) {
    tempDir = await mkdtemp(join(tmpdir(), "mail-mcp-body-"));
  }
  try {
    let bodyFile = "__NONE__";
    if (body !== undefined && tempDir !== undefined) {
      bodyFile = join(tempDir, "body.txt");
      await writeFile(bodyFile, body, "utf8");
    }
    return await runAppleScript("compose/scripts/forward-message.applescript", {
      messageId: String(messageId),
      mailboxName: sanitize(String(mailboxName)),
      accountName: sanitize(String(accountName)),
      to: sanitize(String(to)),
      bodyFile,
      sender,
    });
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

const FROM_ACCOUNT_DESC =
  'Account to send from — a Mail account name ("Google") or one of its addresses ' +
  '("you@gmail.com"), as reported by list_accounts. Matching is case-insensitive and ' +
  "an unrecognised value is an error, never a silent fallback. Omit to use Mail's " +
  "default sending account; either way the account used is returned as `sender`.";

export function registerComposeTools(server: McpServer): void {
  server.tool(
    "send_message",
    "Compose and send a new email message as plain text. Returns success when the message is queued for sending, along with the `sender` the message was sent from; actual delivery is not confirmed. Check Mail's Sent or Outbox mailbox to verify delivery.",
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
      fromAccount: z.string().optional().describe(FROM_ACCOUNT_DESC),
    },
    async ({ to, subject, body, cc, bcc, attachmentPaths, fromAccount }) => {
      try {
        const result = await handleSendMessage(
          to,
          subject,
          body,
          cc,
          bcc,
          attachmentPaths,
          fromAccount
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "reply_to_message",
    "Reply to an existing email message. Returns the `sender` the reply was sent from. Does not support attachments (Mail.app limitation).",
    {
      messageId: z.number().int().describe("The numeric ID of the message to reply to"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z
        .string()
        .describe(
          "The name of the account containing the mailbox. This locates the source " +
            "message only — it does not control which account sends. Use fromAccount for that."
        ),
      body: z.string().describe("The reply body text"),
      replyAll: z
        .boolean()
        .describe("Whether to reply to all recipients (true) or just the sender (false)"),
      fromAccount: z.string().optional().describe(FROM_ACCOUNT_DESC),
    },
    async ({ messageId, mailboxName, accountName, body, replyAll, fromAccount }) => {
      try {
        const result = await handleReplyToMessage(
          messageId,
          mailboxName,
          accountName,
          body,
          replyAll,
          fromAccount
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );

  server.tool(
    "forward_message",
    "Forward an existing email message to a new recipient. Returns the `sender` the forward was sent from. Does not support adding new attachments (Mail.app limitation).",
    {
      messageId: z.number().int().describe("The numeric ID of the message to forward"),
      mailboxName: z.string().describe("The name of the mailbox containing the message"),
      accountName: z
        .string()
        .describe(
          "The name of the account containing the mailbox. This locates the source " +
            "message only — it does not control which account sends. Use fromAccount for that."
        ),
      to: z.string().describe("The recipient email address to forward to"),
      body: z
        .string()
        .optional()
        .describe("Optional text to prepend to the forwarded message body"),
      fromAccount: z.string().optional().describe(FROM_ACCOUNT_DESC),
    },
    async ({ messageId, mailboxName, accountName, to, body, fromAccount }) => {
      try {
        const result = await handleForwardMessage(
          messageId,
          mailboxName,
          accountName,
          to,
          body,
          fromAccount
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: unknown) {
        return toolError(error);
      }
    }
  );
}
