// macos-mail-mcp — MIT License — https://github.com/marius-cetanas/macos-mail-mcp
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import type { AppleScriptError } from "../types.js";

const execFileAsync = promisify(execFile);

export const DEFAULT_TIMEOUT = 30_000;
export const EXTENDED_TIMEOUT = 120_000;

/**
 * Escape a string value for safe embedding inside an AppleScript double-quoted string.
 * Backslashes must be escaped first, then double quotes.
 * AppleScript string literals do NOT interpret escape sequences like \n or \t,
 * so we only need to escape backslashes and double quotes.
 */
export function escapeForAppleScript(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

/**
 * Substitute {{key}} placeholders in a template with (escaped) values from params.
 * Unmatched placeholders are left as-is.
 */
export function substituteParams(
  template: string,
  params: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      return escapeForAppleScript(params[key]);
    }
    return `{{${key}}}`;
  });
}

/**
 * Parse trimmed AppleScript stdout as JSON.
 * If the result has the shape {error, errorNumber}, throws an Error with the error message.
 */
export function parseAppleScriptOutput(output: string): unknown {
  const trimmed = output.trim();
  const parsed: unknown = JSON.parse(trimmed);

  // Detect AppleScript error shape
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "error" in parsed &&
    "errorNumber" in parsed
  ) {
    const err = parsed as AppleScriptError;
    throw new Error(err.error);
  }

  return parsed;
}

/**
 * Run an AppleScript file (relative to the domains directory) with optional parameter substitution.
 *
 * Script path is resolved from build/bridge/ → build/domains/<scriptPath>.
 * Uses execFile (not exec) to avoid shell injection.
 * Writes interpolated script to a temp file, executes it, and cleans up.
 */
export async function runAppleScript(
  scriptPath: string,
  params?: Record<string, string>,
  options?: { timeout?: number }
): Promise<unknown> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  // Resolve script path: from build/bridge/ up one level then into domains/
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const resolvedScriptPath = join(thisDir, "..", "domains", scriptPath);

  // Read shared escapeForJson handler and domain script template
  const sharedHandlerPath = join(thisDir, "escape-for-json.applescript");
  const [sharedHandler, template] = await Promise.all([
    readFile(sharedHandlerPath, "utf8"),
    readFile(resolvedScriptPath, "utf8"),
  ]);

  // Substitute params if provided, then prepend shared handler
  const interpolated = params ? substituteParams(template, params) : template;
  const script = sharedHandler + "\n" + interpolated;

  // Write to temp file
  const tempDir = await mkdtemp(join(tmpdir(), "macos-mail-mcp-"));
  const tempFile = join(tempDir, "script.applescript");

  try {
    await writeFile(tempFile, script, "utf8");

    let stdout: string;
    let stderr: string;

    try {
      const result = await execFileAsync("osascript", [tempFile], { timeout });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (err: unknown) {
      const execError = err as NodeJS.ErrnoException & {
        killed?: boolean;
        stderr?: string;
        message?: string;
      };

      if (execError.killed) {
        throw new Error(
          `AppleScript timed out after ${Math.round(timeout / 1000)} seconds`
        );
      }

      const stderrText = execError.stderr ?? "";
      if (stderrText.includes("is not running")) {
        throw new Error("Mail.app is not running. Please open it first.");
      }

      throw new Error(
        `AppleScript execution failed: ${stderrText || execError.message}`
      );
    }

    // stderr present but osascript exited 0 — treat as non-fatal warning
    if (stderr && stderr.trim()) {
      console.warn(`[macos-mail-mcp] AppleScript warning: ${stderr.trim()}`);
    }

    return parseAppleScriptOutput(stdout);
  } finally {
    // Clean up temp files
    await rm(tempDir, { recursive: true, force: true });
  }
}
