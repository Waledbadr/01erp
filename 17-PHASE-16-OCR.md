# 17 — PHASE 16: OCR — SUPPLIER INVOICE CAPTURE

Depends on: Phases 07, 12. Read `skills/tenant-security`. Follows Master Prompt R1/R2/R3: full internal pipeline, honest Not Configured state, NO fake extraction.

---

## A. PIPELINE

- Upload (jpg/png/webp/pdf, max 10MB, type+MIME+extension validated per Master Prompt Part 9) -> OCR job -> field extraction -> review screen -> commit as DRAFT purchase bill -> Phase 07 lifecycle from there.
- Provider behind an `OcrProvider` interface. Without real credentials: adapter reports Not Configured, jobs stay Pending with explicit status (never fabricated success). Document provider choice in DECISIONS.md.

## B. EXTRACTION MODEL

- `ocr_jobs`: id, companyId, fileRef, mimeType, status (Pending/Processing/Succeeded/Failed), provider, rawResult ref, error, createdBy, timestamps.
- `ocr_extractions`: per extracted field — fieldName, extractedValue, confidence, requiresReview, correctedValue, correctedBy. Confidence computed per field.
- Draft purchase bill created only on explicit commit, flagged `source='ocr'`, linked ocrJobId. Drafts touch nothing (Phase 07 rules).

## C. REVIEW & COMMIT RULES

- **Never auto-post**: OCR output is a draft until a human commits it into the Phase 07 draft flow.
- Fields below 0.85 confidence are flagged red; commit blocked until corrected (or explicitly confirmed per field with audit).
- Every correction is recorded (before/after, user, timestamp). Every job has full audit trail per Master Prompt Part 9.

## D. PAGES

- Upload screen; jobs list (status, provider, link to draft); review screen (field-by-field, red/green confidence, side-by-side with original image/PDF); corrections logged inline.

---

## TESTS (mandatory)

1. Valid invoice image -> draft bill with extracted header + lines; amounts exact
2. Corrupt/unreadable file -> Failed status, clear localized error, no draft created
3. Field < 0.85 -> commit blocked; after manual correction -> commit succeeds, correction audited
4. Provider Not Configured -> explicit state, no fake success (test)
5. Tenant isolation: tenant B cannot see or fetch tenant A's job/file (API test)
6. Disallowed file type -> rejected with clear message (test)
7. Extraction -> commit -> post through Phase 07 produces correct journals end-to-end (E2E)

---

## DEFINITION OF DONE (Phase 16)

- [ ] All 7 test groups pass; auditor verifies zero auto-posting anywhere
- [ ] Not Configured path honest and visible (no silent success)
- [ ] Zero dead actions; mobile/RTL/LTR verified
- [ ] Regression green for Phases 00-15
- [ ] PHASE_STATUS.md updated with evidence + declared provider dependency

Then run the Completion Audit (prompts/AUDIT-TEMPLATE.md).
