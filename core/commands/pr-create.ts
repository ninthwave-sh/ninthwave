// pr-create command: workers wrap `gh pr create` with rate-limit-aware
// retries so a transient GraphQL rate-limit hit doesn't burn the worker's
// own retry budget. All other gh failures bubble up unchanged so the
// worker still sees real errors immediately.
//
// Usage: nw pr-create [<gh pr create args>...]
// Example: nw pr-create --label "domain:foo" --title "fix: ..." --body "$(cat <<'EOF' ... EOF)"

import { GH_TIMEOUT } from "../shell.ts";
import { runGhWithRateLimitRetry } from "../gh.ts";

/** Default upper bound on a single rate-limit backoff (5 minutes). */
const DEFAULT_MAX_WAIT_MS = 5 * 60_000;

/** Default ceiling on rate-limit retries before falling back to the worker. */
const DEFAULT_MAX_RETRIES = 5;

/**
 * Forward arbitrary `gh pr create` args through the shared rate-limit-aware
 * retry helper. Prints the gh stdout (the PR URL on success), prints stderr
 * on failure, and exits with the gh exit code.
 *
 * Implements the worker side of the M-ORCH-19 contract: rate-limit failures
 * are absorbed by the shared backoff/retry pathway instead of consuming the
 * worker's prescribed retries.
 */
export async function cmdPrCreate(
  args: string[],
  projectRoot: string,
): Promise<number> {
  const result = await runGhWithRateLimitRetry(["pr", "create", ...args], {
    cwd: projectRoot,
    timeout: GH_TIMEOUT,
    maxRetries: DEFAULT_MAX_RETRIES,
    maxWaitMs: DEFAULT_MAX_WAIT_MS,
    onRetry: ({ attempt, waitMs, stderr }) => {
      // One concise line per backoff so users tailing the worker see why we paused.
      const seconds = Math.round(waitMs / 1000);
      const reason = stderr.split("\n")[0] ?? "rate limit";
      process.stderr.write(
        `nw pr-create: rate limit hit (attempt ${attempt + 1}); waiting ${seconds}s before retry. ${reason}\n`,
      );
    },
  });

  if (result.stdout) {
    process.stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.exitCode !== 0 && result.stderr) {
    process.stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }
  return result.exitCode;
}
