# CLI commands should accept both comma-separated and space-separated IDs

**Observed:** `ninthwave batch-order` silently treated comma-separated IDs as a single unknown item (zero results). `ninthwave conflicts` rejected comma-separated IDs with a usage error. Both work fine with space-separated args.

**Impact:** Wasted a round-trip during /work. The AI skill naturally passes comma-separated lists (matching the `--items` flag format), but batch-order and conflicts only accept space-separated.

**Suggestion:** All commands that accept multiple item IDs should split on both commas and spaces. The `--items` flag already uses commas — the rest should too.
