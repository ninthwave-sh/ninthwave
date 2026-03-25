# Feat: Show dependency trees visually in status output (M-UX-1)

**Priority:** Medium
**Source:** Dogfooding friction (2026-03-25): dependency-tree-viz
**Depends on:** -
**Domain:** ux

`ninthwave status` shows a flat list of items. When items have dependency chains (e.g., H-PRX-4 -> H-PRX-5 -> H-PRX-6 -> H-PRX-7 -> H-PRX-8 -> M-PRX-9), the chain is not visually apparent. Users cannot tell at a glance which items are blocked by what or how deep the dependency chain goes.

Update `cmdStatus` to render items as a dependency tree when dependencies exist:
1. Build the dependency graph from the TODO items.
2. Identify root items (no dependencies or dependencies outside the current set).
3. Render roots at the top level, then indent dependents below their parent.
4. Use tree-drawing characters for visual clarity (e.g., `├──`, `└──`, `│`).
5. Items with no dependency relationships continue to render as a flat list.
6. Add a `--flat` flag to force the old flat-list behavior.

Example output:
```
✓ H-PRX-4     Merged     Add session CA cert generation
  ✓ H-PRX-5   Merged     Add Cedar policy evaluation
    · H-PRX-6  Queued     Add credential injection + TOML config
      · H-PRX-7 Queued    ninthwave proxy-launcher
```

**Test plan:**
- Items with dependency chains render as an indented tree
- Root items (no deps) render at top level
- Multiple independent trees render separately
- Items with no dependencies render in flat list
- `--flat` flag forces flat rendering
- State icons and colors are preserved in tree view
- Wide terminal: columns align properly
- Narrow terminal: output degrades gracefully (no wrapping artifacts)

Acceptance: Dependency chains are visually apparent in `ninthwave status` output. Tree rendering uses indentation and connector characters. `--flat` flag preserves old behavior. Existing status tests pass.

Key files: `core/commands/status.ts`, `core/cli.ts`
