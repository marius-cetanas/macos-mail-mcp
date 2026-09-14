import { execFileSync } from "node:child_process";

/**
 * Every tracked Markdown file except the two kinds that record rather than state — the documents a
 * test holds to the tree when it checks what the documentation claims.
 *
 * `CHANGELOG.md` records changes, so its entries name figures the tree has moved past: the tool count
 * 1.0.0 shipped with, the Node floor a raise replaced. That is as true of `[Unreleased]` as of a
 * released entry, so the file is excluded whole. The handoffs record sessions.
 *
 * A query rather than a list, because a list is where the one document nobody thought of goes
 * unchecked: the Node-floor test first named its documents, and "Node.js 20+" survived in the one it
 * did not name while it passed (#73).
 */
export function documents(): string[] {
  return execFileSync("git", ["ls-files", "*.md"], { cwd: process.cwd(), encoding: "utf8" })
    .split("\n")
    .filter((f) => f !== "" && f !== "CHANGELOG.md" && !f.startsWith(".portulan/handoffs/"));
}
