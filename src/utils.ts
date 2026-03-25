import { homedir } from "node:os";

/**
 * Remove newlines and carriage returns that would break AppleScript string literals.
 * Replaces one or more consecutive \r and \n characters with a single space.
 */
export function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}

/**
 * Expand tilde (~) at the start of a path to the user's home directory.
 */
export function expandTilde(p: string): string {
  if (p.startsWith("~/")) {
    return homedir() + p.slice(1);
  }
  return p;
}
