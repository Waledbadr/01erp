# TASK-001: Phase 00 — Foundation, Skills & Tooling Setup

- **Phase**: PHASE-00 (Foundation & Scaffolding)
- **Status**: IN_PROGRESS
- **Assigned Agent**: Lead Enterprise Architect & Systems Engineer
- **Target Completion**: 2026-09-17

---

## 1. Objective
Establish the immutable architectural foundation, in-repo project skills, full-stack scaffold (Express + Vite + React 19 + TypeScript + Drizzle ORM), developer tooling, design system component catalog, and bilingual (ar-SA RTL / en-US LTR) base layout.

---

## 2. Acceptance Criteria

- [x] **A1: Workflow & Tooling Conventions**
  - In-repo task workflow (`tasks/TASK-*.md`) established with acceptance criteria.
  - PostgreSQL + Drizzle ORM migration & schema tooling configured.
  - Test runner configured with unit, integration, and E2E patterns.

- [x] **A2: In-Repo Project Skills (7 Mandatory Skills)**
  - `skills/accounting-engine/SKILL.md` (Rules G1/G2 posting contract, idempotency, reversals, DB balance, worked examples).
  - `skills/inventory-engine/SKILL.md` (Movement model, perpetual WAC formula, row locking, unit conversion, landed costs).
  - `skills/saudi-vat/SKILL.md` (15% VAT, inclusive/exclusive math, half-up rounding, tax snapshots, ZATCA Phase 2 QR TLV).
  - `skills/tenant-security/SKILL.md` (Tenant guard, RBAC permission matrix, audit logs, file upload constraints).
  - `skills/phase-exit-checklist/SKILL.md` (Zero dead links, zero unhandled errors, DoD verification steps).
  - `skills/testing-standards/SKILL.md` (Testing conventions, fixed decimal money data, assertion helpers, idempotency checks).
  - `skills/design-system/SKILL.md` (UI catalog, logical CSS properties, WCAG AA contrast, mobile cards-on-table, typography).

- [x] **A3 & A4: Developer Tooling & Scripts**
  - Package scripts: `build`, `typecheck`, `lint`, `test`, `test:e2e`, `db:migrate`, `db:seed:system`.
  - Zero TypeScript errors (`tsc --noEmit`).
  - Unit and integration tests passing.

- [x] **B: Project Scaffold**
  - Modular Monolith server architecture under `server/` with modular routing (`accounting`, `inventory`, `sales`, `purchasing`, `treasury`, `core`).
  - Express server (`server.ts`) with Vite integration on port 3000.
  - Structured JSON logging with `x-correlation-id` and sensitive field redaction.
  - Health check endpoints: `/api/health/live` and `/api/health/ready`.
  - Environment configuration validation with fail-fast boot in `server/core/env.ts` and `.env.example`.
  - System default seeder (`server/db/seed-system.ts`) limited to system essentials only (no fake business records).

- [x] **C: Base Infrastructure (UI + Layout)**
  - Reusable UI component catalog: Button, Input, Select, DatePicker, Modal, Drawer, Toast, Table (auto cards on mobile), Tabs, Badge, EmptyState, LoadingSkeleton, ConfirmDialog, PageHeader, FilterBar.
  - Dual-language i18n engine with Arabic RTL default, English LTR, instant runtime toggle, and localStorage persistence.
  - Fully responsive desktop sidebar + mobile bottom navigation.
  - Functional shell routes for Login, Register, Forgot Password, Dashboard, Component Catalog, Docs, Audit, and 404.
  - Error boundary catching runtime exceptions.
  - CI pipeline configuration `.github/workflows/ci.yml`.
