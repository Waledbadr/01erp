/**
 * Client-side Library for Notifications & Reminders — Saudi ERP Platform
 * Connects frontend UI components to backend REST APIs with graceful local fallbacks.
 */

export type NotificationEventType =
  | 'invoice_posted'
  | 'invoice_paid'
  | 'payment_received'
  | 'purchase_created'
  | 'purchase_bill_posted'
  | 'goods_received'
  | 'expense_approved'
  | 'low_stock'
  | 'negative_stock'
  | 'due_soon'
  | 'overdue'
  | 'zatca_failure'
  | 'backup_failure'
  | 'delivery_failure'
  | 'approval_requested';

export type NotificationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'PUSH' | 'WHATSAPP' | 'SMS';

export interface NotificationDeepLink {
  path: string;
  params?: Record<string, string | number>;
  labelAr: string;
  labelEn: string;
}

export interface NotificationItem {
  id: string;
  tenantId: string;
  userId?: string;
  type: NotificationEventType;
  priority: NotificationPriority;
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  channels: NotificationChannel[];
  read: boolean;
  readAt?: string;
  createdAt: string;
  deepLink?: NotificationDeepLink;
  metadata?: Record<string, any>;
}

export interface UserNotificationPreferences {
  tenantId: string;
  userId: string;
  globalEnabled: boolean;
  soundEnabled: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
  };
  events: Record<
    NotificationEventType,
    {
      enabled: boolean;
      inApp: boolean;
      email: boolean;
      push: boolean;
    }
  >;
}

export interface PushAdapterStatus {
  status: 'CONFIGURED' | 'NOT_CONFIGURED';
  provider: string;
  featureFlag: string;
  publicKey?: string;
  activeSubscriptionsCount: number;
  message: string;
}

export type AgingBucket = 'DUE_SOON' | 'DUE_TODAY' | 'OVERDUE_1_30' | 'OVERDUE_31_60' | 'OVERDUE_61_PLUS';

export interface DueInvoiceRecord {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  customerId: string;
  customerNameAr: string;
  customerNameEn: string;
  customerPhone?: string;
  customerEmail?: string;
  issueDate: string;
  dueDate: string;
  totalAmountSar: number;
  paidAmountSar: number;
  balanceDueSar: number;
  daysOverdue: number;
  agingBucket: AgingBucket;
  lastReminderSentAt?: string;
  reminderCount: number;
}

export interface ReminderTemplate {
  id: string;
  tenantId?: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  category: 'PRE_DUE' | 'DUE_DAY' | 'OVERDUE' | 'FINAL_NOTICE' | 'CUSTOM';
  subjectTemplateAr: string;
  subjectTemplateEn: string;
  bodyTemplateAr: string;
  bodyTemplateEn: string;
  allowedChannels: NotificationChannel[];
  isDefault?: boolean;
}

export type ReminderScheduleType = 'IMMEDIATE' | 'SCHEDULED' | 'POLICY_TRIGGERED';
export type CommunicationStatus = 'DELIVERED' | 'SENT' | 'QUEUED' | 'BLOCKED_DUPLICATE' | 'FAILED';

export interface CommunicationLog {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string;
  invoiceId: string;
  invoiceNumber: string;
  templateId: string;
  templateName: string;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  messageBody: string;
  status: CommunicationStatus;
  scheduledFor?: string;
  sentAt?: string;
  triggeredBy: string;
  blockedReason?: string;
  attachStatement: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface SendReminderPayload {
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  invoiceId: string;
  invoiceNumber: string;
  amountDueSar: number;
  dueDate: string;
  templateId: string;
  channel: NotificationChannel;
  scheduleType: ReminderScheduleType;
  scheduledTime?: string;
  customSubject?: string;
  customMessage?: string;
  attachStatement?: boolean;
  forceSend?: boolean;
}

// ==========================================
// CLIENT API CALLS
// ==========================================

export const NotificationAPI = {
  async getNotifications(filters?: {
    type?: NotificationEventType;
    priority?: NotificationPriority;
    read?: boolean;
    search?: string;
  }): Promise<{ notifications: NotificationItem[]; total: number; unreadCount: number }> {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.priority) params.set('priority', filters.priority);
    if (filters?.read !== undefined) params.set('read', String(filters.read));
    if (filters?.search) params.set('search', filters.search);

    const res = await fetch(`/api/v1/notifications?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch notifications');
    return res.json();
  },

  async getUnreadCount(): Promise<number> {
    try {
      const res = await fetch('/api/v1/notifications/unread-count');
      if (!res.ok) return 0;
      const data = await res.json();
      return data.unreadCount || 0;
    } catch {
      return 0;
    }
  },

  async markAsRead(id: string): Promise<boolean> {
    const res = await fetch('/api/v1/notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    return res.ok;
  },

  async markAllAsRead(): Promise<number> {
    const res = await fetch('/api/v1/notifications/mark-all-read', {
      method: 'POST',
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.updatedCount || 0;
  },

  async deleteNotification(id: string): Promise<boolean> {
    const res = await fetch(`/api/v1/notifications/${id}`, {
      method: 'DELETE',
    });
    return res.ok;
  },

  async clearRead(): Promise<number> {
    const res = await fetch('/api/v1/notifications/clear-read', {
      method: 'POST',
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.clearedCount || 0;
  },

  async getPreferences(): Promise<UserNotificationPreferences> {
    const res = await fetch('/api/v1/notifications/preferences');
    if (!res.ok) throw new Error('Failed to fetch preferences');
    const data = await res.json();
    return data.preferences;
  },

  async updatePreferences(updates: Partial<UserNotificationPreferences>): Promise<UserNotificationPreferences> {
    const res = await fetch('/api/v1/notifications/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update preferences');
    const data = await res.json();
    return data.preferences;
  },

  async triggerTestEvent(payload: {
    type: NotificationEventType;
    priority?: NotificationPriority;
    metadata?: Record<string, any>;
    forceDispatch?: boolean;
  }): Promise<{ success: boolean; suppressed: boolean; notification: NotificationItem | null; message: string }> {
    const res = await fetch('/api/v1/notifications/trigger-test-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async getPushStatus(): Promise<PushAdapterStatus> {
    const res = await fetch('/api/v1/notifications/push/status');
    if (!res.ok) throw new Error('Failed to fetch push status');
    const data = await res.json();
    return data.pushStatus;
  },

  // ==========================================
  // COLLECTIONS & REMINDERS
  // ==========================================

  async getDueInvoices(): Promise<{
    invoices: DueInvoiceRecord[];
    summary: {
      totalOutstandingSar: number;
      totalOverdueSar: number;
      dueSoonCount: number;
      overdueCount: number;
      criticalCount: number;
    };
  }> {
    const res = await fetch('/api/v1/notifications/reminders/due-invoices');
    if (!res.ok) throw new Error('Failed to fetch due invoices');
    return res.json();
  },

  async getTemplates(): Promise<ReminderTemplate[]> {
    const res = await fetch('/api/v1/notifications/reminders/templates');
    if (!res.ok) throw new Error('Failed to fetch reminder templates');
    const data = await res.json();
    return data.templates;
  },

  async previewReminder(payload: {
    templateId: string;
    customerName: string;
    invoiceNumber: string;
    dueDate: string;
    amountDueSar: number;
    daysOverdue: number;
    companyName?: string;
    customSubject?: string;
    customMessage?: string;
  }): Promise<{ subjectAr: string; subjectEn: string; bodyAr: string; bodyEn: string }> {
    const res = await fetch('/api/v1/notifications/reminders/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to generate reminder preview');
    const data = await res.json();
    return data.preview;
  },

  async sendReminder(payload: SendReminderPayload): Promise<{
    success: boolean;
    status: CommunicationStatus;
    logId: string;
    message: string;
    blockedReason?: string;
  }> {
    const res = await fetch('/api/v1/notifications/reminders/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async bulkSendReminders(invoices: SendReminderPayload[]): Promise<{
    total: number;
    sent: number;
    blocked: number;
    results: Array<{ invoiceNumber: string; success: boolean; status: CommunicationStatus; message: string }>;
  }> {
    const res = await fetch('/api/v1/notifications/reminders/bulk-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoices }),
    });
    return res.json();
  },

  async getCommunicationLogs(filters?: {
    customerId?: string;
    channel?: NotificationChannel;
    status?: CommunicationStatus;
    search?: string;
  }): Promise<CommunicationLog[]> {
    const params = new URLSearchParams();
    if (filters?.customerId) params.set('customerId', filters.customerId);
    if (filters?.channel) params.set('channel', filters.channel);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);

    const res = await fetch(`/api/v1/notifications/reminders/communication-logs?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch communication logs');
    const data = await res.json();
    return data.logs || [];
  },
};

// ==========================================
// FORMATTING HELPERS
// ==========================================

export function getPriorityBadge(priority: NotificationPriority): {
  labelAr: string;
  labelEn: string;
  className: string;
} {
  switch (priority) {
    case 'CRITICAL':
      return {
        labelAr: 'حرج جداً',
        labelEn: 'Critical',
        className: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20',
      };
    case 'HIGH':
      return {
        labelAr: 'أولوية عالية',
        labelEn: 'High Priority',
        className: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20',
      };
    case 'MEDIUM':
      return {
        labelAr: 'متوسطة',
        labelEn: 'Medium',
        className: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20',
      };
    case 'LOW':
    default:
      return {
        labelAr: 'معلومات',
        labelEn: 'Informational',
        className: 'bg-slate-50 text-slate-600 border-slate-200 ring-slate-500/20',
      };
  }
}

export function getAgingBucketBadge(bucket: AgingBucket): {
  labelAr: string;
  labelEn: string;
  className: string;
} {
  switch (bucket) {
    case 'DUE_SOON':
      return {
        labelAr: 'تستحق قريباً',
        labelEn: 'Due Soon (1-7 Days)',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'DUE_TODAY':
      return {
        labelAr: 'تستحق اليوم',
        labelEn: 'Due Today',
        className: 'bg-blue-50 text-blue-700 border-blue-200',
      };
    case 'OVERDUE_1_30':
      return {
        labelAr: 'متأخرة (1-30 يوم)',
        labelEn: 'Overdue (1-30 Days)',
        className: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    case 'OVERDUE_31_60':
      return {
        labelAr: 'متعثرة (31-60 يوم)',
        labelEn: 'Overdue (31-60 Days)',
        className: 'bg-orange-50 text-orange-700 border-orange-200',
      };
    case 'OVERDUE_61_PLUS':
      return {
        labelAr: 'متأخرة بشدة (+60 يوم)',
        labelEn: 'Overdue (60+ Days)',
        className: 'bg-rose-50 text-rose-700 border-rose-200',
      };
  }
}
