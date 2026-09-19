import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../../core/authMiddleware.js';
import {
  getActiveSessionsService,
  revokeSessionService,
  revokeAllOtherSessionsService,
  generateTwoFactorSetupService,
  enableTwoFactorService,
  validateDangerousOperationService,
  runComplianceScannerService,
} from './securityService.js';

export const securityRouter = Router();

// GET /api/v1/security/sessions - List active sessions
securityRouter.get('/sessions', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const currentToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const sessions = getActiveSessionsService(
    tenantId,
    currentToken,
    req.tenantContext!.userId,
    req.tenantContext!.isPlatformSuperAdmin
  );
  return res.json({ sessions, total: sessions.length });
});

// POST /api/v1/security/sessions/revoke - Revoke a session
securityRouter.post('/sessions/revoke', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const { sessionToken } = req.body;
  if (!sessionToken) {
    return res.status(400).json({ error: 'SESSION_TOKEN_REQUIRED', message: 'Session token is required.' });
  }

  const success = revokeSessionService(
    tenantId,
    sessionToken,
    req.tenantContext!.userId,
    req.tenantContext!.userEmail
  );

  return res.json({ success, message: success ? 'Session revoked successfully.' : 'Session not found or already expired.' });
});

// POST /api/v1/security/sessions/revoke-others - Revoke all other sessions
securityRouter.post('/sessions/revoke-others', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const currentToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const count = revokeAllOtherSessionsService(
    tenantId,
    currentToken,
    req.tenantContext!.userId,
    req.tenantContext!.userEmail
  );

  return res.json({ success: true, count, message: `Terminated ${count} other active session(s).` });
});

// POST /api/v1/security/2fa/setup - Generate TOTP Secret and QR URI
securityRouter.post('/2fa/setup', requireAuth, (req: Request, res: Response) => {
  const setup = generateTwoFactorSetupService(req.tenantContext!.userEmail);
  return res.json(setup);
});

// POST /api/v1/security/2fa/verify - Verify and enable TOTP 2FA
securityRouter.post('/2fa/verify', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const { secret, code, recoveryCodes } = req.body;

  if (!secret || !code) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: 'Secret and verification code are required.' });
  }

  const result = enableTwoFactorService(
    req.tenantContext!.userId,
    req.tenantContext!.userEmail,
    tenantId,
    secret,
    code,
    recoveryCodes || []
  );

  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json(result);
});

// POST /api/v1/security/dangerous-operations/validate - Dangerous Operation Protocol
securityRouter.post('/dangerous-operations/validate', requireAuth, (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const result = validateDangerousOperationService(
    tenantId,
    req.tenantContext!.userId,
    req.tenantContext!.userEmail,
    req.body
  );

  if (!result.approved) {
    return res.status(400).json(result);
  }

  return res.json(result);
});

// GET /api/v1/security/compliance-check - Run comprehensive compliance scan
securityRouter.get('/compliance-check', requireAuth, requirePermission('reports:audit:view'), (req: Request, res: Response) => {
  const tenantId = req.tenantRepo!.tenantId;
  const report = runComplianceScannerService(tenantId);
  return res.json(report);
});
