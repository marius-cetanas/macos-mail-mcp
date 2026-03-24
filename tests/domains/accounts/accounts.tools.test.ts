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
      { name: "Gmail", type: "imap", enabled: true, emails: ["user@gmail.com"] },
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
});
