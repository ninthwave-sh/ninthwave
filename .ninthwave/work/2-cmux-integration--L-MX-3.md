# Chore: Soften VISION.md multiplexer goal and update docs (L-MX-3)

**Priority:** Low
**Source:** CEO review of cmux strategy 2026-03-28
**Depends on:** H-MX-2
**Domain:** cmux-integration

Update VISION.md and ARCHITECTURE.md to reflect Strategy B (cmux-first, extensible).

## Changes

**VISION.md:**
- Change "Works with 2+ terminal multiplexers (currently: cmux, tmux, zellij)" to "Extensible multiplexer support (ships with cmux, community can extend via Multiplexer interface)"
- Remove tmux and zellij from the feature-completeness criteria

**ARCHITECTURE.md:**
- Keep the "Adding a New Multiplexer Adapter" section (it's the extension guide)
- Add note: "cmux is the only shipped adapter. tmux and zellij adapters were removed in v0.2.0 due to reliability issues (message delivery, session identification). The interface remains extensible for community contributions."

**Test plan:** None (documentation only).

Acceptance: VISION.md reflects current reality. ARCHITECTURE.md preserves extension guide with honest context about why adapters were removed.

Key files: `VISION.md`, `ARCHITECTURE.md`
