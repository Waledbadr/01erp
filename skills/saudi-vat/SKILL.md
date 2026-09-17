---
name: saudi-vat
description: Official rules and computational contracts for Saudi 15% VAT, inclusive and exclusive price decomposition, line-level half-up rounding, tax snapshots, ZATCA Phase 2 e-invoicing fields, and QR code TLV encoding.
---

# Saudi VAT & ZATCA Phase 2 Skill (`skills/saudi-vat/SKILL.md`)

## 1. Statutory VAT Rates in Saudi Arabia
- **Standard Rate**: $15\%$ (Effective July 1, 2020)
- **Zero-Rate ($0\%$)**: Qualifying exports, qualified medicines/medical equipment, international transport.
- **Exempt from VAT**: Qualifying residential real estate leases, margin-based financial services, life insurance.
- **Out of Scope**: Government fees, sovereign duties.

---

## 2. Inclusive vs Exclusive Decomposition & Rounding

### Exact Formulas:
1. **Tax-Exclusive Price ($P_{\text{excl}}$)**:
   $$\text{Tax Amount} = \text{round}_{\text{half-up}}\left(P_{\text{excl}} \times 0.15, 2\right)$$
   $$\text{Total Price} = P_{\text{excl}} + \text{Tax Amount}$$

2. **Tax-Inclusive Price ($P_{\text{incl}}$)**:
   $$\text{Tax Amount} = \text{round}_{\text{half-up}}\left(P_{\text{incl}} - \frac{P_{\text{incl}}}{1.15}, 2\right)$$
   $$\text{Net Amount} = P_{\text{incl}} - \text{Tax Amount}$$

### Line-Level Rounding Mandate:
- Tax calculation and half-up rounding to 2 decimal places (Halalas) MUST occur at the individual invoice line level.
- Total invoice VAT is the sum of rounded line VAT amounts:
  $$\text{Invoice Total VAT} = \sum_{i=1}^{n} \text{Line VAT}_i$$

---

## 3. Tax Snapshot Invariant
When an invoice or bill is created, the system must create an immutable, frozen snapshot of the applicable tax rate, VAT amount, and tax category on every line item:
```json
{
  "line_id": "inv_line_987",
  "item_id": "prod_101",
  "tax_rate_percentage": "15.00",
  "tax_category_code": "S",
  "tax_exemption_reason_code": null,
  "net_amount_sar": "1000.00",
  "tax_amount_sar": "150.00",
  "total_amount_sar": "1150.00"
}
```
If tax regulations or master tax rates change later, historic posted invoices remain 100% untouched.

---

## 4. Document Types (ZATCA Phase 2 Standard vs Simplified)
1. **Standard Tax Invoice (388 - B2B / B2G)**:
   - Mandatory Buyer Details: Buyer Legal Name, Buyer National Address, Buyer 15-digit Tax ID (if registered).
   - Clearance Workflow: Must be transmitted and cleared by ZATCA before being delivered to the buyer.
2. **Simplified Tax Invoice (383 - B2C)**:
   - Cash register / retail POS sales.
   - Reporting Workflow: Reported to ZATCA within 24 hours of issuance.
   - Mandatory QR Code: TLV encoded Base64 QR code printed immediately on receipt.
3. **Credit Note (381) & Debit Note (383 with subtype)**:
   - Mandatory Reference: Must explicitly reference the original invoice's UUID and Issue Date.
   - Tax Reversal: Reverses original VAT output tax in exact proportion.

---

## 5. ZATCA Phase 2 QR Code TLV Encoding Standard
The QR code on Saudi tax invoices is composed of Tag-Length-Value (TLV) encoded binary data formatted as Base64.

### The Standard Tags:
| Tag Number | Field Name | Description | Mandatory For |
| :---: | :--- | :--- | :--- |
| **1** | Seller's Name | Registered commercial name in UTF-8 | Phase 1 & 2 |
| **2** | VAT Registration Number | 15-digit number starting & ending with `3` | Phase 1 & 2 |
| **3** | Time Stamp | ISO 8601 string: `YYYY-MM-DDTHH:mm:ssZ` | Phase 1 & 2 |
| **4** | Invoice Total (with VAT) | Decimal string formatted with 2 decimal places | Phase 1 & 2 |
| **5** | VAT Total | Decimal string formatted with 2 decimal places | Phase 1 & 2 |
| **6** | Invoice Hash (SHA-256) | Base64-encoded cryptographic digest of XML | Phase 2 |
| **7** | Digital Signature (ECDSA) | Cryptographic signature using private key | Phase 2 |
| **8** | Public Key / Cert | ECDSA Public Key from CSID | Phase 2 |
| **9** | Stamp Signature | ZATCA cryptographic stamp (for cleared B2B) | Phase 2 |

### Binary TLV Serialization:
```typescript
function encodeTLV(tag: number, value: string | Uint8Array): Uint8Array {
  const valueBytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const length = valueBytes.length;
  const result = new Uint8Array(2 + length);
  result[0] = tag;
  result[1] = length;
  result.set(valueBytes, 2);
  return result;
}
```
Concatenate all Tag chunks sequentially and encode the resulting byte buffer into standard Base64.
