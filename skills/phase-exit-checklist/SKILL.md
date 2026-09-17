---
name: phase-exit-checklist
description: Audit a project phase before it can be marked complete.
---

# Phase exit checklist

Read before claiming any phase complete. List every requirement and route. Run migrations up/down on scratch DB, build, typecheck, lint, new tests, and all prior regression tests. Verify route inventory has no dead links and every visible action works or is explicitly disabled with a translated reason. Review keyboard access, both Arabic RTL and English LTR screenshots, and desktop/tablet/mobile widths with no horizontal overflow. Scan repository for TODO, FIXME, PLACEHOLDER, MOCK, TEMP, NOT IMPLEMENTED, COMING SOON; document intentional deferrals in PHASE_STATUS.md. Check authorization, audit, error handling, and financial reconciliation. Update docs, PHASE_STATUS.md, and DECISIONS.md. Apply 24-AUDIT-TEMPLATE.md and record evidence. Mark complete only when every applicable check passes.
