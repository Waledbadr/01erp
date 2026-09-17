import { Request, Response, NextFunction } from 'express';
import { centralStore, TenantContext, TenantScopedRepository, SYSTEM_DEFAULT_ROLES } from './tenantGuard.js';
import { logger } from './logger.js';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
      tenantRepo?: TenantScopedRepository;
      sessionToken?: string;
      correlationId?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-session-token']) {
    token = String(req.headers['x-session-token']).trim();
  }

  if (!token) {
    return next();
  }

  const session = centralStore.sessions.get(token);
  if (!session) {
    return next();
  }

  // Check session expiration
  if (session.expiresAt < Date.now()) {
    centralStore.sessions.delete(token);
    return next();
  }

  // Slide expiration (active session sliding renewal)
  session.lastActiveAt = Date.now();
  session.expiresAt = Date.now() + 24 * 60 * 60 * 1000; // Extend by 24h

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
    ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
    userAgent: req.headers['user-agent'] || 'unknown',
  };

  req.tenantContext = tenantContext;
  req.tenantRepo = new TenantScopedRepository(tenantContext);
  req.sessionToken = token;

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
