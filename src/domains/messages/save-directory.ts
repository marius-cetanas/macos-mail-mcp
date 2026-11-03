import { mkdir, stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { expandTilde } from "../../utils.js";

export async function prepareSaveDirectory(savePath: string): Promise<string> {
  if (savePath.length === 0 || savePath.includes("\0")) {
    throw new Error(`Invalid savePath ${JSON.stringify(savePath)}: provide a non-empty directory path without NUL characters.`);
  }
  const directory = resolve(expandTilde(savePath === "~" ? "~/" : savePath));
  try {
    await mkdir(directory, { recursive: true });
    if (!(await stat(directory)).isDirectory()) throw new Error("not a directory");
    await access(directory, constants.W_OK | constants.X_OK);
  } catch (error) {
    throw new Error(`Cannot prepare savePath ${JSON.stringify(directory)}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return directory;
}
