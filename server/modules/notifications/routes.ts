/**
 * Notifications & Reminders REST API Router — Saudi ERP Platform
 * Endpoints for Notification Center, User Preferences, Push Adapter,
 * Collections & Reminders, and Communication Logs.
 */

import { Router, Request, Response } from 'express';
import { NotificationService } from './notificationService.js';
import { ReminderService } from './reminderService.js';
import { PushNotificationAdapter } from './pushAdapter.js';
import { NotificationEventType, NotificationPriority, NotificationChannel } from './types.js';

export const notificationsRouter = Router();

// Middleware helper to extract tenantId and user
function getTenantAndUser(req: Request) {
  const tenantId =
    (req as any).tenant?.tenantId ||
    (req.headers['x-tenant-id'] as string) ||
    'tenant-default';
  const userId =
    (req as any).user?.userId ||
    (req as any).user?.email ||
    'default-user';
  return { tenantId, userId };
}

// ==========================================
// 1. IN-APP NOTIFICATIONS
// ==========================================

notificationsRouter.get('/', (req: Request, res: Response) => {
  try {
    const { tenantId } = getTenantAndUser(req);
    const type = req.query.type as NotificationEventType | undefined;
    const priority = req.query.priority as NotificationPriority | undefined;
    const read = req.query.read !== undefined ? req.query.read === 'true' : undefined;
    const search = req.query.search as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const result = NotificationService.getNotifications(tenantId, {
      type,
      priority,
      read,
      search,
      limit,
    });

    res.json({
      success: true,
      notifications: result.items,
      total: result.total,
      unreadCount: result.unreadCount,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.get('/unread-count', (req: Request, res: Response) => {
  try {
    const { tenantId } = getTenantAndUser(req);
    const { unreadCount } = NotificationService.getNotifications(tenantId);
    res.json({ success: true, unreadCount });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.post('/mark-read', (req: Request, res: Response) => {
  try {
    const { tenantId } = getTenantAndUser(req);
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Notification ID is required.' });
    }
    const ok = NotificationService.markAsRead(tenantId, id);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.post('/mark-all-read', (req: Request, res: Response) => {
  try {
    const { tenantId } = getTenantAndUser(req);
    const updatedCount = NotificationService.markAllAsRead(tenantId);
    res.json({ success: true, updatedCount });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const { tenantId } = getTenantAndUser(req);
    const ok = NotificationService.deleteNotification(tenantId, req.params.id);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.post('/clear-read', (req: Request, res: Response) => {
  try {
    const { tenantId } = getTenantAndUser(req);
    const cleared = NotificationService.clearReadNotifications(tenantId);
    res.json({ success: true, clearedCount: cleared });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. PREFERENCES & SUPPRESSION
// ==========================================

notificationsRouter.get('/preferences', (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = getTenantAndUser(req);
    const preferences = NotificationService.getPreferences(tenantId, userId);
    res.json({ success: true, preferences });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.put('/preferences', (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = getTenantAndUser(req);
    const updated = NotificationService.updatePreferences(tenantId, userId, req.body);
    res.json({ success: true, preferences: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. TRIGGER EVENTS (All 13 enterprise types)
// ==========================================

notificationsRouter.post('/trigger-test-event', (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = getTenantAndUser(req);
    const { type, priority, metadata, forceDispatch } = req.body;

    if (!type) {
      return res.status(400).json({ success: false, error: 'Event type is required.' });
    }

    const notification = NotificationService.triggerEvent({
      tenantId,
      userId,
      type,
      priority,
      metadata,
      forceDispatch,
    });

    res.json({
      success: true,
      suppressed: notification === null,
      notification,
      message: notification
        ? `Notification triggered successfully for event [${type}].`
        : `Notification suppressed by user preferences for event [${type}].`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. PUSH ADAPTER STATUS & SUBSCRIPTION
// ==========================================

notificationsRouter.get('/push/status', (req: Request, res: Response) => {
  try {
    const { tenantId } = getTenantAndUser(req);
    const adapter = PushNotificationAdapter.getInstance();
    const status = adapter.getStatus(tenantId);
    res.json({ success: true, pushStatus: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.post('/push/subscribe', async (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = getTenantAndUser(req);
    const adapter = PushNotificationAdapter.getInstance();
    const result = await adapter.subscribe(tenantId, userId, req.body);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. COLLECTIONS & REMINDERS (Rule G4)
// ==========================================

notificationsRouter.get('/reminders/due-invoices', (req: Request, res: Response) => {
  try {
    const { tenantId } = getTenantAndUser(req);
    const result = ReminderService.getDueInvoices(tenantId);
    res.json({
      success: true,
      invoices: result.records,
      summary: result.summary,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.get('/reminders/templates', (req: Request, res: Response) => {
  try {
    const { tenantId } = getTenantAndUser(req);
    const templates = ReminderService.getTemplates(tenantId);
    res.json({ success: true, templates });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.post('/reminders/preview', (req: Request, res: Response) => {
  try {
    const { tenantId } = getTenantAndUser(req);
    const preview = ReminderService.previewReminder(tenantId, req.body);
    res.json({ success: true, preview });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.post('/reminders/send', async (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = getTenantAndUser(req);
    const result = await ReminderService.sendReminder(tenantId, req.body, userId);
    res.json({
      success: result.success,
      status: result.status,
      logId: result.logId,
      message: result.message,
      blockedReason: result.blockedReason,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.post('/reminders/bulk-send', async (req: Request, res: Response) => {
  try {
    const { tenantId, userId } = getTenantAndUser(req);
    const { invoices } = req.body;
    if (!Array.isArray(invoices) || invoices.length === 0) {
      return res.status(400).json({ success: false, error: 'Invoices array is required.' });
    }

    const result = await ReminderService.bulkSendReminders(tenantId, invoices, userId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

notificationsRouter.get('/reminders/communication-logs', (req: Request, res: Response) => {
  try {
    const { tenantId } = getTenantAndUser(req);
    const customerId = req.query.customerId as string | undefined;
    const channel = req.query.channel as NotificationChannel | undefined;
    const status = req.query.status as any | undefined;
    const search = req.query.search as string | undefined;

    const logs = ReminderService.getCommunicationLogs(tenantId, {
      customerId,
      channel,
      status,
      search,
    });

    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
