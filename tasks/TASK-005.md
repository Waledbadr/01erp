# TASK-005: Fix Vercel ESM startup failure

Status: DONE locally; deployment pending (2026-09-25)

Evidence: Vercel reports ERR_MODULE_NOT_FOUND for src/lib/accounting imported by src/lib/treasury.js. The source imports './accounting' without the extension required by native Node ESM.

Acceptance criteria:
- Correct runtime relative imports in the API dependency graph.
- Reproduce the failure with unbundled JavaScript executed by native Node, then verify startup, health, and synthetic registration succeed.
- Add a repeatable regression check that does not hide resolution failures through bundling or a TypeScript runtime loader.
- Run typecheck and the relevant existing tests; record deployment status accurately.
- Do not change persistence behavior or use production data in tests.

Verification:
- Before the fix, native Node reproduced ERR_MODULE_NOT_FOUND for src/lib/accounting imported by treasury.js.
- After the fix, npm run test:api-esm passed startup, health 200, invalid registration 400, and synthetic registration 201.
- npm run typecheck passed.
- Treasury and authentication/tenant security tests: 28 passed across 2 files.
- npm run build passed, with existing browser crypto externalization and large-chunk warnings.
- Local runtime: Node 23.11.0; CI is configured for Node 22. No remote CI or deployment execution is claimed.
- Existing npm ci lockfile consistency issue remains outside this focused import fix; dependencies were installed without modifying the lockfile in the preceding diagnostic task.
- No push or deployment performed. Existing in-memory registration storage remains unchanged.
