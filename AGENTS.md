# Project orientation

Read `00-MASTER-SYSTEM-PROMPT.md`, the current numbered phase file, `PHASE_STATUS.md`, and the relevant `skills/*/SKILL.md` before changes. The requirement files and audit template live at the repository root; references to `prompts/` in older instructions refer to these root files.

The application is a single Next.js App Router project using strict TypeScript, Tailwind, Drizzle, and PostgreSQL. `src/app` holds routes, `src/components` UI, `src/i18n` translations, `src/db` schema/client, and `src/server` domain modules. Phase 00 contains system defaults and health checks; authentication and business workflows belong to later phases. `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` record decisions.

Commands: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed:system`, `npm run db:verify`. Use supported Node versions from `package.json`. Each task gets `tasks/TASK-<n>.md` acceptance criteria before coding and is marked done only after verification. Financial writes must be tenant scoped, transactional, exact-decimal, and ledger backed in their phases.

Never mark a phase complete without `skills/phase-exit-checklist/SKILL.md` and `24-AUDIT-TEMPLATE.md`. Keep real data and secrets out of tests and Git.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
