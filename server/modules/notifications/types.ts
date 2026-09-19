/**
 * Notifications & Reminders Module Types — Saudi ERP Platform
 * Phase 13/14 Specification:
 * - Typed events across the full enterprise lifecycle
 * - Priority levels: CRITICAL, HIGH, MEDIUM, LOW
 * - In-app, Email, Push, SMS, WhatsApp delivery channels
 * - User notification preferences & event suppression
 * - Ledger-sourced due-soon & overdue invoices (Rule G4)
 * - Template variable substitution & duplicate-send protection
 * - Full communication audit logs
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

export interface NotificationPreferenceItem {
  type: NotificationEventType;
  enabled: boolean;
  channels: {
    inApp: boolean;
    email: boolean;
    push: boolean;
  };
}

export interface UserNotificationPreferences {
  tenantId: string;
  userId: string;
  globalEnabled: boolean;
  soundEnabled: boolean;
  quietHours: {
    enabled: boolean;
    startTime: string; // e.g. "22:00"
    endTime: string;   // e.g. "07:00"
  };
  events: Record<NotificationEventType, {
    enabled: boolean;
    inApp: boolean;
    email: boolean;
    push: boolean;
  }>;
}

export interface PushSubscriptionData {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushAdapterStatus {
  status: 'CONFIGURED' | 'NOT_CONFIGURED';
  provider: string;
  featureFlag: string;
  publicKey?: string;
  activeSubscriptionsCount: number;
  message: string;
}

// ==========================================
// COLLECTIONS & REMINDERS (Rule G4)
// ==========================================

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
  daysOverdue: number; // >0 means overdue, <=0 means due in future
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
  recipient: string; // Email or phone
  subject: string;
  messageBody: string;
  status: CommunicationStatus;
  scheduledFor?: string;
  sentAt?: string;
  triggeredBy: string; // user email / id
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
  forceSend?: boolean; // bypass duplicate lock
}
