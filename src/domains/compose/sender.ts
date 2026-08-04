// macos-mail-mcp — MIT License — https://github.com/marius-cetanas/macos-mail-mcp
import { handleListAccounts } from "../accounts/accounts.tools.js";
import type { Account } from "../../types.js";

/** Sentinel the compose AppleScript templates read as "caller did not specify a sender". */
export const NO_SENDER = "__NONE__";

/**
 * Build the string Mail expects in an outgoing message's `sender` property.
 *
 * Mail matches this against the account's configured identity, so the full
 * `"Name <address>"` form is preferred. Accounts whose full name is unset fall
 * back to the bare address, which Mail still resolves.
 */
export function formatSender(fullName: string, address: string): string {
  const name = fullName.trim();
  return name === "" ? address : `${name} <${address}>`;
}

/**
 * Resolve a caller-supplied account name or email address to a sender string.
 *
 * Accepts either the Mail account name ("Google") or any address that account
 * owns ("someone@gmail.com"), matched case-insensitively, mirroring how
 * `list_accounts` reports them. Only enabled accounts are considered — Mail
 * cannot send from a disabled one.
 *
 * @throws when the value matches no enabled account, or matches several that
 * would resolve to different senders. Failing here is the point: the silent
 * fallback to Mail's default account is the bug this guards against.
 */
export async function resolveSender(fromAccount: string): Promise<string> {
  const needle = fromAccount.trim().toLowerCase();
  if (needle === "") {
    throw new Error("fromAccount must not be empty.");
  }

  const accounts = ((await handleListAccounts()) as Account[]).filter(
    (a) => a.enabled
  );

  const matches: string[] = [];
  for (const account of accounts) {
    const addressHit = account.emails.find(
      (email) => email.trim().toLowerCase() === needle
    );
    if (addressHit !== undefined) {
      matches.push(formatSender(account.fullName, addressHit));
      continue;
    }
    if (account.name.trim().toLowerCase() === needle) {
      const primary = account.emails[0];
      if (primary === undefined) {
        throw new Error(
          `Account "${account.name}" has no email addresses configured, so it cannot be used as a sender.`
        );
      }
      matches.push(formatSender(account.fullName, primary));
    }
  }

  const distinct = [...new Set(matches)];
  if (distinct.length === 1) {
    return distinct[0]!;
  }
  if (distinct.length > 1) {
    throw new Error(
      `"${fromAccount}" is ambiguous — it matches multiple senders: ${distinct.join(
        ", "
      )}. Pass a specific email address instead.`
    );
  }

  throw new Error(
    `"${fromAccount}" does not match any enabled Mail account. Valid values: ${describeChoices(
      accounts
    )}`
  );
}

function describeChoices(accounts: Account[]): string {
  if (accounts.length === 0) {
    return "(no enabled accounts found in Mail)";
  }
  return accounts
    .map((a) => `"${a.name}" (${a.emails.join(", ") || "no addresses"})`)
    .join("; ");
}
