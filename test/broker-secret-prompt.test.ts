// Tests for the interactive broker secret prompt used by `nw init`
// (core/prompt.ts). Exercises the three menu paths (generate / enter / skip),
// the re-prompt-on-invalid-input branch, and invalid-menu-key tolerance.

import { describe, it, expect } from "vitest";
import { resolveBrokerSecretAction } from "../core/prompt.ts";
import { parseBrokerSecret } from "../core/config.ts";

/**
 * Build a scripted `ask` function that returns the given answers in order.
 * Throws if the prompt asks more questions than we supplied answers for so
 * a hung state machine surfaces as a test failure instead of a deadlock.
 */
function scriptedAsk(answers: string[]): (question: string) => Promise<string> {
  let i = 0;
  return async (question: string): Promise<string> => {
    if (i >= answers.length) {
      throw new Error(
        `scriptedAsk exhausted; unexpected question: ${JSON.stringify(question)}`,
      );
    }
    return answers[i++]!;
  };
}

const validate = (value: string): boolean =>
  parseBrokerSecret(value) !== undefined;

describe("resolveBrokerSecretAction", () => {
  it("returns generate when the user presses enter (empty input)", async () => {
    const result = await resolveBrokerSecretAction(scriptedAsk([""]), validate);
    expect(result).toEqual({ action: "generate" });
  });

  it("returns generate on 'g'", async () => {
    const result = await resolveBrokerSecretAction(scriptedAsk(["g"]), validate);
    expect(result).toEqual({ action: "generate" });
  });

  it("returns skip on 's'", async () => {
    const result = await resolveBrokerSecretAction(scriptedAsk(["s"]), validate);
    expect(result).toEqual({ action: "skip" });
  });

  it("returns enter + pasted value when valid", async () => {
    const pasted = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
    const result = await resolveBrokerSecretAction(
      scriptedAsk(["e", pasted]),
      validate,
    );
    expect(result).toEqual({ action: "enter", value: pasted });
  });

  it("re-prompts on invalid secret and accepts a valid retry", async () => {
    const pasted = Buffer.from(new Uint8Array(32).fill(2)).toString("base64");
    // Expected call sequence: menu choice "e", first paste is garbage
    // (too short), second paste is valid.
    const result = await resolveBrokerSecretAction(
      scriptedAsk(["e", "not-a-real-secret", pasted]),
      validate,
    );
    expect(result).toEqual({ action: "enter", value: pasted });
  });

  it("re-prompts on unrecognized menu key", async () => {
    // "q" is not a valid menu key; the prompt should redraw and we then
    // press enter for the default.
    const result = await resolveBrokerSecretAction(
      scriptedAsk(["q", ""]),
      validate,
    );
    expect(result).toEqual({ action: "generate" });
  });

  it("is case-insensitive and trims whitespace on menu input", async () => {
    const result = await resolveBrokerSecretAction(
      scriptedAsk(["  G  "]),
      validate,
    );
    expect(result).toEqual({ action: "generate" });
  });
});
