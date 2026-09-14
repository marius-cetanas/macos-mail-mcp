import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { captureTools } from "../helpers/capture-tools.js";
import { documents } from "../helpers/documents.js";

/**
 * How many tools this server has is written down across the documentation, and until this test it
 * was derived from nothing.
 *
 * `CONTRIBUTING.md` is what that cost. Its project tree was written for the 18 tools of 1.0.0.
 * v1.1.0 added `create_mailbox` and `move_messages`, and the commit that added them updated the
 * README, `CLAUDE.md` and the changelog but not the tree — which went on saying mailboxes had 2 tools
 * and messages 7 + 4, a sum of 18 in a repository whose README said 20, through every later edit to
 * the same file until the one that added this test.
 *
 * So no figure here comes from a document. The registrations are run against stub servers, and every
 * file `documents()` returns is held to what they record — which leaves out `CHANGELOG.md`, whose
 * 1.0.0 entry is right to say 18.
 */
const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

/**
 * The tools the server registers, captured through the real entry point rather than inferred from
 * the directory tree. `connect` never settles, so `main()` stops short of announcing itself on
 * stderr; nothing here needs it to get that far.
 */
const { exposed } = vi.hoisted(() => ({ exposed: [] as string[] }));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    tool(name: string) {
      exposed.push(name);
    }
    connect() {
      return new Promise<void>(() => {});
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: class {} }));

// Fresh modules, as `tests/index.test.ts` loads them: a runner without isolation may already hold the
// entry point from that file, evaluated against its mocks, and a cached module registers nothing here.
vi.resetModules();
await import("../../src/index.js");

/** Each directory under `src/domains/` is a domain, registering its tools from `<name>.tools.ts`. */
const domains = new Map<string, string[]>();
const domainNames = readdirSync(join(root, "src/domains"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
for (const name of domainNames) {
  const module: Record<string, unknown> = await import(
    join(root, "src/domains", name, `${name}.tools.ts`)
  );
  const exported = Object.keys(module).filter((key) => /^register\w+Tools$/.test(key));
  if (exported.length !== 1) {
    throw new Error(
      `src/domains/${name}/${name}.tools.ts exports ${exported.length} register…Tools functions, not one`
    );
  }
  domains.set(name, [...captureTools(module[exported[0]] as (server: never) => void).keys()]);
}

/**
 * The documents count by group, and a group is a domain — except the attachment tools, which the
 * messages domain registers and the documents count apart. The source draws no such line: one
 * function registers both. A name is all that separates them, so the name is the rule, and it is the
 * one judgement in this file that the registrations do not make for it.
 */
const groupOf = (domain: string, tool: string) =>
  tool.includes("attachment") ? "attachments" : domain;

const registered = [...domains].flatMap(([domain, tools]) =>
  tools.map((name) => ({ name, domain, group: groupOf(domain, name) }))
);
const groups = new Set(registered.map((tool) => tool.group));
const groupsOf = (domain: string) =>
  new Set(registered.filter((tool) => tool.domain === domain).map((tool) => tool.group));

/** Every name that appears more than once, each reported once. */
const duplicates = (names: string[]) =>
  [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];

interface Claim {
  line: number;
  stated: number;
  /** Tools — narrowed to a domain, a group, or both, when the claim names them — or domains. */
  of: "tools" | "domains";
  domain?: string;
  group?: string;
}

/**
 * Prose spells small numbers out — "four domains" — so words are read before *domains*. They are not
 * read before *tools*, where a spelled-out number is more often a handful than the whole server:
 * "these two tools share a script" is not a claim that the server has two.
 */
const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
  "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
  "twenty",
];
const numberFrom = (token: string) =>
  /^\d+$/.test(token) ? Number(token) : WORDS.indexOf(token.toLowerCase());

/**
 * Every count a document states, in the three shapes the documents write:
 *
 * - **a project tree's domain line** — `mailboxes/  # 3 tools`, or split by group, as in
 *   `messages/  — 8 message tools + 4 attachment tools (12 total in this domain)`;
 * - **a heading counting a group** — `### Attachments (4)`. A heading naming no group is not a claim;
 * - **prose** — `20 tools`, `four domains` — anywhere else, across a line break included.
 *
 * A domain line is read as that and nothing else. Read as prose too, its `3 tools` would be a claim
 * about the whole server, and a false red against the total.
 */
function claimsIn(text: string): Claim[] {
  const found: Array<Claim & { at: number }> = [];
  const add = (at: number, claim: Omit<Claim, "line">) =>
    found.push({ at, line: text.slice(0, at).split("\n").length, ...claim });

  const tree = new RegExp(`^[ \\t]*(${[...domains.keys()].join("|")})/[ \\t]+[#—](.*)$`, "gm");
  for (const line of text.matchAll(tree)) {
    const [whole, domain, comment] = line;
    const start = line.index + whole.length - comment.length;
    for (const count of comment.matchAll(/(\d+)\s+(\w+)/g)) {
      const word = count[2].toLowerCase();
      // `message` names the messages group and `mailbox` the mailboxes one. A word naming none of the
      // domain's groups stays as written, and fails as a group the registrations do not have.
      const group = /^(tools?|total)$/.test(word)
        ? undefined
        : ([...groupsOf(domain)].find((name) => [word, `${word}s`, `${word}es`].includes(name)) ?? word);
      add(start + count.index, { stated: Number(count[1]), of: "tools", domain, ...(group && { group }) });
    }
  }

  for (const heading of text.matchAll(/^#{1,6}[ \t]+(\w+)[ \t]+\((\d+)\)[ \t]*$/gm)) {
    const group = heading[1].toLowerCase();
    if (groups.has(group)) add(heading.index, { stated: Number(heading[2]), of: "tools", group });
  }

  const prose = text.replace(tree, (line) => " ".repeat(line.length));
  for (const m of prose.matchAll(/\b(\d+)\s+(?:MCP\s+)?tools\b/gi)) {
    add(m.index, { stated: Number(m[1]), of: "tools" });
  }
  const domainCount = new RegExp(`\\b(\\d+|${WORDS.join("|")})\\s+(?:tool\\s+)?domains\\b`, "gi");
  for (const m of prose.matchAll(domainCount)) {
    add(m.index, { stated: numberFrom(m[1]), of: "domains" });
  }

  return found.sort((a, b) => a.at - b.at).map(({ at, ...claim }) => claim);
}

const actual = ({ of, domain, group }: Claim) =>
  of === "domains"
    ? domains.size
    : registered.filter(
        (tool) => (!domain || tool.domain === domain) && (!group || tool.group === group)
      ).length;

const subject = ({ of, domain, group }: Claim) =>
  of === "domains"
    ? "domains"
    : [group && `the ${group} group`, domain && `${domain}/`].filter(Boolean).join(" in ") || "tools";

/** A document's claims, each carrying the document's name. */
const claimsOf = (doc: string, text: string) => claimsIn(text).map((claim) => ({ doc, ...claim }));

const claims = documents().flatMap((doc) => claimsOf(doc, read(doc)));

/**
 * What documents that count one by one leave out. A count can be right and still mislead by what it
 * omits: a tree listing four of five domains says nothing false on any line, and neither does
 * `messages/  # 8 message tools`. So a document that counts domain by domain counts every domain, one
 * that counts group by group counts every group, and a domain line split by group counts every group
 * in its domain.
 */
function omissionsIn(claimed: Array<Claim & { doc: string }>): string[] {
  const omitted: string[] = [];
  const check = (where: string, by: string, counted: Set<string>, all: Iterable<string>) => {
    if (counted.size === 0) return;
    for (const name of all) {
      if (!counted.has(name)) omitted.push(`${where} counts by ${by} but leaves out ${name}`);
    }
  };
  for (const doc of new Set(claimed.map((claim) => claim.doc))) {
    const own = claimed.filter((claim) => claim.doc === doc);
    check(doc, "domain", new Set(own.flatMap((c) => (c.domain ? [c.domain] : []))), domains.keys());
    check(doc, "group", new Set(own.flatMap((c) => (c.group && !c.domain ? [c.group] : []))), groups);

    const splits = new Map<string, typeof own>();
    for (const claim of own.filter((c) => c.domain && c.group)) {
      const key = `${claim.line} ${claim.domain}`;
      splits.set(key, [...(splits.get(key) ?? []), claim]);
    }
    for (const split of splits.values()) {
      const { line, domain } = split[0];
      check(`${doc}:${line}`, `group in ${domain}/`, new Set(split.map((c) => c.group!)), groupsOf(domain!));
    }
  }
  return omitted;
}

describe("the tool counts the documents state", () => {
  it("reads each shape of claim the way the documents write it", () => {
    expect(claimsIn("Provides 20 tools across four\ndomains, and wires 4 domains.")).toEqual([
      { line: 1, stated: 20, of: "tools" },
      { line: 1, stated: 4, of: "domains" },
      { line: 2, stated: 4, of: "domains" },
    ]);
    // A handful of tools, not the server's total.
    expect(claimsIn("These two tools share a script.")).toEqual([]);
    expect(
      claimsIn("    messages/   — 8 message tools + 4 attachment tools (12 total in this domain)")
    ).toEqual([
      { line: 1, stated: 8, of: "tools", domain: "messages", group: "messages" },
      { line: 1, stated: 4, of: "tools", domain: "messages", group: "attachments" },
      { line: 1, stated: 12, of: "tools", domain: "messages" },
    ]);
    expect(claimsIn("    mailboxes/  # 3 mailbox tools")).toEqual([
      { line: 1, stated: 3, of: "tools", domain: "mailboxes", group: "mailboxes" },
    ]);
    // Only as a domain line: this `3 tools` says nothing about the whole server.
    expect(claimsIn("    compose/                         # 3 tools")).toEqual([
      { line: 1, stated: 3, of: "tools", domain: "compose" },
    ]);
    expect(claimsIn("### Attachments (4)\n\n### Choosing the sending account")).toEqual([
      { line: 1, stated: 4, of: "tools", group: "attachments" },
    ]);
  });

  it("attributes every tool the entry point registers to exactly one domain", () => {
    expect(exposed.length).toBeGreaterThan(0);
    // Sorted lists compare as multisets: a name two domains both registered would appear twice on each
    // side, match, and pass, while every total counted it twice. So the names must be unique before
    // they are compared — and the finder is pinned, because one that found nothing would pass as well.
    expect(duplicates(["a", "b", "a", "a"])).toEqual(["a"]);
    expect(duplicates(exposed), "registered more than once through the entry point").toEqual([]);
    expect(
      duplicates(registered.map((tool) => tool.name)),
      "registered by more than one domain"
    ).toEqual([]);
    expect(registered.map((tool) => tool.name).sort()).toEqual([...exposed].sort());
  });

  // A scan that finds nothing passes for the wrong reason: every assertion below holds over an empty
  // list. So each shape must be found at least once — without saying how many times, which editing a
  // document would legitimately change.
  it("finds the documents and every shape of claim it is meant to be checking", () => {
    expect(documents()).toContain("README.md");
    expect(claims.some((claim) => claim.domain), "no project tree's domain line").toBe(true);
    expect(claims.some((claim) => claim.group && !claim.domain), "no heading counting a group").toBe(true);
    expect(claims.some((claim) => !claim.domain && !claim.group), "no count in prose").toBe(true);
  });

  it("states no count the registrations contradict", () => {
    const contradicted = claims
      .filter((claim) => claim.stated !== actual(claim))
      .map(
        (claim) =>
          `${claim.doc}:${claim.line} states ${claim.stated} for ${subject(claim)}; the registrations give ${actual(claim)}`
      );
    expect(contradicted).toEqual([]);
  });

  it("leaves nothing out of a document that counts one by one", () => {
    expect(omissionsIn(claims)).toEqual([]);
  });

  // Against the documents as they stand, the check above has only ever passed, and a check that stopped
  // looking would pass the same way. These are the omissions it exists to catch. Only what a document
  // names matters to it, so every count below is 1.
  it("reports what a document that counts one by one leaves out", () => {
    const names = [...domains.keys()];
    const tree = (line: (domain: string) => string) => names.map(line).join("\n");
    const split = names.find((domain) => groupsOf(domain).size > 1);
    expect(split, "no domain whose tools the documents split into groups").toBeDefined();
    const [kept, ...dropped] = groupsOf(split!);
    const [firstGroup, ...otherGroups] = groups;

    expect(omissionsIn(claimsOf("whole.md", tree((d) => `    ${d}/  # 1 tools`)))).toEqual([]);

    expect(
      omissionsIn(claimsOf("tree.md", names.slice(1).map((d) => `    ${d}/  # 1 tools`).join("\n")))
    ).toEqual([`tree.md counts by domain but leaves out ${names[0]}`]);

    expect(
      omissionsIn(claimsOf("headings.md", otherGroups.map((g) => `### ${g} (1)`).join("\n\n")))
    ).toEqual([`headings.md counts by group but leaves out ${firstGroup}`]);

    const splitTree = tree((d) => (d === split ? `    ${d}/  # 1 ${kept} tools` : `    ${d}/  # 1 tools`));
    expect(omissionsIn(claimsOf("split.md", splitTree))).toEqual(
      dropped.map(
        (group) => `split.md:${names.indexOf(split!) + 1} counts by group in ${split}/ but leaves out ${group}`
      )
    );
  });
});
