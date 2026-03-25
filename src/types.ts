export interface Account {
  name: string;
  type: "imap" | "pop" | "iCloud" | "unknown";
  enabled: boolean;
  emails: string[];
}

export interface AccountDetail extends Account {
  serverName: string;
  port: number;
  usesSsl: boolean;
  userName: string;
  mailboxCount: number;
}

export interface Mailbox {
  name: string;
  unreadCount: number;
  accountName: string;
}

export interface MailboxDetail extends Mailbox {
  messageCount: number;
  container: string | null;
}

export interface MessageSummary {
  id: number;
  subject: string;
  sender: string;
  dateReceived: string;
  readStatus: boolean;
  flagged: boolean;
  flagIndex: number;
  hasAttachments: boolean;
}

export interface MessageDetail extends MessageSummary {
  toRecipients: Recipient[];
  ccRecipients: Recipient[];
  bccRecipients: Recipient[];
  body: string;
  headers: string;
  attachments: Attachment[];
}

export interface Recipient {
  name: string;
  address: string;
}

export interface Attachment {
  name: string;
  mimeType: string;
  fileSize: number;
  downloaded: boolean;
}

export interface AppleScriptError {
  error: string;
  errorNumber: number;
}
