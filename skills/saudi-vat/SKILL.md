---
name: saudi-vat
description: Apply Saudi VAT calculation and ZATCA document rules when implementing tax or e-invoicing.
---

# Saudi VAT

Read before changing tax logic. Supported classifications: 0%, 5%, 15%, exempt, out of scope; allow future configured rates. Tax applicability is determined from item, party, transaction, and effective configuration, then snapshotted on each document line. Use decimal arithmetic. Exclusive: tax = roundHalfUp(net × rate, 2). Inclusive: net = roundHalfUp(gross / (1 + rate), 2), tax = gross - net, with a documented rounding adjustment if needed. Round per line to two decimals, then sum lines; backend totals are authoritative. Never silently alter VAT to force totals.

Credit notes reverse the referenced line's tax classification and amount proportionally; debit notes add tax using their own linked source and snapshot. Distinguish B2B standard and B2C simplified invoices. Prepare UUID, invoice hash, prior-invoice hash chain, UBL XML, QR TLV fields, digital signature, stored XML, validation and submission status. ZATCA credentials are tenant-scoped encrypted secrets; production status requires real onboarding and certification.
