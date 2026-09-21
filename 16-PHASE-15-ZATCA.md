# 16 — PHASE 15: ZATCA E-INVOICING LAYER

Depends on Phases 06, 09, 12. Read `skills/saudi-vat`. Architecture per Master Prompt Part 7: Accounting -> E-Invoice Document -> ZATCA Adapter. ZATCA failure NEVER blocks invoice posting.

---

## A. E-INVOICE DOCUMENT LAYER

- Every posted tax document gets an e-invoice record: type (B2B Standard / B2C Simplified / Credit Note / Debit Note), UUID, invoice hash, previous-invoice-hash chaining, QR (ZATCA TLV for simplified; standard invoices get cryptographic stamp fields per spec version), UBL XML 2.1 generation (schema-valid), original + submitted + processed XML storage, validation results, status machine: Not Ready -> Ready -> Submitted -> Accepted / Rejected / Requires Attention.
- Hash chain integrity enforced (break = integrity alarm, test).
- Tax snapshot feeds XML exactly (Phase 09 data is source).

## B. ZATCA ADAPTER

- Sandbox and Production environments per company, strictly separated; production switch requires special permission + audit.
- CSID onboarding flow (simulation): CSR generation, compliance checks — implemented as real code paths; without real credentials the adapter reports Not Configured and the queue holds documents Ready (never fake success).
- Submission client: signed requests, certificate from secure secret storage (Master Prompt Part 7: encrypted at rest, never logged/exposed/committed), retry with exponential backoff, manual retry, per-attempt log (timestamp, request ID, HTTP status, response body reference, error ID).
- Failure path: base invoice untouched; e-invoice status Requires Attention; notification per Phase 13; retry UI.

## C. PAGES

- ZATCA dashboard: documents by status, failure list, retry actions; e-invoice detail (XML viewer, hash chain, QR, attempts log); company ZATCA settings (environment, credentials upload with encryption, certificate expiry monitoring with warnings).

---

## TESTS (mandatory)

1. UBL XML validates against schema for B2B, B2C, credit note (validation tooling in CI)
2. Hash chain: 3 sequential invoices -> hashes chain correctly; tamper detected
3. QR TLV for simplified invoice decodes to expected fields (known-vector test)
4. Simulated submission success -> status transitions + processed XML stored
5. Simulated submission failure (retryable) -> retries with backoff, never touches base invoice, alert raised
6. Production switch without permission -> denied + audited
7. Secrets: private key never appears in logs/responses/git (automated scan test)

---

## DEFINITION OF DONE (Phase 15)

- [ ] All 7 test groups pass
- [ ] Without real ZATCA credentials: complete internal layer + Not Configured state + queue of Ready documents (auditor verifies no fake success anywhere)
- [ ] Zero dead actions; mobile/RTL/LTR verified; regression green
- [ ] docs/VAT_ZATCA_RULES.md updated with status machine + retry policy
- [ ] PHASE_STATUS.md updated with declared external dependency (real onboarding)

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).
