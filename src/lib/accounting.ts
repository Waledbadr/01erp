/**
 * Core Accounting & Financial Precision Library — Saudi ERP
 * Enforces Golden Rules G1-G8, ADR-003, and ADR-004.
 */

export interface JournalLine {
  accountId: string;
  accountNameAr: string;
  accountNameEn: string;
  debit: string; // Exact decimal string e.g. "1150.00"
  credit: string; // Exact decimal string e.g. "0.00"
  description?: string;
  costCenterId?: string;
}

export interface BalanceValidationResult {
  isValid: boolean;
  totalDebits: string;
  totalCredits: string;
  difference: string;
  error?: string;
  errorAr?: string;
}

/**
 * Standard rounding: Half-up to specified decimal places.
 * Avoids IEEE 754 floating-point inaccuracies by scaling and epsilon compensation.
 */
export function roundHalfUp(value: number, decimals: number = 2): string {
  const factor = Math.pow(10, decimals);
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return rounded.toFixed(decimals);
}

/**
 * Parse an exact decimal string to internal fixed-point representation (cents/halalas).
 * Example: "123.45" -> 12345
 */
export function toHalalas(amountStr: string): bigint {
  const clean = (amountStr || '0').trim();
  if (!clean || isNaN(Number(clean))) return 0n;

  const parts = clean.split('.');
  const whole = BigInt(parts[0] || '0');
  let fraction = parts[1] || '';
  if (fraction.length > 4) {
    fraction = fraction.slice(0, 4);
  } else {
    fraction = fraction.padEnd(4, '0');
  }
  // Store with 4 decimal places internally (1/10000th of SAR)
  const sign = clean.startsWith('-') ? -1n : 1n;
  const absWhole = whole < 0n ? -whole : whole;
  return sign * (absWhole * 10000n + BigInt(fraction));
}

/**
 * Convert 4-decimal fixed point back to standard 2-decimal formatted string.
 */
export function fromHalalasToDisplay(halalas: bigint, decimals: number = 2): string {
  const isNegative = halalas < 0n;
  const absVal = isNegative ? -halalas : halalas;

  // Round from 4 decimal places to desired decimals
  const divisor = 10000n;
  const targetScale = BigInt(Math.pow(10, 4 - decimals));
  const half = targetScale / 2n;

  const rounded = (absVal + half) / targetScale;
  const targetDivisor = BigInt(Math.pow(10, decimals));
  const wholePart = rounded / targetDivisor;
  const fracPart = rounded % targetDivisor;

  const fracStr = fracPart.toString().padStart(decimals, '0');
  return `${isNegative ? '-' : ''}${wholePart.toString()}.${fracStr}`;
}

/**
 * Validates whether a journal's debit lines strictly equal credit lines (Rule G1).
 */
export function validateJournalBalance(lines: JournalLine[]): BalanceValidationResult {
  let totalDebitsHalalas = 0n;
  let totalCreditsHalalas = 0n;

  for (const line of lines) {
    const d = toHalalas(line.debit);
    const c = toHalalas(line.credit);

    if (d < 0n || c < 0n) {
      return {
        isValid: false,
        totalDebits: '0.00',
        totalCredits: '0.00',
        difference: '0.00',
        error: 'Negative debit or credit values are strictly prohibited. Use an offsetting entry.',
        errorAr: 'يُحظر استخدام مبالغ سالبة في المدين أو الدائن. استخدم قيداً مقابلاً.',
      };
    }

    if (d > 0n && c > 0n) {
      return {
        isValid: false,
        totalDebits: '0.00',
        totalCredits: '0.00',
        difference: '0.00',
        error: 'A single journal line cannot contain both debit and credit amounts.',
        errorAr: 'لا يمكن لسطر القيد الواحد أن يحتوي على قيمتين للمدين والدائن معاً.',
      };
    }

    totalDebitsHalalas += d;
    totalCreditsHalalas += c;
  }

  const diffHalalas = totalDebitsHalalas - totalCreditsHalalas;
  const totalDebitsStr = fromHalalasToDisplay(totalDebitsHalalas, 2);
  const totalCreditsStr = fromHalalasToDisplay(totalCreditsHalalas, 2);
  const diffStr = fromHalalasToDisplay(diffHalalas < 0n ? -diffHalalas : diffHalalas, 2);

  const isValid = diffHalalas === 0n && totalDebitsHalalas > 0n;

  let error: string | undefined;
  let errorAr: string | undefined;

  if (totalDebitsHalalas === 0n && totalCreditsHalalas === 0n) {
    error = 'Journal entry cannot be empty or zero value.';
    errorAr = 'لا يمكن ترحيل قيد فارغ أو بقيمة صفرية.';
  } else if (!isValid) {
    error = `Total debits (${totalDebitsStr} SAR) do not equal total credits (${totalCreditsStr} SAR). Discrepancy: ${diffStr} SAR.`;
    errorAr = `إجمالي المدين (${totalDebitsStr} ر.س) لا يساوي إجمالي الدائن (${totalCreditsStr} ر.س). الفارق: ${diffStr} ر.س.`;
  }

  return {
    isValid,
    totalDebits: totalDebitsStr,
    totalCredits: totalCreditsStr,
    difference: diffStr,
    error,
    errorAr,
  };
}

/**
 * Format currency amount with appropriate locale symbols.
 */
export function formatCurrency(amount: string | number, lang: 'ar' | 'en' = 'ar'): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return lang === 'ar' ? '٠٫٠٠ ر.س' : 'SAR 0.00';

  const parts = num.toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return lang === 'ar' ? `${parts} ر.س` : `SAR ${parts}`;
}
