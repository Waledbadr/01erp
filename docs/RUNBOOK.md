# Saudi Enterprise ERP — Production Runbook & Operations Manual

This runbook defines the operational procedures for deploying, maintaining, troubleshooting, and recovering the Saudi ERP, Accounting, Inventory, and ZATCA Phase 2 Cloud Platform.

---

## 1. System Architecture & Production Specifications

- **Runtime Target**: Google Cloud Run containerized service.
- **Port Ingress**: Port `3000` (strict container ingress routing; `0.0.0.0:3000`).
- **Web Server**: Express backend serving `/api/v1` REST routes and production compiled React 19 SPA (`dist/index.html`).
- **Database**: PostgreSQL 16+ with Drizzle ORM and connection pooling (`server/db/client.ts`).
- **Statutory Engine**: In-memory high-performance journal posting, ZATCA UBL 2.1 e-invoicing queue, perpetual WAC recalculator, and multi-tenant repository guard.
- **Security Envelope**: AES-256-GCM backup encryption, PBKDF2 password derivation, HMAC-SHA256 CSRF protection, and statutory security headers (CSP, HSTS, X-Content-Type-Options).

---

## 2. Deployment Procedures

### 2.1 Pre-Flight Deployment Checklist
Before triggering any production deployment:
1. Verify CI is green on the target branch:
   - `npm run lint` (0 errors)
   - `npm run typecheck` (0 errors)
   - `npm test` (100% test suites green)
   - `npm run test:smoke` (Smoke test passes)
2. Run Database Migration dry-run:
   ```bash
   npm run db:migrate
   ```
3. Verify that all required environment variables are set in Cloud Run Secret Manager:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `ZATCA_ENV` (`PRODUCTION` or `SIMULATION`)
   - `NODE_ENV=production`

### 2.2 Production Build & Release Execution
1. Compile the unified bundle:
   ```bash
   npm run build
   ```
   *Compiles Vite SPA to `dist/` and bundles `server.ts` to `dist/server.cjs` via esbuild.*
2. Deploy container image to Cloud Run:
   ```bash
   gcloud run deploy saudi-erp-prod \
     --image gcr.io/saudi-erp/production:v1.0.0 \
     --region europe-west1 \
     --port 3000 \
     --min-instances 2 \
     --max-instances 20 \
     --cpu 2 \
     --memory 2Gi \
     --allow-unauthenticated
   ```
3. Execute Live Smoke Verification immediately after deployment:
   ```bash
   curl -f https://<domain>/api/health/smoke
   ```
   *If the smoke endpoint returns non-200 or `smokeTestStatus !== 'PASSED'`, immediately invoke Rollback.*

---

## 3. Zero-Downtime Rollback Procedure

If a deployed revision exhibits regressions, ledger balance mismatches, or ZATCA transmission failures:

### 3.1 Instant Cloud Run Revision Rollback (< 60 seconds)
Cloud Run maintains immutable previous container revisions:
```bash
# 1. Identify previous healthy revision tag
gcloud run revisions list --service saudi-erp-prod --region europe-west1

# 2. Shift 100% traffic immediately to the previous healthy revision
gcloud run services update-traffic saudi-erp-prod \
  --region europe-west1 \
  --to-revisions saudi-erp-prod-00042-xyz=100
```

### 3.2 Database Schema Down-Migration (if applicable)
If the failed deployment included non-backward-compatible database migrations:
1. Take an emergency safety snapshot:
   ```bash
   npm run db:snapshot:emergency
   ```
2. Revert the migration script to the previous migration point:
   ```bash
   npm run db:migrate:rollback
   ```

---

## 4. Disaster Recovery & Backup Restoration

- **RTO (Recovery Time Objective)**: $\le 15\text{ minutes}$.
- **RPO (Recovery Point Objective)**: $\le 1\text{ hour}$.
- **Encryption**: AES-256-GCM symmetric authenticated encryption.

### 4.1 Automated Nightly Backup Schedule
- Backups execute at `02:00 UTC` daily.
- Backup snapshots are stored with multi-tier retention:
  - Daily: 7 days
  - Monthly: 30 days
  - Quarterly: 90 days
  - Annual: 365 days
- Coldline replication to offsite cloud storage vaults.

### 4.2 Restoring from Backup (The DR Drill Procedure)
1. **Safety Pre-Restore Snapshot**: The system automatically generates a `PRE_RESTORE_SAFETY` snapshot before overwriting any database tables.
2. **Mandatory Operational Justification**: Restoration APIs require a minimum 10-character human justification (logged to statutory audit trail).
3. **Restoration Execution**:
   ```bash
   # Via API:
   POST /api/v1/backups/:snapshotId/restore
   Payload: { "justification": "Restoring after infrastructure node outage" }
   ```
4. **Post-Restore Integrity Verification**:
   - Recompute General Ledger Trial Balance: Total Debits must equal Total Credits.
   - Verify SHA-256 checksums across inventory items, suppliers, and tax invoices.
   - Verify that 0 halalas of balance drift occurred.

---

## 5. Incident Response & Escalation Matrix

### 5.1 Incident Severity Levels

| Severity | Definition | Target Response (SLA) | Escalation Action |
| :--- | :--- | :---: | :--- |
| **SEV-1 (Critical)** | System down, ledger posting failure, ZATCA bulk rejection, data corruption. | $\le 15\text{ min}$ | Immediate page to Lead Architect & CTO. Activate DR Runbook. |
| **SEV-2 (High)** | Degraded response (> 3s), background ZATCA queue stalled, export failure. | $\le 1\text{ hour}$ | On-call engineer assigned. Hotfix branch created. |
| **SEV-3 (Medium)** | Non-blocking UI glitch, single-user session timeout, report formatting defect. | $\le 4\text{ hours}$ | Scheduled for next business sprint release. |
| **SEV-4 (Low)** | Typo, minor aesthetic alignment, enhancement suggestion. | Next release | Backlog ticket logged. |

### 5.2 Key Incident Contacts

| Role | Name / Title | Contact Channel | Primary Responsibilities |
| :--- | :--- | :--- | :--- |
| **Incident Commander** | Lead Infrastructure Architect | ops-emergency@saudi-erp.sa | Oversees triage, commands rollback or hotfix decisions. |
| **Principal Accountant** | Financial Controller | controller@saudi-erp.sa | Verifies ledger integrity, approves fiscal period overrides. |
| **Security & Compliance** | CISO & ZATCA Compliance Officer | security@saudi-erp.sa | Handles ZATCA cryptographic key rotations, audit investigations. |
| **On-Call Engineering** | Rotating Senior DevOps | devops-pager@saudi-erp.sa | Executes deployments, container scaling, and database patching. |

---

## 6. Diagnostic & Troubleshooting Playbooks

### 6.1 General Ledger Imbalance Alert
**Symptom**: Cloud monitoring detects an alert: `GL_BALANCE_MISMATCH`.
**Action**:
1. Check `GET /api/v1/reports/trial-balance`.
2. Inspect the latest journal entry in `journals` table where `total_debit != total_credit`.
3. The platform's strict G1 invariant prevents unbalanced postings from committing; if reported, verify if an manual DB query bypassed the application layer.
4. Execute `TenantScopedRepository.assertDbBalanceConstraint()`.

### 6.2 ZATCA Transmission Queue Blockage
**Symptom**: `zatca_jobs` queue shows pending jobs with retry counts exceeding 3.
**Action**:
1. Check ZATCA government portal status:
   `GET /api/v1/zatca/simulation/ping` or official ZATCA Fatoora status page.
2. Note: Under ZATCA Phase 2 decoupling, sales invoices are **never** held in draft; the local invoice is posted and legally valid.
3. Trigger batch retry once ZATCA connectivity recovers:
   `POST /api/v1/zatca/documents/batch-retry`
4. Inspect the cryptographic hash chain:
   `GET /api/v1/zatca/chain/verify` (Ensure no PIH hash breakage).

### 6.3 Performance Degradation (> 3s p95)
**Symptom**: High database query latency or p95 report generation exceeds 3 seconds.
**Action**:
1. Inspect database connection pool saturation via `GET /api/health/ready`.
2. Ensure database indices are active on `(tenant_id, account_id, entry_date)` and `(tenant_id, invoice_number)`.
3. Verify that reports run with date range filters and index-backed aggregation rather than full-table scans.

---

## 7. Verification & Runbook Sign-Off
- **Status**: Production Certified.
- **Reviewed by**: Enterprise QA & Security Review Board.
- **Effective Date**: September 2026.
