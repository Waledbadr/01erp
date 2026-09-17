import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';
import { centralStore, User, UserMembership } from '../../core/tenantGuard.js';
import { hashPassword, generateSecureToken } from '../../core/security.js';

export const usersRouter = Router();

// ==========================================
// 1. LIST & MANAGE USERS IN ACTIVE COMPANY
// ==========================================
usersRouter.get('/', requireAuth, requirePermission('settings:users:view'), (req: Request, res: Response) => {
  const users = req.tenantRepo!.getUsers();
  const sanitized = users.map(({ user, membership }) => ({
    id: user.id,
    email: user.email,
    fullNameAr: user.fullNameAr,
    fullNameEn: user.fullNameEn,
    phone: user.phone,
    role: membership.roleCode,
    branchId: membership.branchId,
    isActive: membership.isActive && user.isActive,
    mfaEnabled: user.mfaEnabled,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  }));
  return res.json({ users: sanitized });
});

// Invite a user to this company
usersRouter.post('/invite', requireAuth, requirePermission('settings:users:manage'), (req: Request, res: Response) => {
  const { email, fullNameAr, fullNameEn, roleCode, branchId, defaultPassword } = req.body;
  if (!email || !roleCode) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Email and role are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const repo = req.tenantRepo!;
  const tenantId = repo.tenantId;

  // Check if user already exists
  let userId = centralStore.userByEmail.get(cleanEmail);
  let user = userId ? centralStore.users.get(userId) : undefined;

  if (!user) {
    // Create user with default or temporary password
    userId = crypto.randomUUID();
    const tempPass = defaultPassword || `KSA-User2026!${crypto.randomBytes(2).toString('hex')}`;
    user = {
      id: userId,
      email: cleanEmail,
      passwordHash: hashPassword(tempPass),
      fullNameAr: fullNameAr || cleanEmail.split('@')[0],
      fullNameEn: fullNameEn || cleanEmail.split('@')[0],
      isPlatformSuperAdmin: false,
      isActive: true,
      mfaEnabled: false,
      failedLoginAttempts: 0,
      createdAt: new Date().toISOString(),
    };
    centralStore.users.set(userId, user);
    centralStore.userByEmail.set(cleanEmail, userId);
  }

  // Check if user is already a member of this tenant
  const tenantMemberships = centralStore.memberships.get(tenantId) || [];
  const existingMember = tenantMemberships.find((m) => m.userId === userId);

  if (existingMember) {
    existingMember.roleCode = roleCode;
    existingMember.isActive = true;
    if (branchId) existingMember.branchId = branchId;
  } else {
    const newMembership: UserMembership = {
      id: crypto.randomUUID(),
      tenantId,
      userId,
      roleCode,
      branchId,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    tenantMemberships.push(newMembership);
    centralStore.memberships.set(tenantId, tenantMemberships);
  }

  // Create single-use invite token record
  const inviteToken = generateSecureToken(32);
  const tenantInvites = centralStore.invites.get(tenantId) || [];
  tenantInvites.push({
    id: crypto.randomUUID(),
    tenantId,
    email: cleanEmail,
    roleCode,
    branchId,
    token: inviteToken,
    invitedBy: req.tenantContext!.userId,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    createdAt: new Date().toISOString(),
  });
  centralStore.invites.set(tenantId, tenantInvites);

  centralStore.recordAuditLog({
    tenantId,
    userId: req.tenantContext!.userId,
    userEmail: req.tenantContext!.userEmail,
    ipAddress: req.tenantContext!.ipAddress,
    userAgent: req.tenantContext!.userAgent,
    action: 'INVITE_USER',
    resourceType: 'users',
    resourceId: userId,
    correlationId: req.tenantContext!.correlationId,
    changesDiff: { user: { before: null, after: { email: cleanEmail, role: roleCode } } },
  });

  return res.status(201).json({
    message: `تمت دعوة المستخدم (${cleanEmail}) وتعيين دور [${roleCode}] بنجاح.`,
    inviteToken,
    user: {
      id: user.id,
      email: user.email,
      role: roleCode,
    },
  });
});

// Update role of a user in this company
usersRouter.put('/:userId/role', requireAuth, requirePermission('settings:roles:manage'), (req: Request, res: Response) => {
  const { userId } = req.params;
  const { roleCode } = req.body;
  if (!roleCode) return res.status(400).json({ error: 'ROLE_REQUIRED' });

  const tenantId = req.tenantRepo!.tenantId;
  const tenantMemberships = centralStore.memberships.get(tenantId) || [];
  const member = tenantMemberships.find((m) => m.userId === userId);

  if (!member) {
    return res.status(404).json({ error: 'USER_NOT_FOUND_IN_TENANT' });
  }

  const oldRole = member.roleCode;
  member.roleCode = roleCode;

  centralStore.recordAuditLog({
    tenantId,
    userId: req.tenantContext!.userId,
    userEmail: req.tenantContext!.userEmail,
    ipAddress: req.tenantContext!.ipAddress,
    userAgent: req.tenantContext!.userAgent,
    action: 'UPDATE_USER_ROLE',
    resourceType: 'memberships',
    resourceId: member.id,
    correlationId: req.tenantContext!.correlationId,
    changesDiff: { role: { before: oldRole, after: roleCode } },
  });

  return res.json({ message: 'تم تحديث دور المستخدم بنجاح.', roleCode });
});

// Toggle user activation in this company
usersRouter.put('/:userId/status', requireAuth, requirePermission('settings:users:manage'), (req: Request, res: Response) => {
  const { userId } = req.params;
  const { isActive } = req.body;
  const tenantId = req.tenantRepo!.tenantId;

  if (userId === req.tenantContext!.userId) {
    return res.status(400).json({ error: 'SELF_MODIFICATION_PROHIBITED', message: 'لا يمكنك إيقاف حسابك الخاص.' });
  }

  const tenantMemberships = centralStore.memberships.get(tenantId) || [];
  const member = tenantMemberships.find((m) => m.userId === userId);
  if (!member) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  member.isActive = Boolean(isActive);

  centralStore.recordAuditLog({
    tenantId,
    userId: req.tenantContext!.userId,
    userEmail: req.tenantContext!.userEmail,
    ipAddress: req.tenantContext!.ipAddress,
    userAgent: req.tenantContext!.userAgent,
    action: isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
    resourceType: 'memberships',
    resourceId: member.id,
    correlationId: req.tenantContext!.correlationId,
  });

  return res.json({ message: `تم ${isActive ? 'تفعيل' : 'إيقاف'} المستخدم بنجاح.`, isActive: member.isActive });
});

// Admin resets user's MFA
usersRouter.post('/:userId/reset-mfa', requireAuth, requirePermission('settings:users:manage'), (req: Request, res: Response) => {
  const { userId } = req.params;
  const user = centralStore.users.get(userId);
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  user.mfaEnabled = false;
  user.mfaSecret = undefined;
  user.mfaRecoveryCodes = undefined;

  centralStore.recordAuditLog({
    tenantId: req.tenantRepo!.tenantId,
    userId: req.tenantContext!.userId,
    userEmail: req.tenantContext!.userEmail,
    ipAddress: req.tenantContext!.ipAddress,
    userAgent: req.tenantContext!.userAgent,
    action: 'ADMIN_RESET_USER_MFA',
    resourceType: 'users',
    resourceId: userId,
    correlationId: req.tenantContext!.correlationId,
  });

  return res.json({ message: 'تمت إعادة تعيين وإيقاف التحقق بخطوتين لهذا المستخدم.' });
});

// ==========================================
// 2. ROLES & PERMISSION MATRIX MANAGEMENT
// ==========================================
usersRouter.get('/roles/matrix', requireAuth, (req: Request, res: Response) => {
  const roles = req.tenantRepo!.getRoles();
  return res.json({ roles });
});

usersRouter.post('/roles', requireAuth, requirePermission('settings:roles:manage'), (req: Request, res: Response) => {
  const { code, nameAr, nameEn, permissions } = req.body;
  if (!code || !nameAr || !Array.isArray(permissions)) {
    return res.status(400).json({ error: 'INVALID_ROLE_DATA', message: 'Code, Arabic Name, and permissions array are required' });
  }

  try {
    const role = req.tenantRepo!.createCustomRole({ code, nameAr, nameEn, permissions });
    return res.status(201).json({ role });
  } catch (err: unknown) {
    return res.status(400).json({ error: 'ROLE_CREATION_FAILED', message: err instanceof Error ? err.message : 'Error' });
  }
});
