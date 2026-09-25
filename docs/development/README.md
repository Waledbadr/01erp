# سجل بناء التطبيق — Build history

This folder keeps everything about **how the application was built**, separate from the product
documentation in `docs/` and from the application code.

| Path | Contents |
|---|---|
| `phases/00-MASTER-SYSTEM-PROMPT.md` | The master instruction file the phases were generated from |
| `phases/01-…` → `phases/23-…` | One instruction file per build phase (foundation, accounting, sales, ZATCA…) |
| `phases/24-AUDIT-TEMPLATE.md` | Audit checklist template used at the end of each phase |
| `PHASE_STATUS.md` | Phase tracking table. **Read the correction at the end of the file**: the "COMPLETE" marks predate real data storage |
| `tasks/` | Task records with acceptance criteria and evidence (`TASK-005` Vercel fix, `TASK-006` PostgreSQL persistence, `TASK-007` UI clean-up) |
| `demo-accounts.txt` | Demo accounts list — kept on the developer machine only, not in git |

Developer-only screens of the app (design system, project docs viewer, build phases, rule audit tools)
are still in the code but are shown **only in development builds** (`npm run dev`), under
"أدوات المطوّر" in the menu. Customers never see them.
