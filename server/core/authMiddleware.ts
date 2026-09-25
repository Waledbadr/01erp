import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { centralStore, TenantContext, TenantScopedRepository, SYSTEM_DEFAULT_ROLES } from './tenantGuard.js';
import { validateApiKeyService } from '../modules/integrations/apiKeyService.js';
import { ApiKey } from '../modules/integrations/types.js';
import { logger } from './logger.js';
import { STATUTORY_SECURITY_HEADERS, verifyCsrfToken } from './security.js';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
      tenantRepo?: TenantScopedRepository;
      sessionToken?: string;
      apiKey?: ApiKey;
      correlationId?: string;
      user?: {
        userId: string;
        email: string;
        tenantId: string;
        role: string;
        isPlatformSuperAdmin: boolean;
      };
    }
  }
}

/**
 * Statutory Security Headers Middleware:
 * Enforces CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  for (const [header, val] of Object.entries(STATUTORY_SECURITY_HEADERS)) {
    res.setHeader(header, val);
  }
  next();
}

/**
 * CSRF Protection Middleware for state-mutating requests
 */
export function csrfProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!writeMethods.includes(req.method.toUpperCase())) {
    return next();
  }

  const path = req.path || req.originalUrl || '';
  // Exempt public auth, webhooks, and health endpoints
  if (
    path.includes('/auth/login') ||
    path.includes('/auth/register') ||
    path.includes('/auth/csrf') ||
    path.includes('/webhooks') ||
    path.includes('/health')
  ) {
    return next();
  }

  const csrfHeader = req.headers['x-csrf-token'] as string;
  const sessionToken = req.sessionToken || (req.headers['x-session-token'] as string);

  // If client enforces CSRF or sends a session-based mutation with x-csrf-token
  if (req.headers['x-require-csrf'] === 'true' || (sessionToken && csrfHeader !== undefined)) {
    if (!csrfHeader || !sessionToken || !verifyCsrfToken(csrfHeader, sessionToken)) {
      return res.status(403).json({
        error: 'CSRF_FORBIDDEN',
        message: 'Invalid or missing anti-CSRF token on mutating request.',
      });
    }
  }

  next();
}

/**
 * Session Token Rotation Service
 */
export function rotateSessionTokenService(oldToken: string): { newToken: string; session: any } {
  const session = centralStore.sessions.get(oldToken);
  if (!session) {
    throw new Error('INVALID_SESSION: Session not found for rotation.');
  }

  const newToken = `session-${crypto.randomUUID()}`;
  centralStore.sessions.delete(oldToken);
  session.sessionToken = newToken;
  session.lastActiveAt = Date.now();
  centralStore.sessions.set(newToken, session);

  return { newToken, session };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-api-key']) {
    token = String(req.headers['x-api-key']).trim();
  } else if (req.headers['x-session-token']) {
    token = String(req.headers['x-session-token']).trim();
  }

  if (!token) {
    return next();
  }

  const clientIp = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Check if token is an API Key (sk_live_...)
  if (token.startsWith('sk_live_')) {
    const validation = validateApiKeyService(token, clientIp, userAgent);

    if (!validation.valid) {
      if (validation.error === 'RATE_LIMIT_EXCEEDED') {
        res.setHeader('Retry-After', String(validation.retryAfterSeconds || 60));
        return res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: validation.errorMessage || 'API rate limit exceeded',
          retryAfter: validation.retryAfterSeconds,
        });
      }
      if (validation.error === 'REVOKED_KEY') {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'API key has been revoked',
        });
      }
      if (validation.error === 'EXPIRED_KEY') {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'API key has expired',
        });
      }
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid API key',
      });
    }

    req.tenantContext = validation.tenantContext;
    req.tenantRepo = new TenantScopedRepository(validation.tenantContext!);
    req.apiKey = validation.apiKey;
    return next();
  }

  // Otherwise handle standard Session Token
  const session = centralStore.sessions.get(token);
  if (!session) {
    return next();
  }

  // Absolute session expiration
  if (session.expiresAt < Date.now()) {
    centralStore.sessions.delete(token);
    return res.status(401).json({
      error: 'SESSION_EXPIRED',
      message: 'Session has reached maximum lifetime. Please log in again.',
    });
  }

  const user = centralStore.users.get(session.userId);
  if (!user || !user.isActive) {
    return next();
  }

  // Determine user's membership and role in this tenant
  let roleCode = 'VIEWER';
  let branchId: string | undefined;

  if (user.isPlatformSuperAdmin) {
    roleCode = 'SUPER_ADMIN';
  } else {
    const memberships = centralStore.memberships.get(session.tenantId) || [];
    const member = memberships.find((m) => m.userId === user.id && m.isActive);
    if (!member) {
      // User is not an active member of this tenant
      return next();
    }
    roleCode = member.roleCode;
    branchId = member.branchId;
  }

  // Configurable Idle Timeout: 15 mins for high privilege roles, 30 mins for standard roles
  const SENSITIVE_ROLES = ['OWNER', 'SUPER_ADMIN', 'CHIEF_ACCOUNTANT'];
  const idleTimeoutMs = SENSITIVE_ROLES.includes(roleCode) ? 15 * 60 * 1000 : 30 * 60 * 1000;

  if (session.lastActiveAt && Date.now() - session.lastActiveAt > idleTimeoutMs) {
    centralStore.sessions.delete(token);
    return res.status(401).json({
      error: 'IDLE_TIMEOUT',
      message: 'Session expired due to inactivity. Please log in again.',
    });
  }

  // Slide expiration (active session sliding renewal)
  session.lastActiveAt = Date.now();
  session.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // Extend by 24h

  // Resolve permissions from system default or custom roles
  const tenantRoles = centralStore.roles.get(session.tenantId) || SYSTEM_DEFAULT_ROLES;
  const roleDef = tenantRoles.find((r) => r.code === roleCode) || SYSTEM_DEFAULT_ROLES.find((r) => r.code === roleCode);
  const permissions = roleDef ? roleDef.permissions : [];

  const correlationId = (req as Request & { correlationId?: string }).correlationId || 'unknown';

  const tenantContext: TenantContext = {
    tenantId: session.tenantId,
    userId: user.id,
    userEmail: user.email,
    role: roleCode,
    permissions,
    branchId,
    isPlatformSuperAdmin: user.isPlatformSuperAdmin,
    correlationId,
    ipAddress: clientIp,
    userAgent,
  };

  req.tenantContext = tenantContext;
  req.tenantRepo = new TenantScopedRepository(tenantContext);
  req.sessionToken = token;
  req.user = {
    userId: tenantContext.userId,
    email: tenantContext.userEmail,
    tenantId: tenantContext.tenantId,
    role: tenantContext.role,
    isPlatformSuperAdmin: tenantContext.isPlatformSuperAdmin,
  };

  next();
}

// Tenant authenticator for modular routes.
// SECURITY: this used to fabricate an OWNER (or, with `x-superadmin: true`, a SUPER_ADMIN)
// context for ANY unauthenticated request, taking the tenant from the `x-tenant-id` header.
// It now requires a real authenticated context (session token or API key).
export function authenticateRequest(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required.',
    });
  }
  next();
}

// Write protection for suspended accounts (Section B2 requirement):
// Suspended accounts enter read-only mode (403 READ_ONLY).
// All reads work (export, view, search, report).
export function checkTenantNotSuspended(req: Request, res: Response, next: NextFunction) {
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!writeMethods.includes(req.method.toUpperCase())) {
    return next();
  }

  // Exempt billing routes (payments, plan changes), auth routes, and superadmin routes
  const path = req.path || req.originalUrl || '';
  if (
    path.includes('/billing') ||
    path.includes('/auth') ||
    path.includes('/superadmin') ||
    path.includes('/login') ||
    path.includes('/logout')
  ) {
    return next();
  }

  const tenantId = req.tenantContext?.tenantId || req.user?.tenantId;
  if (tenantId) {
    const tenant = centralStore.tenants.get(tenantId);
    if (tenant?.isSuspended) {
      return res.status(403).json({
        error: 'READ_ONLY',
        message:
          'Tenant subscription is suspended. The account is in read-only mode. All write operations are forbidden until payment is settled.',
        isSuspended: true,
      });
    }
  }

  next();
}

// Require authenticated session
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext || !req.tenantRepo) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required to access this resource',
    });
  }
  next();
}

// Require specific permission
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tenantContext || !req.tenantRepo) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    if (req.tenantContext.isPlatformSuperAdmin || req.tenantContext.role === 'OWNER') {
      return next();
    }

    if (!req.tenantContext.permissions.includes(permission)) {
      logger.warn(`Permission denied: User ${req.tenantContext.userEmail} attempted ${permission}`, {
        tenantId: req.tenantContext.tenantId,
        userId: req.tenantContext.userId,
        permission,
      });
      return res.status(403).json({
        error: 'PERMISSION_DENIED',
        message: `Action requires permission: ${permission}`,
      });
    }

    next();
  };
}

// Require platform super administrator
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext || !req.tenantContext.isPlatformSuperAdmin) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Platform super administrator privilege required',
    });
  }
  next();
}
