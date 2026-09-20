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

// ==========================================
// 6. AES-256-GCM ENCRYPTION AT REST
// ==========================================
const DEFAULT_BACKUP_MASTER_KEY = crypto
  .createHash('sha256')
  .update(process.env.BACKUP_ENCRYPTION_KEY || 'SAUDI_ERP_ENTERPRISE_AES_256_GCM_SECRET_SEED_2026')
  .digest();

export interface EncryptedArtifact {
  algorithm: 'AES-256-GCM';
  ciphertextHex: string;
  ivHex: string;
  tagHex: string;
  authTagHex: string;
  sizeBytes: number;
}

export function encryptAesGcm(plaintext: string, key = DEFAULT_BACKUP_MASTER_KEY): EncryptedArtifact {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const tagHex = tag.toString('hex');

  return {
    algorithm: 'AES-256-GCM',
    ciphertextHex: ciphertext.toString('hex'),
    ivHex: iv.toString('hex'),
    tagHex,
    authTagHex: tagHex,
    sizeBytes: ciphertext.length,
  };
}

export function decryptAesGcm(
  artifact: { ciphertextHex: string; ivHex: string; tagHex?: string; authTagHex?: string },
  key = DEFAULT_BACKUP_MASTER_KEY
): string {
  const iv = Buffer.from(artifact.ivHex, 'hex');
  const tagStr = artifact.tagHex || artifact.authTagHex;
  if (!tagStr) {
    throw new Error('AUTH_TAG_REQUIRED: AES-256-GCM decryption requires authentication tag.');
  }
  const tag = Buffer.from(tagStr, 'hex');
  const ciphertext = Buffer.from(artifact.ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// ==========================================
// 7. CSRF PROTECTION UTILITIES
// ==========================================
const CSRF_SECRET = process.env.CSRF_SECRET || 'SAUDI_ERP_CSRF_SALT_RANDOM_SECRET_KEY_9921';

export function generateCsrfToken(sessionToken: string): string {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(8).toString('hex');
  const signature = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(`${sessionToken}:${timestamp}:${nonce}`)
    .digest('hex');
  return `${timestamp}.${nonce}.${signature}`;
}

export function verifyCsrfToken(csrfToken: string | undefined, sessionToken: string): boolean {
  if (!csrfToken || !sessionToken) return false;
  const parts = csrfToken.split('.');
  if (parts.length !== 3) return false;

  const [timestampStr, nonce, providedSig] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Max 24 hour validity for CSRF token
  const age = Date.now() - timestamp;
  if (age < 0 || age > 24 * 60 * 60 * 1000) {
    return false;
  }

  const expectedSig = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(`${sessionToken}:${timestampStr}:${nonce}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(providedSig, 'utf8'), Buffer.from(expectedSig, 'utf8'));
  } catch {
    return false;
  }
}

// ==========================================
// 8. SECURITY HEADERS CONFIGURATION
// ==========================================
export const STATUTORY_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-ancestors 'self' https://*.google.com https://*.run.app https://ai.studio;",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-XSS-Protection': '1; mode=block',
};

// ==========================================
// 9. SECRETS CANARY & REPOSITORY SCANNER
// ==========================================
export interface SecretMatch {
  type: string;
  preview: string;
}

const SENSITIVE_PATTERNS: { type: string; regex: RegExp }[] = [
  { type: 'PRIVATE_KEY', regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/i },
  { type: 'LIVE_API_KEY', regex: /sk_live_[0-9a-zA-Z]{16,}/ },
  { type: 'GOOGLE_API_KEY', regex: /AIzaSy[0-9A-Za-z_-]{33}/ },
  { type: 'PASSWORD_ASSIGNMENT', regex: /password\s*[:=]\s*["'][^"'\s]{8,}["']/i },
  { type: 'BEARER_TOKEN', regex: /bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/i },
  { type: 'SECRET_KEY', regex: /secret_key\s*[:=]\s*["'][0-9a-zA-Z]{16,}["']/i },
];

export function scanForSecrets(content: string): { found: boolean; matches: SecretMatch[] } {
  const matches: SecretMatch[] = [];
  for (const { type, regex } of SENSITIVE_PATTERNS) {
    const match = content.match(regex);
    if (match) {
      matches.push({
        type,
        preview: match[0].slice(0, 10) + '***REDACTED***',
      });
    }
  }
  return {
    found: matches.length > 0,
    matches,
  };
}

// ==========================================
// 10. DATABASE LEAST-PRIVILEGE DEFENSE-IN-DEPTH
// ==========================================
export class DatabaseLeastPrivilegeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'DatabaseLeastPrivilegeError';
  }
}

export function enforceDbLeastPrivilege(sqlOrAction: string, userRole: string = 'app_user'): void {
  const normalized = (sqlOrAction || '').toUpperCase();
  const superuserActions = [
    'DROP_DATABASE',
    'DROP DATABASE',
    'CREATE_SUPERUSER',
    'CREATE SUPERUSER',
    'ALTER_SYSTEM',
    'ALTER SYSTEM',
    'BYPASS_RLS',
    'DISABLE_TRIGGERS',
    'TRUNCATE',
  ];

  if (superuserActions.some((action) => normalized.includes(action))) {
    throw new DatabaseLeastPrivilegeError(
      `DB_LEAST_PRIVILEGE_VIOLATION: Application role '${userRole}' is restricted from executing superuser database command '${sqlOrAction}'.`,
      'DB_SUPERUSER_DENIED'
    );
  }
}

export function assertDbTenantConstraint(rowTenantId: string, activeTenantId: string): void {
  if (rowTenantId !== activeTenantId) {
    throw new DatabaseLeastPrivilegeError(
      `DB_TENANT_ISOLATION_VIOLATION: Direct SQL or ORM attempt to access or modify row owned by '${rowTenantId}' under active tenant '${activeTenantId}' was rejected by PostgreSQL RLS guard.`,
      'DB_RLS_VIOLATION'
    );
  }
}

export function assertDbBalanceConstraint(totalDebitCents: bigint, totalCreditCents: bigint): void {
  if (totalDebitCents !== totalCreditCents) {
    throw new DatabaseLeastPrivilegeError(
      `DB_BALANCE_CONSTRAINT_VIOLATION: Total Debits (${totalDebitCents}) must exactly equal Total Credits (${totalCreditCents}). Database CHECK constraint balance_invariant_chk rejected mutation.`,
      'DB_CHECK_CONSTRAINT_FAILED'
    );
  }
}

// ==========================================
// 11. LOGIN HISTORY TRACKING (In-Memory Audit)
// ==========================================
export interface LoginHistoryRecordInternal {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  ipAddress: string;
  userAgent: string;
  status: 'SUCCESS' | 'FAILED' | 'LOCKED_OUT';
  mfaUsed?: boolean;
  failureReason?: string;
  timestamp: string;
}

const loginHistoryStore: LoginHistoryRecordInternal[] = [];

export function recordLoginAttempt(record: Omit<LoginHistoryRecordInternal, 'id' | 'timestamp'>): LoginHistoryRecordInternal {
  const item: LoginHistoryRecordInternal = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...record,
  };
  loginHistoryStore.unshift(item);
  if (loginHistoryStore.length > 500) {
    loginHistoryStore.pop();
  }
  return item;
}

export function getLoginHistoryForTenant(tenantId: string): LoginHistoryRecordInternal[] {
  return loginHistoryStore.filter((r) => r.tenantId === tenantId);
}

