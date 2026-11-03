import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";
import type { Account } from "../../../src/types.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("accounts tools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("list_accounts calls runAppleScript with correct script path", async () => {
    const mockAccounts: Account[] = [
      { name: "Gmail", type: "imap", enabled: true, fullName: "", emails: ["user@gmail.com"] },
    ];
    mockRunAppleScript.mockResolvedValue(mockAccounts);

    const { handleListAccounts } = await import(
      "../../../src/domains/accounts/accounts.tools.js"
    );
    const result = await handleListAccounts();
    expect(result).toEqual(mockAccounts);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "accounts/scripts/list-accounts.applescript",
      {}
    );
  });

  it("get_account_detail passes accountName param", async () => {
    mockRunAppleScript.mockResolvedValue({ name: "Gmail", type: "imap" });

    const { handleGetAccountDetail } = await import(
      "../../../src/domains/accounts/accounts.tools.js"
    );
    await handleGetAccountDetail("Gmail");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "accounts/scripts/get-account-detail.applescript",
      { accountName: "Gmail" }
    );
  });

  it("list_accounts preserves raw Exchange type text when Mail supplies it", async () => {
    const mockAccounts: Account[] = [
      { name: "iCloud", type: "iCloud", enabled: true, fullName: "", emails: ["user@icloud.com"] },
      { name: "Google", type: "imap", enabled: true, fullName: "", emails: ["user@gmail.com"] },
      { name: "Exchange", type: "exchange", enabled: true, fullName: "", emails: ["user@outlook.com"] },
    ];
    mockRunAppleScript.mockResolvedValue(mockAccounts);

    const { handleListAccounts } = await import(
      "../../../src/domains/accounts/accounts.tools.js"
    );
    const result = await handleListAccounts();
    expect(result).toHaveLength(3);
    expect((result as Account[])[2].type).toBe("exchange");
  });

  it("get_account_detail preserves explicit unavailable server properties", async () => {
    const mockDetail = {
      name: "Exchange",
      type: "exchange",
      enabled: true,
      emails: ["user@outlook.com"],
      fullName: "",
      serverName: null,
      port: null,
      usesSsl: null,
      userName: "user@outlook.com",
      mailboxCount: 16,
    };
    mockRunAppleScript.mockResolvedValue(mockDetail);

    const { handleGetAccountDetail } = await import(
      "../../../src/domains/accounts/accounts.tools.js"
    );
    const result = await handleGetAccountDetail("Exchange") as Record<string, unknown>;
    expect(result.serverName).toBeNull();
    expect(result.port).toBeNull();
    expect(result.usesSsl).toBeNull();
    expect(result.type).toBe("exchange");
  });
});
