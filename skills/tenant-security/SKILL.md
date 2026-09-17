---
name: tenant-security
description: Multi-tenant isolation guard patterns, RBAC permission matrix conventions, secrets management, immutable audit logging requirements, and file upload validation rules.
---

# Tenant Security & Compliance Skill (`skills/tenant-security/SKILL.md`)

## 1. The Tenant Guard Pattern (Zero Cross-Tenant Leakage)
Every database query without exception MUST be scoped to the authenticated user's `tenant_id`.

### Rules:
1. **Explicit Predicate Mandate**: Every repository method, ORM query, and raw SQL statement must explicitly filter by `tenant_id = $tenantId`:
   ```typescript
   // Example Drizzle ORM query with Tenant Guard:
   const invoices = await db
     .select()
     .from(invoicesTable)
     .where(and(eq(invoicesTable.tenantId, currentTenantId), eq(invoicesTable.id, invoiceId)));
   ```
2. **Postgres Row-Level Security (RLS)**:
   In database migrations, enable RLS on every tenant-owned table:
   ```sql
   ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation_policy ON journal_entries
     FOR ALL
     USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
   ```
3. **Session Context**: The application sets the tenant session variable inside every connection checkout before executing queries:
   ```sql
   SET LOCAL app.current_tenant_id = 'tenant-uuid-1234';
   ```

---

## 2. RBAC Permission Matrix Conventions
Permissions follow the granular format `<module>:<resource>:<action>`:
- Examples: `accounting:journal:post`, `accounting:journal:reverse`, `sales:invoice:create`, `inventory:stocktake:approve`, `settings:tax:manage`.

### Standard System Roles:
| Role | Code | Permissions |
| :--- | :--- | :--- |
| **Owner / Superadmin** | `OWNER` | All modules, billing, tenant settings, branch creation. |
| **Financial Controller / Chief Accountant** | `CHIEF_ACCOUNTANT` | Full GL posting, period closing, financial statements, reversal authorization. |
| **General Accountant** | `ACCOUNTANT` | Journal drafting, AP/AR entries, bank reconciliation. |
| **Sales Manager** | `SALES_MGR` | Quotations, sales orders, standard invoice creation, customer credit limits. |
| **Cashier / POS Operator** | `CASHIER` | Simplified B2C invoices, cash register shifts, returns within daily limit. |
| **Warehouse Manager** | `WAREHOUSE_MGR` | GRN receipts, stock deliveries, inter-warehouse transfers, stocktake reconciliation. |
| **Auditor / Read-Only** | `AUDITOR` | Read-only access to all reports, GL, audit logs, and ZATCA compliance records. |

---

## 3. Secrets Handling & Cryptographic Keys
- **CSID Private Keys**: ZATCA Onboarding produces an ECDSA private key (`secp256k1`). This private key MUST be encrypted at rest using AES-256-GCM with a tenant-isolated key rotation scheme.
- **Never Log Secrets**: The structured logger filters out: `password`, `secret`, `token`, `privateKey`, `apiKey`, `authorization`, `cookie`.
- **Environment Separation**: Secrets are loaded from validated environment variables, never hardcoded.

---

## 4. Immutable Audit Event Requirements
Financial and security actions MUST write an immutable record to the `audit_logs` table.

### Required Fields:
```typescript
export interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  action: string; // e.g. 'POST_JOURNAL', 'LOGIN_SUCCESS', 'CLOSE_PERIOD'
  resourceType: string; // e.g. 'journal_entries'
  resourceId: string;
  correlationId: string;
  changesDiff: Record<string, { before: unknown; after: unknown }>;
  createdAt: string;
}
```
The audit log table has NO `UPDATE` or `DELETE` grants in PostgreSQL.

---

## 5. File Upload Validation Rules
For scanned vendor invoices, receipt attachments, and import CSVs:
1. **MIME Type Whitelist**: `application/pdf`, `image/jpeg`, `image/png`, `text/csv`.
2. **File Signature / Magic Bytes**: Inspect actual file header bytes, not just file extensions.
3. **Size Limit**: Default 10 MB per file, max 50 MB per batch.
4. **Storage Isolation**: S3/GCS bucket paths must be partitioned by `tenants/{tenant_id}/uploads/{date}/{uuid}.ext`.
