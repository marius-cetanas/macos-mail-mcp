#!/usr/bin/env node
/**
 * Driver for the branch-freshness check: ask the compare API how far behind the base the head is,
 * then let `classifyFreshness` decide. The decision lives in its own module so the rule is testable
 * without a network; this file is the thin part that fetches, through the reader every check shares,
 * so its one request carries the same headers and refuses a redirect as the others do.
 */
import { classifyFreshness, DEFAULT_LIMIT } from "./branch-freshness.mjs";
import { API, githubHeaders, readPages } from "./github-api.mjs";

const { GH_TOKEN, GITHUB_REPOSITORY, BASE, HEAD } = process.env;
if (!GH_TOKEN || !GITHUB_REPOSITORY || !BASE || !HEAD) {
  console.error("need GH_TOKEN, GITHUB_REPOSITORY, BASE and HEAD");
  process.exit(1);
}

const where = `compare/${BASE}...${HEAD}`;
let comparison;
try {
  comparison = await readPages({
    fetch,
    headers: githubHeaders(GH_TOKEN, "macos-mail-mcp-branch-freshness"),
    url: `${API}/repos/${GITHUB_REPOSITORY}/${where}`,
    where,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const { ok, message } = classifyFreshness({ behindBy: comparison.behind_by, limit: DEFAULT_LIMIT });
console.log(message);
process.exit(ok ? 0 : 1);
