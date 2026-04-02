export interface FakeTerminalOptions {
  term?: string;
  columns?: number;
  lines?: number;
  color?: boolean;
}

export interface FakeTerminal {
  term: string;
  columns: number;
  lines: number;
  color: boolean;
  env: Record<string, string>;
}

export function createFakeTerminal(options: FakeTerminalOptions = {}): FakeTerminal {
  const term = options.term ?? "xterm-256color";
  const columns = options.columns ?? 120;
  const lines = options.lines ?? 40;
  const color = options.color ?? false;

  return {
    term,
    columns,
    lines,
    color,
    env: {
      TERM: term,
      COLUMNS: String(columns),
      LINES: String(lines),
      CI: "1",
      GH_PAGER: "cat",
      GIT_PAGER: "cat",
      PAGER: "cat",
      ...(color ? { FORCE_COLOR: "1" } : { NO_COLOR: "1" }),
    },
  };
}

export function buildFakeTerminalEnv(options: FakeTerminalOptions = {}): Record<string, string> {
  return createFakeTerminal(options).env;
}
