import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";
import { formatSender, resolveSender, NO_SENDER } from "../../../src/domains/compose/sender.js";
import type { Account } from "../../../src/types.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

function account(overrides: Partial<Account> = {}): Account {
  return {
    name: "Google",
    type: "imap",
    enabled: true,
    fullName: "Marius Cetanas",
    emails: ["marius.cetanas@gmail.com"],
    ...overrides,
  };
}

/** Make list_accounts resolve to the given accounts. */
function withAccounts(...accounts: Account[]): void {
  mockRunAppleScript.mockResolvedValue(accounts);
}

describe("formatSender", () => {
  it("builds the full 'Name <address>' form", () => {
    expect(formatSender("Marius Cetanas", "m@example.com")).toBe(
      "Marius Cetanas <m@example.com>"
    );
  });

  it("falls back to a bare address when the full name is empty", () => {
    expect(formatSender("", "m@example.com")).toBe("m@example.com");
  });

  it("treats a whitespace-only full name as absent", () => {
    expect(formatSender("   ", "m@example.com")).toBe("m@example.com");
  });

  it("trims surrounding whitespace from the full name", () => {
    expect(formatSender("  Marius  ", "m@example.com")).toBe("Marius <m@example.com>");
  });
});

describe("NO_SENDER", () => {
  it("matches the sentinel the AppleScript templates compare against", () => {
    expect(NO_SENDER).toBe("__NONE__");
  });
});

describe("resolveSender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("matching by account name", () => {
    it("resolves an exact account name", async () => {
      withAccounts(account());
      await expect(resolveSender("Google")).resolves.toBe(
        "Marius Cetanas <marius.cetanas@gmail.com>"
      );
    });

    it("matches case-insensitively", async () => {
      withAccounts(account());
      await expect(resolveSender("gOOgLe")).resolves.toBe(
        "Marius Cetanas <marius.cetanas@gmail.com>"
      );
    });

    it("ignores surrounding whitespace in the input", async () => {
      withAccounts(account());
      await expect(resolveSender("  Google  ")).resolves.toBe(
        "Marius Cetanas <marius.cetanas@gmail.com>"
      );
    });

    it("uses the first address when an account has several", async () => {
      withAccounts(
        account({ emails: ["primary@gmail.com", "alias@gmail.com"] })
      );
      await expect(resolveSender("Google")).resolves.toBe(
        "Marius Cetanas <primary@gmail.com>"
      );
    });

    it("rejects an account that has no addresses configured", async () => {
      withAccounts(account({ emails: [] }));
      await expect(resolveSender("Google")).rejects.toThrow(
        /has no email addresses configured/
      );
    });
  });

  describe("matching by email address", () => {
    it("resolves an exact address", async () => {
      withAccounts(account());
      await expect(resolveSender("marius.cetanas@gmail.com")).resolves.toBe(
        "Marius Cetanas <marius.cetanas@gmail.com>"
      );
    });

    it("matches case-insensitively", async () => {
      withAccounts(account());
      await expect(resolveSender("Marius.Cetanas@GMAIL.com")).resolves.toBe(
        "Marius Cetanas <marius.cetanas@gmail.com>"
      );
    });

    it("resolves to the matched alias, not the account's first address", async () => {
      withAccounts(
        account({ emails: ["primary@gmail.com", "alias@gmail.com"] })
      );
      await expect(resolveSender("alias@gmail.com")).resolves.toBe(
        "Marius Cetanas <alias@gmail.com>"
      );
    });

    it("preserves the casing Mail reports, not the caller's", async () => {
      withAccounts(account({ emails: ["Marius.Cetanas@Gmail.com"] }));
      await expect(resolveSender("marius.cetanas@gmail.com")).resolves.toBe(
        "Marius Cetanas <Marius.Cetanas@Gmail.com>"
      );
    });

    it("picks the right account when several are configured", async () => {
      withAccounts(
        account({ name: "iCloud", emails: ["m@icloud.com"] }),
        account({ name: "Google", emails: ["m@gmail.com"] })
      );
      await expect(resolveSender("m@gmail.com")).resolves.toBe(
        "Marius Cetanas <m@gmail.com>"
      );
    });
  });

  describe("accounts with no full name", () => {
    it("resolves to a bare address", async () => {
      withAccounts(account({ fullName: "" }));
      await expect(resolveSender("Google")).resolves.toBe("marius.cetanas@gmail.com");
    });
  });

  describe("disabled accounts", () => {
    it("does not match a disabled account by name", async () => {
      withAccounts(account({ enabled: false }));
      await expect(resolveSender("Google")).rejects.toThrow(
        /does not match any enabled Mail account/
      );
    });

    it("does not match a disabled account by address", async () => {
      withAccounts(account({ enabled: false }));
      await expect(resolveSender("marius.cetanas@gmail.com")).rejects.toThrow(
        /does not match any enabled Mail account/
      );
    });

    it("omits disabled accounts from the list of valid values", async () => {
      withAccounts(
        account({ name: "Disabled", enabled: false, emails: ["off@example.com"] }),
        account({ name: "Google", emails: ["on@example.com"] })
      );
      await expect(resolveSender("nope")).rejects.toThrow(/on@example.com/);
      await expect(resolveSender("nope")).rejects.not.toThrow(/off@example.com/);
    });
  });

  describe("invalid input", () => {
    it("rejects an empty string", async () => {
      withAccounts(account());
      await expect(resolveSender("")).rejects.toThrow(/must not be empty/);
    });

    it("rejects a whitespace-only string", async () => {
      withAccounts(account());
      await expect(resolveSender("   ")).rejects.toThrow(/must not be empty/);
    });

    it("does not consult Mail when the input is empty", async () => {
      withAccounts(account());
      await expect(resolveSender("")).rejects.toThrow();
      expect(mockRunAppleScript).not.toHaveBeenCalled();
    });

    it("never silently falls back to the default account", async () => {
      withAccounts(account());
      await expect(resolveSender("typo@example.com")).rejects.toThrow();
    });

    it("names the offending value in the error", async () => {
      withAccounts(account());
      await expect(resolveSender("typo@example.com")).rejects.toThrow(
        /"typo@example\.com"/
      );
    });

    it("lists the valid choices in the error", async () => {
      withAccounts(account({ name: "Google", emails: ["a@x.com", "b@x.com"] }));
      await expect(resolveSender("nope")).rejects.toThrow(/"Google" \(a@x\.com, b@x\.com\)/);
    });

    it("reports when Mail has no enabled accounts at all", async () => {
      withAccounts();
      await expect(resolveSender("anything")).rejects.toThrow(
        /no enabled accounts found in Mail/
      );
    });

    it("describes an address-less account in the choices", async () => {
      withAccounts(account({ name: "Empty", emails: [] }));
      await expect(resolveSender("nope")).rejects.toThrow(/"Empty" \(no addresses\)/);
    });
  });

  describe("ambiguity", () => {
    it("rejects a value matching two accounts with different senders", async () => {
      withAccounts(
        account({ name: "Work", fullName: "M C", emails: ["shared@example.com"] }),
        account({ name: "Personal", fullName: "Marius", emails: ["shared@example.com"] })
      );
      await expect(resolveSender("shared@example.com")).rejects.toThrow(/is ambiguous/);
    });

    it("lists both candidates in the ambiguity error", async () => {
      withAccounts(
        account({ name: "Work", fullName: "M C", emails: ["shared@example.com"] }),
        account({ name: "Personal", fullName: "Marius", emails: ["shared@example.com"] })
      );
      await expect(resolveSender("shared@example.com")).rejects.toThrow(
        /M C <shared@example\.com>.*Marius <shared@example\.com>/
      );
    });

    it("accepts duplicates that resolve to the same sender", async () => {
      withAccounts(
        account({ name: "Work", fullName: "Marius", emails: ["shared@example.com"] }),
        account({ name: "Mirror", fullName: "Marius", emails: ["shared@example.com"] })
      );
      await expect(resolveSender("shared@example.com")).resolves.toBe(
        "Marius <shared@example.com>"
      );
    });

    it("prefers an address match over a same-string name match on one account", async () => {
      withAccounts(account({ name: "marius.cetanas@gmail.com" }));
      await expect(resolveSender("marius.cetanas@gmail.com")).resolves.toBe(
        "Marius Cetanas <marius.cetanas@gmail.com>"
      );
    });
  });
});
