import crypto from 'crypto';

// ==========================================
// 1. SECURE PASSWORD HASHING (PBKDF2-SHA512)
// ==========================================
const PBKDF2_ITERATIONS = 100000;
const KEY_LEN = 64;
const DIGEST = 'sha512';

export function hashPassword(password: string): string {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, DIGEST);
  return `$pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${derivedKey.toString('hex')}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 5 || parts[1] !== 'pbkdf2') {
      return false;
    }
    const iterations = parseInt(parts[2], 10);
    const salt = parts[3];
    const originalHash = parts[4];

    const derivedKey = crypto.pbkdf2Sync(password, salt, iterations, KEY_LEN, DIGEST);
    const currentHash = derivedKey.toString('hex');

    return crypto.timingSafeEqual(Buffer.from(currentHash, 'utf8'), Buffer.from(originalHash, 'utf8'));
  } catch {
    return false;
  }
}

// ==========================================
// 2. CRYPTOGRAPHIC TOKENS & SIGNED SESSIONS
// ==========================================
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ==========================================
// 3. MFA / RFC 6238 TOTP ENGINE
// ==========================================
// Base32 helper for TOTP secrets
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(length = 20): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += BASE32_ALPHABET[bytes[i] % 32];
  }
  return result;
}

function base32ToBuffer(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const index = BASE32_ALPHABET.indexOf(clean[i]);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, timeStepWindow = 0): string {
  const key = base32ToBuffer(secret);
  const time = Math.floor(Date.now() / 1000 / 30) + timeStepWindow;
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(time), 0);

  const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

export function verifyTotp(secret: string, token: string, allowedDrift = 1): boolean {
  if (!secret || !token) return false;
  const cleanToken = token.trim();
  for (let drift = -allowedDrift; drift <= allowedDrift; drift++) {
    const expected = generateTotpCode(secret, drift);
    if (crypto.timingSafeEqual(Buffer.from(cleanToken, 'utf8'), Buffer.from(expected, 'utf8'))) {
      return true;
    }
  }
  return false;
}

export function generateMfaEnrollment(email: string, issuer = 'SaudiERP'): { secret: string; otpauthUrl: string } {
  const secret = generateBase32Secret(20);
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  const otpauthUrl = `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  return { secret, otpauthUrl };
}

export function generateRecoveryCodes(count = 8): { plaintext: string[]; hashed: string[] } {
  const plaintext: string[] = [];
  const hashed: string[] = [];

  for (let i = 0; i < count; i++) {
    const part1 = crypto.randomBytes(3).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(3).toString('hex').toUpperCase();
    const code = `${part1}-${part2}`;
    plaintext.push(code);
    hashed.push(crypto.createHash('sha256').update(code).digest('hex'));
  }

  return { plaintext, hashed };
}

export function verifyAndBurnRecoveryCode(
  inputCode: string,
  storedHashedCodes: string[]
): { valid: boolean; remainingHashedCodes: string[] } {
  const clean = inputCode.trim().toUpperCase();
  const inputHash = crypto.createHash('sha256').update(clean).digest('hex');

  const index = storedHashedCodes.findIndex((h) => crypto.timingSafeEqual(Buffer.from(h, 'utf8'), Buffer.from(inputHash, 'utf8')));
  if (index === -1) {
    return { valid: false, remainingHashedCodes: storedHashedCodes };
  }

  const remaining = [...storedHashedCodes];
  remaining.splice(index, 1);
  return { valid: true, remainingHashedCodes: remaining };
}

// ==========================================
// 4. SAUDI REGULATORY FORMAT VALIDATORS
// ==========================================
/**
 * Saudi VAT ID validation: Exactly 15 digits, begins with '3' and ends with '3'
 */
export function validateSaudiVatNumber(vat: string): { valid: boolean; error?: string } {
  if (!vat) return { valid: false, error: 'VAT number is required' };
  const cleaned = vat.trim();
  if (!/^\d{15}$/.test(cleaned)) {
    return { valid: false, error: 'VAT number must be exactly 15 digits' };
  }
  if (!cleaned.startsWith('3')) {
    return { valid: false, error: 'Saudi VAT number must begin with 3' };
  }
  if (!cleaned.endsWith('3')) {
    return { valid: false, error: 'Saudi VAT number must end with 3' };
  }
  return { valid: true };
}

/**
 * Saudi Commercial Registration (CR) Number: Exactly 10 digits
 */
export function validateSaudiCrNumber(cr: string): { valid: boolean; error?: string } {
  if (!cr) return { valid: false, error: 'CR number is required' };
  const cleaned = cr.trim();
  if (!/^\d{10}$/.test(cleaned)) {
    return { valid: false, error: 'CR number must be exactly 10 digits' };
  }
  return { valid: true };
}

/**
 * Saudi 700-series Unified National Number: Exactly 10 digits starting with 7
 */
export function validateSaudiUnifiedNumber(num: string): { valid: boolean; error?: string } {
  if (!num) return { valid: true }; // optional if CR is supplied
  const cleaned = num.trim();
  if (!/^7\d{9}$/.test(cleaned)) {
    return { valid: false, error: 'Unified National Number must be 10 digits starting with 7 (e.g. 7001234567)' };
  }
  return { valid: true };
}

// ==========================================
// 5. TURNSTILE / CAPTCHA VALIDATION
// ==========================================
export async function verifyTurnstileToken(token: string | undefined, ipAddress: string): Promise<{ success: boolean; status: 'ok' | 'not_configured' | 'invalid' }> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    return { success: true, status: 'not_configured' };
  }

  if (!token) {
    return { success: false, status: 'invalid' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    formData.append('remoteip', ipAddress);

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const result = (await response.json()) as { success: boolean };
    return { success: result.success, status: result.success ? 'ok' : 'invalid' };
  } catch {
    // Gracefully handle network issues
    return { success: false, status: 'invalid' };
  }
}
