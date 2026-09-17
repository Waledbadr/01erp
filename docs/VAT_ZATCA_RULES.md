# Saudi VAT & ZATCA (FATOORA) E-Invoicing Rules

## 1. Saudi Value Added Tax (VAT) Specifications

### 1.1 Applicable Tax Rates
- **Standard Rate (15%)**: General rate applied to the majority of goods and services in the Kingdom.
- **Zero-Rated (0%)**: Applied to qualifying exports of goods/services outside the GCC, qualifying medicines and medical equipment, international transport, and investment metals.
- **Exempt (معفى)**: Certain financial services, residential real estate lease, and life insurance.
- **Out of Scope (خارج نطاق الضريبة)**: Government statutory fees, compensations, and sovereign charges.

### 1.2 Rounding & Arithmetic (Rule G8)
- Calculations are computed per line item:
  $$\text{Line Net Amount} = \text{Quantity} \times \text{Unit Price} - \text{Discount}$$
  $$\text{Line VAT Amount} = \text{round}(\text{Line Net Amount} \times \text{VAT Rate}, 2)$$
  $$\text{Line Gross Total} = \text{Line Net Amount} + \text{Line VAT Amount}$$
- Invoice summary totals:
  $$\text{Subtotal (Net)} = \sum \text{Line Net Amount}$$
  $$\text{Total VAT} = \sum \text{Line VAT Amount}$$
  $$\text{Grand Total} = \text{Subtotal} + \text{Total VAT}$$
- All rounding uses the standard "Half-Up" arithmetic method executed by the backend.

---

## 2. ZATCA E-Invoicing Requirements

### 2.1 Document Classifications

| Document Type | Code | Target Audience | Primary Requirement |
| :--- | :--- | :--- | :--- |
| **Standard Tax Invoice** | `388` | B2B / B2G | Buyer Tax ID, full address, clearance by ZATCA before delivery |
| **Simplified Tax Invoice** | `388` (subtype 02) | B2C / Retail | Instant issuance, TLV QR Code mandatory on print |
| **Credit Note** | `381` | Returns / Reductions | Original Invoice UUID reference + adjustment reason code |
| **Debit Note** | `383` | Surcharges / Additions | Original Invoice UUID reference + adjustment reason code |

### 2.2 ZATCA Phase 1: TLV Base64 QR Code Structure
The QR code encodes TLV (Tag-Length-Value) bytes encoded in UTF-8 and converted to Base64:
- **Tag 1**: Seller Name (اسم المورد)
- **Tag 2**: Seller VAT Registration Number (الرقم الضريبي للمورد - 15 digits starting and ending with 3)
- **Tag 3**: Invoice Timestamp in ISO 8601 UTC (e.g. `2026-09-17T12:00:00Z`)
- **Tag 4**: Invoice Total with VAT (إجمالي الفاتورة شامل الضريبة)
- **Tag 5**: Total VAT Amount (مبلغ ضريبة القيمة المضافة)
- *Phase 2 additions:*
  - **Tag 6**: SHA-256 Invoice Hash (تشفير الفاتورة)
  - **Tag 7**: ECDSA Digital Signature (التوقيع الرقمي)
  - **Tag 8**: ECDSA Public Key (المفتاح العام)
  - **Tag 9**: ZATCA Cryptographic Stamp / Certificate Signature

### 2.3 ZATCA Phase 2: Technical Architecture
1. **Invoice Hashing**:
   - The invoice payload is structured as an XML document adhering to the UBL 2.1 syntax profile (`urn:oasis:names:specification:ubl:schema:xsd:Invoice-2`).
   - The XML is canonicalized (C14N) excluding the signature node.
   - The SHA-256 digest is generated and converted to Base64.
2. **Previous Invoice Hash Chaining (`PIH`)**:
   - Every invoice must contain the SHA-256 hash of the immediate predecessor invoice within the same company and branch sequence.
   - For the first invoice in a sequence, the initial hash is defined as the SHA-256 of `0` (`NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==`).
   - This cryptographic chain renders invoice tampering and omission instantly detectable.
3. **Transmission & Sandbox Workflow**:
   - Invoices are generated with complete cryptographic signatures and stored in the database.
   - Background workers transmit standard invoices for clearance and simplified invoices for reporting.
   - In offline mode or when ZATCA endpoints are unreachable, invoices remain queued for retry while local commercial transactions proceed uninterrupted.
