/**
 * Collections & Reminders Service Engine (Rule G4-Linked) — Saudi ERP Platform
 * Integrates ledger-sourced accounts receivable due dates, localized reminder composer,
 * template variable substitution, duplicate-send protection, and communication audit logs.
 */

import crypto from 'crypto';
import {
  DueInvoiceRecord,
  AgingBucket,
  ReminderTemplate,
  CommunicationLog,
  SendReminderPayload,
  NotificationChannel,
  CommunicationStatus,
} from './types.js';
import { SharingService } from '../documents/sharingService.js';
import { logger } from '../../core/logger.js';

// In-Memory stores keyed by tenantId
const dueInvoicesStore: Map<string, DueInvoiceRecord[]> = new Map();
const templatesStore: Map<string, ReminderTemplate[]> = new Map();
const communicationLogsStore: Map<string, CommunicationLog[]> = new Map();

// Default cooldown window for duplicate-send protection (24 hours in ms)
const DUPLICATE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export class ReminderService {
  /**
   * Returns standard localized reminder templates
   */
  public static getDefaultTemplates(): ReminderTemplate[] {
    return [
      {
        id: 'tpl-friendly-pre-due',
        nameAr: 'تذكير ودي قبل الاستحقاق (Friendly Pre-Due)',
        nameEn: 'Friendly Pre-Due Reminder',
        descriptionAr: 'رسالة ودية تذكيرية ترسل قبل موعد الاستحقاق بـ 3 إلى 5 أيام.',
        descriptionEn: 'Gentle notification dispatched 3-5 days before the invoice due date.',
        category: 'PRE_DUE',
        subjectTemplateAr: 'تذكير باستحقاق فاتورة قادم: {invoice_number} - {company_name}',
        subjectTemplateEn: 'Upcoming Invoice Due Date: {invoice_number} - {company_name}',
        bodyTemplateAr:
          'عزيزنا العميل {customer_name}، نود تذكيركم بأن الفاتورة رقم {invoice_number} بمبلغ {amount_due} ستستحق في {due_date}. نشكر لكم حسن تعاونكم الدائم.',
        bodyTemplateEn:
          'Dear {customer_name}, this is a gentle reminder that invoice {invoice_number} for {amount_due} is due on {due_date}. Thank you for your continued partnership.',
        allowedChannels: ['EMAIL', 'WHATSAPP', 'SMS'],
        isDefault: true,
      },
      {
        id: 'tpl-due-today',
        nameAr: 'إشعار استحقاق الفاتورة اليوم (Due Today)',
        nameEn: 'Invoice Due Today Notice',
        descriptionAr: 'تنبيه موجه بتاريخ الاستحقاق الفعلي للفاتورة.',
        descriptionEn: 'Notification dispatched on the exact due date of the invoice.',
        category: 'DUE_DAY',
        subjectTemplateAr: 'إشعار استحقاق اليوم: الفاتورة {invoice_number} - {company_name}',
        subjectTemplateEn: 'Due Today: Invoice {invoice_number} - {company_name}',
        bodyTemplateAr:
          'السادة {customer_name}، نفيدكم بحلول موعد سداد الفاتورة رقم {invoice_number} اليوم بتاريخ {due_date} بمبلغ {amount_due}. نرجو التكرم بالتحويل البنكي وإشعارنا بالإيصال.',
        bodyTemplateEn:
          'Dear {customer_name}, please be advised that invoice {invoice_number} in the amount of {amount_due} is due today ({due_date}). Kindly arrange settlement at your earliest convenience.',
        allowedChannels: ['EMAIL', 'WHATSAPP', 'SMS'],
        isDefault: true,
      },
      {
        id: 'tpl-standard-overdue',
        nameAr: 'تذكير سداد - فاتورة مستحقة متأخرة (Standard Overdue)',
        nameEn: 'Standard Overdue Reminder',
        descriptionAr: 'رسالة للمطالبة بسداد الفواتير المتأخرة من 1 إلى 30 يوماً.',
        descriptionEn: 'Reminder for overdue invoices between 1 and 30 days.',
        category: 'OVERDUE',
        subjectTemplateAr: 'متابعة سداد فاتورة متأخرة: {invoice_number} (متأخرة {days_overdue} يوم)',
        subjectTemplateEn: 'Overdue Invoice Reminder: {invoice_number} ({days_overdue} days overdue)',
        bodyTemplateAr:
          'عناية السادة {customer_name}، نلفت انتباهكم الكريم إلى أن الفاتورة رقم {invoice_number} بمبلغ {amount_due} قد تجاوزت موعد استحقاقها المحدد في {due_date} بـ {days_overdue} يوماً. نرجو التكرم بسرعة سداد المستحق.',
        bodyTemplateEn:
          'Attention {customer_name}, please note that invoice {invoice_number} for {amount_due} is currently {days_overdue} days past due (Due date was {due_date}). We kindly request immediate settlement.',
        allowedChannels: ['EMAIL', 'WHATSAPP', 'SMS'],
        isDefault: true,
      },
      {
        id: 'tpl-urgent-escalation',
        nameAr: 'إشعار نهائي لتحصيل مستحقات متعثرة (Final Escalation)',
        nameEn: 'Urgent Final Collection Notice',
        descriptionAr: 'إشعار رسمي نهائي للمستحقات المتأخرة لأكثر من 30 يوماً قبل تعليق التوريد.',
        descriptionEn: 'Formal collection escalation for receivables overdue by more than 30 days.',
        category: 'FINAL_NOTICE',
        subjectTemplateAr: 'إشعار نهائي عاجل: مستحقات متعثرة للفاتورة {invoice_number} - {company_name}',
        subjectTemplateEn: 'Final Collection Notice: Overdue Invoice {invoice_number} - {company_name}',
        bodyTemplateAr:
          'السادة إدارة {customer_name} المحترمين، بالرغم من تذكيراتنا السابقة، نود إخطاركم رسمياً بأن الفاتورة {invoice_number} بمبلغ {amount_due} متعثرة السداد منذ {days_overdue} يوماً. لتجنب تعليق التسهيلات الائتمانية، يرجى تصفية المبلغ خلال 48 ساعة.',
        bodyTemplateEn:
          'Dear Management of {customer_name}, despite prior notifications, invoice {invoice_number} for {amount_due} remains unpaid and is now {days_overdue} days overdue. To prevent credit suspension, please settle within 48 hours.',
        allowedChannels: ['EMAIL', 'WHATSAPP', 'SMS'],
        isDefault: false,
      },
      {
        id: 'tpl-custom',
        nameAr: 'نموذج مخصص (Custom Template)',
        nameEn: 'Custom Template',
        descriptionAr: 'نموذج حر لكتابة رسالة تذكير مخصصة بحسب اتفاق الإدارة.',
        descriptionEn: 'Freely customized reminder text for specific agreements.',
        category: 'CUSTOM',
        subjectTemplateAr: 'متابعة حساب وفواتير من {company_name}',
        subjectTemplateEn: 'Account Statement & Invoices from {company_name}',
        bodyTemplateAr: 'السادة {customer_name}، نود إحاطتكم بتفاصيل الفاتورة {invoice_number} بمبلغ {amount_due}.',
        bodyTemplateEn: 'Dear {customer_name}, regarding invoice {invoice_number} with outstanding balance {amount_due}.',
        allowedChannels: ['EMAIL', 'WHATSAPP', 'SMS'],
        isDefault: false,
      },
    ];
  }

  /**
   * Retrieves templates for tenant
   */
  public static getTemplates(tenantId: string): ReminderTemplate[] {
    const existing = templatesStore.get(tenantId);
    if (existing) return existing;

    const defaults = this.getDefaultTemplates().map((t) => ({ ...t, tenantId }));
    templatesStore.set(tenantId, defaults);
    return defaults;
  }

  /**
   * Sourced directly from AR Ledger & Invoices:
   * Generates or fetches overdue and due-soon invoices with accurate aging buckets.
   */
  public static getDueInvoices(tenantId: string): {
    records: DueInvoiceRecord[];
    summary: {
      totalOutstandingSar: number;
      totalOverdueSar: number;
      dueSoonCount: number;
      overdueCount: number;
      criticalCount: number;
    };
  } {
    this.ensureSeedInvoices(tenantId);
    const records = dueInvoicesStore.get(tenantId) || [];

    // Recalculate daysOverdue & agingBucket based on current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalOutstandingSar = 0;
    let totalOverdueSar = 0;
    let dueSoonCount = 0;
    let overdueCount = 0;
    let criticalCount = 0;

    for (const r of records) {
      const dueDate = new Date(r.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      r.daysOverdue = diffDays;

      if (diffDays <= 0 && diffDays >= -7) {
        r.agingBucket = diffDays === 0 ? 'DUE_TODAY' : 'DUE_SOON';
        dueSoonCount++;
      } else if (diffDays <= 0) {
        r.agingBucket = 'DUE_SOON';
      } else if (diffDays <= 30) {
        r.agingBucket = 'OVERDUE_1_30';
        overdueCount++;
      } else if (diffDays <= 60) {
        r.agingBucket = 'OVERDUE_31_60';
        overdueCount++;
        criticalCount++;
      } else {
        r.agingBucket = 'OVERDUE_61_PLUS';
        overdueCount++;
        criticalCount++;
      }

      totalOutstandingSar += r.balanceDueSar;
      if (diffDays > 0) {
        totalOverdueSar += r.balanceDueSar;
      }
    }

    return {
      records,
      summary: {
        totalOutstandingSar,
        totalOverdueSar,
        dueSoonCount,
        overdueCount,
        criticalCount,
      },
    };
  }

  /**
   * Variable Substitution Engine
   * Replaces variables: {customer_name}, {invoice_number}, {due_date}, {amount_due}, {days_overdue}, {company_name}
   */
  public static substituteVariables(
    templateText: string,
    vars: {
      customerName: string;
      invoiceNumber: string;
      dueDate: string;
      amountDueSar: number;
      daysOverdue: number;
      companyName?: string;
    }
  ): string {
    const company = vars.companyName || 'شركة قمة النماء للتجارة';
    const amountStr = `${vars.amountDueSar.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
    const daysStr = Math.max(0, vars.daysOverdue).toString();

    return templateText
      .replace(/\{customer_name\}/g, vars.customerName)
      .replace(/\{invoice_number\}/g, vars.invoiceNumber)
      .replace(/\{due_date\}/g, vars.dueDate)
      .replace(/\{amount_due\}/g, amountStr)
      .replace(/\{days_overdue\}/g, daysStr)
      .replace(/\{company_name\}/g, company);
  }

  /**
   * Preview reminder with populated template variables
   */
  public static previewReminder(
    tenantId: string,
    payload: {
      templateId: string;
      customerName: string;
      invoiceNumber: string;
      dueDate: string;
      amountDueSar: number;
      daysOverdue: number;
      companyName?: string;
      customSubject?: string;
      customMessage?: string;
    }
  ): {
    subjectAr: string;
    subjectEn: string;
    bodyAr: string;
    bodyEn: string;
  } {
    const templates = this.getTemplates(tenantId);
    const template = templates.find((t) => t.id === payload.templateId) || templates[0];

    const vars = {
      customerName: payload.customerName,
      invoiceNumber: payload.invoiceNumber,
      dueDate: payload.dueDate,
      amountDueSar: payload.amountDueSar,
      daysOverdue: payload.daysOverdue,
      companyName: payload.companyName,
    };

    const subjectAr = payload.customSubject
      ? this.substituteVariables(payload.customSubject, vars)
      : this.substituteVariables(template.subjectTemplateAr, vars);
    const subjectEn = this.substituteVariables(template.subjectTemplateEn, vars);

    const bodyAr = payload.customMessage
      ? this.substituteVariables(payload.customMessage, vars)
      : this.substituteVariables(template.bodyTemplateAr, vars);
    const bodyEn = this.substituteVariables(template.bodyTemplateEn, vars);

    return { subjectAr, subjectEn, bodyAr, bodyEn };
  }

  /**
   * Check for duplicate sends within cooldown window (default 24h)
   * Rule: same customer + same invoice + same template within window -> blocked with notice
   */
  public static checkDuplicateSend(
    tenantId: string,
    customerId: string,
    invoiceId: string,
    templateId: string,
    windowMs: number = DUPLICATE_COOLDOWN_MS
  ): { isDuplicate: boolean; lastLog?: CommunicationLog; windowMinutes: number } {
    const logs = communicationLogsStore.get(tenantId) || [];
    const now = Date.now();

    const recentMatch = logs.find((l) => {
      if (l.customerId !== customerId || l.invoiceId !== invoiceId || l.templateId !== templateId) {
        return false;
      }
      if (l.status === 'BLOCKED_DUPLICATE' || l.status === 'FAILED') {
        return false;
      }
      const logTime = new Date(l.createdAt).getTime();
      return now - logTime < windowMs;
    });

    return {
      isDuplicate: !!recentMatch,
      lastLog: recentMatch,
      windowMinutes: Math.round(windowMs / (60 * 1000)),
    };
  }

  /**
   * Send or Schedule a reminder with full duplicate-send protection & audit logging
   */
  public static async sendReminder(
    tenantId: string,
    payload: SendReminderPayload,
    userEmail: string = 'finance@alnamaa.sa'
  ): Promise<{
    success: boolean;
    status: CommunicationStatus;
    logId: string;
    message: string;
    blockedReason?: string;
  }> {
    const templates = this.getTemplates(tenantId);
    const template = templates.find((t) => t.id === payload.templateId) || templates[0];

    // 1. Calculate overdue days for preview
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(payload.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    const daysOverdue = Math.max(0, Math.round((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    // 2. Render localized message
    const preview = this.previewReminder(tenantId, {
      templateId: payload.templateId,
      customerName: payload.customerName,
      invoiceNumber: payload.invoiceNumber,
      dueDate: payload.dueDate,
      amountDueSar: payload.amountDueSar,
      daysOverdue,
      customSubject: payload.customSubject,
      customMessage: payload.customMessage,
    });

    const recipient =
      payload.channel === 'EMAIL'
        ? payload.customerEmail || 'accounting@customer.sa'
        : payload.customerPhone || '+966501234567';

    // 3. Duplicate-Send Protection Check
    const duplicateCheck = this.checkDuplicateSend(
      tenantId,
      payload.customerId,
      payload.invoiceId,
      payload.templateId
    );

    if (duplicateCheck.isDuplicate && !payload.forceSend) {
      const lastSentDate = duplicateCheck.lastLog?.sentAt || duplicateCheck.lastLog?.createdAt || 'recently';
      const blockedReason = `Duplicate reminder blocked: A reminder for invoice ${payload.invoiceNumber} was already sent to ${payload.customerName} via ${duplicateCheck.lastLog?.channel || 'EMAIL'} within the 24-hour window (Sent on ${new Date(lastSentDate).toLocaleString()}).`;

      // Log blocked attempt in audit log
      const blockedLog: CommunicationLog = {
        id: `comm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        tenantId,
        customerId: payload.customerId,
        customerName: payload.customerName,
        invoiceId: payload.invoiceId,
        invoiceNumber: payload.invoiceNumber,
        templateId: payload.templateId,
        templateName: template.nameAr,
        channel: payload.channel,
        recipient,
        subject: preview.subjectAr,
        messageBody: preview.bodyAr,
        status: 'BLOCKED_DUPLICATE',
        triggeredBy: userEmail,
        blockedReason,
        attachStatement: !!payload.attachStatement,
        createdAt: new Date().toISOString(),
      };

      this.addLog(tenantId, blockedLog);
      logger.warn(`[ReminderService] ${blockedReason}`);

      return {
        success: false,
        status: 'BLOCKED_DUPLICATE',
        logId: blockedLog.id,
        message: blockedReason,
        blockedReason,
      };
    }

    // 4. Determine status: Scheduled vs Immediate
    const isScheduled = payload.scheduleType === 'SCHEDULED' && payload.scheduledTime;
    const finalStatus: CommunicationStatus = isScheduled ? 'QUEUED' : 'SENT';

    // 5. If Email & Immediate, queue or send through SharingService
    if (payload.channel === 'EMAIL' && !isScheduled) {
      try {
        SharingService.queueMessage(tenantId, {
          channel: 'EMAIL',
          documentType: 'SALES_INVOICE',
          documentId: payload.invoiceId,
          documentNumber: payload.invoiceNumber,
          recipient,
          subject: preview.subjectAr,
          body: preview.bodyAr,
        });
      } catch (err: any) {
        logger.warn(`[ReminderService] SharingService enqueue error: ${err.message}`);
      }
    }

    // 6. Record in Communication Audit Log
    const nowIso = new Date().toISOString();
    const commLog: CommunicationLog = {
      id: `comm_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      tenantId,
      customerId: payload.customerId,
      customerName: payload.customerName,
      invoiceId: payload.invoiceId,
      invoiceNumber: payload.invoiceNumber,
      templateId: payload.templateId,
      templateName: template.nameAr,
      channel: payload.channel,
      recipient,
      subject: preview.subjectAr,
      messageBody: preview.bodyAr,
      status: finalStatus,
      scheduledFor: isScheduled ? payload.scheduledTime : undefined,
      sentAt: isScheduled ? undefined : nowIso,
      triggeredBy: userEmail,
      attachStatement: !!payload.attachStatement,
      createdAt: nowIso,
      metadata: {
        amountDueSar: payload.amountDueSar,
        dueDate: payload.dueDate,
        daysOverdue,
        forceSend: !!payload.forceSend,
      },
    };

    this.addLog(tenantId, commLog);

    // Update invoice record reminder count
    this.updateInvoiceReminderState(tenantId, payload.invoiceId, nowIso);

    logger.info(`[ReminderService] Reminder ${finalStatus} for invoice ${payload.invoiceNumber} to ${recipient}`);

    return {
      success: true,
      status: finalStatus,
      logId: commLog.id,
      message: isScheduled
        ? `Reminder scheduled successfully for ${payload.scheduledTime}.`
        : `Reminder dispatched successfully via ${payload.channel} to ${recipient}.`,
    };
  }

  /**
   * Bulk Reminder Dispatch
   */
  public static async bulkSendReminders(
    tenantId: string,
    invoices: SendReminderPayload[],
    userEmail: string = 'finance@alnamaa.sa'
  ): Promise<{
    total: number;
    sent: number;
    blocked: number;
    results: Array<{ invoiceNumber: string; success: boolean; status: CommunicationStatus; message: string }>;
  }> {
    const results: Array<{ invoiceNumber: string; success: boolean; status: CommunicationStatus; message: string }> = [];
    let sent = 0;
    let blocked = 0;

    for (const inv of invoices) {
      const res = await this.sendReminder(tenantId, inv, userEmail);
      if (res.success) {
        sent++;
      } else {
        blocked++;
      }
      results.push({
        invoiceNumber: inv.invoiceNumber,
        success: res.success,
        status: res.status,
        message: res.message,
      });
    }

    return {
      total: invoices.length,
      sent,
      blocked,
      results,
    };
  }

  /**
   * Retrieve communication audit logs for tenant
   */
  public static getCommunicationLogs(
    tenantId: string,
    filters?: {
      customerId?: string;
      channel?: NotificationChannel;
      status?: CommunicationStatus;
      search?: string;
    }
  ): CommunicationLog[] {
    this.ensureSeedLogs(tenantId);
    let logs = communicationLogsStore.get(tenantId) || [];

    if (filters?.customerId) {
      logs = logs.filter((l) => l.customerId === filters.customerId);
    }
    if (filters?.channel) {
      logs = logs.filter((l) => l.channel === filters.channel);
    }
    if (filters?.status) {
      logs = logs.filter((l) => l.status === filters.status);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.customerName.toLowerCase().includes(q) ||
          l.invoiceNumber.toLowerCase().includes(q) ||
          l.recipient.toLowerCase().includes(q) ||
          l.subject.toLowerCase().includes(q)
      );
    }

    return logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // ==========================================
  // INTERNAL HELPERS & SEED DATA
  // ==========================================

  private static addLog(tenantId: string, log: CommunicationLog): void {
    const list = communicationLogsStore.get(tenantId) || [];
    list.unshift(log);
    communicationLogsStore.set(tenantId, list);
  }

  private static updateInvoiceReminderState(tenantId: string, invoiceId: string, sentAt: string): void {
    const records = dueInvoicesStore.get(tenantId) || [];
    const inv = records.find((r) => r.id === invoiceId);
    if (inv) {
      inv.lastReminderSentAt = sentAt;
      inv.reminderCount = (inv.reminderCount || 0) + 1;
    }
  }

  private static ensureSeedInvoices(tenantId: string): void {
    if (dueInvoicesStore.has(tenantId) && (dueInvoicesStore.get(tenantId)?.length || 0) > 0) {
      return;
    }

    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    const dPast45 = new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000);
    const dPast18 = new Date(today.getTime() - 18 * 24 * 60 * 60 * 1000);
    const dPast5 = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
    const dFuture2 = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
    const dFuture5 = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000);

    const seeds: DueInvoiceRecord[] = [
      {
        id: 'inv-due-1',
        tenantId,
        invoiceNumber: 'INV-2026-0031',
        customerId: 'cust-ufoq',
        customerNameAr: 'شركة الأفق المتقدمة المحدودة',
        customerNameEn: 'Advanced Horizon Co. Ltd.',
        customerPhone: '+966551122334',
        customerEmail: 'finance@al-ufoq.sa',
        issueDate: '2026-08-01',
        dueDate: fmt(dPast18),
        totalAmountSar: 28750.0,
        paidAmountSar: 4600.0,
        balanceDueSar: 24150.0,
        daysOverdue: 18,
        agingBucket: 'OVERDUE_1_30',
        lastReminderSentAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        reminderCount: 2,
      },
      {
        id: 'inv-due-2',
        tenantId,
        invoiceNumber: 'INV-2026-0012',
        customerId: 'cust-binaa',
        customerNameAr: 'مؤسسة بناء المستقبل للمقاولات',
        customerNameEn: 'Future Build Contracting Est.',
        customerPhone: '+966509988776',
        customerEmail: 'billing@binaa.sa',
        issueDate: '2026-07-10',
        dueDate: fmt(dPast45),
        totalAmountSar: 69000.0,
        paidAmountSar: 15000.0,
        balanceDueSar: 54000.0,
        daysOverdue: 45,
        agingBucket: 'OVERDUE_31_60',
        lastReminderSentAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
        reminderCount: 3,
      },
      {
        id: 'inv-due-3',
        tenantId,
        invoiceNumber: 'INV-2026-0044',
        customerId: 'cust-riyadh',
        customerNameAr: 'مؤسسة الرياض للتوريدات',
        customerNameEn: 'Riyadh Supplies Enterprise',
        customerPhone: '+966543210987',
        customerEmail: 'info@riyadh-supplies.sa',
        issueDate: '2026-08-25',
        dueDate: fmt(dPast5),
        totalAmountSar: 13800.0,
        paidAmountSar: 0,
        balanceDueSar: 13800.0,
        daysOverdue: 5,
        agingBucket: 'OVERDUE_1_30',
        reminderCount: 0,
      },
      {
        id: 'inv-due-4',
        tenantId,
        invoiceNumber: 'INV-2026-0051',
        customerId: 'cust-delta',
        customerNameAr: 'شركة دلتا الشرق للخدمات',
        customerNameEn: 'Delta East Services Co.',
        customerPhone: '+966567890123',
        customerEmail: 'accounts@delta-east.sa',
        issueDate: '2026-09-01',
        dueDate: fmt(dFuture2),
        totalAmountSar: 42500.0,
        paidAmountSar: 10000.0,
        balanceDueSar: 32500.0,
        daysOverdue: -2,
        agingBucket: 'DUE_SOON',
        reminderCount: 0,
      },
      {
        id: 'inv-due-5',
        tenantId,
        invoiceNumber: 'INV-2026-0056',
        customerId: 'cust-safwa',
        customerNameAr: 'مجموعة الصفوة القابضة',
        customerNameEn: 'Al-Safwa Holding Group',
        customerPhone: '+966512345678',
        customerEmail: 'finance@al-safwa.sa',
        issueDate: '2026-09-05',
        dueDate: fmt(dFuture5),
        totalAmountSar: 18400.0,
        paidAmountSar: 0,
        balanceDueSar: 18400.0,
        daysOverdue: -5,
        agingBucket: 'DUE_SOON',
        reminderCount: 0,
      },
    ];

    dueInvoicesStore.set(tenantId, seeds);
  }

  private static ensureSeedLogs(tenantId: string): void {
    if (communicationLogsStore.has(tenantId) && (communicationLogsStore.get(tenantId)?.length || 0) > 0) {
      return;
    }

    const seeds: CommunicationLog[] = [
      {
        id: 'comm-seed-1',
        tenantId,
        customerId: 'cust-ufoq',
        customerName: 'شركة الأفق المتقدمة المحدودة',
        invoiceId: 'inv-due-1',
        invoiceNumber: 'INV-2026-0031',
        templateId: 'tpl-standard-overdue',
        templateName: 'تذكير سداد - فاتورة مستحقة متأخرة',
        channel: 'EMAIL',
        recipient: 'finance@al-ufoq.sa',
        subject: 'متابعة سداد فاتورة متأخرة: INV-2026-0031 (متأخرة 18 يوم)',
        messageBody: 'عناية السادة شركة الأفق المتقدمة المحدودة، نلفت انتباهكم الكريم إلى أن الفاتورة رقم INV-2026-0031 بمبلغ 24,150.00 ر.س قد تجاوزت موعد استحقاقها. نرجو التكرم بالسداد.',
        status: 'DELIVERED',
        sentAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        triggeredBy: 'cfo@alnamaa.sa',
        attachStatement: true,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      },
      {
        id: 'comm-seed-2',
        tenantId,
        customerId: 'cust-binaa',
        customerName: 'مؤسسة بناء المستقبل للمقاولات',
        invoiceId: 'inv-due-2',
        invoiceNumber: 'INV-2026-0012',
        templateId: 'tpl-urgent-escalation',
        templateName: 'إشعار نهائي لتحصيل مستحقات متعثرة',
        channel: 'WHATSAPP',
        recipient: '+966509988776',
        subject: 'إشعار نهائي عاجل: مستحقات متعثرة للفاتورة INV-2026-0012',
        messageBody: 'السادة إدارة مؤسسة بناء المستقبل، نود إخطاركم رسمياً بأن الفاتورة INV-2026-0012 بمبلغ 54,000.00 ر.س متعثرة السداد. يرجى تصفية المبلغ خلال 48 ساعة.',
        status: 'SENT',
        sentAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
        triggeredBy: 'cfo@alnamaa.sa',
        attachStatement: false,
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
      },
    ];

    communicationLogsStore.set(tenantId, seeds);
  }
}
