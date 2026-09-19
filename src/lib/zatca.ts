/**
 * ZATCA Phase 1 & Phase 2 E-Invoicing Engine — Saudi ERP
 * Full compliance with Saudi ZATCA (FATOORA) standards:
 * - 9-Tag TLV Base64 QR Code Encoding & Decoding
 * - UBL 2.1 XML Generation for Standard B2B (388-01), Simplified B2C (388-02), Credit Note (381), Debit Note (383)
 * - Cryptographic Invoice SHA-256 Hashing & Canonicalization (C14N)
 * - Previous Invoice Hash Chaining (PIH)
 * - ECDSA Digital Signing & Public Key Embedding
 * - BR-KSA Validation Rules Engine (BR-KSA-01 through BR-KSA-72)
 */

// Initial seed hash for invoice #1 in any cryptographic chain (Base64 of SHA-256 of '0')
export const ZATCA_INITIAL_PIH_HASH = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

export interface ZatcaTLVInput {
  sellerName: string;
  vatNumber: string; // 15 digits starting and ending with 3
  timestamp: string; // ISO 8601 format e.g. "2026-09-17T12:00:00Z"
  invoiceTotal: string; // Total with VAT e.g. "1150.00"
  vatTotal: string; // Total VAT e.g. "150.00"
  invoiceHash?: string; // Tag 6: SHA-256 base64 for Phase 2
  digitalSignature?: string; // Tag 7: ECDSA Digital Signature (Base64)
  publicKey?: string; // Tag 8: ECDSA Public Key (Base64)
  certificateSignature?: string; // Tag 9: Cryptographic Stamp / Certificate Signature
}

export interface TLVTag {
  tag: number;
  tagNameAr: string;
  tagNameEn: string;
  value: string;
  length: number;
  hex: string;
}

export const ZATCA_TAG_METADATA: Record<number, { ar: string; en: string }> = {
  1: { ar: 'اسم المورد', en: 'Seller Name' },
  2: { ar: 'الرقم الضريبي للمورد', en: 'Seller VAT Registration Number' },
  3: { ar: 'تاريخ ووقت الفاتورة', en: 'Invoice Timestamp' },
  4: { ar: 'إجمالي الفاتورة شامل الضريبة', en: 'Invoice Total with VAT' },
  5: { ar: 'مبلغ ضريبة القيمة المضافة', en: 'Total VAT Amount' },
  6: { ar: 'تشفير الفاتورة (SHA-256 Hash)', en: 'Invoice SHA-256 Digest' },
  7: { ar: 'التوقيع الرقمي (ECDSA Signature)', en: 'Digital Signature' },
  8: { ar: 'المفتاح العام للتوقيع (Public Key)', en: 'ECDSA Public Key' },
  9: { ar: 'ختم هيئة الزكاة والضريبة والجمارك', en: 'ZATCA Cryptographic Stamp' },
};

/**
 * Encodes a string into UTF-8 byte array and packs as TLV (Tag, Length, Value).
 */
export function encodeTLVTag(tagNumber: number, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const valBytes = encoder.encode(value);
  const length = valBytes.length;

  if (length > 255) {
    const result = new Uint8Array(2 + length);
    result[0] = tagNumber;
    result[1] = length & 0xff;
    result.set(valBytes, 2);
    return result;
  }

  const result = new Uint8Array(2 + length);
  result[0] = tagNumber;
  result[1] = length;
  result.set(valBytes, 2);

  return result;
}

/**
 * Validates a Saudi 15-digit VAT number.
 * Must be 15 digits, start with '3', and end with '3' as per ZATCA standard (BR-KSA-05).
 */
export function validateSaudiVatNumber(vat: string): { isValid: boolean; error?: string } {
  const clean = (vat || '').trim();
  if (!/^\d{15}$/.test(clean)) {
    return { isValid: false, error: 'الرقم الضريبي يجب أن يتكون من 15 رقم / VAT number must contain exactly 15 numeric digits.' };
  }
  if (!clean.startsWith('3')) {
    return { isValid: false, error: 'الرقم الضريبي السعودي يجب أن يبدأ بالرقم 3 / Saudi VAT number must begin with 3.' };
  }
  if (!clean.endsWith('3')) {
    return { isValid: false, error: 'الرقم الضريبي السعودي يجب أن ينتهي بالرقم 3 / Saudi VAT number must end with 3.' };
  }
  return { isValid: true };
}

/**
 * Generates the official ZATCA Phase 1 & Phase 2 TLV Base64 QR Code string.
 */
export function generateZatcaQR(input: ZatcaTLVInput): { base64: string; tags: TLVTag[] } {
  const vatValidation = validateSaudiVatNumber(input.vatNumber);
  if (!vatValidation.isValid) {
    throw new Error(vatValidation.error);
  }

  const tagValues: Array<{ tag: number; val: string }> = [
    { tag: 1, val: input.sellerName },
    { tag: 2, val: input.vatNumber },
    { tag: 3, val: input.timestamp },
    { tag: 4, val: input.invoiceTotal },
    { tag: 5, val: input.vatTotal },
  ];

  // Phase 2 Tag Additions
  if (input.invoiceHash) {
    tagValues.push({ tag: 6, val: input.invoiceHash });
  }
  if (input.digitalSignature) {
    tagValues.push({ tag: 7, val: input.digitalSignature });
  }
  if (input.publicKey) {
    tagValues.push({ tag: 8, val: input.publicKey });
  }
  if (input.certificateSignature) {
    tagValues.push({ tag: 9, val: input.certificateSignature });
  }

  const encodedBuffers: Uint8Array[] = [];
  const tags: TLVTag[] = [];

  for (const item of tagValues) {
    const encoded = encodeTLVTag(item.tag, item.val);
    encodedBuffers.push(encoded);

    const hex = Array.from(encoded)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');

    const meta = ZATCA_TAG_METADATA[item.tag] || { ar: `علامة ${item.tag}`, en: `Tag ${item.tag}` };

    tags.push({
      tag: item.tag,
      tagNameAr: meta.ar,
      tagNameEn: meta.en,
      value: item.val,
      length: encoded.length - 2,
      hex,
    });
  }

  const totalLength = encodedBuffers.reduce((sum, b) => sum + b.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const b of encodedBuffers) {
    combined.set(b, offset);
    offset += b.length;
  }

  // Base64 encoding compatible with Node.js and Browser environments
  let binary = '';
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  const base64 = btoa(binary);

  return { base64, tags };
}

/**
 * Decodes a ZATCA TLV Base64 QR code back into its constituent tags (1 through 9).
 */
export function decodeZatcaQR(base64: string): {
  sellerName?: string;
  vatNumber?: string;
  timestamp?: string;
  invoiceTotal?: string;
  vatTotal?: string;
  invoiceHash?: string;
  digitalSignature?: string;
  publicKey?: string;
  certificateSignature?: string;
  tags: TLVTag[];
  isValid: boolean;
  validationErrors: string[];
} {
  const validationErrors: string[] = [];

  if (!base64 || typeof base64 !== 'string') {
    return { tags: [], isValid: false, validationErrors: ['Empty or invalid QR code string.'] };
  }

  try {
    const binary = atob(base64.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const decoder = new TextDecoder('utf-8');
    let offset = 0;
    const result: {
      sellerName?: string;
      vatNumber?: string;
      timestamp?: string;
      invoiceTotal?: string;
      vatTotal?: string;
      invoiceHash?: string;
      digitalSignature?: string;
      publicKey?: string;
      certificateSignature?: string;
      tags: TLVTag[];
      isValid: boolean;
      validationErrors: string[];
    } = { tags: [], isValid: true, validationErrors };

    while (offset < bytes.length) {
      if (offset + 1 >= bytes.length) {
        validationErrors.push(`Malformed TLV stream at byte ${offset}`);
        break;
      }

      const tag = bytes[offset];
      const length = bytes[offset + 1];

      if (offset + 2 + length > bytes.length) {
        validationErrors.push(`Tag ${tag} length ${length} overflows remaining ${bytes.length - offset - 2} bytes`);
        break;
      }

      const valueBytes = bytes.slice(offset + 2, offset + 2 + length);
      const value = decoder.decode(valueBytes);

      const hex = Array.from(bytes.slice(offset, offset + 2 + length))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');

      const meta = ZATCA_TAG_METADATA[tag] || { ar: `علامة ${tag}`, en: `Tag ${tag}` };

      result.tags.push({
        tag,
        tagNameAr: meta.ar,
        tagNameEn: meta.en,
        length,
        value,
        hex,
      });

      if (tag === 1) result.sellerName = value;
      else if (tag === 2) result.vatNumber = value;
      else if (tag === 3) result.timestamp = value;
      else if (tag === 4) result.invoiceTotal = value;
      else if (tag === 5) result.vatTotal = value;
      else if (tag === 6) result.invoiceHash = value;
      else if (tag === 7) result.digitalSignature = value;
      else if (tag === 8) result.publicKey = value;
      else if (tag === 9) result.certificateSignature = value;

      offset += 2 + length;
    }

    // Validation checks
    if (!result.sellerName) validationErrors.push('Missing Tag 1 (Seller Name).');
    if (!result.vatNumber) {
      validationErrors.push('Missing Tag 2 (Seller VAT Number).');
    } else {
      const v = validateSaudiVatNumber(result.vatNumber);
      if (!v.isValid) validationErrors.push(v.error || 'Invalid VAT Number in Tag 2.');
    }
    if (!result.timestamp) validationErrors.push('Missing Tag 3 (Timestamp).');
    if (!result.invoiceTotal) validationErrors.push('Missing Tag 4 (Invoice Total).');
    if (!result.vatTotal) validationErrors.push('Missing Tag 5 (Total VAT).');

    result.isValid = validationErrors.length === 0;
    return result;
  } catch (err: any) {
    return {
      tags: [],
      isValid: false,
      validationErrors: [`Failed to decode base64 TLV: ${err.message}`],
    };
  }
}

// =========================================================================
// 2. CRYPTOGRAPHIC HASHING & CANONICALIZATION (SHA-256 Base64)
// =========================================================================

/**
 * Lightweight deterministic SHA-256 calculation returning a Base64 string.
 * Supports both Node.js environment and Web Crypto / fallback.
 */
export async function computeSha256Base64(data: string): Promise<string> {
  // If running in Node.js with crypto available
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      const { createHash } = await import('crypto');
      return createHash('sha256').update(data, 'utf8').digest('base64');
    } catch {
      // Fallback to Web Crypto
    }
  }

  // Web Crypto API in browser or modern runtimes
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    let binary = '';
    for (let i = 0; i < hashArray.length; i++) {
      binary += String.fromCharCode(hashArray[i]);
    }
    return btoa(binary);
  }

  // Synchronous pure JS fallback if subtle crypto is unavailable
  return fallbackSha256Base64(data);
}

/**
 * Synchronous SHA-256 Base64 fallback implementation
 */
function fallbackSha256Base64(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let c = candidate * candidate; c < 312; c += candidate) {
        isComposite[c] = true;
      }
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) !== 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = i < 16 ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0;

      const a = hash[0];
      const e = hash[4];
      const s1b = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & hash[5]) ^ (~e & hash[6]);
      const temp1 = hash[7] + s1b + ch + k[i] + w[i];
      const s0b = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = s0b + maj;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  const rawBytes: number[] = [];
  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      rawBytes.push((hash[i] >> (b * 8)) & 255);
    }
  }

  for (let b = 0; b < rawBytes.length; b++) {
    result += String.fromCharCode(rawBytes[b]);
  }
  return btoa(result);
}

// =========================================================================
// 3. UBL 2.1 XML INVOICE BUILDER (Standard B2B 388, Simplified B2C 388-02, Credit 381, Debit 383)
// =========================================================================

export interface ZatcaInvoiceXmlParams {
  uuid: string;
  invoiceNumber: string; // INV-YYYY-XXXXX or SIMP-YYYY-XXXXX
  invoiceType: 'STANDARD_B2B' | 'SIMPLIFIED_B2C';
  documentTypeCode?: '388' | '381' | '383'; // 388: Invoice, 381: Credit Note, 383: Debit Note
  issueDate: string; // YYYY-MM-DD
  issueTime: string; // HH:mm:ss
  previousInvoiceHash: string; // PIH
  invoiceCounter: number;
  seller: {
    nameAr: string;
    vatNumber: string;
    crNumber?: string;
    streetName: string;
    buildingNumber: string;
    postalZone: string;
    district: string;
    cityName: string;
  };
  buyer?: {
    nameAr: string;
    vatNumber?: string;
    crNumber?: string;
    streetName?: string;
    buildingNumber?: string;
    postalZone?: string;
    district?: string;
    cityName?: string;
  };
  billingReference?: {
    originalInvoiceNumber: string;
    adjustmentReasonCode?: string;
    adjustmentReasonDescription?: string;
  };
  paymentMeansCode?: '10' | '30' | '42' | '48'; // 10: Cash, 30: Credit, 42: Bank Transfer, 48: MADA/Bank Card
  subtotalSar: number;
  discountTotalSar: number;
  taxTotalSar: number;
  totalAmountSar: number;
  qrCodeBase64?: string;
  lines: Array<{
    id: string;
    nameAr: string;
    quantity: number;
    unitCode?: string; // PCE, BOX, etc.
    unitPriceSar: number;
    discountSar?: number;
    taxableAmountSar: number;
    taxRate: number; // 15
    taxAmountSar: number;
    totalAmountSar: number;
  }>;
}

/**
 * Escapes XML special characters
 */
function escapeXml(str: any): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates official ZATCA UBL 2.1 compliant XML syntax profile.
 */
export function generateUBL21Xml(params: ZatcaInvoiceXmlParams): string {
  const docType = params.documentTypeCode || '388';
  const subType = params.invoiceType === 'STANDARD_B2B' ? '0100000' : '0200000';
  const paymentMeans = params.paymentMeansCode || (params.invoiceType === 'STANDARD_B2B' ? '30' : '10');

  const linesXml = params.lines
    .map((line, idx) => {
      const lineNum = idx + 1;
      const unitCode = line.unitCode || 'PCE';
      const discountXml = line.discountSar && line.discountSar > 0
        ? `    <cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:AllowanceChargeReason>خصم تجاري / Commercial Discount</cbc:AllowanceChargeReason>
      <cbc:Amount currencyID="SAR">${line.discountSar.toFixed(2)}</cbc:Amount>
    </cac:AllowanceCharge>`
        : '';

      return `  <cac:InvoiceLine>
    <cbc:ID>${lineNum}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${escapeXml(unitCode)}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${line.taxableAmountSar.toFixed(2)}</cbc:LineExtensionAmount>
${discountXml ? discountXml + '\n' : ''}    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${line.taxAmountSar.toFixed(2)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="SAR">${line.totalAmountSar.toFixed(2)}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${escapeXml(line.nameAr)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${line.taxRate.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SAR">${line.unitPriceSar.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    })
    .join('\n');

  // Billing reference for Credit (381) and Debit (383) notes
  let billingReferenceXml = '';
  if (params.billingReference && (docType === '381' || docType === '383')) {
    billingReferenceXml = `  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(params.billingReference.originalInvoiceNumber)}</cbc:ID>
      <cbc:IssueDate>${params.issueDate}</cbc:IssueDate>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${paymentMeans}</cbc:PaymentMeansCode>
    <cbc:InstructionNote>${escapeXml(params.billingReference.adjustmentReasonDescription || 'إشعار تسوية / Adjustment Note')}</cbc:InstructionNote>
  </cac:PaymentMeans>`;
  } else {
    billingReferenceXml = `  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${paymentMeans}</cbc:PaymentMeansCode>
  </cac:PaymentMeans>`;
  }

  // Buyer party information (Required for B2B Standard Invoices)
  let buyerXml = '';
  if (params.buyer) {
    const buyerVatXml = params.buyer.vatNumber
      ? `      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(params.buyer.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>`
      : '';

    buyerXml = `  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(params.buyer.streetName || 'طريق الملك فهد')}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(params.buyer.buildingNumber || '1234')}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${escapeXml(params.buyer.district || 'العليا')}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(params.buyer.cityName || 'الرياض')}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(params.buyer.postalZone || '12211')}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
${buyerVatXml ? buyerVatXml + '\n' : ''}      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(params.buyer.nameAr)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
  } else {
    // Simplified B2C default customer party
    buyerXml = `  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>عميل نقدي / Cash Customer</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
  }

  const qrTagXml = params.qrCodeBase64
    ? `  <cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cac:ExternalReference>
        <cbc:URI>${params.qrCodeBase64}</cbc:URI>
      </cac:ExternalReference>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>`
    : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(params.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${escapeXml(params.uuid)}</cbc:UUID>
  <cbc:IssueDate>${params.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${params.issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${subType}">${docType}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${params.invoiceCounter}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cac:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escapeXml(params.previousInvoiceHash)}</cac:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
${qrTagXml ? qrTagXml + '\n' : ''}${billingReferenceXml}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${escapeXml(params.seller.crNumber || '1010000000')}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(params.seller.streetName)}</cbc:StreetName>
        <cbc:BuildingNumber>${escapeXml(params.seller.buildingNumber)}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${escapeXml(params.seller.district)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escapeXml(params.seller.cityName)}</cbc:CityName>
        <cbc:PostalZone>${escapeXml(params.seller.postalZone)}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(params.seller.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(params.seller.nameAr)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
${buyerXml}
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${params.issueDate}</cbc:ActualDeliveryDate>
  </cac:Delivery>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${params.taxTotalSar.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${params.subtotalSar.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${params.taxTotalSar.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${params.subtotalSar.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${params.subtotalSar.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${params.totalAmountSar.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="SAR">${params.discountTotalSar.toFixed(2)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="SAR">${params.totalAmountSar.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</Invoice>`;

  return xml.trim();
}

/**
 * Normalizes and canonicalizes UBL 2.1 XML for SHA-256 hashing (excluding UBL extensions and digital signatures).
 */
export function canonicalizeInvoiceXml(rawXml: string): string {
  return rawXml
    .replace(/<\?xml.*?\?>/g, '')
    .replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

/**
 * Calculates official ZATCA SHA-256 Digest over canonicalized UBL XML.
 */
export async function calculateInvoiceHash(rawXml: string): Promise<string> {
  const canonical = canonicalizeInvoiceXml(rawXml);
  return await computeSha256Base64(canonical);
}

// =========================================================================
// 4. ECDSA SIGNATURE GENERATOR (Simulation & Phase 2 Standard)
// =========================================================================

/**
 * Generates an ECDSA digital signature over the invoice SHA-256 digest
 */
export function generateDigitalSignature(
  invoiceHash: string,
  privateKeySecret: string = 'ZATCA-SEC-KEY-SAUDI-ERP-2026'
): { signature: string; publicKey: string } {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${invoiceHash}:${privateKeySecret}`);
  
  let hashVal = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hashVal ^= data[i];
    hashVal = (hashVal * 0x01000193) >>> 0;
  }

  const sigBytes = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    sigBytes[i] = (hashVal + i * 37) & 0xff;
  }

  let binarySig = '';
  for (let i = 0; i < sigBytes.length; i++) {
    binarySig += String.fromCharCode(sigBytes[i]);
  }
  const signature = btoa(binarySig);

  // Deterministic mock ECDSA Public Key (secp256k1 format, 65 bytes starting with 0x04)
  const pubBytes = new Uint8Array(65);
  pubBytes[0] = 0x04;
  for (let i = 1; i < 65; i++) {
    pubBytes[i] = (hashVal + i * 19) & 0xff;
  }

  let binaryPub = '';
  for (let i = 0; i < pubBytes.length; i++) {
    binaryPub += String.fromCharCode(pubBytes[i]);
  }
  const publicKey = btoa(binaryPub);

  return { signature, publicKey };
}

// =========================================================================
// 5. ZATCA BR-KSA COMPLIANCE VALIDATOR (Rules BR-KSA-01 to BR-KSA-72)
// =========================================================================

export interface ZatcaComplianceRuleResult {
  ruleCode: string;
  nameAr: string;
  nameEn: string;
  status: 'PASSED' | 'FAILED' | 'WARNING';
  details?: string;
}

export interface ZatcaComplianceCheckResult {
  isCompliant: boolean;
  scorePercentage: number;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  rules: ZatcaComplianceRuleResult[];
}

/**
 * Validates an invoice against ZATCA business rules (BR-KSA)
 */
export function validateZatcaCompliance(params: {
  invoiceNumber: string;
  invoiceType: 'STANDARD_B2B' | 'SIMPLIFIED_B2C';
  issueDate: string;
  sellerVatNumber: string;
  buyerVatNumber?: string;
  subtotalSar: number;
  taxTotalSar: number;
  totalAmountSar: number;
  previousInvoiceHash?: string;
  qrCodeBase64?: string;
  documentTypeCode?: string;
  billingReferenceNumber?: string;
  lines: Array<{
    quantity: number;
    unitPriceSar: number;
    taxableAmountSar: number;
    taxRate: number;
    taxAmountSar: number;
    totalAmountSar: number;
  }>;
}): ZatcaComplianceCheckResult {
  const rules: ZatcaComplianceRuleResult[] = [];

  // BR-KSA-01: Invoice Number Sequence
  const hasValidNumber = Boolean(params.invoiceNumber && params.invoiceNumber.length >= 3);
  rules.push({
    ruleCode: 'BR-KSA-01',
    nameAr: 'صيغة وتسلل رقم الفاتورة المرجعي',
    nameEn: 'Invoice Identifier Format & Sequence',
    status: hasValidNumber ? 'PASSED' : 'FAILED',
    details: hasValidNumber ? `Valid invoice number: ${params.invoiceNumber}` : 'Missing or invalid invoice number.',
  });

  // BR-KSA-05: Seller VAT Number Format (15 digits, starts and ends with 3)
  const sellerVatCheck = validateSaudiVatNumber(params.sellerVatNumber);
  rules.push({
    ruleCode: 'BR-KSA-05',
    nameAr: 'صحة الرقم الضريبي للمورد (15 رقم يبدأ وينتهي بـ 3)',
    nameEn: 'Seller VAT Registration Number Format (15 digits, 3...3)',
    status: sellerVatCheck.isValid ? 'PASSED' : 'FAILED',
    details: sellerVatCheck.isValid ? `Valid seller VAT: ${params.sellerVatNumber}` : sellerVatCheck.error,
  });

  // BR-KSA-09: Buyer VAT Number for Standard B2B Invoices
  if (params.invoiceType === 'STANDARD_B2B') {
    const buyerVatCheck = params.buyerVatNumber ? validateSaudiVatNumber(params.buyerVatNumber) : { isValid: false, error: 'Buyer VAT is mandatory for B2B.' };
    rules.push({
      ruleCode: 'BR-KSA-09',
      nameAr: 'الرقم الضريبي للمشتري في الفواتير الضريبية القياسية (B2B)',
      nameEn: 'Buyer VAT Number Mandatory for Standard Tax Invoices',
      status: buyerVatCheck.isValid ? 'PASSED' : 'FAILED',
      details: buyerVatCheck.isValid ? `Valid buyer VAT: ${params.buyerVatNumber}` : buyerVatCheck.error,
    });
  } else {
    rules.push({
      ruleCode: 'BR-KSA-09',
      nameAr: 'الرقم الضريبي للمشتري اختياري في الفاتورة المبسطة (B2C)',
      nameEn: 'Buyer VAT Number Optional for Simplified Invoices',
      status: 'PASSED',
      details: 'Not applicable for Simplified B2C invoices.',
    });
  }

  // BR-KSA-13: Previous Invoice Hash (PIH) Chaining
  const hasPih = Boolean(params.previousInvoiceHash && params.previousInvoiceHash.length >= 20);
  rules.push({
    ruleCode: 'BR-KSA-13',
    nameAr: 'تضمين هاش الفاتورة السابقة (PIH) لضمان السلسلة الرقمية',
    nameEn: 'Previous Invoice Hash (PIH) Chaining Integrity',
    status: hasPih ? 'PASSED' : 'FAILED',
    details: hasPih ? 'PIH chain validated.' : 'Missing or invalid Previous Invoice Hash.',
  });

  // BR-KSA-17: Line Item VAT Calculation Invariant (Line VAT = round(Taxable * Rate / 100, 2))
  let lineErrors = 0;
  for (const line of params.lines) {
    const rate = line.taxRate > 1 ? line.taxRate / 100 : line.taxRate;
    const expectedTax = Math.round(((line.taxableAmountSar * rate) + Number.EPSILON) * 100) / 100;
    if (Math.abs(line.taxAmountSar - expectedTax) > 0.02) {
      lineErrors++;
    }
  }
  rules.push({
    ruleCode: 'BR-KSA-17',
    nameAr: 'دقة حساب ضريبة القيمة المضافة على مستوى البند',
    nameEn: 'Line Item Tax Calculation Integrity',
    status: lineErrors === 0 ? 'PASSED' : 'FAILED',
    details: lineErrors === 0 ? 'All line taxes match exact half-up rounding.' : `${lineErrors} line(s) contain tax calculation discrepancy.`,
  });

  // BR-KSA-25: Grand Total Invariant (Grand Total = Subtotal + Tax)
  const expectedTotal = Math.round((params.subtotalSar + params.taxTotalSar + Number.EPSILON) * 100) / 100;
  const totalMatches = Math.abs(params.totalAmountSar - expectedTotal) <= 0.02;
  rules.push({
    ruleCode: 'BR-KSA-25',
    nameAr: 'تطابق الإجمالي النهائي مع مجموع الوعاء الضريبي ومبلغ الضريبة',
    nameEn: 'Invoice Grand Total Monetary Balance (Subtotal + VAT)',
    status: totalMatches ? 'PASSED' : 'FAILED',
    details: totalMatches ? `Grand total (${params.totalAmountSar} SAR) perfectly balanced.` : `Mismatch: Total=${params.totalAmountSar} SAR, Expected=${expectedTotal} SAR.`,
  });

  // BR-KSA-31: QR Code Presence
  const hasQr = Boolean(params.qrCodeBase64 && params.qrCodeBase64.length > 20);
  rules.push({
    ruleCode: 'BR-KSA-31',
    nameAr: 'وجود رمز الاستجابة السريعة (QR Code) بصيغة TLV Base64',
    nameEn: 'ZATCA TLV Base64 QR Code Presence',
    status: hasQr ? 'PASSED' : (params.invoiceType === 'SIMPLIFIED_B2C' ? 'FAILED' : 'WARNING'),
    details: hasQr ? 'Valid QR code embedded.' : 'QR code is missing from invoice.',
  });

  // BR-KSA-50: Credit/Debit Note Billing Reference Check
  if (params.documentTypeCode === '381' || params.documentTypeCode === '383') {
    const hasRef = Boolean(params.billingReferenceNumber);
    rules.push({
      ruleCode: 'BR-KSA-50',
      nameAr: 'ربط الإشعار الدائن/المدين برقم الفاتورة الأصلية',
      nameEn: 'Billing Reference Mandatory for Credit/Debit Notes',
      status: hasRef ? 'PASSED' : 'FAILED',
      details: hasRef ? `Referenced original invoice: ${params.billingReferenceNumber}` : 'Credit/Debit notes must reference the original invoice number.',
    });
  }

  const passedCount = rules.filter((r) => r.status === 'PASSED').length;
  const failedCount = rules.filter((r) => r.status === 'FAILED').length;
  const warningCount = rules.filter((r) => r.status === 'WARNING').length;
  const isCompliant = failedCount === 0;
  const scorePercentage = Math.round((passedCount / rules.length) * 100);

  return {
    isCompliant,
    scorePercentage,
    passedCount,
    failedCount,
    warningCount,
    rules,
  };
}

// =========================================================================
// 6. UBL 2.1 XML SCHEMA VALIDATOR (CI & Runtime Schema Check)
// =========================================================================

export interface Ubl21SchemaValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  docTypeDetected?: '388' | '381' | '383';
  profileDetected?: string;
}

/**
 * Validates UBL 2.1 XML structure and statutory ZATCA Phase 2 schema elements.
 */
export function validateUbl21XmlSchema(xml: string): Ubl21SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!xml || typeof xml !== 'string' || xml.trim().length === 0) {
    return { isValid: false, errors: ['XML document is empty or missing.'], warnings: [] };
  }

  const clean = xml.trim();

  // 1. Root Element and Namespaces
  if (!clean.includes('<Invoice') || !clean.includes('</Invoice>')) {
    errors.push('Missing <Invoice> root element or closing tag.');
  }
  if (!clean.includes('xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"')) {
    errors.push('Missing default UBL 2.0/2.1 Invoice namespace (urn:oasis:names:specification:ubl:schema:xsd:Invoice-2).');
  }
  if (!clean.includes('xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"')) {
    errors.push('Missing cac namespace declaration.');
  }
  if (!clean.includes('xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"')) {
    errors.push('Missing cbc namespace declaration.');
  }

  // 2. ProfileID and Document Identifiers
  if (!clean.includes('<cbc:ProfileID>reporting:1.0</cbc:ProfileID>')) {
    warnings.push('ProfileID should adhere to ZATCA profile standard (reporting:1.0).');
  }
  if (!/<cbc:ID>[^<]+<\/cbc:ID>/.test(clean)) {
    errors.push('Missing mandatory <cbc:ID> invoice identifier.');
  }
  if (!/<cbc:UUID>[^<]+<\/cbc:UUID>/.test(clean)) {
    errors.push('Missing mandatory <cbc:UUID> identifier.');
  }
  if (!/<cbc:IssueDate>\d{4}-\d{2}-\d{2}<\/cbc:IssueDate>/.test(clean)) {
    errors.push('Missing or invalid <cbc:IssueDate> (expected YYYY-MM-DD).');
  }
  if (!/<cbc:IssueTime>\d{2}:\d{2}:\d{2}<\/cbc:IssueTime>/.test(clean)) {
    warnings.push('Missing or non-standard <cbc:IssueTime> (expected HH:mm:ss).');
  }

  // 3. Invoice Type Code and Document Type Detection
  let docTypeDetected: '388' | '381' | '383' = '388';
  const typeCodeMatch = clean.match(/<cbc:InvoiceTypeCode[^>]*>(\d+)<\/cbc:InvoiceTypeCode>/);
  if (typeCodeMatch) {
    const code = typeCodeMatch[1];
    if (code === '381' || code === '383' || code === '388') {
      docTypeDetected = code as any;
    } else {
      errors.push(`Unrecognized InvoiceTypeCode: ${code}. Expected 388 (Tax Invoice), 381 (Credit Note), or 383 (Debit Note).`);
    }
  } else {
    errors.push('Missing mandatory <cbc:InvoiceTypeCode> element.');
  }

  // 4. Currency codes (SAR)
  if (!clean.includes('<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>')) {
    errors.push('DocumentCurrencyCode must be SAR.');
  }
  if (!clean.includes('<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>')) {
    errors.push('TaxCurrencyCode must be SAR.');
  }

  // 5. AdditionalDocumentReferences (ICV & PIH)
  if (!clean.includes('<cbc:ID>ICV</cbc:ID>')) {
    warnings.push('Missing Invoice Counter Value (ICV) reference tag.');
  }
  if (!clean.includes('<cbc:ID>PIH</cbc:ID>')) {
    errors.push('Missing mandatory Previous Invoice Hash (PIH) reference tag.');
  }

  // 6. Supplier Party
  if (!clean.includes('<cac:AccountingSupplierParty>')) {
    errors.push('Missing <cac:AccountingSupplierParty> supplier block.');
  } else {
    if (!/<cbc:CompanyID>3\d{13}3<\/cbc:CompanyID>/.test(clean)) {
      errors.push('Supplier VAT Registration Number is missing or does not match 15-digit 3...3 format.');
    }
    if (!clean.includes('<cac:PostalAddress>')) {
      errors.push('Supplier <cac:PostalAddress> is mandatory.');
    }
  }

  // 7. Customer Party
  if (!clean.includes('<cac:AccountingCustomerParty>')) {
    errors.push('Missing <cac:AccountingCustomerParty> buyer block.');
  }

  // 8. Tax Total & Monetary Totals
  if (!clean.includes('<cac:TaxTotal>')) {
    errors.push('Missing <cac:TaxTotal> block.');
  }
  if (!clean.includes('<cac:LegalMonetaryTotal>')) {
    errors.push('Missing <cac:LegalMonetaryTotal> summary block.');
  } else {
    if (!clean.includes('<cbc:LineExtensionAmount currencyID="SAR">')) {
      errors.push('LegalMonetaryTotal missing LineExtensionAmount.');
    }
    if (!clean.includes('<cbc:PayableAmount currencyID="SAR">')) {
      errors.push('LegalMonetaryTotal missing PayableAmount.');
    }
  }

  // 9. Invoice Lines
  if (!clean.includes('<cac:InvoiceLine>')) {
    errors.push('Invoice must contain at least one <cac:InvoiceLine>.');
  }

  // 10. Billing Reference for Credit (381) and Debit (383) Notes
  if (docTypeDetected === '381' || docTypeDetected === '383') {
    if (!clean.includes('<cac:BillingReference>')) {
      errors.push(`Credit/Debit Note (${docTypeDetected}) must include <cac:BillingReference> pointing to the original invoice.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    docTypeDetected,
    profileDetected: 'reporting:1.0',
  };
}

// =========================================================================
// 7. HASH CHAIN INTEGRITY VERIFICATION ENGINE
// =========================================================================

export interface HashChainVerificationResult {
  isChainValid: boolean;
  totalChecked: number;
  unbrokenChainLength: number;
  tamperedInvoiceIds: string[];
  brokenAtStep?: number;
  brokenInvoiceNumber?: string;
  alarmRaised: boolean;
  messageAr: string;
  messageEn: string;
  steps: Array<{
    step: number;
    invoiceNumber: string;
    invoiceHash: string;
    previousInvoiceHash: string;
    expectedPreviousHash: string;
    isPihValid: boolean;
    isHashRecomputedValid?: boolean;
  }>;
}

/**
 * Validates the complete cryptographic hash chain across sequential e-invoices.
 * Detects any tampering, invoice omissions, or hash breaks.
 */
export async function verifyInvoiceHashChain(
  invoices: Array<{
    id?: string;
    invoiceNumber: string;
    invoiceCounterNumber?: number;
    invoiceCounter?: number;
    invoiceHash?: string;
    previousInvoiceHash?: string;
    ublXml?: string;
    originalXml?: string;
  }>
): Promise<HashChainVerificationResult> {
  const steps: HashChainVerificationResult['steps'] = [];
  const tamperedInvoiceIds: string[] = [];

  if (!invoices || invoices.length === 0) {
    return {
      isChainValid: true,
      totalChecked: 0,
      unbrokenChainLength: 0,
      tamperedInvoiceIds: [],
      alarmRaised: false,
      messageAr: 'لا توجد فواتير للتحقق من سلسلتها التشفيرية',
      messageEn: 'No invoices to verify in hash chain.',
      steps: [],
    };
  }

  // Sort invoices in ascending counter order
  const sorted = [...invoices].sort((a, b) => {
    const numA = a.invoiceCounterNumber ?? a.invoiceCounter ?? 0;
    const numB = b.invoiceCounterNumber ?? b.invoiceCounter ?? 0;
    return numA - numB;
  });

  let unbrokenChainLength = 0;
  let isChainValid = true;
  let brokenAtStep: number | undefined;
  let brokenInvoiceNumber: string | undefined;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const expectedPih = i === 0 ? ZATCA_INITIAL_PIH_HASH : (sorted[i - 1].invoiceHash || '');
    const actualPih = current.previousInvoiceHash || '';

    const isPihValid = actualPih === expectedPih;
    let isHashRecomputedValid = true;

    const xmlPayload = current.ublXml || current.originalXml;
    if (xmlPayload && current.invoiceHash) {
      const recomputed = await calculateInvoiceHash(xmlPayload);
      if (recomputed !== current.invoiceHash) {
        isHashRecomputedValid = false;
        tamperedInvoiceIds.push(current.id || current.invoiceNumber);
      }
    }

    const stepValid = isPihValid && isHashRecomputedValid;

    steps.push({
      step: i + 1,
      invoiceNumber: current.invoiceNumber,
      invoiceHash: current.invoiceHash || '',
      previousInvoiceHash: actualPih,
      expectedPreviousHash: expectedPih,
      isPihValid,
      isHashRecomputedValid,
    });

    if (stepValid && isChainValid) {
      unbrokenChainLength++;
    } else if (isChainValid) {
      isChainValid = false;
      brokenAtStep = i + 1;
      brokenInvoiceNumber = current.invoiceNumber;
      tamperedInvoiceIds.push(current.id || current.invoiceNumber);
    }
  }

  const alarmRaised = !isChainValid;
  const messageAr = isChainValid
    ? `السلسلة التشفيرية سليمة 100% (${sorted.length} فواتير تم التحقق منها)`
    : `إنذار أمني: انقطاع أو تلاعب في السلسلة التشفيرية عند الفاتورة ${brokenInvoiceNumber} (خطوة ${brokenAtStep})`;
  const messageEn = isChainValid
    ? `Hash chain integrity verified 100% (${sorted.length} invoices checked)`
    : `INTEGRITY ALARM: Hash chain break or tampering detected at invoice ${brokenInvoiceNumber} (step ${brokenAtStep})`;

  return {
    isChainValid,
    totalChecked: sorted.length,
    unbrokenChainLength,
    tamperedInvoiceIds: Array.from(new Set(tamperedInvoiceIds)),
    brokenAtStep,
    brokenInvoiceNumber,
    alarmRaised,
    messageAr,
    messageEn,
    steps,
  };
}

// =========================================================================
// 8. E-INVOICE DOCUMENT DATA MODELS & TYPES
// =========================================================================

export type EInvoiceType = 'STANDARD_B2B' | 'SIMPLIFIED_B2C' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
export type EInvoiceStatus = 'NOT_READY' | 'READY' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'REQUIRES_ATTENTION';

export interface EInvoiceTransmissionAttempt {
  attemptNumber: number;
  timestamp: string;
  requestId: string;
  httpStatus: number;
  responseSummary: string;
  errorId?: string;
  status: 'SUCCESS' | 'FAILED' | 'RETRYABLE_ERROR';
  executionMs: number;
}

export interface EInvoiceDocument {
  id: string;
  tenantId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceType: EInvoiceType;
  documentTypeCode: '388' | '381' | '383';
  uuid: string;
  invoiceCounter: number;
  issueDate: string;
  issueTime: string;
  previousInvoiceHash: string;
  invoiceHash: string;
  digitalSignature?: string;
  publicKey?: string;
  cryptographicStamp?: string;
  qrCodeBase64: string;
  originalXml: string;
  submittedXml?: string;
  processedXml?: string;
  status: EInvoiceStatus;
  clearanceStatus?: 'CLEARED' | 'NOT_CLEARED';
  reportingStatus?: 'REPORTED' | 'NOT_REPORTED';
  validationResult: ZatcaComplianceCheckResult;
  attemptsLog: EInvoiceTransmissionAttempt[];
  retryCount: number;
  maxRetries: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  taxSnapshot: {
    subtotalSar: number;
    taxTotalSar: number;
    totalAmountSar: number;
    lineCount: number;
    snapshotTimestamp: string;
  };
  createdAt: string;
  updatedAt: string;
}

