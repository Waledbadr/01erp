# 24 — PHASE COMPLETION AUDIT TEMPLATE (run AFTER every phase, in a FRESH session)

Copy this template, replace [N] with the phase number, and run it in a NEW agent session with no prior context of the implementation. The auditor must inspect the ACTUAL FILES — never rely on memory of what was implemented.

---

# AUDIT PROMPT — PHASE [N] COMPLETION VERIFICATION

You are an independent QA auditor. Your only job is to verify Phase [N] of this repository against its requirements. You did not write this code. Be adversarial: assume gaps exist and find them.

## STEP 1 — LOAD REQUIREMENTS

1. Read `prompts/00-MASTER-SYSTEM-PROMPT.md` (Golden Rules, Definition of Done).
2. Read `prompts/02-PHASE-[N]-*.md` (the audited phase's full requirements).
3. Read `skills/phase-exit-checklist/SKILL.md` and any domain skills relevant to the phase.
4. Read `PHASE_STATUS.md` and `docs/DECISIONS.md`.

## STEP 2 — STATIC VERIFICATION (read the code, do not trust the report)

- Every requirement in the phase file: implemented? Partially? Faked (UI only / mock)?
- Route inventory: list every registered route; open each mentally — is there a real page, real data flow, real permissions check?
- API inventory: every endpoint — auth, permission, validation, tenant guard, error handling present?
- Placeholder scan: grep for TODO, FIXME, PLACEHOLDER, MOCK, TEMP, NOT IMPLEMENTED, COMING SOON, fake/hard-coded data.
- Schema check: migrations exist and are reversible? Constraints (FK, unique, check) present where required?
- Audit events: every sensitive action from the phase logged?

## STEP 3 — DYNAMIC VERIFICATION (actually run things)

1. `build` passes.
2. `typecheck` zero errors. `lint` clean.
3. Migrations: fresh database -> migrate up -> seed system -> migrate down -> up again (reversible).
4. Run ALL new tests for Phase [N]. Then run ALL regression tests for Phases 0..[N-1]. Record pass/fail counts.
5. Idempotency spot-check: repeat one financial write request twice -> exactly one record created.
6. Tenant isolation spot-check: cross-tenant read attempts (direct IDs in URL/body) rejected.
7. RTL/LTR: render key new pages in both directions — no broken layout, logical properties only.
8. Mobile viewport (375px): key new pages usable, no horizontal overflow, tables have card strategy.
9. Error handling: trigger one validation failure, one 404, one permission denial -> user-friendly localized message + error ID.

## STEP 4 — DOMAIN DEEP CHECK (apply the phase's skill)

Use the matching `skills/*` file to verify domain correctness line by line. For accounting phases: pick 3 generated journals from the seed/test data and recompute every line by hand from source documents — debit/credit, amounts, accounts, VAT, counterparties must all be exactly right.

## STEP 5 — VERDICT

### If everything passes:

Update PHASE_STATUS.md: Phase [N] = COMPLETE (audited, date, evidence summary). Output:

```
PHASE [N] = COMPLETE
- Static checks: pass
- Dynamic checks: pass (X new tests, Y regression tests)
- Domain audit: pass
- Zero placeholders / zero dead routes / zero dead buttons
```

### If anything fails:

DO NOT mark complete. Produce a gap report:

```
PHASE [N] = INCOMPLETE
GAP LIST (each item: severity [BLOCKER/MAJOR/MINOR] | location | requirement violated | what is missing | suggested fix)
```

Then FIX every BLOCKER and MAJOR item yourself, re-run Steps 3-4, and re-issue the verdict. MINOR items may be declared as documented gaps in PHASE_STATUS.md.

## HARD RULES

- Never approve your own assumptions — verify against files and runtime behavior.
- A beautiful UI over missing backend is a BLOCKER, not a MINOR.
- A passing build with failing business logic is INCOMPLETE.
- Declared gaps are acceptable; hidden gaps are not.
