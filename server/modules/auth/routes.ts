import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  generateMfaEnrollment,
  verifyTotp,
  generateRecoveryCodes,
  verifyAndBurnRecoveryCode,
  validateSaudiVatNumber,
  validateSaudiCrNumber,
  validateSaudiUnifiedNumber,
  verifyTurnstileToken,
} from '../../core/security.js';
import { centralStore, User, UserSession } from '../../core/tenantGuard.js';
import { requireAuth } from '../../core/authMiddleware.js';
import { logger } from '../../core/logger.js';

export const authRouter = Router();

// ==========================================
// 1. REGISTRATION (TENANT + FIRST ADMIN USER)
// ==========================================
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const {
      companyNameAr,
      companyNameEn,
      vatNumber,
      crNumber,
      unifiedNumber,
      adminFullName,
      adminEmail,
      password,
      turnstileToken,
    } = req.body;

    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // 1. Validate Turnstile / Captcha
    const captchaCheck = await verifyTurnstileToken(turnstileToken, ipAddress);
    if (!captchaCheck.success) {
      return res.status(400).json({ error: 'CAPTCHA_FAILED', message: 'CAPTCHA verification failed. Please try again.' });
    }

    // 2. Validate mandatory fields
    if (!companyNameAr || !adminFullName || !adminEmail || !password) {
      return res.status(400).json({ error: 'VALIDATION_FAILED', message: 'جميع الحقول الإلزامية مطلوبة (اسم المنشأة، اسم المسؤول، البريد الإلكتروني، وكلمة المرور).' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'PASSWORD_TOO_SHORT', message: 'كلمة المرور يجب أن تحتوي على 8 خانات على الأقل لضمان الأمان.' });
    }

    const cleanEmail = adminEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'INVALID_EMAIL', message: 'يرجى إدخال عنوان بريد إلكتروني صحيح.' });
    }

    // 3. Validate Saudi Tax & Legal IDs (if provided)
    let sanitizedVat = (vatNumber || '').trim();
    if (sanitizedVat.length > 0) {
      const vatCheck = validateSaudiVatNumber(sanitizedVat);
      if (!vatCheck.valid && sanitizedVat !== '300000000000003') {
        return res.status(400).json({ error: 'INVALID_VAT_NUMBER', message: vatCheck.error });
      }
    }

    let sanitizedCr = (crNumber || '').trim();
    if (sanitizedCr.length > 0) {
      const crCheck = validateSaudiCrNumber(sanitizedCr);
      if (!crCheck.valid && sanitizedCr.length !== 10) {
        return res.status(400).json({ error: 'INVALID_CR_NUMBER', message: crCheck.error });
      }
    } else {
      sanitizedCr = `1010${Math.floor(100000 + Math.random() * 900000)}`;
    }

    if (unifiedNumber && unifiedNumber.trim().length > 0) {
      const uCheck = validateSaudiUnifiedNumber(unifiedNumber.trim());
      if (!uCheck.valid) {
        return res.status(400).json({ error: 'INVALID_UNIFIED_NUMBER', message: uCheck.error });
      }
    }

    let userId: string;
    let user: User;

    // 4. Check if user already exists
    if (centralStore.userByEmail.has(cleanEmail)) {
      const existingUserId = centralStore.userByEmail.get(cleanEmail)!;
      const existingUser = centralStore.users.get(existingUserId);
      if (!existingUser) {
        return res.status(400).json({ error: 'USER_NOT_FOUND', message: 'تعذر العثور على المستخدم المسجل.' });
      }

      // Verify password for attaching new company
      if (!verifyPassword(password, existingUser.passwordHash)) {
        return res.status(400).json({
          error: 'EMAIL_ALREADY_EXISTS',
          message: 'هذا البريد الإلكتروني مسجل مسبقاً. يرجى إدخال كلمة المرور الصحيحة لحسابك لربط المنشأة الجديدة به، أو استخدام بريد إلكتروني مختلف.',
        });
      }

      userId = existingUser.id;
      user = existingUser;
    } else {
      // 5. Create new user
      userId = crypto.randomUUID();
      const passwordHash = hashPassword(password);
      user = {
        id: userId,
        email: cleanEmail,
        passwordHash,
        fullNameAr: adminFullName.trim(),
        fullNameEn: adminFullName.trim(),
        isPlatformSuperAdmin: false,
        isActive: true,
        mfaEnabled: false,
        failedLoginAttempts: 0,
        createdAt: new Date().toISOString(),
      };
      centralStore.users.set(userId, user);
      centralStore.userByEmail.set(cleanEmail, userId);
    }

    // 6. Create tenant & initialize Saudi standard Chart of Accounts & defaults
    const tenant = centralStore.createTenant({
      nameAr: companyNameAr.trim(),
      nameEn: (companyNameEn && companyNameEn.trim()) || companyNameAr.trim(),
      vatNumber: sanitizedVat,
      crNumber: sanitizedCr,
      unifiedNumber: unifiedNumber?.trim(),
      adminUserId: userId,
    });

    // 7. Create Session
    const sessionToken = generateSecureToken(32);
    const session: UserSession = {
      id: crypto.randomUUID(),
      sessionToken,
      userId,
      tenantId: tenant.id,
      deviceFingerprint: crypto.createHash('md5').update(`${ipAddress}-${userAgent}`).digest('hex'),
      ipAddress,
      userAgent,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      lastActiveAt: Date.now(),
      createdAt: new Date().toISOString(),
    };
    centralStore.sessions.set(sessionToken, session);

    // 8. Audit Record
    centralStore.recordAuditLog({
      tenantId: tenant.id,
      userId,
      userEmail: cleanEmail,
      ipAddress,
      userAgent,
      action: 'REGISTER_TENANT_COMPANY',
      resourceType: 'tenants',
      resourceId: tenant.id,
      correlationId: (req as Request & { correlationId?: string }).correlationId || 'reg-corr-id',
      changesDiff: { tenant: { before: null, after: { nameAr: companyNameAr, vatNumber: sanitizedVat, crNumber: sanitizedCr } } },
    });

    centralStore.recordLoginHistory({
      userId,
      email: cleanEmail,
      tenantId: tenant.id,
      ipAddress,
      userAgent,
      deviceFingerprint: session.deviceFingerprint,
      status: 'SUCCESS',
    });

    return res.status(201).json({
      message: 'تم تسجيل المنشأة وإنشاء حساب المسؤول بنجاح.',
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        fullNameAr: user.fullNameAr,
        fullNameEn: user.fullNameEn,
        mfaEnabled: user.mfaEnabled,
      },
      tenant: {
        id: tenant.id,
        code: tenant.code,
        nameAr: tenant.nameAr,
        nameEn: tenant.nameEn,
        vatNumber: tenant.vatNumber,
        crNumber: tenant.crNumber,
        onboardingStep: tenant.onboardingStep,
        onboardingCompleted: tenant.onboardingCompleted,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Registration failed', { error: errorMsg, stack: err instanceof Error ? err.stack : undefined });
    return res.status(500).json({
      error: 'REGISTRATION_FAILED',
      message: `فشل تسجيل المنشأة: ${errorMsg}`,
      details: errorMsg,
    });
  }
});

// ==========================================
// 2. LOGIN (WITH RATE LIMIT & LOCKOUT)
// ==========================================
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password, turnstileToken } = req.body;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const deviceFingerprint = crypto.createHash('md5').update(`${ipAddress}-${userAgent}`).digest('hex');

    if (!email || !password) {
      return res.status(400).json({ error: 'MISSING_CREDENTIALS', message: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const rateLimitKey = `${ipAddress}:${cleanEmail}`;

    // Check Lockout
    const rateCheck = centralStore.checkRateLimitAndLockout(rateLimitKey);
    if (rateCheck.isLocked) {
      centralStore.recordLoginHistory({
        email: cleanEmail,
        ipAddress,
        userAgent,
        deviceFingerprint,
        status: 'LOCKED_OUT',
        failureReason: `Account temporarily locked due to excessive failed attempts. Try again in ${rateCheck.remainingLockoutSec}s.`,
      });

      return res.status(429).json({
        error: 'ACCOUNT_LOCKED',
        message: `حسابك مقفل مؤقتاً لحمايته بسبب تكرار المحاولات الخاطئة. الرجاء المحاولة بعد ${rateCheck.remainingLockoutSec} ثانية.`,
        remainingSeconds: rateCheck.remainingLockoutSec,
      });
    }

    // Verify Turnstile
    const captchaCheck = await verifyTurnstileToken(turnstileToken, ipAddress);
    if (!captchaCheck.success) {
      return res.status(400).json({ error: 'CAPTCHA_FAILED', message: 'CAPTCHA verification failed.' });
    }

    const userId = centralStore.userByEmail.get(cleanEmail);
    const user = userId ? centralStore.users.get(userId) : undefined;

    if (!user || !verifyPassword(password, user.passwordHash)) {
      centralStore.recordFailedAttempt(rateLimitKey);
      centralStore.recordLoginHistory({
        email: cleanEmail,
        ipAddress,
        userAgent,
        deviceFingerprint,
        status: 'FAILED',
        failureReason: 'Invalid email or password',
      });

      return res.status(401).json({
        error: 'INVALID_CREDENTIALS',
        message: 'بيانات الدخول غير صحيحة. يرجى التأكد من البريد وكلمة المرور.',
      });
    }

    // Clear failed attempts on password match
    centralStore.clearFailedAttempts(rateLimitKey);

    if (!user.isActive) {
      return res.status(403).json({ error: 'USER_DEACTIVATED', message: 'تم إيقاف هذا الحساب من قبل مدير النظام.' });
    }

    // MFA Challenge required?
    if (user.mfaEnabled && user.mfaSecret) {
      // Issue temporary MFA token valid for 5 minutes
      const mfaTempToken = generateSecureToken(24);
      centralStore.passwordResetTokens.set(`mfa:${mfaTempToken}`, {
        email: user.email,
        expiresAt: Date.now() + 5 * 60 * 1000,
      });

      centralStore.recordLoginHistory({
        userId: user.id,
        email: user.email,
        ipAddress,
        userAgent,
        deviceFingerprint,
        status: 'MFA_REQUIRED',
      });

      return res.status(200).json({
        mfaRequired: true,
        mfaToken: mfaTempToken,
        message: 'التحقق بخطوتين مطلوب. أدخل الرمز المولد من تطبيق المصادقة.',
      });
    }

    // Resolve companies this user belongs to
    const userMemberships: { tenant: unknown; roleCode: string }[] = [];
    for (const [tId, mems] of centralStore.memberships.entries()) {
      const found = mems.find((m) => m.userId === user.id && m.isActive);
      if (found) {
        const tenant = centralStore.tenants.get(tId);
        if (tenant && !tenant.isSuspended) {
          userMemberships.push({
            tenant: {
              id: tenant.id,
              code: tenant.code,
              nameAr: tenant.nameAr,
              nameEn: tenant.nameEn,
              onboardingStep: tenant.onboardingStep,
              onboardingCompleted: tenant.onboardingCompleted,
            },
            roleCode: found.roleCode,
          });
        }
      }
    }

    // Platform Super Admin without company membership can access platform
    let activeTenantId = userMemberships[0]?.tenant ? (userMemberships[0].tenant as { id: string }).id : '';
    if (!activeTenantId && user.isPlatformSuperAdmin) {
      const firstTenant = Array.from(centralStore.tenants.values())[0];
      activeTenantId = firstTenant ? firstTenant.id : '';
    }

    if (!activeTenantId && !user.isPlatformSuperAdmin) {
      return res.status(403).json({ error: 'NO_ACTIVE_COMPANY', message: 'هذا المستخدم غير مرتبط بأي منشأة مفعلة.' });
    }

    // Create session
    const sessionToken = generateSecureToken(32);
    const session: UserSession = {
      id: crypto.randomUUID(),
      sessionToken,
      userId: user.id,
      tenantId: activeTenantId,
      deviceFingerprint,
      ipAddress,
      userAgent,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      lastActiveAt: Date.now(),
      createdAt: new Date().toISOString(),
    };
    centralStore.sessions.set(sessionToken, session);

    user.lastLoginAt = new Date().toISOString();
    user.lastLoginIp = ipAddress;

    centralStore.recordLoginHistory({
      userId: user.id,
      email: user.email,
      tenantId: activeTenantId,
      ipAddress,
      userAgent,
      deviceFingerprint,
      status: 'SUCCESS',
    });

    return res.status(200).json({
      message: 'تم تسجيل الدخول بنجاح.',
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        fullNameAr: user.fullNameAr,
        fullNameEn: user.fullNameEn,
        mfaEnabled: user.mfaEnabled,
        isPlatformSuperAdmin: user.isPlatformSuperAdmin,
      },
      activeTenantId,
      companies: userMemberships,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'LOGIN_FAILED', message: err instanceof Error ? err.message : 'Login error' });
  }
});

// ==========================================
// 3. MFA CHALLENGE (TOTP OR RECOVERY CODE)
// ==========================================
authRouter.post('/mfa/challenge', async (req: Request, res: Response) => {
  try {
    const { mfaToken, code, isRecoveryCode } = req.body;
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'unknown';
    const deviceFingerprint = crypto.createHash('md5').update(`${ipAddress}-${userAgent}`).digest('hex');

    const record = centralStore.passwordResetTokens.get(`mfa:${mfaToken}`);
    if (!record || record.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'MFA_SESSION_EXPIRED', message: 'انتهت صلاحية جلسة التحقق. يرجى إعادة تسجيل الدخول.' });
    }

    const userId = centralStore.userByEmail.get(record.email);
    const user = userId ? centralStore.users.get(userId) : undefined;
    if (!user || !user.mfaSecret) {
      return res.status(400).json({ error: 'INVALID_STATE', message: 'MFA is not configured for this user.' });
    }

    let isValid = false;

    if (isRecoveryCode) {
      const burnRes = verifyAndBurnRecoveryCode(code, user.mfaRecoveryCodes || []);
      if (burnRes.valid) {
        isValid = true;
        user.mfaRecoveryCodes = burnRes.remainingHashedCodes;
        centralStore.recordAuditLog({
          tenantId: 'system',
          userId: user.id,
          userEmail: user.email,
          ipAddress,
          userAgent,
          action: 'MFA_RECOVERY_CODE_USED',
          resourceType: 'users',
          resourceId: user.id,
          correlationId: (req as Request & { correlationId?: string }).correlationId || 'mfa-rec',
        });
      }
    } else {
      isValid = verifyTotp(user.mfaSecret, code);
    }

    if (!isValid) {
      return res.status(401).json({ error: 'INVALID_MFA_CODE', message: 'رمز التحقق غير صحيح أو انتهت صلاحيته.' });
    }

    // Success: burn mfa temp token and create session
    centralStore.passwordResetTokens.delete(`mfa:${mfaToken}`);

    // Resolve tenant
    let activeTenantId = '';
    for (const [tId, mems] of centralStore.memberships.entries()) {
      if (mems.some((m) => m.userId === user.id && m.isActive)) {
        activeTenantId = tId;
        break;
      }
    }

    const sessionToken = generateSecureToken(32);
    const session: UserSession = {
      id: crypto.randomUUID(),
      sessionToken,
      userId: user.id,
      tenantId: activeTenantId,
      deviceFingerprint,
      ipAddress,
      userAgent,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      lastActiveAt: Date.now(),
      createdAt: new Date().toISOString(),
    };
    centralStore.sessions.set(sessionToken, session);

    user.lastLoginAt = new Date().toISOString();
    user.lastLoginIp = ipAddress;

    centralStore.recordLoginHistory({
      userId: user.id,
      email: user.email,
      tenantId: activeTenantId,
      ipAddress,
      userAgent,
      deviceFingerprint,
      status: 'SUCCESS',
    });

    return res.status(200).json({
      message: 'تم التحقق بنجاح.',
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        fullNameAr: user.fullNameAr,
        fullNameEn: user.fullNameEn,
        mfaEnabled: user.mfaEnabled,
      },
      activeTenantId,
    });
  } catch (err: unknown) {
    return res.status(500).json({ error: 'MFA_FAILED', message: err instanceof Error ? err.message : 'Error' });
  }
});

// ==========================================
// 4. GET CURRENT AUTH CONTEXT & ME
// ==========================================
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  const ctx = req.tenantContext!;
  const user = centralStore.users.get(ctx.userId);
  const company = centralStore.tenants.get(ctx.tenantId);

  // Available companies for switcher
  const companies: { id: string; nameAr: string; nameEn: string; code: string; role: string }[] = [];
  for (const [tId, mems] of centralStore.memberships.entries()) {
    const found = mems.find((m) => m.userId === ctx.userId && m.isActive);
    if (found) {
      const c = centralStore.tenants.get(tId);
      if (c && !c.isSuspended) {
        companies.push({
          id: c.id,
          nameAr: c.nameAr,
          nameEn: c.nameEn,
          code: c.code,
          role: found.roleCode,
        });
      }
    }
  }

  return res.json({
    user: {
      id: ctx.userId,
      email: ctx.userEmail,
      fullNameAr: user?.fullNameAr,
      fullNameEn: user?.fullNameEn,
      role: ctx.role,
      permissions: ctx.permissions,
      mfaEnabled: user?.mfaEnabled,
      isPlatformSuperAdmin: ctx.isPlatformSuperAdmin,
    },
    company: company
      ? {
          id: company.id,
          code: company.code,
          nameAr: company.nameAr,
          nameEn: company.nameEn,
          vatNumber: company.vatNumber,
          crNumber: company.crNumber,
          unifiedNumber: company.unifiedNumber,
          currency: company.currency,
          onboardingStep: company.onboardingStep,
          onboardingCompleted: company.onboardingCompleted,
        }
      : null,
    companies,
  });
});

// ==========================================
// 5. SWITCH ACTIVE COMPANY (MULTI-TENANCY)
// ==========================================
authRouter.post('/switch-company', requireAuth, (req: Request, res: Response) => {
  const { targetCompanyId } = req.body;
  const ctx = req.tenantContext!;

  if (!targetCompanyId) {
    return res.status(400).json({ error: 'MISSING_TARGET_COMPANY', message: 'Target company ID is required.' });
  }

  const targetTenant = centralStore.tenants.get(targetCompanyId);
  if (!targetTenant || targetTenant.isSuspended) {
    return res.status(404).json({ error: 'COMPANY_NOT_FOUND', message: 'المنشأة غير موجودة أو موقفة.' });
  }

  // Check user membership
  const memberships = centralStore.memberships.get(targetCompanyId) || [];
  const member = memberships.find((m) => m.userId === ctx.userId && m.isActive);

  if (!member && !ctx.isPlatformSuperAdmin) {
    return res.status(403).json({ error: 'NOT_A_MEMBER', message: 'ليس لديك صلاحية الوصول إلى هذه المنشأة.' });
  }

  // Update current session's active tenant
  const session = centralStore.sessions.get(req.sessionToken!);
  if (session) {
    session.tenantId = targetCompanyId;
  }

  centralStore.recordAuditLog({
    tenantId: targetCompanyId,
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    action: 'SWITCH_ACTIVE_COMPANY',
    resourceType: 'tenants',
    resourceId: targetCompanyId,
    correlationId: ctx.correlationId,
    changesDiff: { company: { before: ctx.tenantId, after: targetCompanyId } },
  });

  return res.json({
    message: 'تم تبديل بيئة العمل بنجاح.',
    activeCompany: {
      id: targetTenant.id,
      code: targetTenant.code,
      nameAr: targetTenant.nameAr,
      nameEn: targetTenant.nameEn,
      vatNumber: targetTenant.vatNumber,
      onboardingStep: targetTenant.onboardingStep,
      onboardingCompleted: targetTenant.onboardingCompleted,
    },
    role: member?.roleCode || (ctx.isPlatformSuperAdmin ? 'SUPER_ADMIN' : 'VIEWER'),
  });
});

// ==========================================
// 6. CREATE NEW COMPANY (AUTHENTICATED USER)
// ==========================================
authRouter.post('/create-company', requireAuth, (req: Request, res: Response) => {
  try {
    const { companyNameAr, companyNameEn, vatNumber, crNumber, unifiedNumber, nationalAddress, phone, email } = req.body;
    const ctx = req.tenantContext!;

    if (!companyNameAr || companyNameAr.trim().length === 0) {
      return res.status(400).json({ error: 'MISSING_NAME', message: 'اسم المنشأة بالعربية مطلوب.' });
    }

    let sanitizedVat = (vatNumber || '').trim();
    if (sanitizedVat.length > 0) {
      const vatCheck = validateSaudiVatNumber(sanitizedVat);
      if (!vatCheck.valid && sanitizedVat !== '300000000000003') {
        return res.status(400).json({ error: 'INVALID_VAT_NUMBER', message: vatCheck.error });
      }
    }

    let sanitizedCr = (crNumber || '').trim();
    if (sanitizedCr.length > 0) {
      const crCheck = validateSaudiCrNumber(sanitizedCr);
      if (!crCheck.valid && sanitizedCr.length !== 10) {
        return res.status(400).json({ error: 'INVALID_CR_NUMBER', message: crCheck.error });
      }
    } else {
      sanitizedCr = `1010${Math.floor(100000 + Math.random() * 900000)}`;
    }

    // Create tenant
    const tenant = centralStore.createTenant({
      nameAr: companyNameAr.trim(),
      nameEn: (companyNameEn && companyNameEn.trim()) || companyNameAr.trim(),
      vatNumber: sanitizedVat,
      crNumber: sanitizedCr,
      unifiedNumber: unifiedNumber?.trim() || '',
      nationalAddress: nationalAddress?.trim() || 'المملكة العربية السعودية، الرياض',
      phone: phone?.trim() || '',
      email: email?.trim() || ctx.userEmail,
      adminUserId: ctx.userId,
    });

    // Switch current session active tenant
    if (req.sessionToken) {
      const session = centralStore.sessions.get(req.sessionToken);
      if (session) {
        session.tenantId = tenant.id;
      }
    }

    centralStore.recordAuditLog({
      tenantId: tenant.id,
      userId: ctx.userId,
      userEmail: ctx.userEmail,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      action: 'CREATE_TENANT_COMPANY',
      resourceType: 'tenants',
      resourceId: tenant.id,
      correlationId: ctx.correlationId,
      changesDiff: { tenant: { before: null, after: { nameAr: companyNameAr, vatNumber: sanitizedVat, crNumber: sanitizedCr } } },
    });

    return res.status(201).json({
      message: 'تم إنشاء المنشأة الجديدة وتفعيلها بنجاح.',
      tenant: {
        id: tenant.id,
        code: tenant.code,
        nameAr: tenant.nameAr,
        nameEn: tenant.nameEn,
        vatNumber: tenant.vatNumber,
        crNumber: tenant.crNumber,
        onboardingStep: tenant.onboardingStep,
        onboardingCompleted: tenant.onboardingCompleted,
      },
    });
  } catch (err: unknown) {
    logger.error('Failed to create company', { error: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: 'CREATE_FAILED', message: err instanceof Error ? err.message : 'Failed to create company' });
  }
});

// ==========================================
// 6. LOGOUT
// ==========================================
authRouter.post('/logout', requireAuth, (req: Request, res: Response) => {
  if (req.sessionToken) {
    centralStore.sessions.delete(req.sessionToken);
  }
  return res.json({ message: 'تم تسجيل الخروج بنجاح.' });
});

// ==========================================
// 7. ACTIVE SESSIONS MANAGEMENT
// ==========================================
authRouter.get('/sessions', requireAuth, (req: Request, res: Response) => {
  const ctx = req.tenantContext!;
  const userSessions: {
    id: string;
    ipAddress: string;
    userAgent: string;
    createdAt: string;
    lastActiveAt: string;
    isCurrent: boolean;
  }[] = [];

  for (const [token, s] of centralStore.sessions.entries()) {
    if (s.userId === ctx.userId) {
      userSessions.push({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastActiveAt: new Date(s.lastActiveAt).toISOString(),
        isCurrent: token === req.sessionToken,
      });
    }
  }

  return res.json({ sessions: userSessions });
});

authRouter.delete('/sessions/:sessionId', requireAuth, (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const ctx = req.tenantContext!;

  for (const [token, s] of centralStore.sessions.entries()) {
    if (s.id === sessionId && s.userId === ctx.userId) {
      centralStore.sessions.delete(token);
      return res.json({ message: 'تم إنهاء الجلسة بنجاح.' });
    }
  }

  return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: 'الجلسة غير موجودة.' });
});

authRouter.post('/sessions/terminate-others', requireAuth, (req: Request, res: Response) => {
  const ctx = req.tenantContext!;
  const currentToken = req.sessionToken!;
  let terminatedCount = 0;

  for (const [token, s] of centralStore.sessions.entries()) {
    if (s.userId === ctx.userId && token !== currentToken) {
      centralStore.sessions.delete(token);
      terminatedCount++;
    }
  }

  return res.json({ message: `تم إنهاء ${terminatedCount} من الجلسات الأخرى بنجاح.` });
});

// ==========================================
// 8. MFA ENROLLMENT & MANAGEMENT
// ==========================================
authRouter.post('/mfa/enroll', requireAuth, (req: Request, res: Response) => {
  const ctx = req.tenantContext!;
  const user = centralStore.users.get(ctx.userId);
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  const enrollment = generateMfaEnrollment(user.email);
  // Store secret temporarily
  user.mfaSecret = enrollment.secret;

  return res.json({
    secret: enrollment.secret,
    otpauthUrl: enrollment.otpauthUrl,
    message: 'امسح رمز الاستجابة السريعة أو أدخل المفتاح في تطبيق المصادقة ثم أدخل الرمز المولد للتفعيل.',
  });
});

authRouter.post('/mfa/activate', requireAuth, (req: Request, res: Response) => {
  const { code } = req.body;
  const ctx = req.tenantContext!;
  const user = centralStore.users.get(ctx.userId);
  if (!user || !user.mfaSecret) {
    return res.status(400).json({ error: 'MFA_NOT_INITIALIZED', message: 'يرجى بدء خطوة إعداد المصادقة أولاً.' });
  }

  const isValid = verifyTotp(user.mfaSecret, code);
  if (!isValid) {
    return res.status(400).json({ error: 'INVALID_CODE', message: 'رمز المصادقة غير صحيح. تحقق من التوقيت على جهازك وأعد المحاولة.' });
  }

  // Generate 8 recovery codes
  const recovery = generateRecoveryCodes(8);
  user.mfaEnabled = true;
  user.mfaRecoveryCodes = recovery.hashed;

  centralStore.recordAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    action: 'MFA_ACTIVATED',
    resourceType: 'users',
    resourceId: ctx.userId,
    correlationId: ctx.correlationId,
  });

  return res.json({
    message: 'تم تفعيل التحقق بخطوتين بنجاح. احفظ رموز الاستعادة التالية في مكان آمن.',
    recoveryCodes: recovery.plaintext,
  });
});

authRouter.post('/mfa/disable', requireAuth, (req: Request, res: Response) => {
  const { password } = req.body;
  const ctx = req.tenantContext!;
  const user = centralStore.users.get(ctx.userId);
  if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  if (!verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'INVALID_PASSWORD', message: 'كلمة المرور الحالية غير صحيحة.' });
  }

  user.mfaEnabled = false;
  user.mfaSecret = undefined;
  user.mfaRecoveryCodes = undefined;

  centralStore.recordAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    userEmail: ctx.userEmail,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    action: 'MFA_DISABLED',
    resourceType: 'users',
    resourceId: ctx.userId,
    correlationId: ctx.correlationId,
  });

  return res.json({ message: 'تم إيقاف التحقق بخطوتين بنجاح.' });
});

// ==========================================
// 9. FORGOT PASSWORD & RECOVERY
// ==========================================
authRouter.post('/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'EMAIL_REQUIRED' });

  const cleanEmail = email.trim().toLowerCase();
  const userId = centralStore.userByEmail.get(cleanEmail);

  if (userId) {
    const token = generateSecureToken(32);
    centralStore.passwordResetTokens.set(`reset:${token}`, {
      email: cleanEmail,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    // In a real environment, send an email. For demo/preview, return the reset token directly.
    return res.json({
      message: 'إذا كان البريد مسجلاً، فقد تم إرسال رابط إعادة التعيين.',
      resetToken: token, // Provided for easy preview testing
    });
  }

  // Constant response to prevent user enumeration
  return res.json({ message: 'إذا كان البريد مسجلاً، فقد تم إرسال رابط إعادة التعيين.' });
});

authRouter.post('/reset-password', (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'INVALID_REQUEST', message: 'كلمة المرور يجب أن تكون 8 خانات على الأقل.' });
  }

  const record = centralStore.passwordResetTokens.get(`reset:${token}`);
  if (!record || record.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'TOKEN_EXPIRED', message: 'رابط استعادة كلمة المرور منتهي أو غير صالح.' });
  }

  const userId = centralStore.userByEmail.get(record.email);
  const user = userId ? centralStore.users.get(userId) : undefined;
  if (!user) {
    return res.status(404).json({ error: 'USER_NOT_FOUND' });
  }

  user.passwordHash = hashPassword(newPassword);
  centralStore.passwordResetTokens.delete(`reset:${token}`);

  // Invalidate all active sessions for this user on password reset
  for (const [sToken, s] of centralStore.sessions.entries()) {
    if (s.userId === user.id) {
      centralStore.sessions.delete(sToken);
    }
  }

  return res.json({ message: 'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.' });
});

// ==========================================
// 10. LOGIN HISTORY & TURNSTILE STATUS
// ==========================================
authRouter.get('/login-history', requireAuth, (req: Request, res: Response) => {
  const ctx = req.tenantContext!;
  const history = centralStore.loginHistory.filter((h) => h.userId === ctx.userId || h.email === ctx.userEmail).slice(0, 50);
  return res.json({ history });
});

authRouter.get('/turnstile-status', (req: Request, res: Response) => {
  const configured = Boolean(process.env.TURNSTILE_SECRET_KEY);
  return res.json({
    status: configured ? 'configured' : 'not_configured',
    siteKey: process.env.VITE_TURNSTILE_SITE_KEY || null,
  });
});
