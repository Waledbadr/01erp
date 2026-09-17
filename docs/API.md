# REST API Specification — Saudi ERP

## 1. Conventions & Standards

- **Base URL**: `/api/v1`
- **Content Type**: `application/json; charset=utf-8`
- **Authentication**: Bearer Token via `Authorization: Bearer <token>`
- **Tenant Context**: Sent via authenticated session or `X-Company-Id` / `X-Branch-Id` headers.
- **Idempotency**: All mutation endpoints (POST/PUT/DELETE) support an optional `Idempotency-Key: <UUID>` header to safeguard against network duplicate submissions.

---

## 2. Standard Response Envelope

### Success Response (`200 OK`, `201 Created`):
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 1420,
    "timestamp": "2026-09-17T07:29:00.000Z"
  }
}
```

### Error Response (`400`, `401`, `403`, `404`, `422`, `500`):
```json
{
  "success": false,
  "error": {
    "code": "JOURNAL_UNBALANCED",
    "message": "Total debits (1,150.00 SAR) do not equal total credits (1,100.00 SAR).",
    "messageAr": "إجمالي المدين (١٬١٥٠٫٠٠ ر.س) لا يساوي إجمالي الدائن (١٬١٠٠٫٠٠ ر.س).",
    "details": { "difference": "50.00" },
    "correlationId": "req-99f8a2-3b10"
  }
}
```

---

## 3. Core API Endpoint Groups

### 3.1 Authentication & Profile
- `POST /api/v1/auth/login`: Email/Password or Username login with 2FA support.
- `POST /api/v1/auth/logout`: Revoke active session token.
- `GET /api/v1/auth/me`: Current user details, active tenant, branches, and permissions.
- `GET /api/v1/auth/sessions`: List active login sessions.
- `DELETE /api/v1/auth/sessions/:id`: Revoke specific remote session.

### 3.2 General Ledger & Chart of Accounts
- `GET /api/v1/accounts`: Hierarchical list of Chart of Accounts.
- `POST /api/v1/accounts`: Create new sub-account.
- `GET /api/v1/journals`: Paginated journal entries with line details.
- `POST /api/v1/journals`: Submit manual adjustment journal (enforces debits=credits).
- `POST /api/v1/journals/:id/reverse`: Reverse a posted journal entry.
- `GET /api/v1/ledgers/trial-balance`: Real-time trial balance report.
- `GET /api/v1/ledgers/partner-statement`: Customer or supplier statement with aging.

### 3.3 Sales & Accounts Receivable
- `GET /api/v1/sales/invoices`: List sales invoices with status, customer, and balance.
- `POST /api/v1/sales/invoices`: Create standard (B2B) or simplified (B2C) sales invoice.
- `POST /api/v1/sales/invoices/:id/post`: Post invoice to GL and deduct inventory.
- `POST /api/v1/sales/credit-notes`: Issue credit note referencing existing invoice.
- `GET /api/v1/sales/invoices/:id/print`: Formatted print view / PDF download payload.

### 3.4 Purchasing & Accounts Payable
- `GET /api/v1/purchases/bills`: List vendor bills.
- `POST /api/v1/purchases/bills`: Record vendor bill with 15% VAT and line items.
- `POST /api/v1/purchases/bills/:id/post`: Post bill to GL and update inventory stock & WAC.
- `POST /api/v1/purchases/landed-costs`: Allocate shipping/customs costs to bills.

### 3.5 Payments & Cash Management
- `POST /api/v1/payments/receipts`: Customer receipt voucher with invoice allocation.
- `POST /api/v1/payments/disbursements`: Supplier payment voucher with bill allocation.
- `POST /api/v1/payments/reallocate`: Reallocate unallocated balance to open documents.

### 3.6 Inventory & Warehousing
- `GET /api/v1/inventory/items`: Items catalog with multi-unit prices and barcodes.
- `POST /api/v1/inventory/items`: Create item with units and barcodes.
- `GET /api/v1/inventory/stock-balances`: Warehouse on-hand stock and WAC costs.
- `POST /api/v1/inventory/transfers`: Create inter-warehouse transfer.
- `POST /api/v1/inventory/adjustments`: Positive/negative stock count adjustment.

### 3.7 ZATCA E-Invoicing
- `POST /api/v1/zatca/onboard`: Register CSID and cryptographic keys.
- `POST /api/v1/zatca/invoices/:id/validate`: Check invoice XML against ZATCA schema.
- `POST /api/v1/zatca/invoices/:id/transmit`: Send invoice to ZATCA FATOORA portal.
- `GET /api/v1/zatca/invoices/:id/qr`: Retrieve TLV Base64 QR code data.
