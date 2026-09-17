# Security, Access Control & Audit Architecture — Saudi ERP

## 1. Multi-Tenant Isolation
Tenant isolation is a fundamental security requirement enforced at every layer of the system:
1. **Database Queries**: Every table that stores business data contains a non-nullable `company_id` column indexed with foreign key constraints. Data queries enforce tenant filtering at the query builder layer.
2. **Context Guard Middleware**: Incoming HTTP requests validate the bearer token and inject the verified `tenantContext = { companyId, branchId, userId, role, permissions }` into request scope.
3. **No Frontend Reliance**: Frontend authorization checks are strictly for UI presentation (hiding buttons, disabling inputs). The backend verifies permissions on every mutation and query.

---

## 2. Authentication & Session Management
- **Credential Storage**: Passwords hashed using standard adaptive key derivation (Argon2id or bcrypt with minimum 12 salt rounds).
- **Session Tokens**: Cryptographically secure, high-entropy tokens with configurable sliding session expiry (default 8 hours) and absolute lifetime (24 hours).
- **Two-Factor Authentication (2FA)**: Time-based One-Time Passwords (TOTP / RFC 6238) for administrative and financial posting roles.
- **Session Controls**: Users can view all active sessions, inspect device/browser/IP metadata, and terminate specific sessions or revoke all active sessions.

---

## 3. Role-Based Access Control (RBAC) & Scope Matrix

| Role | Sales | Purchasing | GL & Accounting | Inventory | Reports & Tax | Settings & ZATCA |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | Full | Full | Full | Full | Full | Full |
| **Branch Admin** | Full | Full | View / Approve | Full | Branch Only | Branch Config |
| **Chief Accountant**| View / Post | View / Post | Full Post & Lock| Reconcile | Full Financial | View Certs |
| **Accountant** | Create/Edit | Create/Edit | Create Journals | View | Financial Reports| None |
| **Sales Rep** | Create/View | None | None | View Qty (No Cost)| Sales Only | None |
| **Warehouse Keeper**| Deliveries | Receipts | None | Transfers & Count | Stock Reports | None |
| **Auditor / Viewer**| Read-only | Read-only | Read-only | Read-only | Read-only | Read-only |

### Field-Level Masking:
Sales representatives and cashier staff are explicitly masked from viewing purchase costs, profit margins, supplier purchase histories, and high-level P&L metrics unless an administrator grants an explicit override permission.

---

## 4. Immutable Audit Trail
All significant actions generate a permanent audit log entry in the `audit_logs` table:
```typescript
interface AuditLogRecord {
  id: string;
  companyId: string;
  branchId?: string;
  userId: string;
  userEmail: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'POST' | 'REVERSE' | 'CLOSE_PERIOD' | 'REOPEN_PERIOD' | 'LOGIN' | 'FAILED_LOGIN' | 'EXPORT_DATA';
  entityType: string; // e.g. 'SALES_INVOICE', 'JOURNAL_ENTRY', 'ITEM'
  entityId: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string; // ISO 8601 UTC
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
  reason?: string;
}
```
Audit records are insert-only. No user (including Super Admin) can edit or delete an audit record through application interfaces.

---

## 5. Dangerous Operations & Confirmation Protocol
The following actions require explicit secondary authentication or confirmation modals with required justification:
1. **Reversing a Posted Journal**: Requires providing an explicit textual reason.
2. **Closing or Reopening a Fiscal Period**: Requires Chief Accountant or Super Admin credentials.
3. **Overriding Negative Inventory Block**: Requires documented supervisor sign-off.
4. **ZATCA Production Onboarding / CSID Renewal**: Safeguarded against accidental activation.
