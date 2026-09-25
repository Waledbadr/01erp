---
name: phase-exit-checklist
description: The official, rigorous verification checklist required before declaring any implementation phase complete in the Saudi ERP platform.
---

# Phase Exit Checklist Skill (`skills/phase-exit-checklist/SKILL.md`)

## 1. Overview
No phase in the project may be marked as COMPLETE in `docs/development/PHASE_STATUS.md` without passing every single check in this checklist. Skipping any item is an immediate quality violation.

---

## 2. The Complete Pre-Exit Verification Sequence

### Step 1: Zero Compiler & Linter Warnings
- [ ] Run `npm run typecheck` or `tsc --noEmit`. Must exit with code 0 (zero errors).
- [ ] Run `npm run lint`. Must exit with code 0 (zero lint errors or unresolved imports).
- [ ] No `any` escapes in core financial or inventory calculation pipelines.

### Step 2: Test Suite Execution & Coverage
- [ ] Run `npm test`. 100% of all unit tests must pass cleanly.
- [ ] Run `npm run test:e2e` (or configured E2E test suites).
- [ ] Regression check: All previously passing phase tests must remain green.
- [ ] Assert that new tests verify the specific domain rules of the phase (e.g. fixed-point math, debit=credit balance, WAC serialization).

### Step 3: Database & Migration Verification
- [ ] Schema changes reflected in Drizzle ORM / SQL schema.
- [ ] Migration scripts run cleanly (`npm run db:migrate`) without altering existing historical tables destructively.
- [ ] Verify database triggers and constraints (e.g. check constraints on debit/credit equality, positive stock balances).

### Step 4: UI / Navigation / Button Integrity Audit
- [ ] **Zero Dead Links**: Every route, tab, link, or navigation item renders a valid screen.
- [ ] **Zero Dead Buttons**: Every button in the UI triggers a real state change, modal, calculation, or API call. No empty click handlers (`onClick={() => {}}`).
- [ ] **No Placeholder / Fake UI**: No "Lorem ipsum", no mock placeholder cards, no fake counters.
- [ ] **Error Boundary & Empty States**: Every view handles loading, empty data, and error scenarios gracefully.

### Step 5: Bilingual RTL & LTR Visual Verification
- [ ] Native Arabic (`ar-SA`) RTL verified with correct logical CSS classes (`start-`, `end-`, `ms-`, `me-`, `ps-`, `pe-`).
- [ ] English (`en-US`) LTR verified with correct text flow and icon alignment.
- [ ] Instant toggle between languages without page refresh or session loss.
- [ ] All UI strings loaded from i18n translation resources (no hardcoded English strings in Arabic mode or vice versa).

### Step 6: Responsive Viewport Check
- [ ] Desktop viewport (1280px+): Sidebar expanded, multi-column data grids, accessible action bars.
- [ ] Tablet viewport (768px - 1024px): Responsive layout adapts without horizontal overflow.
- [ ] Mobile viewport (375px - 414px): Bottom navigation visible, tables transform into clean, stacked cards, touch targets $\ge 44\text{px}$.

### Step 7: Phase Status Documentation Update
- [ ] Update `docs/development/PHASE_STATUS.md` with:
  - Exact completion date.
  - Test suite count and pass status.
  - Declared gaps / external dependencies (must be "Zero").
  - Summary of verified features and evidence.
