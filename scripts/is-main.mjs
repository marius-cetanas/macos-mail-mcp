import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Was this module run directly, rather than imported?
 *
 * ## Why not `import.meta.url === \`file://${process.argv[1]}\``
 *
 * Because it is string equality between two things that are not the same string. `import.meta.url`
 * is a URL, so a path containing a space arrives percent-encoded (`has%20space`) while `argv[1]`
 * carries the raw byte; and neither side is resolved, so a symlinked path (`/tmp` →
 * `/private/tmp` on macOS) compares unequal to itself. Both measured.
 *
 * The failure is silent and it fails the wrong way: the guard returns false, the CLI arm never
 * runs, the process exits 0, and a check that polled nothing reports success. A gate that passes
 * without checking is worse than one that is absent, because it is trusted.
 *
 * Comparing resolved real paths fixes both. Matching on basename would not — it fires for any
 * same-named script — and splitting on "/" misses Windows separators.
 *
 * @param {string} metaUrl the caller's own `import.meta.url`
 */
export function isMain(metaUrl) {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}
