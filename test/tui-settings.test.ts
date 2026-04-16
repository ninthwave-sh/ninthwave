// Tests for TUI settings resolution with per-repo config overrides.

import { describe, it, expect } from "vitest";
import {
  resolveTuiSettingsDefaults,
  TUI_SETTINGS_DEFAULTS,
} from "../core/tui-settings.ts";

describe("resolveTuiSettingsDefaults", () => {
  it("returns hardcoded defaults when both configs are empty", () => {
    const result = resolveTuiSettingsDefaults({});
    expect(result).toEqual(TUI_SETTINGS_DEFAULTS);
  });

  it("returns hardcoded defaults when both configs are absent", () => {
    const result = resolveTuiSettingsDefaults({}, undefined);
    expect(result).toEqual(TUI_SETTINGS_DEFAULTS);
  });

  it("uses global user config values as fallback", () => {
    const result = resolveTuiSettingsDefaults({
      merge_strategy: "auto",
      review_mode: "off",
      collaboration_mode: "connect",
    });
    expect(result).toEqual({
      mergeStrategy: "auto",
      reviewMode: "off",
      collaborationMode: "connect",
    });
  });

  it("per-repo config overrides global user config", () => {
    const result = resolveTuiSettingsDefaults(
      { merge_strategy: "manual", review_mode: "on", collaboration_mode: "local" },
      { merge_strategy: "auto", review_mode: "off", collaboration_mode: "connect" },
    );
    expect(result).toEqual({
      mergeStrategy: "auto",
      reviewMode: "off",
      collaborationMode: "connect",
    });
  });

  it("falls back to global when per-repo field is absent", () => {
    const result = resolveTuiSettingsDefaults(
      { merge_strategy: "auto", review_mode: "off", collaboration_mode: "connect" },
      {},
    );
    expect(result).toEqual({
      mergeStrategy: "auto",
      reviewMode: "off",
      collaborationMode: "connect",
    });
  });

  it("falls back to hardcoded default when both are absent for a field", () => {
    const result = resolveTuiSettingsDefaults(
      { merge_strategy: "auto" },
      { review_mode: "off" },
    );
    expect(result).toEqual({
      mergeStrategy: "auto",
      reviewMode: "off",
      collaborationMode: TUI_SETTINGS_DEFAULTS.collaborationMode,
    });
  });

  it("ignores invalid per-repo values and falls back to global", () => {
    const result = resolveTuiSettingsDefaults(
      { merge_strategy: "auto" },
      { merge_strategy: "invalid-value" as any },
    );
    expect(result.mergeStrategy).toBe("auto");
  });

  it("ignores invalid per-repo values and falls back to hardcoded default", () => {
    const result = resolveTuiSettingsDefaults(
      {},
      { merge_strategy: "invalid-value" as any },
    );
    expect(result.mergeStrategy).toBe(TUI_SETTINGS_DEFAULTS.mergeStrategy);
  });

  it("normalizes legacy review mode values from per-repo config", () => {
    const result = resolveTuiSettingsDefaults(
      {},
      { review_mode: "mine" as any },
    );
    expect(result.reviewMode).toBe("on");
  });

  it("normalizes legacy collaboration mode values from per-repo config", () => {
    const result = resolveTuiSettingsDefaults(
      {},
      { collaboration_mode: "share" as any },
    );
    expect(result.collaborationMode).toBe("connect");
  });
});
