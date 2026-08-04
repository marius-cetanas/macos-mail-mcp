import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../../src/bridge/applescript-runner.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../src/bridge/applescript-runner.js")
  >();
  return { ...actual, runAppleScript: vi.fn() };
});

import {
  runAppleScript,
  substituteParams,
} from "../../../src/bridge/applescript-runner.js";
import {
  handleSendMessage,
  handleReplyToMessage,
  handleForwardMessage,
} from "../../../src/domains/compose/compose.tools.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

const SCRIPT_DIR = join(process.cwd(), "src/domains/compose/scripts");

const ACCOUNTS = [
  {
    name: "Google",
    type: "imap",
    enabled: true,
    fullName: "Marius Cetanas",
    emails: ["marius.cetanas@gmail.com"],
  },
];

function scriptSource(name: string): string {
  return readFileSync(join(SCRIPT_DIR, name), "utf8");
}

function placeholders(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]!)
  );
}

/** Invoke a handler and return the params it handed to the bridge. */
async function paramsFor(
  invoke: () => Promise<unknown>,
  scriptFragment: string
): Promise<Record<string, string>> {
  await invoke();
  const call = mockRunAppleScript.mock.calls.find(([script]) =>
    String(script).includes(scriptFragment)
  );
  return (call?.[1] ?? {}) as Record<string, string>;
}

const CASES = [
  {
    file: "send-message.applescript",
    invoke: () =>
      handleSendMessage(
        "bob@test.com", "Hi", "Hello",
        "cc@t.com", "bcc@t.com", ["/tmp/a.pdf"], "Google"
      ),
  },
  {
    file: "reply-to-message.applescript",
    invoke: () => handleReplyToMessage(1, "INBOX", "Gmail", "Thanks", true, "Google"),
  },
  {
    file: "forward-message.applescript",
    invoke: () => handleForwardMessage(1, "INBOX", "Gmail", "a@t.com", "FYI", "Google"),
  },
];

describe("compose AppleScript templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAppleScript.mockImplementation(async (script: string) =>
      script.includes("list-accounts") ? ACCOUNTS : { success: true }
    );
  });

  describe.each(CASES)("$file", ({ file, invoke }) => {
    it("declares a {{sender}} placeholder", () => {
      expect(placeholders(scriptSource(file))).toContain("sender");
    });

    it("guards the assignment behind the __NONE__ sentinel", () => {
      expect(scriptSource(file)).toMatch(
        /if "\{\{sender\}\}" is not "__NONE__" then\s*\n\s*set sender to "\{\{sender\}\}"/
      );
    });

    it("reads the sender back and returns it on success", () => {
      const source = scriptSource(file);
      expect(source).toMatch(/set rawSender to sender of \w+/);
      expect(source).toContain('\\"success\\": true, \\"sender\\": \\""');
      expect(source).toContain("escapeForJson(actualSender)");
    });

    it("reads the sender back before sending, not after", () => {
      const source = scriptSource(file);
      expect(source.indexOf("set rawSender to")).toBeLessThan(source.indexOf("send "));
    });

    it("escapes the sender for JSON output", () => {
      expect(scriptSource(file)).toMatch(/escapeForJson\(actualSender\)/);
    });

    it("tolerates Mail returning 'missing value' for the sender", () => {
      expect(scriptSource(file)).toMatch(/if rawSender is not missing value then/);
    });

    it("has every placeholder supplied by its handler", async () => {
      const supplied = new Set(Object.keys(await paramsFor(invoke, file.replace(".applescript", ""))));
      const missing = [...placeholders(scriptSource(file))].filter(
        (name) => !supplied.has(name)
      );
      expect(missing).toEqual([]);
    });

    it("leaves no unsubstituted placeholder after substitution", async () => {
      const params = await paramsFor(invoke, file.replace(".applescript", ""));
      const rendered = substituteParams(scriptSource(file), params);
      expect(rendered).not.toMatch(/\{\{\w+\}\}/);
    });

    it("renders the resolved sender into the script body", async () => {
      const params = await paramsFor(invoke, file.replace(".applescript", ""));
      const rendered = substituteParams(scriptSource(file), params);
      expect(rendered).toContain('set sender to "Marius Cetanas <marius.cetanas@gmail.com>"');
    });

    it("renders the sentinel unchanged when no account was requested", async () => {
      const noSender = await paramsFor(
        () =>
          file.startsWith("send")
            ? handleSendMessage("bob@test.com", "Hi", "Hello")
            : file.startsWith("reply")
              ? handleReplyToMessage(1, "INBOX", "Gmail", "Thanks", true)
              : handleForwardMessage(1, "INBOX", "Gmail", "a@t.com"),
        file.replace(".applescript", "")
      );
      expect(noSender.sender).toBe("__NONE__");
      const rendered = substituteParams(scriptSource(file), noSender);
      expect(rendered).toContain('if "__NONE__" is not "__NONE__" then');
    });
  });

  describe("accounts templates expose the full name needed to build a sender", () => {
    it.each(["list-accounts.applescript", "get-account-detail.applescript"])(
      "%s emits a fullName field",
      (file) => {
        const source = readFileSync(
          join(process.cwd(), "src/domains/accounts/scripts", file),
          "utf8"
        );
        expect(source).toMatch(/full name of acct/);
        expect(source).toMatch(/\\"fullName\\": \\""/);
      }
    );

    it.each(["list-accounts.applescript", "get-account-detail.applescript"])(
      "%s tolerates a missing full name",
      (file) => {
        const source = readFileSync(
          join(process.cwd(), "src/domains/accounts/scripts", file),
          "utf8"
        );
        expect(source).toMatch(/if rawFullName is not missing value then/);
      }
    );
  });
});
