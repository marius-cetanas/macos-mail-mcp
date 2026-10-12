- The lockfile no longer carries the eight advisories `npm audit` reported against it on
  2026-10-12, in five packages: `proxy-addr` (one critical), `@modelcontextprotocol/sdk` (one high),
  `source-map-js` (one high), `ip-address` (four moderate) and `fast-uri` (one moderate). `npm audit`
  reports 0 vulnerabilities. Dependabot's #115 proposed SDK 1.30.1, the last version
  GHSA-6qxp-vccf-f47h covers, so the lockfile holds 1.32.1 instead. That advisory is in the SDK's
  OAuth client, and this server imports `McpServer` and `StdioServerTransport` from the SDK and
  nothing else. The published package ships no lockfile and its dependency ranges already admitted
  the patched versions; what moved is this repository's own CI and development tree, where `audit`
  had turned red on `main` between 2026-09-29 and 2026-10-06 and on every pull request with it.
