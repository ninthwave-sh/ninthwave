# Docs: Architecture documentation for contributors (L-ARC-1)

**Priority:** Low
**Source:** Vision exploration — public repo readiness
**Depends on:**
**Domain:** docs

## Context

CONTRIBUTING.md has a good development setup guide and high-level architecture overview, but contributors need deeper documentation of the orchestrator state machine, data flow, and extension points. An ARCHITECTURE.md would make the codebase accessible to external contributors who want to understand how the pieces fit together before diving into code.

## Requirements

1. Create `ARCHITECTURE.md` at the project root with the following sections:
   - **Orchestrator State Machine** — All 13+ states, valid transitions, trigger conditions. Text-based state diagram using Mermaid or ASCII art.
   - **Data Flow** — How a TODO file flows through decompose → start → orchestrate → merge. Show the lifecycle from file creation to PR merge to cleanup.
   - **Key Abstractions** — `Multiplexer` interface, `TaskBackend` interface, `StatusSync` interface, `SessionUrlProvider` pattern. What each abstracts and how to implement a new one.
   - **Extension Points** — How to add a new multiplexer adapter, task backend, or CLI command. Step-by-step.
   - **Supervisor Architecture** — Deterministic daemon + optional LLM supervisor. What each does, how they interact, the backoff/disable mechanism.
   - **Worker Lifecycle** — How workers are launched, communicate, and cleaned up. The workspace ref, heartbeat, and health check mechanisms.
   - **Sandbox Tiers** — nono (local), policy proxy (MITM), Firecracker (future). How they layer.
2. Keep it factual and current — reference actual file paths and function names.
3. Add a link from CONTRIBUTING.md's Architecture section to the new ARCHITECTURE.md.
4. Keep the document under 500 lines — concise reference, not a novel.

Acceptance: `ARCHITECTURE.md` exists at the project root with state machine diagram, data flow documentation, extension point guides, and links to key source files. CONTRIBUTING.md links to it. The document is accurate against the current codebase.

**Test plan:**
- Verify all referenced file paths exist in the codebase
- Verify state names match the actual state machine in `core/orchestrator.ts`
- Verify interface names match `core/types.ts`
- Verify extension point instructions are actionable (a contributor could follow them)

Key files: `ARCHITECTURE.md` (new), `CONTRIBUTING.md`, `core/orchestrator.ts`, `core/types.ts`
