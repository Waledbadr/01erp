# AGENTS.md — Developer & Agent Orientation

## System Overview
This project is a production-grade Saudi ERP, Accounting, Inventory, and ZATCA Phase 2 E-Invoicing Cloud Platform built with React 19, TypeScript, Tailwind CSS, Express, and PostgreSQL/Drizzle schema.

## Key Directives & Golden Rules
1. **Never mock financial data**: General Ledger is the single source of truth (Rule G1). Total Debits must equal Total Credits for every journal entry.
2. **Fixed-Point Financial Arithmetic**: Never use JavaScript floating-point numbers (`0.1 + 0.2`) for money. Always use exact decimal calculations with line-level half-up rounding (Rule G7/G8).
3. **No Prototype / No Fake UI**: Every button, input, and modal must be fully functional and connected to real state and validation (Rule R1).
4. **Bilingual RTL/LTR**: Native Arabic (`ar-SA`) RTL first, with instant toggle to English (`en-US`) LTR. Use logical CSS properties (`start-`, `end-`, `ms-`, `me-`).
5. **Item-Unit Specific Barcodes**: In inventory, barcodes belong to `(Item, Unit)` pairings, never directly to the item alone (Rule I4).
6. **ZATCA Phase 2**: Decouple invoice generation from ZATCA transmission. Base invoices post immediately; ZATCA runs in an asynchronous resilient queue.

## Where Things Live
- `docs/`: Master architectural and domain documentation (`PROJECT_SPEC.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `ACCOUNTING_RULES.md`, `INVENTORY_RULES.md`, `VAT_ZATCA_RULES.md`, `SECURITY.md`, `API.md`, `TESTING.md`, `DEPLOYMENT.md`, `BACKUPS.md`, `USER_GUIDE_AR.md`, `USER_GUIDE_EN.md`).
- `PHASE_STATUS.md`: Tracking progress and completion criteria for every phase.
- `src/`: Client-side React 19 source code.
- `server.ts` / `server/`: Express backend API server and business engines.
- `dist/`: Built client and server output for production.

## Essential Commands
- **Lint / Typecheck**: `npm run lint`
- **Build**: `npm run build`
- **Dev**: `npm run dev`
