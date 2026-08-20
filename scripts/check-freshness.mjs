#!/usr/bin/env node
/**
 * Driver for the branch-freshness check: ask the compare API how far behind the base the head is,
 * then let `classifyFreshness` decide. The decision lives in its own module so the rule is testable
 * without a network; this file is the thin part that fetches.
 */
import { classifyFreshness, DEFAULT_LIMIT } from "./branch-freshness.mjs";

const { GH_TOKEN, GITHUB_REPOSITORY, BASE, HEAD } = process.env;
if (!GH_TOKEN || !GITHUB_REPOSITORY || !BASE || !HEAD) {
  console.error("need GH_TOKEN, GITHUB_REPOSITORY, BASE and HEAD");
  process.exit(1);
}

const res = await fetch(
  `https://api.github.com/repos/${GITHUB_REPOSITORY}/compare/${BASE}...${HEAD}`,
  {
    headers: {
      authorization: `Bearer ${GH_TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "macos-mail-mcp-branch-freshness",
    },
  }
);
if (!res.ok) {
  console.error(`compare ${BASE}...${HEAD} -> ${res.status}`);
  process.exit(1);
}

const { behind_by: behindBy } = await res.json();
const { ok, message } = classifyFreshness({ behindBy, limit: DEFAULT_LIMIT });
console.log(message);
process.exit(ok ? 0 : 1);
