// Saudi Arabian Regulatory Identifiers Validators (Client-Side Safe)

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a Saudi Tax Identification / VAT Number (الرقم الضريبي).
 * Standard: 15 numeric digits, starting with '3' and ending with '3'.
 */
export function validateSaudiVatNumber(vat: string): ValidationResult {
  if (!vat || typeof vat !== 'string') {
    return { valid: false, error: 'الرقم الضريبي مطلوب' };
  }

  const clean = vat.trim();
  if (!/^\d{15}$/.test(clean)) {
    return { valid: false, error: 'الرقم الضريبي يجب أن يتكون من 15 رقماً بالضبط' };
  }

  if (clean.charAt(0) !== '3') {
    return { valid: false, error: 'الرقم الضريبي السعودي يجب أن يبدأ بالرقم 3' };
  }

  if (clean.charAt(14) !== '3') {
    return { valid: false, error: 'الرقم الضريبي السعودي يجب أن ينتهي بالرقم 3' };
  }

  return { valid: true };
}

/**
 * Validates a Saudi Commercial Registration (السجل التجاري).
 * Standard: exactly 10 numeric digits.
 */
export function validateSaudiCrNumber(cr: string): ValidationResult {
  if (!cr || typeof cr !== 'string') {
    return { valid: false, error: 'رقم السجل التجاري مطلوب' };
  }

  const clean = cr.trim();
  if (!/^\d{10}$/.test(clean)) {
    return { valid: false, error: 'رقم السجل التجاري يجب أن يتكون من 10 أرقام بالضبط' };
  }

  return { valid: true };
}

/**
 * Validates the Saudi Unified National Number (الرقم الوطني الموحد للمنشآت 700).
 * Standard: 10 numeric digits starting with '7'.
 */
export function validateSaudiUnifiedNumber(unified: string): ValidationResult {
  if (!unified || typeof unified !== 'string') {
    return { valid: false, error: 'الرقم الموحد مطلوب' };
  }

  const clean = unified.trim();
  if (!/^7\d{9}$/.test(clean)) {
    return { valid: false, error: 'الرقم الوطني الموحد (700) يجب أن يبدأ بالرقم 7 ويتكون من 10 أرقام' };
  }

  return { valid: true };
}

/**
 * Validates Saudi IBAN format (SA followed by 22 digits).
 */
export function validateSaudiIban(iban: string): ValidationResult {
  if (!iban || typeof iban !== 'string') {
    return { valid: false, error: 'الآيبان البنكي مطلوب' };
  }

  const clean = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^SA\d{22}$/.test(clean)) {
    return { valid: false, error: 'الآيبان السعودي يجب أن يبدأ بـ SA متبوعاً بـ 22 رقماً (24 خانة إجمالاً)' };
  }

  return { valid: true };
}

/**
 * Boolean helpers for direct conditional checks
 */
export function validateSaudiVat(vat: string): boolean {
  return validateSaudiVatNumber(vat).valid;
}

export function validateSaudiCR(cr: string): boolean {
  return validateSaudiCrNumber(cr).valid;
}

export function validateSaudi700Number(unified: string): boolean {
  return validateSaudiUnifiedNumber(unified).valid;
}

