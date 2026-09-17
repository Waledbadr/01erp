# 13 — PHASE 12: DOCUMENTS — TEMPLATES, PDF, PRINTING, SHARING

Depends on: Phases 02-11 (documents exist to render). Premium output quality is a core requirement (Master Prompt Part 6/8).

---

## A. TEMPLATE ENGINE

- Per document type (sales invoice, purchase bill, quotation, sales/purchase order, receipt voucher, payment voucher, credit/debit note, customer/supplier statement, labels): visual template editor — logo, company info blocks, colors, fonts, columns, field visibility/order, header/footer, payment info, VAT block, QR placement, notes; AR/EN variants; RTL/LTR correct rendering.
- Live preview with real sample record; versioned templates; per-company defaults.

## B. PDF ENGINE

- Real PDF generation from structured document data + templates (NEVER screenshots). Server-side rendering; Arabic shaping and RTL layout pixel-correct; embedded fonts.
- Sizes: A4, A5, Letter, 80mm thermal (receipts/labels). Print preferences remembered per user + document type.

## C. SHARING & SENDING

- Email: SMTP per company (credentials via secret storage), multiple identities, CC/BCC, PDF (+XML where applicable), localized templates with variables, send queue with retry, full send log (recipient, method, status, error, user, timestamp).
- Secure links: unpredictable signed tokens, revocable, expirable, no internal ID exposure, tenant + permission checked on every access, access logged; optional no-login mode scoped to that document only.
- WhatsApp-ready: share flows (deep-link / clipboard message + attached PDF); WhatsApp Business API adapter interface with Not Configured default. Same for SMS adapter.
- Resend + sending history on every document page.

## D. PAGES

- Template editor (per type, live preview), sending center (queue, failures, retry), secure-link manager (active links, revoke), email settings (per company identity, connection test).

---

## TESTS (mandatory)

1. PDF for each document type renders with correct data (content assertions + visual E2E snapshots in both RTL/LTR)
2. Thermal 80mm output renders usable receipt (E2E)
3. Email send: real SMTP in test env (or documented queue path), retry on failure, log complete
4. Secure link: access works, wrong tenant denied, revoked link dies, expiry enforced, access logged
5. Template change affects only new documents (posted keep their snapshot)
6. Arabic text shapes correctly (no broken ligatures) in PDF (visual assertion)

---

## DEFINITION OF DONE (Phase 12)

- [ ] All 6 test groups pass; auditor visually inspects 3 PDFs in both languages
- [ ] Every document page has working Print/PDF/Email/Share actions
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green
- [ ] PHASE_STATUS.md updated

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).
