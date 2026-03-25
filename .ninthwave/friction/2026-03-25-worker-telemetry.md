# Workers need telemetry for evidence-based failure diagnosis

**Observed:** When H-PRX-4 worker died twice, the only evidence was screen scraping output ("Bootstrapping... 45s" then dead). No exit code, no stderr, no resource usage metrics, no timing data. The root cause investigation had to rely on inference rather than evidence.

**Impact:** Can't make evidence-based decisions about worker failures. Diagnosis devolves into speculation. Retry decisions are uninformed.

**Suggestion:**
- Capture worker exit code and stderr when worker process dies
- Log worker resource usage (memory, CPU) at regular intervals
- Record exact duration of each worker phase (startup, explore, plan, implement, test, PR)
- Log the last N lines of worker output on crash (not just screen scraping)
- Add a `ninthwave logs <ID>` command to inspect worker telemetry after the fact
- Consider structured telemetry events: worker_start, worker_phase_change, worker_exit, worker_error
- Daemon should log why it declared a worker "stuck" (timeout? exit code? screen pattern?)
