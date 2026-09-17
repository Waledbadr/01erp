import { describe, it, expect } from 'vitest';
import { 
  roundHalfUp, 
  toHalalas, 
  fromHalalasToDisplay, 
  validateJournalBalance, 
  formatCurrency 
} from '../lib/accounting';

describe('Accounting Engine & Fixed-Point Mathematics (Rules G1, G7, G8)', () => {
  it('should round half-up accurately to avoid floating-point drift', () => {
    expect(roundHalfUp(10.255, 2)).toBe('10.26');
    expect(roundHalfUp(10.254, 2)).toBe('10.25');
    expect(roundHalfUp(0.1 + 0.2, 2)).toBe('0.30');
  });

  it('should convert strings to 4-decimal fixed-point halalas and back without loss', () => {
    const halalas = toHalalas('1250.5000');
    expect(fromHalalasToDisplay(halalas, 2)).toBe('1250.50');
  });

  it('should validate balanced journal entries (Rule G1: debits == credits)', () => {
    const balancedJournal = [
      {
        accountId: '1111',
        accountNameAr: 'الصندوق الرئيسي',
        accountNameEn: 'Main Cash Drawer',
        debit: '1150.00',
        credit: '0.00',
      },
      {
        accountId: '4110',
        accountNameAr: 'إيرادات المبيعات',
        accountNameEn: 'Sales Revenue',
        debit: '0.00',
        credit: '1000.00',
      },
      {
        accountId: '2120',
        accountNameAr: 'ضريبة القيمة المضافة المخرجة',
        accountNameEn: 'Output VAT Payable',
        debit: '0.00',
        credit: '150.00',
      },
    ];

    const result = validateJournalBalance(balancedJournal);
    expect(result.isValid).toBe(true);
    expect(result.totalDebits).toBe('1150.00');
    expect(result.totalCredits).toBe('1150.00');
    expect(result.difference).toBe('0.00');
  });

  it('should reject unbalanced journal entries with detailed error', () => {
    const unbalancedJournal = [
      {
        accountId: '1111',
        accountNameAr: 'الصندوق الرئيسي',
        accountNameEn: 'Main Cash Drawer',
        debit: '1100.00',
        credit: '0.00',
      },
      {
        accountId: '4110',
        accountNameAr: 'إيرادات المبيعات',
        accountNameEn: 'Sales Revenue',
        debit: '0.00',
        credit: '1000.00',
      },
    ];

    const result = validateJournalBalance(unbalancedJournal);
    expect(result.isValid).toBe(false);
    expect(result.difference).toBe('100.00');
    expect(result.error).toContain('do not equal');
  });

  it('should reject lines with both debit and credit or negative values', () => {
    const invalidLineJournal = [
      {
        accountId: '1111',
        accountNameAr: 'الصندوق الرئيسي',
        accountNameEn: 'Main Cash Drawer',
        debit: '500.00',
        credit: '200.00',
      },
    ];

    const result = validateJournalBalance(invalidLineJournal);
    expect(result.isValid).toBe(false);
  });

  it('should format SAR currency properly in ar and en', () => {
    expect(formatCurrency('1250.50', 'en')).toBe('SAR 1,250.50');
    expect(formatCurrency('1250.50', 'ar')).toContain('ر.س');
  });
});
