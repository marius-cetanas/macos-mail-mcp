# macos-mail-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that connects Claude to macOS Mail.app via AppleScript, with 18 tools across 4 domains (accounts, mailboxes, messages, compose).

**Architecture:** Domain-driven with layered AppleScript separation. Each domain has its own `.tools.ts` registration file and `scripts/` folder with `.applescript` templates. A shared bridge layer handles all `osascript` execution via `execFile` (not `exec`), parameter injection, and JSON parsing.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` v1.x, `zod`, `vitest` for testing, `osascript` for Mail.app automation

**Spec:** `docs/superpowers/specs/2026-03-24-macos-mail-mcp-design.md`

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Project metadata, scripts, dependencies |
| `tsconfig.json` | TypeScript compiler config (ES2022, Node16) |
| `vitest.config.ts` | Test runner configuration |
| `.gitignore` | Ignore node_modules, build |
| `src/index.ts` | Entry point: create McpServer, wire domains, start stdio transport |
| `src/types.ts` | Shared return type interfaces (Account, Mailbox, MessageSummary, etc.) |
| `src/bridge/applescript-runner.ts` | Load .applescript templates, substitute params, run osascript via execFile, parse JSON output |
| `src/domains/accounts/accounts.tools.ts` | Register `list_accounts`, `get_account_detail` tools |
| `src/domains/accounts/scripts/list-accounts.applescript` | AppleScript to list all accounts |
| `src/domains/accounts/scripts/get-account-detail.applescript` | AppleScript to get account detail |
| `src/domains/mailboxes/mailboxes.tools.ts` | Register `list_mailboxes`, `get_mailbox_info` tools |
| `src/domains/mailboxes/scripts/list-mailboxes.applescript` | AppleScript to list mailboxes |
| `src/domains/mailboxes/scripts/get-mailbox-info.applescript` | AppleScript to get mailbox info |
| `src/domains/messages/messages.tools.ts` | Register all 11 message tools |
| `src/domains/messages/scripts/*.applescript` | 11 AppleScript templates for message operations |
| `src/domains/compose/compose.tools.ts` | Register `send_message`, `reply_to_message`, `forward_message` tools |
| `src/domains/compose/scripts/*.applescript` | 3 AppleScript templates for compose operations |
| `tests/bridge/applescript-runner.test.ts` | Unit tests for bridge (param escaping, JSON parsing, error handling) |
| `tests/domains/accounts/accounts.tools.test.ts` | Tests for accounts tools with mocked bridge |
| `tests/domains/mailboxes/mailboxes.tools.test.ts` | Tests for mailboxes tools with mocked bridge |
| `tests/domains/messages/messages.tools.test.ts` | Tests for messages tools with mocked bridge |
| `tests/domains/compose/compose.tools.test.ts` | Tests for compose tools with mocked bridge |

## Testing Strategy

AppleScript execution requires macOS Mail.app running, so tests use two layers:

1. **Unit tests (mocked):** Mock `child_process.execFile` to test the bridge's escaping, JSON parsing, timeout handling, and error wrapping. Mock the bridge itself to test tool handlers' input validation and output formatting. **Important:** All domain test files must call `vi.resetModules()` in `beforeEach` before dynamically importing the module under test, to ensure mocks apply correctly and avoid vitest module caching issues.
2. **Manual integration test:** After full build, run the server with `node build/index.js` and test against a real Mail.app instance using Claude Code or the MCP inspector.

**ESM note:** The project uses `"type": "module"`. Tests import `.js` extensions (e.g., `../../src/bridge/applescript-runner.js`) which vitest resolves to the `.ts` source. This works out of the box with vitest's ESM/TypeScript support.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "macos-mail-mcp",
  "version": "1.0.0",
  "description": "MCP server connecting Claude to macOS Mail.app via AppleScript",
  "type": "module",
  "bin": {
    "macos-mail-mcp": "./build/index.js"
  },
  "scripts": {
    "build": "tsc && chmod 755 build/index.js && npm run copy-scripts",
    "copy-scripts": "cd src && find domains -name '*.applescript' -exec sh -c 'mkdir -p \"../build/$(dirname \"$1\")\" && cp \"$1\" \"../build/$1\"' _ {} \\;",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsc --watch"
  },
  "files": ["build"],
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.1",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "build", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: ".",
    restoreMocks: true,
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
build/
*.tsbuildinfo
```

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p src/bridge
mkdir -p src/domains/accounts/scripts
mkdir -p src/domains/mailboxes/scripts
mkdir -p src/domains/messages/scripts
mkdir -p src/domains/compose/scripts
mkdir -p tests/bridge
mkdir -p tests/domains/accounts
mkdir -p tests/domains/mailboxes
mkdir -p tests/domains/messages
mkdir -p tests/domains/compose
```

- [ ] **Step 6: Install dependencies**

```bash
cd ~/Projects/macos-mail-mcp && npm install
```

- [ ] **Step 7: Verify TypeScript compiles (empty project)**

Create a minimal `src/index.ts`:

```typescript
#!/usr/bin/env node
console.error("macos-mail-mcp: not yet implemented");
```

```bash
npm run build
```

Expected: compiles without errors, creates `build/index.js`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold project with package.json, tsconfig, vitest"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export interface Account {
  name: string;
  type: "imap" | "pop" | "iCloud";
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
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared return type interfaces"
```

---

### Task 3: AppleScript Bridge

**Files:**
- Create: `src/bridge/applescript-runner.ts`
- Create: `tests/bridge/applescript-runner.test.ts`

- [ ] **Step 1: Write failing tests for parameter escaping**

```typescript
// tests/bridge/applescript-runner.test.ts
import { describe, it, expect } from "vitest";
import { escapeForAppleScript } from "../../src/bridge/applescript-runner.js";

describe("escapeForAppleScript", () => {
  it("escapes double quotes", () => {
    expect(escapeForAppleScript('hello "world"')).toBe('hello \\"world\\"');
  });

  it("escapes backslashes", () => {
    expect(escapeForAppleScript("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  it("escapes backslashes before quotes", () => {
    expect(escapeForAppleScript('say \\"hi\\"')).toBe('say \\\\\\"hi\\\\\\"');
  });

  it("passes through safe strings unchanged", () => {
    expect(escapeForAppleScript("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(escapeForAppleScript("")).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/bridge/applescript-runner.test.ts
```

Expected: FAIL -- module not found

- [ ] **Step 3: Write failing tests for template substitution**

Add to the same test file:

```typescript
import { substituteParams } from "../../src/bridge/applescript-runner.js";

describe("substituteParams", () => {
  it("substitutes a single parameter", () => {
    const template = 'set x to "{{name}}"';
    const result = substituteParams(template, { name: "Alice" });
    expect(result).toBe('set x to "Alice"');
  });

  it("substitutes multiple parameters", () => {
    const template = 'mailbox "{{mailboxName}}" of account "{{accountName}}"';
    const result = substituteParams(template, {
      mailboxName: "INBOX",
      accountName: "Gmail",
    });
    expect(result).toBe('mailbox "INBOX" of account "Gmail"');
  });

  it("escapes parameter values", () => {
    const template = 'set x to "{{name}}"';
    const result = substituteParams(template, { name: 'O"Brien' });
    expect(result).toBe('set x to "O\\"Brien"');
  });

  it("leaves unmatched placeholders unchanged", () => {
    const template = "{{known}} and {{unknown}}";
    const result = substituteParams(template, { known: "yes" });
    expect(result).toBe("yes and {{unknown}}");
  });
});
```

- [ ] **Step 4: Write failing tests for JSON output parsing**

Add to the same test file:

```typescript
import { parseAppleScriptOutput } from "../../src/bridge/applescript-runner.js";

describe("parseAppleScriptOutput", () => {
  it("parses valid JSON array", () => {
    const result = parseAppleScriptOutput('[{"name": "test"}]');
    expect(result).toEqual([{ name: "test" }]);
  });

  it("parses valid JSON object", () => {
    const result = parseAppleScriptOutput('{"key": "value"}');
    expect(result).toEqual({ key: "value" });
  });

  it("detects AppleScript error objects and throws", () => {
    expect(() =>
      parseAppleScriptOutput('{"error": "not found", "errorNumber": -1728}')
    ).toThrow("not found");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseAppleScriptOutput("not json")).toThrow();
  });

  it("handles empty string", () => {
    expect(() => parseAppleScriptOutput("")).toThrow();
  });
});
```

- [ ] **Step 5: Implement the bridge**

Create `src/bridge/applescript-runner.ts`. Key implementation details:
- `escapeForAppleScript(value: string): string` -- escape backslashes first, then quotes
- `substituteParams(template: string, params: Record<string, string>): string` -- replaceAll `{{key}}` with escaped values
- `parseAppleScriptOutput(output: string): unknown` -- JSON.parse, check for `{error, errorNumber}` shape and throw
- `runAppleScript(scriptPath: string, params?, options?)` -- read template file, substitute params, write to temp file, execute with `execFile("osascript", [tempFilePath])`, parse output, clean up temp file
- Export `DEFAULT_TIMEOUT = 30_000` and `EXTENDED_TIMEOUT = 120_000` constants
- Uses `execFile` (NOT `exec`) to avoid shell injection. The script content is written to a temp file and the temp file path is passed as an argument to osascript.
- Script path is resolved via `path.join(dirname(fileURLToPath(import.meta.url)), '..', 'domains', scriptPath)` -- from `build/bridge/` this resolves to `build/domains/<scriptPath>`. This means callers pass paths like `"accounts/scripts/list-accounts.applescript"`.
- Import and use `AppleScriptError` from `../types.js` for type-safe error detection in `parseAppleScriptOutput`

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- tests/bridge/applescript-runner.test.ts
```

Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/bridge/applescript-runner.ts tests/bridge/applescript-runner.test.ts
git commit -m "feat: add AppleScript bridge with param escaping, template substitution, JSON parsing"
```

---

### Task 4: Accounts Domain

**Files:**
- Create: `src/domains/accounts/accounts.tools.ts`
- Create: `src/domains/accounts/scripts/list-accounts.applescript`
- Create: `src/domains/accounts/scripts/get-account-detail.applescript`
- Create: `tests/domains/accounts/accounts.tools.test.ts`

- [ ] **Step 1: Write failing test for accounts tools**

```typescript
// tests/domains/accounts/accounts.tools.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/domains/accounts/accounts.tools.test.ts
```

Expected: FAIL -- module not found

- [ ] **Step 3: Write `list-accounts.applescript`**

AppleScript that iterates all accounts and builds a JSON array of `{name, type, enabled, emails}` objects. Uses `try`/`on error` block. See spec for template convention example.

- [ ] **Step 4: Write `get-account-detail.applescript`**

AppleScript that gets account `{{accountName}}` and returns JSON with `{name, type, enabled, emails, serverName, port, usesSsl, userName, mailboxCount}`. Uses `try`/`on error` block.

- [ ] **Step 5: Implement `accounts.tools.ts`**

- `handleListAccounts()` -- calls `runAppleScript("accounts/scripts/list-accounts.applescript", {})`
- `handleGetAccountDetail(accountName)` -- calls `runAppleScript` with `{accountName}` param
- `registerAccountsTools(server: McpServer)` -- registers both tools with Zod schemas, wraps handlers in try/catch, returns `{content: [{type: "text", text: JSON.stringify(result, null, 2)}]}` on success, `{content: [{type: "text", text: error}], isError: true}` on failure

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- tests/domains/accounts/accounts.tools.test.ts
```

Expected: PASS

- [ ] **Step 7: Verify build compiles**

```bash
npm run build
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/domains/accounts/ tests/domains/accounts/
git commit -m "feat: add accounts domain (list_accounts, get_account_detail)"
```

---

### Task 5: Mailboxes Domain

**Files:**
- Create: `src/domains/mailboxes/mailboxes.tools.ts`
- Create: `src/domains/mailboxes/scripts/list-mailboxes.applescript`
- Create: `src/domains/mailboxes/scripts/get-mailbox-info.applescript`
- Create: `tests/domains/mailboxes/mailboxes.tools.test.ts`

- [ ] **Step 1: Write failing test for mailboxes tools**

```typescript
// tests/domains/mailboxes/mailboxes.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("mailboxes tools", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("list_mailboxes with account passes accountName", async () => {
    mockRunAppleScript.mockResolvedValue([]);
    const { handleListMailboxes } = await import(
      "../../../src/domains/mailboxes/mailboxes.tools.js"
    );
    await handleListMailboxes("Gmail");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "mailboxes/scripts/list-mailboxes.applescript",
      { accountName: "Gmail" }
    );
  });

  it("list_mailboxes without account passes __ALL__", async () => {
    mockRunAppleScript.mockResolvedValue([]);
    const { handleListMailboxes } = await import(
      "../../../src/domains/mailboxes/mailboxes.tools.js"
    );
    await handleListMailboxes();
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "mailboxes/scripts/list-mailboxes.applescript",
      { accountName: "__ALL__" }
    );
  });

  it("get_mailbox_info passes accountName and mailboxName", async () => {
    mockRunAppleScript.mockResolvedValue({
      name: "INBOX", unreadCount: 5, accountName: "Gmail", messageCount: 120, container: null
    });
    const { handleGetMailboxInfo } = await import(
      "../../../src/domains/mailboxes/mailboxes.tools.js"
    );
    await handleGetMailboxInfo("Gmail", "INBOX");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "mailboxes/scripts/get-mailbox-info.applescript",
      { accountName: "Gmail", mailboxName: "INBOX" }
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/domains/mailboxes/mailboxes.tools.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `list-mailboxes.applescript`**

AppleScript that lists mailboxes. `{{accountName}}` param -- if `"__ALL__"`, iterate all accounts; otherwise get specified account. Returns JSON array of `{name, unreadCount, accountName}`.

- [ ] **Step 4: Write `get-mailbox-info.applescript`**

AppleScript that gets mailbox `{{mailboxName}}` of account `{{accountName}}`. Returns `{name, unreadCount, accountName, messageCount, container}` where container is `null` or the parent mailbox name.

- [ ] **Step 5: Implement `mailboxes.tools.ts`**

- `handleListMailboxes(accountName?)` -- passes `"__ALL__"` when no account
- `handleGetMailboxInfo(accountName, mailboxName)`
- `registerMailboxesTools(server)` -- Zod schemas, `accountName` optional on list

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- tests/domains/mailboxes/mailboxes.tools.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/domains/mailboxes/ tests/domains/mailboxes/
git commit -m "feat: add mailboxes domain (list_mailboxes, get_mailbox_info)"
```

---

### Task 6: Messages Domain -- Reading & Searching

**Files:**
- Create: `src/domains/messages/messages.tools.ts`
- Create: `src/domains/messages/scripts/list-messages.applescript`
- Create: `src/domains/messages/scripts/get-message.applescript`
- Create: `src/domains/messages/scripts/search-messages.applescript`
- Create: `tests/domains/messages/messages.tools.test.ts`

- [ ] **Step 1: Write failing tests for reading/searching tools**

```typescript
// tests/domains/messages/messages.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("messages tools - reading", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("list_messages passes limit and offset as strings", async () => {
    mockRunAppleScript.mockResolvedValue([]);
    const { handleListMessages } = await import(
      "../../../src/domains/messages/messages.tools.js"
    );
    await handleListMessages("Gmail", "INBOX", 10, 5);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/list-messages.applescript",
      { accountName: "Gmail", mailboxName: "INBOX", limit: "10", offset: "5" }
    );
  });

  it("get_message passes messageId as string", async () => {
    mockRunAppleScript.mockResolvedValue({ id: 12345, subject: "Test" });
    const { handleGetMessage } = await import(
      "../../../src/domains/messages/messages.tools.js"
    );
    await handleGetMessage(12345, "INBOX", "Gmail");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/get-message.applescript",
      { messageId: "12345", mailboxName: "INBOX", accountName: "Gmail" }
    );
  });

  it("search_messages passes __ALL__ for omitted optional params", async () => {
    mockRunAppleScript.mockResolvedValue([]);
    const { handleSearchMessages } = await import(
      "../../../src/domains/messages/messages.tools.js"
    );
    await handleSearchMessages("subject", "invoice", undefined, undefined, 50);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/search-messages.applescript",
      {
        field: "subject",
        query: "invoice",
        mailboxName: "__ALL__",
        accountName: "__ALL__",
        limit: "50",
      }
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/domains/messages/messages.tools.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `list-messages.applescript`**

AppleScript that lists messages in `{{mailboxName}}` of `{{accountName}}` with `{{limit}}` and `{{offset}}` pagination. Returns JSON array of `MessageSummary` objects. Uses `escapeQuotes` handler for subject and sender. Gets `date received as <<class isot>> as string` for ISO date format.

- [ ] **Step 4: Write `get-message.applescript`**

AppleScript that gets a single message by ID: `first message of mailbox "{{mailboxName}}" of account "{{accountName}}" whose id is {{messageId}}`. Returns full `MessageDetail` JSON including:
- `content of msg as text` for body (plain text)
- `all headers of msg` for headers (single text block, NOT `every header`)
- to/cc/bcc recipients via `buildRecipientsJson` handler
- attachment list via `mail attachment` iteration
- `escapeQuotes` handler for all string fields containing user content

- [ ] **Step 5: Write `search-messages.applescript`**

AppleScript that searches using `whose` clause. Params: `{{field}}`, `{{query}}`, `{{mailboxName}}`, `{{accountName}}`, `{{limit}}`. Supports `__ALL__` for mailbox/account to search broadly. Builds `whose` clause based on field (subject/sender/content). Returns `MessageSummary[]` capped at limit.

- [ ] **Step 6: Implement reading/searching handlers in `messages.tools.ts`**

- `handleListMessages(accountName, mailboxName, limit, offset)` -- all params converted to strings
- `handleGetMessage(messageId, mailboxName, accountName)` -- messageId as string
- `handleSearchMessages(field, query, mailboxName?, accountName?, limit?)` -- optional params default to `"__ALL__"`, limit default `"50"`
- `registerMessagesTools(server)` -- registers ALL 11 message tools (reading, managing, and attachments). Tasks 7-8 add the handler functions and AppleScript files, then add the corresponding tool registrations inside this same `registerMessagesTools` function.
- Zod schemas: `list_messages` has `limit` default 25, `offset` default 0; `search_messages` has `field` as enum, `limit` default 50

- [ ] **Step 7: Run tests to verify they pass**

```bash
npm test -- tests/domains/messages/messages.tools.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/domains/messages/ tests/domains/messages/
git commit -m "feat: add messages domain - reading and searching (list, get, search)"
```

---

### Task 7: Messages Domain -- Managing

**Files:**
- Modify: `src/domains/messages/messages.tools.ts`
- Create: `src/domains/messages/scripts/move-message.applescript`
- Create: `src/domains/messages/scripts/delete-message.applescript`
- Create: `src/domains/messages/scripts/flag-message.applescript`
- Create: `src/domains/messages/scripts/mark-read.applescript`
- Modify: `tests/domains/messages/messages.tools.test.ts`

- [ ] **Step 1: Write failing tests for managing tools**

Add to `tests/domains/messages/messages.tools.test.ts`:

```typescript
describe("messages tools - managing", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("move_message passes all params", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleMoveMessage } = await import("../../../src/domains/messages/messages.tools.js");
    await handleMoveMessage(123, "INBOX", "Archive", "Gmail");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/move-message.applescript",
      { messageId: "123", mailboxName: "INBOX", toMailbox: "Archive", accountName: "Gmail" }
    );
  });

  it("delete_message passes correct params", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleDeleteMessage } = await import("../../../src/domains/messages/messages.tools.js");
    await handleDeleteMessage(123, "INBOX", "Gmail");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/delete-message.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail" }
    );
  });

  it("flag_message passes flagged and flagIndex", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleFlagMessage } = await import("../../../src/domains/messages/messages.tools.js");
    await handleFlagMessage(123, "INBOX", "Gmail", true, 2);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/flag-message.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail", flagged: "true", flagIndex: "2" }
    );
  });

  it("mark_read passes read status", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleMarkRead } = await import("../../../src/domains/messages/messages.tools.js");
    await handleMarkRead(123, "INBOX", "Gmail", true);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/mark-read.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail", read: "true" }
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/domains/messages/messages.tools.test.ts
```

Expected: FAIL for new tests

- [ ] **Step 3: Write the four AppleScript templates**

Each uses `first message of mailbox "{{mailboxName}}" of account "{{accountName}}" whose id is {{messageId}}` to find the message.

- `move-message.applescript`: `set mailbox of msg to mailbox "{{toMailbox}}" of account "{{accountName}}"`, returns `{"success": true}`
- `delete-message.applescript`: `delete msg`, returns `{"success": true}`
- `flag-message.applescript`: `set flagged status of msg to {{flagged}}` and `set flag index of msg to {{flagIndex}}`, returns `{"success": true}`
- `mark-read.applescript`: `set read status of msg to {{read}}`, returns `{"success": true}`

All wrapped in `try`/`on error`.

- [ ] **Step 4: Add handlers and tool registrations to `messages.tools.ts`**

- `handleMoveMessage(messageId, mailboxName, toMailbox, accountName)` -- all converted to strings
- `handleDeleteMessage(messageId, mailboxName, accountName)`
- `handleFlagMessage(messageId, mailboxName, accountName, flagged, flagIndex)` -- flagIndex defaults to -1
- `handleMarkRead(messageId, mailboxName, accountName, read)`
- Register tools: `move_message` description warns about Gmail labels, `delete_message` notes it uses Mail's `delete` verb

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/domains/messages/messages.tools.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domains/messages/ tests/domains/messages/
git commit -m "feat: add messages domain - managing (move, delete, flag, mark read)"
```

---

### Task 8: Messages Domain -- Attachments

**Files:**
- Modify: `src/domains/messages/messages.tools.ts`
- Create: `src/domains/messages/scripts/list-attachments.applescript`
- Create: `src/domains/messages/scripts/save-attachment.applescript`
- Create: `src/domains/messages/scripts/save-all-attachments.applescript`
- Create: `src/domains/messages/scripts/read-attachment.applescript`
- Modify: `tests/domains/messages/messages.tools.test.ts`

- [ ] **Step 1: Write failing tests for attachment tools**

Add to `tests/domains/messages/messages.tools.test.ts`:

```typescript
describe("messages tools - attachments", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("list_attachments passes correct params", async () => {
    mockRunAppleScript.mockResolvedValue([]);
    const { handleListAttachments } = await import("../../../src/domains/messages/messages.tools.js");
    await handleListAttachments(123, "INBOX", "Gmail");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/list-attachments.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail" }
    );
  });

  it("save_attachment uses extended timeout", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleSaveAttachment } = await import("../../../src/domains/messages/messages.tools.js");
    await handleSaveAttachment(123, "INBOX", "Gmail", "file.pdf", "~/Downloads");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/save-attachment.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail", attachmentName: "file.pdf", savePath: "~/Downloads" },
      { timeout: 120_000 }
    );
  });

  it("save_all_attachments uses extended timeout", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true, savedFiles: [] });
    const { handleSaveAllAttachments } = await import("../../../src/domains/messages/messages.tools.js");
    await handleSaveAllAttachments(123, "INBOX", "Gmail", "~/Downloads");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/save-all-attachments.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail", savePath: "~/Downloads" },
      { timeout: 120_000 }
    );
  });

  it("read_attachment calls runAppleScript for text files", async () => {
    mockRunAppleScript.mockResolvedValue({ name: "data.csv", content: "a,b,c" });
    const { handleReadAttachment } = await import("../../../src/domains/messages/messages.tools.js");
    const result = await handleReadAttachment(123, "INBOX", "Gmail", "data.csv");
    expect(result).toEqual({ name: "data.csv", content: "a,b,c" });
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "messages/scripts/read-attachment.applescript",
      { messageId: "123", mailboxName: "INBOX", accountName: "Gmail", attachmentName: "data.csv" },
      { timeout: 120_000 }
    );
  });

  it("read_attachment rejects binary file extensions", async () => {
    const { handleReadAttachment } = await import("../../../src/domains/messages/messages.tools.js");
    await expect(handleReadAttachment(123, "INBOX", "Gmail", "photo.jpg"))
      .rejects.toThrow("Binary file type");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/domains/messages/messages.tools.test.ts
```

Expected: FAIL for new tests

- [ ] **Step 3: Write attachment AppleScript templates**

- `list-attachments.applescript`: iterate `mail attachment` of message, return `Attachment[]` JSON
- `save-attachment.applescript`: find attachment by name, check `downloaded`, save to `{{savePath}}/{{attachmentName}}`, return `{success, path}`
- `save-all-attachments.applescript`: save all downloaded attachments, return `{success, savedFiles[], savePath}`
- `read-attachment.applescript`: save to temp, read as UTF-8, escape for JSON (newlines, quotes, backslashes, tabs, carriage returns), return `{name, content}`, clean up temp file

- [ ] **Step 4: Add attachment handlers to `messages.tools.ts`**

- `handleListAttachments(messageId, mailboxName, accountName)`
- `handleSaveAttachment(messageId, mailboxName, accountName, attachmentName, savePath)` -- passes `{timeout: EXTENDED_TIMEOUT}`
- `handleSaveAllAttachments(messageId, mailboxName, accountName, savePath)` -- passes `{timeout: EXTENDED_TIMEOUT}`
- `handleReadAttachment(messageId, mailboxName, accountName, attachmentName)` -- checks extension against allowlist first, throws for binary files, passes `{timeout: EXTENDED_TIMEOUT}`
- Allowed text extensions: `.txt`, `.csv`, `.json`, `.html`, `.md`, `.xml`, `.log`

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- tests/domains/messages/messages.tools.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domains/messages/ tests/domains/messages/
git commit -m "feat: add messages domain - attachments (list, save, save all, read)"
```

---

### Task 9: Compose Domain

**Files:**
- Create: `src/domains/compose/compose.tools.ts`
- Create: `src/domains/compose/scripts/send-message.applescript`
- Create: `src/domains/compose/scripts/reply-to-message.applescript`
- Create: `src/domains/compose/scripts/forward-message.applescript`
- Create: `tests/domains/compose/compose.tools.test.ts`

- [ ] **Step 1: Write failing tests for compose tools**

```typescript
// tests/domains/compose/compose.tools.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/bridge/applescript-runner.js", () => ({
  runAppleScript: vi.fn(),
  EXTENDED_TIMEOUT: 120_000,
  DEFAULT_TIMEOUT: 30_000,
}));

import { runAppleScript } from "../../../src/bridge/applescript-runner.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("compose tools", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("send_message passes to, subject, body", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleSendMessage("bob@test.com", "Hi", "Hello Bob");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/send-message.applescript",
      expect.objectContaining({ to: "bob@test.com", subject: "Hi", body: "Hello Bob" })
    );
  });

  it("send_message passes __NONE__ for omitted optional params", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleSendMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleSendMessage("bob@test.com", "Hi", "Hello");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/send-message.applescript",
      expect.objectContaining({ cc: "__NONE__", bcc: "__NONE__", attachmentPaths: "__NONE__" })
    );
  });

  it("reply_to_message passes replyAll as string", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleReplyToMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleReplyToMessage(123, "INBOX", "Gmail", "Thanks!", true);
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/reply-to-message.applescript",
      expect.objectContaining({ messageId: "123", replyAll: "true" })
    );
  });

  it("forward_message passes __NONE__ for omitted body", async () => {
    mockRunAppleScript.mockResolvedValue({ success: true });
    const { handleForwardMessage } = await import("../../../src/domains/compose/compose.tools.js");
    await handleForwardMessage(123, "INBOX", "Gmail", "alice@test.com");
    expect(mockRunAppleScript).toHaveBeenCalledWith(
      "compose/scripts/forward-message.applescript",
      expect.objectContaining({ to: "alice@test.com", body: "__NONE__" })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/domains/compose/compose.tools.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write `send-message.applescript`**

AppleScript that creates `outgoing message`, adds to/cc/bcc recipients (skip if `__NONE__`), adds attachments from comma-separated paths (skip if `__NONE__`, delay 1 between each), calls `send`. Body set via `content` property (plain text).

- [ ] **Step 4: Write `reply-to-message.applescript`**

AppleScript that finds message by ID, calls `reply msg without opening window` (with/without `reply to all` based on `{{replyAll}}`), sets `content` of the returned outgoing message to prepend `{{body}}`, then calls `send`. Uses `without opening window` so Mail.app doesn't show a compose window -- the MCP server runs headless.

- [ ] **Step 5: Write `forward-message.applescript`**

AppleScript that finds message by ID, calls `forward msg without opening window`, adds to recipient, optionally prepends body (skip if `__NONE__`), then calls `send`. Uses `without opening window` for headless operation.

- [ ] **Step 6: Implement `compose.tools.ts`**

- `handleSendMessage(to, subject, body, cc?, bcc?, attachmentPaths?)` -- optional params default to `"__NONE__"`, attachmentPaths joined with `,`
- `handleReplyToMessage(messageId, mailboxName, accountName, body, replyAll)`
- `handleForwardMessage(messageId, mailboxName, accountName, to, body?)`
- `registerComposeTools(server)` -- Zod schemas, tool descriptions note attachment limitation on reply/forward

- [ ] **Step 7: Run tests to verify they pass**

```bash
npm test -- tests/domains/compose/compose.tools.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/domains/compose/ tests/domains/compose/
git commit -m "feat: add compose domain (send_message, reply_to_message, forward_message)"
```

---

### Task 10: Entry Point -- Wire Everything Together

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Implement `src/index.ts`**

```typescript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAccountsTools } from "./domains/accounts/accounts.tools.js";
import { registerMailboxesTools } from "./domains/mailboxes/mailboxes.tools.js";
import { registerMessagesTools } from "./domains/messages/messages.tools.js";
import { registerComposeTools } from "./domains/compose/compose.tools.js";

const server = new McpServer({
  name: "macos-mail-mcp",
  version: "1.0.0",
});

registerAccountsTools(server);
registerMailboxesTools(server);
registerMessagesTools(server);
registerComposeTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("macos-mail-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

- [ ] **Step 2: Build and verify compilation**

```bash
cd ~/Projects/macos-mail-mcp && npm run build
```

Expected: compiles with no errors

- [ ] **Step 3: Verify the server starts**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | node build/index.js 2>/dev/null | head -1
```

Expected: JSON response with server capabilities

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire all domains into MCP server entry point"
```

---

### Task 11: Full Test Suite & Build Verification

**Files:**
- None new -- verification only

- [ ] **Step 1: Run full test suite**

```bash
cd ~/Projects/macos-mail-mcp && npm test
```

Expected: All tests pass

- [ ] **Step 2: Clean build and verify .applescript files copied**

```bash
rm -rf build && npm run build
ls build/domains/accounts/scripts/
ls build/domains/mailboxes/scripts/
ls build/domains/messages/scripts/
ls build/domains/compose/scripts/
```

Expected: `.applescript` files present in build output

- [ ] **Step 3: Verify server starts after clean build**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | node build/index.js 2>/dev/null | head -1
```

Expected: JSON response

- [ ] **Step 4: Commit if any fixes were needed**

```bash
git add -A && git status
# Only commit if there are changes
```

---

### Task 12: Register with Claude Code & Manual Test

**Files:**
- None -- CLI configuration only

- [ ] **Step 1: Register the MCP server**

```bash
claude mcp add --transport stdio --scope user macos-mail-mcp -- node /Users/mariuscetanas/Projects/macos-mail-mcp/build/index.js
```

- [ ] **Step 2: Verify registration**

```bash
claude mcp list
```

Expected: `macos-mail-mcp` appears in the list

- [ ] **Step 3: Test with Claude Code**

Open a new Claude Code session and test:
1. Run `/mcp` -- verify `macos-mail-mcp` shows as connected with 18 tools
2. Ask Claude: "Use list_accounts to show my mail accounts" -- verify it works (macOS will prompt for automation permission on first use)
3. Ask Claude: "List my mailboxes" -- verify mailbox listing works
4. Ask Claude: "Show me my latest 5 emails in INBOX" -- verify message listing works

- [ ] **Step 4: Final commit**

```bash
cd ~/Projects/macos-mail-mcp && git add -A && git status
# Commit only if there are changes
git commit -m "chore: finalize macos-mail-mcp v1.0.0"
```
