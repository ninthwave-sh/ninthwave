import type { RunResult } from "./types.ts";

/** Recommended timeout for git commands (30 seconds). */
export const GIT_TIMEOUT = 30_000;

/** Recommended timeout for gh CLI commands (60 seconds). */
export const GH_TIMEOUT = 60_000;

export function run(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; input?: string; timeout?: number },
): RunResult {
  const start = opts?.timeout !== undefined ? Date.now() : 0;
  const result = Bun.spawnSync([cmd, ...args], {
    cwd: opts?.cwd,
    stdin: opts?.input ? new TextEncoder().encode(opts.input) : undefined,
    timeout: opts?.timeout,
  });
  // Bun returns exitCode: null when a process is killed by signal (e.g., timeout).
  // Normalize to a number for callers.
  const exitCode = result.exitCode ?? 124;
  const timedOut =
    opts?.timeout !== undefined && Date.now() - start >= opts.timeout;
  if (timedOut) {
    return {
      stdout: result.stdout.toString().trim(),
      stderr: `TIMEOUT: command timed out after ${opts!.timeout}ms: ${cmd} ${args.join(" ")}`,
      exitCode: exitCode === 0 ? 124 : exitCode,
      timedOut: true,
    };
  }
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode,
  };
}

/**
 * Async shell runner using Bun.spawn. Yields to the event loop while the
 * child process runs, keeping the TUI responsive during long gh CLI calls.
 *
 * Returns the same RunResult shape as the synchronous `run()`.
 */
export async function runAsync(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; input?: string; timeout?: number },
): Promise<RunResult> {
  const start = opts?.timeout !== undefined ? Date.now() : 0;

  const proc = Bun.spawn([cmd, ...args], {
    cwd: opts?.cwd,
    stdin: opts?.input ? new Blob([opts.input]) : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;

  if (opts?.timeout !== undefined) {
    // Race the process against a timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, opts.timeout);

    try {
      await proc.exited;
    } finally {
      clearTimeout(timeoutId);
    }
  } else {
    await proc.exited;
  }

  // Check elapsed time as a secondary timeout signal (matches sync behavior)
  if (opts?.timeout !== undefined && !timedOut && Date.now() - start >= opts.timeout) {
    timedOut = true;
  }

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = proc.exitCode ?? 124;

  if (timedOut) {
    return {
      stdout: stdout.trim(),
      stderr: `TIMEOUT: command timed out after ${opts!.timeout}ms: ${cmd} ${args.join(" ")}`,
      exitCode: exitCode === 0 ? 124 : exitCode,
      timedOut: true,
    };
  }

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
  };
}
