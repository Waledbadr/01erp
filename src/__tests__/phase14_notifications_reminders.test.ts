/**
 * Phase 14 Comprehensive Test Suite — Notifications & Reminders (Rule G4)
 * Tests:
 * 1. Event Type Validation & Priority Mapping (15 enterprise event types)
 * 2. Notification Center & Read State Tracking
 * 3. User Preferences & Suppression Logic
 * 4. Rule G4: Overdue Invoices & Aging Buckets Auto-Sourced from Ledger
 * 5. Template Engine & Variable Substitution
 * 6. Duplicate-Send Protection (24-hour Cooldown Window)
 * 7. Multi-Channel Communication Audit Log
 * 8. Push Adapter Interface & VAPID Architecture
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationService } from '../../server/modules/notifications/notificationService.js';
import { ReminderService } from '../../server/modules/notifications/reminderService.js';
import { PushNotificationAdapter } from '../../server/modules/notifications/pushAdapter.js';
import { NotificationEventType, NotificationPriority } from '../../server/modules/notifications/types.js';

describe('Phase 14: Enterprise Notifications & Collections Reminders', () => {
  const testTenant = 'tenant-test-p14';
  const testUser = 'finance-officer@company.sa';

  beforeEach(() => {
    // Clean state
    NotificationService.clearReadNotifications(testTenant);
  });

  describe('1. In-App Notifications & Event Lifecycle', () => {
    it('should correctly trigger and store all enterprise event types with deep links', () => {
      const eventTypes: NotificationEventType[] = [
        'invoice_posted',
        'invoice_paid',
        'payment_received',
        'purchase_created',
        'purchase_bill_posted',
        'goods_received',
        'expense_approved',
        'low_stock',
        'negative_stock',
        'due_soon',
        'overdue',
        'zatca_failure',
        'backup_failure',
        'delivery_failure',
        'approval_requested',
      ];

      for (const type of eventTypes) {
        const item = NotificationService.triggerEvent({
          tenantId: testTenant,
          userId: testUser,
          type,
          metadata: { documentNumber: `DOC-${type}` },
          forceDispatch: true,
        });

        expect(item).not.toBeNull();
        expect(item?.type).toBe(type);
        expect(item?.titleAr).toBeTruthy();
        expect(item?.titleEn).toBeTruthy();
        expect(item?.deepLink).toBeDefined();
      }

      const notifs = NotificationService.getNotifications(testTenant, { limit: 100 });
      expect(notifs.total).toBeGreaterThanOrEqual(15);
      expect(notifs.unreadCount).toBeGreaterThanOrEqual(15);
    });

    it('should mark single and all notifications as read', () => {
      const item = NotificationService.triggerEvent({
        tenantId: testTenant,
        userId: testUser,
        type: 'invoice_posted',
        forceDispatch: true,
      });
      expect(item).not.toBeNull();

      const markSingle = NotificationService.markAsRead(testTenant, item!.id);
      expect(markSingle).toBe(true);

      const checkList = NotificationService.getNotifications(testTenant, { read: false });
      expect(checkList.items.find((n) => n.id === item!.id)).toBeUndefined();

      // Trigger two more and mark all read
      NotificationService.triggerEvent({
        tenantId: testTenant,
        userId: testUser,
        type: 'low_stock',
        forceDispatch: true,
      });
      NotificationService.triggerEvent({
        tenantId: testTenant,
        userId: testUser,
        type: 'zatca_failure',
        forceDispatch: true,
      });

      const updatedCount = NotificationService.markAllAsRead(testTenant);
      expect(updatedCount).toBeGreaterThanOrEqual(2);

      const unread = NotificationService.getNotifications(testTenant, { read: false });
      expect(unread.unreadCount).toBe(0);
    });
  });

  describe('2. User Notification Preferences & Suppression', () => {
    it('should suppress notifications when disabled in user preferences', () => {
      // Disable 'low_stock' in user preferences
      NotificationService.updatePreferences(testTenant, testUser, {
        events: {
          low_stock: { enabled: false, inApp: false, email: false, push: false },
        } as any,
      });

      const suppressedItem = NotificationService.triggerEvent({
        tenantId: testTenant,
        userId: testUser,
        type: 'low_stock',
      });

      expect(suppressedItem).toBeNull();

      // Enable again
      NotificationService.updatePreferences(testTenant, testUser, {
        events: {
          low_stock: { enabled: true, inApp: true, email: false, push: false },
        } as any,
      });

      const allowedItem = NotificationService.triggerEvent({
        tenantId: testTenant,
        userId: testUser,
        type: 'low_stock',
      });

      expect(allowedItem).not.toBeNull();
      expect(allowedItem?.type).toBe('low_stock');
    });

    it('should suppress non-critical notifications during quiet hours', () => {
      NotificationService.updatePreferences(testTenant, testUser, {
        quietHours: {
          enabled: true,
          startTime: '00:00',
          endTime: '23:59', // All day quiet hours for testing
        },
      });

      // Medium priority should be suppressed
      const mediumItem = NotificationService.triggerEvent({
        tenantId: testTenant,
        userId: testUser,
        type: 'due_soon',
        priority: 'MEDIUM',
      });
      expect(mediumItem).toBeNull();

      // CRITICAL priority should still pass through
      const criticalItem = NotificationService.triggerEvent({
        tenantId: testTenant,
        userId: testUser,
        type: 'negative_stock',
        priority: 'CRITICAL',
      });
      expect(criticalItem).not.toBeNull();
      expect(criticalItem?.priority).toBe('CRITICAL');
    });
  });

  describe('3. Collections & Reminders (Rule G4) & Aging Calculation', () => {
    it('should calculate due invoices, outstanding balances, and aging buckets correctly', () => {
      const dueData = ReminderService.getDueInvoices(testTenant);
      expect(dueData.records.length).toBeGreaterThan(0);
      expect(dueData.summary.totalOutstandingSar).toBeGreaterThan(0);

      // Verify each invoice has proper aging bucket
      for (const inv of dueData.records) {
        expect(inv.balanceDueSar).toBeGreaterThan(0);
        expect(inv.agingBucket).toMatch(/DUE_SOON|DUE_TODAY|OVERDUE_1_30|OVERDUE_31_60|OVERDUE_61_PLUS/);
        if (inv.daysOverdue > 60) {
          expect(inv.agingBucket).toBe('OVERDUE_61_PLUS');
        } else if (inv.daysOverdue > 30) {
          expect(inv.agingBucket).toBe('OVERDUE_31_60');
        } else if (inv.daysOverdue > 0) {
          expect(inv.agingBucket).toBe('OVERDUE_1_30');
        } else if (inv.daysOverdue === 0) {
          expect(inv.agingBucket).toBe('DUE_TODAY');
        } else {
          expect(inv.agingBucket).toBe('DUE_SOON');
        }
      }
    });

    it('should perform variable substitution in reminder templates with formatting', () => {
      const templates = ReminderService.getTemplates(testTenant);
      const overdueTpl = templates.find((t) => t.id === 'tpl-standard-overdue') || templates[0];

      const preview = ReminderService.previewReminder(testTenant, {
        templateId: overdueTpl.id,
        customerName: 'شركة الأفق التقني',
        invoiceNumber: 'INV-2026-0088',
        dueDate: '2026-08-15',
        amountDueSar: 25000,
        daysOverdue: 34,
        companyName: 'مؤسسة الرياض للتجارة',
      });

      expect(preview.subjectAr).toContain('INV-2026-0088');
      expect(preview.bodyAr).toContain('شركة الأفق التقني');
      expect(preview.bodyAr).toContain('INV-2026-0088');
      expect(preview.bodyAr).toContain('25,000');
      expect(preview.bodyAr).toContain('34');
      expect(preview.bodyAr).not.toContain('{customer_name}');
      expect(preview.bodyAr).not.toContain('{invoice_number}');
    });
  });

  describe('4. Duplicate-Send Protection & Communication Logs', () => {
    it('should block duplicate reminders sent within the 24-hour window', async () => {
      const payload = {
        customerId: 'cust-p14-dup',
        customerName: 'مجموعة النور التجارية',
        customerEmail: 'finance@alnoor.sa',
        invoiceId: 'inv-p14-999',
        invoiceNumber: 'INV-2026-0999',
        amountDueSar: 12500,
        dueDate: '2026-08-20',
        templateId: 'tpl-standard-overdue',
        channel: 'EMAIL' as const,
        scheduleType: 'IMMEDIATE' as const,
        attachStatement: true,
      };

      // First send -> should succeed
      const firstResult = await ReminderService.sendReminder(testTenant, payload, testUser);
      expect(firstResult.success).toBe(true);
      expect(firstResult.status).toBe('SENT');
      expect(firstResult.logId).toBeTruthy();

      // Immediate second send -> should be blocked by duplicate protection
      const secondResult = await ReminderService.sendReminder(testTenant, payload, testUser);
      expect(secondResult.success).toBe(false);
      expect(secondResult.status).toBe('BLOCKED_DUPLICATE');
      expect(secondResult.blockedReason).toContain('Duplicate reminder blocked');

      // Send with forceSend=true -> should bypass lock
      const forceResult = await ReminderService.sendReminder(
        testTenant,
        { ...payload, forceSend: true },
        testUser
      );
      expect(forceResult.success).toBe(true);
      expect(forceResult.status).toBe('SENT');
    });

    it('should audit and query communication logs by channel and status', async () => {
      const logs = ReminderService.getCommunicationLogs(testTenant);
      expect(logs.length).toBeGreaterThan(0);

      const emailLogs = ReminderService.getCommunicationLogs(testTenant, { channel: 'EMAIL' });
      for (const log of emailLogs) {
        expect(log.channel).toBe('EMAIL');
      }

      const blockedLogs = ReminderService.getCommunicationLogs(testTenant, {
        status: 'BLOCKED_DUPLICATE',
      });
      expect(blockedLogs.length).toBeGreaterThan(0);
      expect(blockedLogs[0].blockedReason).toBeDefined();
    });
  });

  describe('5. Push Notification Adapter Architecture', () => {
    it('should provide VAPID status and support subscription lifecycle', async () => {
      const adapter = PushNotificationAdapter.getInstance();
      const status = adapter.getStatus(testTenant);

      expect(status.provider).toBe('Web Push (W3C Push API / RFC 8291)');
      expect(status.featureFlag).toBe('PUSH_NOTIFICATIONS_ENABLED');

      // Test subscription
      const subResult = await adapter.subscribe(testTenant, testUser, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-sub-token',
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYcAO03AIN9VPSC8Mt7vhPBWImJ3',
          auth: 'tBHItJI5svbpez7KI4CCXg',
        },
      });

      expect(subResult.success).toBe(true);
      expect(subResult.subscriptionId).toBeTruthy();

      const updatedStatus = adapter.getStatus(testTenant);
      expect(updatedStatus.activeSubscriptionsCount).toBeGreaterThanOrEqual(1);
    });
  });
});
