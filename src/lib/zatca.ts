/**
 * ZATCA Phase 1 & 2 E-Invoicing Engine — Saudi ERP
 * Enforces ZATCA QR TLV structure and UBL 2.1 invoice standards.
 */

export interface ZatcaTLVInput {
  sellerName: string;
  vatNumber: string; // 15 digits starting and ending with 3
  timestamp: string; // ISO 8601 format e.g. "2026-09-17T12:00:00Z"
  invoiceTotal: string; // Total with VAT e.g. "1150.00"
  vatTotal: string; // Total VAT e.g. "150.00"
  invoiceHash?: string; // SHA-256 base64 for Phase 2
}

export interface TLVTag {
  tag: number;
  value: string;
  length: number;
  hex: string;
}

/**
 * Encodes a string into UTF-8 byte array and packs as TLV (Tag, Length, Value).
 */
export function encodeTLVTag(tagNumber: number, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const valBytes = encoder.encode(value);
  const length = valBytes.length;

  const result = new Uint8Array(2 + length);
  result[0] = tagNumber;
  result[1] = length;
  result.set(valBytes, 2);

  return result;
}

/**
 * Validates a Saudi 15-digit VAT number.
 * Must be 15 digits, start with '3', and end with '3' as per ZATCA standard.
 */
export function validateSaudiVatNumber(vat: string): { isValid: boolean; error?: string } {
  const clean = vat.trim();
  if (!/^\d{15}$/.test(clean)) {
    return { isValid: false, error: 'VAT number must contain exactly 15 numeric digits.' };
  }
  if (!clean.startsWith('3')) {
    return { isValid: false, error: 'Saudi VAT number must begin with 3.' };
  }
  if (!clean.endsWith('3')) {
    return { isValid: false, error: 'Saudi VAT number must end with 3.' };
  }
  return { isValid: true };
}

/**
 * Generates the official ZATCA TLV Base64 QR Code string.
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

  if (input.invoiceHash) {
    tagValues.push({ tag: 6, val: input.invoiceHash });
  }

  const encodedBuffers: Uint8Array[] = [];
  const tags: TLVTag[] = [];

  for (const item of tagValues) {
    const encoded = encodeTLVTag(item.tag, item.val);
    encodedBuffers.push(encoded);

    const hex = Array.from(encoded)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');

    tags.push({
      tag: item.tag,
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
 * Decodes a ZATCA TLV Base64 QR code back into its constituent tags.
 */
export function decodeZatcaQR(base64: string): {
  sellerName?: string;
  vatNumber?: string;
  timestamp?: string;
  invoiceTotal?: string;
  vatTotal?: string;
  invoiceHash?: string;
  tags: TLVTag[];
} {
  const binary = atob(base64);
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
    tags: TLVTag[];
  } = { tags: [] };

  while (offset < bytes.length) {
    const tag = bytes[offset];
    const length = bytes[offset + 1];
    const valueBytes = bytes.slice(offset + 2, offset + 2 + length);
    const value = decoder.decode(valueBytes);

    const hex = Array.from(bytes.slice(offset, offset + 2 + length))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');

    result.tags.push({ tag, length, value, hex });

    if (tag === 1) result.sellerName = value;
    else if (tag === 2) result.vatNumber = value;
    else if (tag === 3) result.timestamp = value;
    else if (tag === 4) result.invoiceTotal = value;
    else if (tag === 5) result.vatTotal = value;
    else if (tag === 6) result.invoiceHash = value;

    offset += 2 + length;
  }

  return result;
}

