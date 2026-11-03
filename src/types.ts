export interface Account {
  name: string;
  /** Known types use canonical names; other Mail-reported type text is preserved. */
  type: string;
  enabled: boolean;
  /** Display name Mail sends as, e.g. "Marius Cetanas". Empty when Mail reports `missing value`. */
  fullName: string;
  emails: string[];
}

/** Server connection fields are null when unsupported or unavailable. */
export interface AccountDetail extends Account {
  serverName: string | null;
  port: number | null;
  usesSsl: boolean | null;
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

export interface SearchResult extends MessageSummary {
  mailboxName: string;
  accountName: string;
}

export interface SearchScope {
  accountName: string | null;
  mailboxName: string | null;
}

export interface SearchResponse {
  messages: SearchResult[];
  partial: boolean;
  cancelled: boolean;
  limitReached: boolean;
  timedOut: SearchScope[];
  skipped: Array<SearchScope & { reason: "timeout" | "cancelled" | "error" | "limit" }>;
  errors: Array<SearchScope & { message: string }>;
  warnings: string[];
}

export interface MessageDetail extends MessageSummary {
  mailboxName?: string;
  toRecipients: Recipient[];
  ccRecipients: Recipient[];
  bccRecipients: Recipient[];
  body: string;
  headers: string;
  attachments: Attachment[];
}

export interface Recipient {
  /** Empty when Mail reports a missing display name. */
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
