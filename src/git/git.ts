import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitCommandError, GitUnavailableError } from "./errors.js";

const execFileAsync = promisify(execFile);

/**
 * Thin wrapper around the Git executable via `child_process.execFile`
 * (no shell — paths/arguments are safe and Windows-compatible). All Git
 * access in Phase 1E flows through this helper so error semantics are
 * centralized.
 */

/**
 * Run `git` with `args` in `cwd` and return the raw stdout (exact bytes,
 * untrimmed — callers that parse NUL-delimited records need the raw output).
 *
 * Throws `GitUnavailableError` when git is not installed and
 * `GitCommandError` when git exits non-zero.
 */
export async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  let result;
  try {
    result = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      encoding: "utf8",
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "EACCES") {
      throw new GitUnavailableError(String(code));
    }
    const stderr = String((err as { stderr?: string }).stderr ?? "").trim();
    throw new GitCommandError(`git ${args.join(" ")}`, stderr);
  }
  return result.stdout;
}
