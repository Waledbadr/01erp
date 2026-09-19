/**
 * Notification Service Engine — Saudi ERP Platform
 * Manages enterprise notifications lifecycle, typed events, priority tiers,
 * user preferences suppression, deep links, and multi-channel dispatch.
 */

import crypto from 'crypto';
import {
  NotificationEventType,
  NotificationPriority,
  NotificationChannel,
  NotificationItem,
  UserNotificationPreferences,
  NotificationDeepLink,
} from './types.js';
import { PushNotificationAdapter } from './pushAdapter.js';
import { logger } from '../../core/logger.js';

// In-Memory store keyed by tenantId
const notificationsStore: Map<string, NotificationItem[]> = new Map();
// Preferences store keyed by `${tenantId}:${userId}`
const preferencesStore: Map<string, UserNotificationPreferences> = new Map();

export interface TriggerEventOptions {
  tenantId: string;
  userId?: string;
  type: NotificationEventType;
  priority?: NotificationPriority;
  titleAr?: string;
  titleEn?: string;
  messageAr?: string;
  messageEn?: string;
  deepLink?: NotificationDeepLink;
  metadata?: Record<string, any>;
  forceDispatch?: boolean; // bypass preference check
}

export class NotificationService {
  /**
   * Returns standard default preferences for a user
   */
  public static getDefaultPreferences(tenantId: string, userId: string): UserNotificationPreferences {
    const allTypes: NotificationEventType[] = [
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

    const events: UserNotificationPreferences['events'] = {} as any;
    for (const t of allTypes) {
      events[t] = {
        enabled: true,
        inApp: true,
        email: ['zatca_failure', 'backup_failure', 'overdue', 'approval_requested'].includes(t),
        push: ['zatca_failure', 'negative_stock', 'approval_requested'].includes(t),
      };
    }

    return {
      tenantId,
      userId,
      globalEnabled: true,
      soundEnabled: true,
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '07:00',
      },
      events,
    };
  }

  /**
   * Retrieves user notification preferences
   */
  public static getPreferences(tenantId: string, userId: string = 'default-user'): UserNotificationPreferences {
    const key = `${tenantId}:${userId}`;
    const existing = preferencesStore.get(key);
    if (existing) return existing;

    const initial = this.getDefaultPreferences(tenantId, userId);
    preferencesStore.set(key, initial);
    return initial;
  }

  /**
   * Updates user notification preferences
   */
  public static updatePreferences(
    tenantId: string,
    userId: string,
    updates: Partial<UserNotificationPreferences>
  ): UserNotificationPreferences {
    const current = this.getPreferences(tenantId, userId);
    const updated: UserNotificationPreferences = {
      ...current,
      ...updates,
      events: {
        ...current.events,
        ...(updates.events || {}),
      },
    };
    preferencesStore.set(`${tenantId}:${userId}`, updated);
    return updated;
  }

  /**
   * Default event definitions with metadata, priorities, and localized messages
   */
  public static getEventDefaults(type: NotificationEventType, metadata?: Record<string, any>): {
    priority: NotificationPriority;
    titleAr: string;
    titleEn: string;
    messageAr: string;
    messageEn: string;
    deepLink: NotificationDeepLink;
  } {
    const meta = metadata || {};
    switch (type) {
      case 'invoice_posted':
        return {
          priority: 'LOW',
          titleAr: 'ترحيل فاتورة مبيعات',
          titleEn: 'Sales Invoice Posted',
          messageAr: `تم ترحيل الفاتورة رقم ${meta.invoiceNumber || 'INV-2026-001'} بقيمة ${(meta.amount || 0).toLocaleString()} ر.س إلى دفتر الأستاذ.`,
          messageEn: `Invoice ${meta.invoiceNumber || 'INV-2026-001'} totaling ${(meta.amount || 0).toLocaleString()} SAR posted to GL.`,
          deepLink: { path: '/sales', params: { invoiceId: meta.invoiceId || '' }, labelAr: 'عرض الفاتورة', labelEn: 'View Invoice' },
        };
      case 'invoice_paid':
        return {
          priority: 'LOW',
          titleAr: 'سداد كامل لفاتورة',
          titleEn: 'Invoice Fully Paid',
          messageAr: `تم سداد الفاتورة رقم ${meta.invoiceNumber || 'INV-2026-001'} للعميل ${meta.customerName || 'شركة الأفق'} بالكامل.`,
          messageEn: `Invoice ${meta.invoiceNumber || 'INV-2026-001'} for ${meta.customerName || 'Al-Ufoq'} is now fully paid.`,
          deepLink: { path: '/sales', params: { invoiceId: meta.invoiceId || '' }, labelAr: 'تفاصيل الفاتورة', labelEn: 'Invoice Details' },
        };
      case 'payment_received':
        return {
          priority: 'LOW',
          titleAr: 'استلام دفعة نقدية / سند قبض',
          titleEn: 'Customer Payment Received',
          messageAr: `تم قيد سند قبض بمبلغ ${(meta.amount || 0).toLocaleString()} ر.س عبر ${meta.method || 'التحويل البنكي'}.`,
          messageEn: `Receipt voucher of ${(meta.amount || 0).toLocaleString()} SAR logged via ${meta.method || 'Bank Transfer'}.`,
          deepLink: { path: '/treasury', params: { tab: 'receipts' }, labelAr: 'سندات القبض', labelEn: 'Receipt Vouchers' },
        };
      case 'purchase_created':
      case 'purchase_bill_posted':
      case 'goods_received':
        return {
          priority: 'MEDIUM',
          titleAr: 'حركة مشتريات وتوريد',
          titleEn: 'Purchasing & Supply Event',
          messageAr: `تم تسجيل حركة مشتريات رقم ${meta.docNumber || 'PO-2026-089'} من المورد ${meta.supplierName || 'شركة التوريدات الوطنية'}.`,
          messageEn: `Purchasing movement ${meta.docNumber || 'PO-2026-089'} recorded from supplier ${meta.supplierName || 'National Supplies'}.`,
          deepLink: { path: '/purchasing', params: { billId: meta.billId || '' }, labelAr: 'سجل المشتريات', labelEn: 'Purchasing Register' },
        };
      case 'expense_approved':
        return {
          priority: 'MEDIUM',
          titleAr: 'اعتماد سند صرف مصروفات',
          titleEn: 'Expense Voucher Approved',
          messageAr: `تم اعتماد سند الصرف رقم ${meta.voucherNumber || 'EXP-044'} بمبلغ ${(meta.amount || 0).toLocaleString()} ر.س من الإدارة المالية.`,
          messageEn: `Expense voucher ${meta.voucherNumber || 'EXP-044'} for ${(meta.amount || 0).toLocaleString()} SAR approved by finance.`,
          deepLink: { path: '/treasury', params: { tab: 'payments' }, labelAr: 'سندات الصرف', labelEn: 'Payment Vouchers' },
        };
      case 'low_stock':
        return {
          priority: 'HIGH',
          titleAr: 'تنبيه: انخفاض رصيد المخزون',
          titleEn: 'Warning: Low Stock Alert',
          messageAr: `الصنف [${meta.itemName || 'ورق طباعة A4'}] وصل إلى مستوى إعادة الطلب (${meta.currentQty || 5} متبقية، الحد الأدنى: ${meta.reorderLevel || 20}).`,
          messageEn: `Item [${meta.itemName || 'A4 Paper'}] reached reorder point (${meta.currentQty || 5} remaining, minimum: ${meta.reorderLevel || 20}).`,
          deepLink: { path: '/inventory', params: { itemId: meta.itemId || '' }, labelAr: 'فحص المخزون', labelEn: 'Check Stock' },
        };
      case 'negative_stock':
        return {
          priority: 'CRITICAL',
          titleAr: 'تحذير حرج: رصيد مخزون سالب',
          titleEn: 'Critical: Negative Stock Detected',
          messageAr: `تم اكتشاف رصيد سالب للصنف [${meta.itemName || 'شاشة سامسونج 27'}] في مستودع ${meta.warehouseName || 'الرئيسي'}. يتطلب جرد فوري.`,
          messageEn: `Negative stock detected for item [${meta.itemName || 'Samsung 27" Screen'}] in warehouse ${meta.warehouseName || 'Main'}. Immediate stocktake required.`,
          deepLink: { path: '/inventory', params: { itemId: meta.itemId || '', tab: 'adjustments' }, labelAr: 'تسوية الجرد', labelEn: 'Stock Adjustment' },
        };
      case 'due_soon':
        return {
          priority: 'MEDIUM',
          titleAr: 'فاتورة تقترب من موعد الاستحقاق',
          titleEn: 'Invoice Due Soon',
          messageAr: `الفاتورة ${meta.invoiceNumber || 'INV-2026-042'} للعميل ${meta.customerName || 'مؤسسة الرياض'} تستحق خلال ${meta.daysLeft || 3} أيام بمبلغ ${(meta.amount || 0).toLocaleString()} ر.س.`,
          messageEn: `Invoice ${meta.invoiceNumber || 'INV-2026-042'} for ${meta.customerName || 'Riyadh Est.'} is due in ${meta.daysLeft || 3} days (${(meta.amount || 0).toLocaleString()} SAR).`,
          deepLink: { path: '/reminders', params: { invoiceId: meta.invoiceId || '' }, labelAr: 'إرسال تذكير', labelEn: 'Send Reminder' },
        };
      case 'overdue':
        return {
          priority: 'HIGH',
          titleAr: 'تنبيه: فاتورة متأخرة السداد',
          titleEn: 'Alert: Overdue Invoice',
          messageAr: `الفاتورة ${meta.invoiceNumber || 'INV-2026-015'} للعميل ${meta.customerName || 'شركة الأفق'} تجاوزت تاريخ الاستحقاق بـ ${meta.daysOverdue || 12} يوماً (المبلغ المستحق: ${(meta.amount || 0).toLocaleString()} ر.س).`,
          messageEn: `Invoice ${meta.invoiceNumber || 'INV-2026-015'} for ${meta.customerName || 'Al-Ufoq'} is ${meta.daysOverdue || 12} days overdue (${(meta.amount || 0).toLocaleString()} SAR).`,
          deepLink: { path: '/reminders', params: { invoiceId: meta.invoiceId || '', tab: 'overdue' }, labelAr: 'إدارة التحصيل', labelEn: 'Collections' },
        };
      case 'zatca_failure':
        return {
          priority: 'CRITICAL',
          titleAr: 'فشل اعتماد فاتورة زاتكا (ZATCA Error)',
          titleEn: 'ZATCA Phase 2 Submission Failure',
          messageAr: `رفضت بوابة هيئة الزكاة الفاتورة رقم ${meta.invoiceNumber || 'INV-2026-050'}. رمز الخطأ: ${meta.errorCode || 'BR-KSA-42'}: ${meta.errorMessage || 'الرقم الضريبي للمشتري غير صالح'}.`,
          messageEn: `ZATCA clearance rejected invoice ${meta.invoiceNumber || 'INV-2026-050'}. Error code ${meta.errorCode || 'BR-KSA-42'}: ${meta.errorMessage || 'Invalid Buyer VAT ID'}.`,
          deepLink: { path: '/zatca', params: { invoiceId: meta.invoiceId || '' }, labelAr: 'معالجة خطأ زاتكا', labelEn: 'Fix ZATCA Error' },
        };
      case 'backup_failure':
        return {
          priority: 'CRITICAL',
          titleAr: 'فشل النسخ الاحتياطي الآلي للنظام',
          titleEn: 'Automated System Backup Failed',
          messageAr: `فشلت عملية إنشاء النسخة الاحتياطية المجدولة لقاعدة البيانات: ${meta.reason || 'انقطاع الاتصال بالسحابة'}. يرجى التدخل اليدوي.`,
          messageEn: `Scheduled database backup failed: ${meta.reason || 'Cloud storage connection timeout'}. Manual intervention required.`,
          deepLink: { path: '/security', params: { tab: 'backups' }, labelAr: 'سجل النسخ الاحتياطي', labelEn: 'Backup Log' },
        };
      case 'delivery_failure':
        return {
          priority: 'HIGH',
          titleAr: 'فشل إرسال إشعار بريدي / ويبهوك',
          titleEn: 'Email / Webhook Delivery Failed',
          messageAr: `تعذر تسليم البريد الإلكتروني للمستلم ${meta.recipient || 'client@domain.sa'}: ${meta.errorReason || 'رفض خادم SMTP'}.`,
          messageEn: `Failed to deliver email to ${meta.recipient || 'client@domain.sa'}: ${meta.errorReason || 'SMTP server connection refused'}.`,
          deepLink: { path: '/documents', params: { tab: 'sharing' }, labelAr: 'طابور الإرسال', labelEn: 'Delivery Queue' },
        };
      case 'approval_requested':
      default:
        return {
          priority: 'HIGH',
          titleAr: 'طلب اعتماد بانتظار موافقتك',
          titleEn: 'Pending Approval Request',
          messageAr: `طلب اعتماد ${meta.requestType || 'طلب شراء جديد'} بمبلغ ${(meta.amount || 0).toLocaleString()} ر.س يتطلب مراجعتك.`,
          messageEn: `Approval request for ${meta.requestType || 'New Purchase Request'} (${(meta.amount || 0).toLocaleString()} SAR) requires your review.`,
          deepLink: { path: '/purchasing', params: { tab: 'requests' }, labelAr: 'مراجعة الطلب', labelEn: 'Review Request' },
        };
    }
  }

  /**
   * Core event triggering engine.
   * Checks user preferences suppression, constructs notification, dispatches to allowed channels.
   */
  public static triggerEvent(options: TriggerEventOptions): NotificationItem | null {
    const {
      tenantId,
      userId = 'default-user',
      type,
      forceDispatch = false,
      metadata = {},
    } = options;

    // 1. Check Preferences Suppression & Quiet Hours
    const preferences = this.getPreferences(tenantId, userId);
    if (!forceDispatch) {
      if (!preferences.globalEnabled) {
        logger.info(`[NotificationService] Suppressed event ${type} (Global notifications disabled for user ${userId})`);
        return null;
      }
      const eventPref = preferences.events[type];
      if (eventPref && !eventPref.enabled) {
        logger.info(`[NotificationService] Suppressed event ${type} (Type disabled by user preferences)`);
        return null;
      }

      // Check Quiet Hours (CRITICAL priority overrides quiet hours)
      if (preferences.quietHours.enabled) {
        const now = new Date();
        const currentHours = now.getHours().toString().padStart(2, '0');
        const currentMinutes = now.getMinutes().toString().padStart(2, '0');
        const currentTime = `${currentHours}:${currentMinutes}`;

        const { startTime, endTime } = preferences.quietHours;
        const inQuietHours =
          startTime <= endTime
            ? currentTime >= startTime && currentTime <= endTime
            : currentTime >= startTime || currentTime <= endTime; // overnight wrap

        const defaults = this.getEventDefaults(type, metadata);
        const resolvedPriority = options.priority || defaults.priority;

        if (inQuietHours && resolvedPriority !== 'CRITICAL') {
          logger.info(
            `[NotificationService] Suppressed non-critical event ${type} during quiet hours (${startTime} - ${endTime})`
          );
          return null;
        }
      }
    }

    // 2. Resolve default texts and priority
    const defaults = this.getEventDefaults(type, metadata);
    const priority = options.priority || defaults.priority;
    const titleAr = options.titleAr || defaults.titleAr;
    const titleEn = options.titleEn || defaults.titleEn;
    const messageAr = options.messageAr || defaults.messageAr;
    const messageEn = options.messageEn || defaults.messageEn;
    const deepLink = options.deepLink || defaults.deepLink;

    // 3. Resolve Channels
    const prefForType = preferences.events[type];
    const channels: NotificationChannel[] = ['IN_APP'];
    if (prefForType?.email) channels.push('EMAIL');
    if (prefForType?.push) channels.push('PUSH');

    // 4. Construct Notification Item
    const notification: NotificationItem = {
      id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      tenantId,
      userId,
      type,
      priority,
      titleAr,
      titleEn,
      messageAr,
      messageEn,
      channels,
      read: false,
      createdAt: new Date().toISOString(),
      deepLink,
      metadata,
    };

    // 5. Store in In-Memory Store
    const list = notificationsStore.get(tenantId) || [];
    list.unshift(notification); // newest first
    notificationsStore.set(tenantId, list);

    // 6. Push Adapter Handshake (if Push is in channels)
    if (channels.includes('PUSH')) {
      const pushAdapter = PushNotificationAdapter.getInstance();
      pushAdapter.sendPush(tenantId, userId, {
        title: titleAr,
        body: messageAr,
        data: { notifId: notification.id, deepLink },
      }).catch((err) => {
        logger.warn(`[NotificationService] Push delivery notice: ${err.message}`);
      });
    }

    logger.info(`[NotificationService] Fired ${type} [${priority}] for tenant ${tenantId}`);
    return notification;
  }

  /**
   * Get all notifications for a tenant with optional filters
   */
  public static getNotifications(
    tenantId: string,
    filters?: {
      type?: NotificationEventType;
      priority?: NotificationPriority;
      read?: boolean;
      search?: string;
      limit?: number;
    }
  ): { items: NotificationItem[]; total: number; unreadCount: number } {
    this.ensureSeedData(tenantId);
    let items = notificationsStore.get(tenantId) || [];

    const unreadCount = items.filter((n) => !n.read).length;

    if (filters?.type) {
      items = items.filter((n) => n.type === filters.type);
    }
    if (filters?.priority) {
      items = items.filter((n) => n.priority === filters.priority);
    }
    if (filters?.read !== undefined) {
      items = items.filter((n) => n.read === filters.read);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      items = items.filter(
        (n) =>
          n.titleAr.toLowerCase().includes(q) ||
          n.titleEn.toLowerCase().includes(q) ||
          n.messageAr.toLowerCase().includes(q) ||
          n.messageEn.toLowerCase().includes(q)
      );
    }

    const limit = filters?.limit || 50;
    return {
      items: items.slice(0, limit),
      total: items.length,
      unreadCount,
    };
  }

  /**
   * Mark an individual notification as read
   */
  public static markAsRead(tenantId: string, notificationId: string): boolean {
    const list = notificationsStore.get(tenantId) || [];
    const item = list.find((n) => n.id === notificationId);
    if (!item) return false;

    item.read = true;
    item.readAt = new Date().toISOString();
    return true;
  }

  /**
   * Mark all notifications as read
   */
  public static markAllAsRead(tenantId: string): number {
    const list = notificationsStore.get(tenantId) || [];
    let count = 0;
    const now = new Date().toISOString();
    for (const item of list) {
      if (!item.read) {
        item.read = true;
        item.readAt = now;
        count++;
      }
    }
    return count;
  }

  /**
   * Delete a notification
   */
  public static deleteNotification(tenantId: string, notificationId: string): boolean {
    const list = notificationsStore.get(tenantId) || [];
    const filtered = list.filter((n) => n.id !== notificationId);
    notificationsStore.set(tenantId, filtered);
    return filtered.length !== list.length;
  }

  /**
   * Clear all read notifications
   */
  public static clearReadNotifications(tenantId: string): number {
    const list = notificationsStore.get(tenantId) || [];
    const unreadOnly = list.filter((n) => !n.read);
    const removedCount = list.length - unreadOnly.length;
    notificationsStore.set(tenantId, unreadOnly);
    return removedCount;
  }

  /**
   * Pre-seed initial enterprise notifications if empty
   */
  private static ensureSeedData(tenantId: string) {
    if (notificationsStore.has(tenantId) && (notificationsStore.get(tenantId)?.length || 0) > 0) {
      return;
    }

    const seeds: Array<Omit<NotificationItem, 'tenantId'>> = [
      {
        id: 'seed-notif-1',
        userId: 'default-user',
        type: 'zatca_failure',
        priority: 'CRITICAL',
        titleAr: 'تنبيه زاتكا: خطأ في مطابقة الرقم الضريبي للمشتري',
        titleEn: 'ZATCA Alert: Buyer VAT ID Mismatch on Clearance',
        messageAr: 'رفضت منصة فاتورة اعتماد الفاتورة القياسية INV-2026-0042 بسبب عدم تطابق الرقم الضريبي 300000000000003.',
        messageEn: 'ZATCA Fatoora rejected Standard Invoice INV-2026-0042 due to mismatched 15-digit VAT ID.',
        channels: ['IN_APP', 'EMAIL'],
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        deepLink: { path: '/zatca', params: { invoiceId: 'INV-2026-0042' }, labelAr: 'مراجعة زاتكا', labelEn: 'Review ZATCA' },
      },
      {
        id: 'seed-notif-2',
        userId: 'default-user',
        type: 'overdue',
        priority: 'HIGH',
        titleAr: 'فاتورة متأخرة السداد: شركة الأفق المتقدمة',
        titleEn: 'Overdue Invoice: Advanced Horizon Co.',
        messageAr: 'تجاوزت الفاتورة INV-2026-0031 موعد الاستحقاق بـ 18 يوماً بمبلغ 24,150.00 ر.س.',
        messageEn: 'Invoice INV-2026-0031 is 18 days overdue with an outstanding balance of 24,150.00 SAR.',
        channels: ['IN_APP', 'EMAIL'],
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
        deepLink: { path: '/reminders', params: { invoiceId: 'INV-2026-0031', tab: 'overdue' }, labelAr: 'إرسال تذكير', labelEn: 'Send Reminder' },
      },
      {
        id: 'seed-notif-3',
        userId: 'default-user',
        type: 'low_stock',
        priority: 'HIGH',
        titleAr: 'نقص مخزون: ورق تصوير فاخر A4',
        titleEn: 'Low Stock Alert: Premium A4 Copy Paper',
        messageAr: 'بلغ الرصيد الحالي 12 بندل في مستودع الرياض الرئيسي (الحد الأدنى لإعادة الطلب: 50).',
        messageEn: 'Current inventory is 12 reams in Riyadh Central Warehouse (Reorder threshold: 50).',
        channels: ['IN_APP'],
        read: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
        deepLink: { path: '/inventory', params: { itemId: 'ITEM-001' }, labelAr: 'عرض المخزون', labelEn: 'View Stock' },
      },
      {
        id: 'seed-notif-4',
        userId: 'default-user',
        type: 'payment_received',
        priority: 'LOW',
        titleAr: 'سند قبض جديد بمبلغ 11,500.00 ر.س',
        titleEn: 'New Payment Receipt: 11,500.00 SAR',
        messageAr: 'تم تسجيل سند قبض بنكي لحساب مؤسسة الرياض للتجارة وتخصيصه للفاتورة INV-2026-0028.',
        messageEn: 'Customer receipt voucher logged for Riyadh Trading Est. allocated to INV-2026-0028.',
        channels: ['IN_APP'],
        read: true,
        readAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
        deepLink: { path: '/treasury', params: { tab: 'receipts' }, labelAr: 'سندات القبض', labelEn: 'Receipt Vouchers' },
      },
    ];

    notificationsStore.set(
      tenantId,
      seeds.map((s) => ({ ...s, tenantId }))
    );
  }
}
