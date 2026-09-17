import { describe, it, expect } from 'vitest';
import { generateZatcaQR, validateSaudiVatNumber, encodeTLVTag } from '../lib/zatca';

describe('ZATCA Phase 1 & 2 E-Invoicing Engine', () => {
  it('should validate Saudi 15-digit VAT number (must start and end with 3)', () => {
    expect(validateSaudiVatNumber('300000000000003').isValid).toBe(true);
    expect(validateSaudiVatNumber('100000000000003').isValid).toBe(false);
    expect(validateSaudiVatNumber('300000000000001').isValid).toBe(false);
    expect(validateSaudiVatNumber('300003').isValid).toBe(false);
    expect(validateSaudiVatNumber('30000000000000A').isValid).toBe(false);
  });

  it('should encode TLV tag with length byte and UTF-8 value', () => {
    const encoded = encodeTLVTag(1, 'Test');
    expect(encoded[0]).toBe(1); // Tag 1
    expect(encoded[1]).toBe(4); // Length 4
    expect(new TextDecoder().decode(encoded.slice(2))).toBe('Test');
  });

  it('should generate valid ZATCA TLV Base64 QR code with required tags', () => {
    const result = generateZatcaQR({
      sellerName: 'شركة النظم السعودية للتجارة',
      vatNumber: '300000000000003',
      timestamp: '2026-09-17T12:00:00Z',
      invoiceTotal: '1150.00',
      vatTotal: '150.00',
    });

    expect(result.base64).toBeDefined();
    expect(result.base64.length).toBeGreaterThan(20);
    expect(result.tags.length).toBe(5);
    expect(result.tags[0].tag).toBe(1);
    expect(result.tags[1].tag).toBe(2);
    expect(result.tags[2].tag).toBe(3);
    expect(result.tags[3].tag).toBe(4);
    expect(result.tags[4].tag).toBe(5);
  });

  it('should include invoice hash in Tag 6 for Phase 2', () => {
    const result = generateZatcaQR({
      sellerName: 'Al-Madar Tech',
      vatNumber: '310123456700003',
      timestamp: '2026-09-17T14:30:00Z',
      invoiceTotal: '2300.00',
      vatTotal: '300.00',
      invoiceHash: 'NWZjN2FiODRlMGViOGQ4ZTgyMmFhODc5ODdlNzllZTkyOGZkOGEwMA==',
    });

    expect(result.tags.length).toBe(6);
    expect(result.tags[5].tag).toBe(6);
    expect(result.tags[5].value).toBe('NWZjN2FiODRlMGViOGQ4ZTgyMmFhODc5ODdlNzllZTkyOGZkOGEwMA==');
  });
});
