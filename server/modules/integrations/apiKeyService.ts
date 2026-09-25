/**
 * API Key Management Service — Saudi ERP Platform
 * Supporting SHA-256 Key Hashing at Rest, Scoped Permissions, Expiration,
 * Per-Key Rate Limiting with Retry-After Header, and Immutable Audit Logging.
 */

import crypto from 'crypto';
import { ApiKey, CreateApiKeyInput, CreateApiKeyResult, SYSTEM_API_SCOPES } from './types.js';
import { centralStore, TenantContext } from '../../core/tenantGuard.js';
import { recordAuditLogService } from '../audit/auditService.js';
import { logger } from '../../core/logger.js';
import { registerTenantState } from '../../db/tenantStateRegistry.js';

// Central in-memory store for API keys partitioned by keyHash & tenantId
const apiKeysByHash = new Map<string, ApiKey>();
const apiKeysByTenant = new Map<string, ApiKey[]>();

// Rate Limiting tracker: keyId -> { windowStartMs: number, count: number }
interface RateLimitBucket {
  windowStartMs: number;
  count: number;
}
const rateLimitBuckets = new Map<string, RateLimitBucket>();

/**
 * Hash raw secret key using SHA-256 for secure lookup at rest.
 */
export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Clean helper to get all API keys for a tenant
 */
export function getTenantApiKeysMap(tenantId: string): ApiKey[] {
  if (!apiKeysByTenant.has(tenantId)) {
    apiKeysByTenant.set(tenantId, []);
  }
  return apiKeysByTenant.get(tenantId)!;
}

/**
 * Map API scope to underlying system RBAC permission nodes.
 */
export function mapScopeToSystemPermission(scope: string): string {
  switch (scope) {
    case 'customers:read':
    case 'suppliers:read':
      return 'parties:read';
    case 'customers:write':
    case 'suppliers:write':
      return 'parties:write';
    case 'items:read':
      return 'inventory:item:view';
    case 'items:write':
      return 'inventory:item:manage';
    case 'invoices:read':
      return 'sales:invoice:view';
    case 'invoices:write':
      return 'sales:invoice:create';
    case 'bills:read':
      return 'purchases:bill:view';
    case 'bills:write':
      return 'purchases:bill:create';
    case 'payments:read':
      return 'treasury:receipt:view';
    case 'payments:write':
      return 'treasury:receipt:create';
    case 'journals:read':
      return 'accounting:journal:view';
    case 'journals:write':
      return 'accounting:journal:post';
    case 'reports:read':
      return 'accounting:financials:view';
    case 'search:read':
      return 'core:search:read';
    case 'webhooks:manage':
      return 'integrations:webhooks:manage';
    default:
      return scope;
  }
}

/**
 * Create a new scoped API Key.
 * Enforces rule: An API Key can NEVER exceed its creator's permissions.
 */
export function createApiKeyService(
  context: TenantContext,
  input: CreateApiKeyInput
): CreateApiKeyResult {
  const { tenantId, userId, userEmail, role, permissions } = context;

  // Validate scopes
  if (!input.scopes || input.scopes.length === 0) {
    throw new Error('At least one API scope must be selected');
  }

  // Validate that creator possesses the permissions required by the requested scopes
  // (Unless creator is OWNER or SUPER_ADMIN)
  const isOwner = role === 'OWNER' || role === 'SUPER_ADMIN' || permissions.includes('*');
  if (!isOwner) {
    for (const scope of input.scopes) {
      const requiredPerm = mapScopeToSystemPermission(scope);
      const hasPerm = permissions.includes(requiredPerm) || permissions.includes('*');
      if (!hasPerm) {
        throw new Error(`Forbidden: Creator lacks system permission for scope '${scope}' (${requiredPerm})`);
      }
    }
  }

  // Generate secure raw key: sk_live_ + 48 hex characters
  const randomHex = crypto.randomBytes(24).toString('hex');
  const rawSecretKey = `sk_live_${randomHex}`;
  const keyPrefix = `sk_live_${randomHex.substring(0, 8)}...`;
  const keyHash = hashApiKey(rawSecretKey);

  const rateLimit = input.rateLimit && input.rateLimit > 0 ? input.rateLimit : 60; // 60 req/min default

  let expiresAt: string | null = null;
  if (input.expiresInDays && input.expiresInDays > 0) {
    const expDate = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
    expiresAt = expDate.toISOString();
  }

  const apiKeyId = `key_${crypto.randomBytes(8).toString('hex')}`;
  const newKey: ApiKey = {
    id: apiKeyId,
    tenantId,
    name: input.name.trim(),
    keyPrefix,
    keyHash,
    scopes: [...input.scopes],
    rateLimit,
    expiresAt,
    isRevoked: false,
    createdBy: userId,
    creatorEmail: userEmail,
    creatorRole: role,
    creatorPermissions: [...permissions],
    createdAt: new Date().toISOString(),
    totalCalls: 0,
  };

  // Store key at rest
  apiKeysByHash.set(keyHash, newKey);
  const tenantList = getTenantApiKeysMap(tenantId);
  tenantList.push(newKey);

  // Audit log
  try {
    recordAuditLogService({
      tenantId,
      userId,
      userEmail,
      action: 'API_KEY_CREATED',
      resourceType: 'api_keys',
      resourceId: newKey.id,
      changesDiff: {
        keyName: { before: null, after: newKey.name },
        scopes: { before: null, after: newKey.scopes },
        rateLimit: { before: null, after: newKey.rateLimit },
        expiresAt: { before: null, after: newKey.expiresAt },
      },
    } as any);
  } catch (err) {
    logger.warn('Failed to record audit log for API key creation', { error: String(err) });
  }

  return {
    apiKey: newKey,
    rawSecretKey, // Shown ONLY ONCE
  };
}

/**
 * List all API keys for a tenant (without raw secrets)
 */
export function listApiKeysService(tenantId: string): ApiKey[] {
  const list = getTenantApiKeysMap(tenantId);
  return list.map((k) => ({ ...k }));
}

/**
 * Revoke an API Key immediately.
 */
export function revokeApiKeyService(
  tenantId: string,
  keyId: string,
  revokedByUserId: string,
  revokedByEmail?: string
): ApiKey {
  const list = getTenantApiKeysMap(tenantId);
  const key = list.find((k) => k.id === keyId);
  if (!key) {
    throw new Error('API Key not found');
  }

  if (key.isRevoked) {
    return key;
  }

  key.isRevoked = true;
  key.revokedAt = new Date().toISOString();
  key.revokedBy = revokedByUserId;

  // Update hash map entry as well
  if (apiKeysByHash.has(key.keyHash)) {
    apiKeysByHash.set(key.keyHash, key);
  }

  // Audit log
  try {
    recordAuditLogService({
      tenantId,
      userId: revokedByUserId,
      userEmail: revokedByEmail || 'system@erp.sa',
      action: 'API_KEY_REVOKED',
      resourceType: 'api_keys',
      resourceId: key.id,
      changesDiff: {
        isRevoked: { before: false, after: true },
        revokedAt: { before: null, after: key.revokedAt },
      },
    } as any);
  } catch (err) {
    logger.warn('Failed to record audit log for API key revocation', { error: String(err) });
  }

  return key;
}

/**
 * Delete an API key permanently.
 */
export function deleteApiKeyService(tenantId: string, keyId: string): boolean {
  const list = getTenantApiKeysMap(tenantId);
  const idx = list.findIndex((k) => k.id === keyId);
  if (idx === -1) {
    return false;
  }
  const [removed] = list.splice(idx, 1);
  if (removed && removed.keyHash) {
    apiKeysByHash.delete(removed.keyHash);
    rateLimitBuckets.delete(removed.id);
  }
  return true;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  apiKey?: ApiKey;
  tenantContext?: TenantContext;
  error?: 'INVALID_KEY' | 'REVOKED_KEY' | 'EXPIRED_KEY' | 'RATE_LIMIT_EXCEEDED';
  errorMessage?: string;
  retryAfterSeconds?: number;
}

/**
 * Validate incoming API Key (from Bearer or X-API-Key header).
 * Enforces:
 * 1. Existence and active hash match
 * 2. Revocation status
 * 3. Expiration date
 * 4. Rate limiting per key with 60s sliding window
 * 5. Effective permission derivation (key scopes + creator permissions)
 */
export function validateApiKeyService(
  rawSecretKey: string,
  ipAddress = '127.0.0.1',
  userAgent = 'api-client'
): ApiKeyValidationResult {
  if (!rawSecretKey || !rawSecretKey.startsWith('sk_live_')) {
    return { valid: false, error: 'INVALID_KEY', errorMessage: 'Invalid API key format' };
  }

  const hash = hashApiKey(rawSecretKey);
  const key = apiKeysByHash.get(hash);

  if (!key) {
    return { valid: false, error: 'INVALID_KEY', errorMessage: 'API key not recognized or invalid' };
  }

  // Check revocation
  if (key.isRevoked) {
    return { valid: false, error: 'REVOKED_KEY', errorMessage: 'API key has been revoked' };
  }

  // Check expiration
  if (key.expiresAt) {
    const expTime = new Date(key.expiresAt).getTime();
    if (Date.now() > expTime) {
      return { valid: false, error: 'EXPIRED_KEY', errorMessage: 'API key has expired' };
    }
  }

  // Rate Limiting Check (60-second fixed/sliding window)
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key.id) || { windowStartMs: now, count: 0 };

  if (now - bucket.windowStartMs > 60000) {
    // Reset window
    bucket.windowStartMs = now;
    bucket.count = 1;
  } else {
    bucket.count += 1;
  }
  rateLimitBuckets.set(key.id, bucket);

  if (bucket.count > key.rateLimit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStartMs + 60000 - now) / 1000));
    return {
      valid: false,
      error: 'RATE_LIMIT_EXCEEDED',
      errorMessage: `Rate limit of ${key.rateLimit} requests/min exceeded. Retry in ${retryAfterSeconds}s`,
      retryAfterSeconds,
    };
  }

  // Track usage stats
  key.lastUsedAt = new Date().toISOString();
  key.lastUsedIp = ipAddress;
  key.totalCalls += 1;

  // Build effective TenantContext for this API call
  // Maps key scopes into system permissions
  const mappedPermissions: string[] = [];
  for (const s of key.scopes) {
    mappedPermissions.push(mapScopeToSystemPermission(s));
  }

  // Key permissions can NEVER exceed creator's permissions
  const isCreatorOwner = key.creatorRole === 'OWNER' || key.creatorRole === 'SUPER_ADMIN';
  const effectivePermissions = isCreatorOwner
    ? mappedPermissions
    : mappedPermissions.filter((p) => key.creatorPermissions.includes(p) || key.creatorPermissions.includes('*'));

  const tenantContext: TenantContext = {
    tenantId: key.tenantId,
    userId: key.createdBy,
    userEmail: key.creatorEmail,
    role: key.creatorRole,
    permissions: effectivePermissions,
    ipAddress,
    userAgent,
    correlationId: `api_${crypto.randomUUID()}`,
  };

  return {
    valid: true,
    apiKey: key,
    tenantContext,
  };
}

/**
 * Reset rate limit bucket (useful for test suites).
 */
export function resetRateLimitBucketsForTest(): void {
  rateLimitBuckets.clear();
}

/**
 * Clear all API keys store (for hermetic test isolation).
 */
export function clearApiKeysStoreForTest(): void {
  apiKeysByHash.clear();
  apiKeysByTenant.clear();
  rateLimitBuckets.clear();
}

// Company data persistence: keys are saved per tenant; the hash index is rebuilt after a load
// so both maps keep pointing at the same objects.
registerTenantState('integrations.apiKeysByTenant', apiKeysByTenant, {
  afterLoad: (tenantId) => {
    for (const [hash, key] of [...apiKeysByHash.entries()]) {
      if ((key as { tenantId?: string }).tenantId === tenantId) apiKeysByHash.delete(hash);
    }
    for (const key of apiKeysByTenant.get(tenantId) || []) apiKeysByHash.set(key.keyHash, key);
  },
});
