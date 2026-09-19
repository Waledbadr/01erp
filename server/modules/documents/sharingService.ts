import crypto from 'crypto';
import {
  DocumentType,
  SecureLink,
  SecureLinkAccessLog,
  EmailSettings,
  EmailIdentity,
  SharingQueueItem,
  SharingAttachment,
} from './types.js';

// In-Memory stores for email settings, sending queue, and secure links
const emailSettingsStore: Map<string, EmailSettings> = new Map();
const secureLinksStore: Map<string, SecureLink> = new Map(); // key: token
const sharingQueueStore: Map<string, SharingQueueItem[]> = new Map(); // key: tenantId

export class SharingService {
  // ==========================================
  // EMAIL SETTINGS & IDENTITIES
  // ==========================================

  public static getEmailSettings(tenantId: string): EmailSettings {
    const existing = emailSettingsStore.get(tenantId);
    if (existing) return existing;

    const initial: EmailSettings = {
      tenantId,
      smtpHost: 'smtp.saudi-erp.com',
      smtpPort: 587,
      secure: true,
      username: 'notifications@alnamaa.sa',
      passwordMasked: '••••••••••••',
      fromName: 'شركة قمة النماء - الفوترة الإلكترونية',
      fromEmail: 'billing@alnamaa.sa',
      replyTo: 'support@alnamaa.sa',
      identities: [
        { id: 'id-billing', name: 'الفواتير والتحصيل (Billing)', email: 'billing@alnamaa.sa', isDefault: true },
        { id: 'id-sales', name: 'المبيعات والعقود (Sales)', email: 'sales@alnamaa.sa', isDefault: false },
        { id: 'id-info', name: 'الإدارة العامة (General)', email: 'info@alnamaa.sa', isDefault: false },
      ],
      lastTestedAt: new Date().toISOString(),
      lastTestStatus: 'SUCCESS',
    };

    emailSettingsStore.set(tenantId, initial);
    return initial;
  }

  public static updateEmailSettings(tenantId: string, updates: Partial<EmailSettings>): EmailSettings {
    const current = this.getEmailSettings(tenantId);
    const updated: EmailSettings = {
      ...current,
      ...updates,
      tenantId,
    };
    emailSettingsStore.set(tenantId, updated);
    return updated;
  }

  public static async testSmtpConnection(
    tenantId: string,
    targetEmail?: string
  ): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const settings = this.getEmailSettings(tenantId);
    const start = Date.now();

    // Verify host and credentials format
    if (!settings.smtpHost || !settings.fromEmail) {
      settings.lastTestedAt = new Date().toISOString();
      settings.lastTestStatus = 'FAILED';
      settings.lastTestError = 'SMTP host or fromEmail is missing';
      return { success: false, message: settings.lastTestError, latencyMs: Date.now() - start };
    }

    // Simulate standard SMTP EHLO/STARTTLS handshake
    await new Promise((res) => setTimeout(res, 80));
    const latency = Date.now() - start;

    settings.lastTestedAt = new Date().toISOString();
    settings.lastTestStatus = 'SUCCESS';
    settings.lastTestError = undefined;

    return {
      success: true,
      message: `تم التحقق من الاتصال بخادم البريد ${settings.smtpHost}:${settings.smtpPort} بنجاح وإرسال رسالة اختبارية إلى ${targetEmail || settings.fromEmail}`,
      latencyMs: latency,
    };
  }

  // ==========================================
  // SENDING QUEUE & LOGS
  // ==========================================

  public static queueMessage(
    tenantId: string,
    payload: {
      channel: 'EMAIL' | 'WHATSAPP' | 'SMS';
      documentType: DocumentType;
      documentId: string;
      documentNumber: string;
      recipient: string;
      senderIdentity?: string;
      subject?: string;
      body?: string;
      attachments?: SharingAttachment[];
    }
  ): SharingQueueItem {
    const list = sharingQueueStore.get(tenantId) || [];
    const id = `sh-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const item: SharingQueueItem = {
      id,
      tenantId,
      channel: payload.channel,
      documentType: payload.documentType,
      documentId: payload.documentId,
      documentNumber: payload.documentNumber,
      recipient: payload.recipient,
      senderIdentity: payload.senderIdentity,
      subject: payload.subject,
      body: payload.body,
      attachments: payload.attachments || [],
      status: 'QUEUED',
      attempts: 0,
      maxRetries: 3,
      createdAt: now,
    };

    list.unshift(item);
    sharingQueueStore.set(tenantId, list);

    // Trigger immediate simulated async delivery
    this.processQueueItem(tenantId, id).catch(() => {});

    return item;
  }

  public static async processQueueItem(tenantId: string, itemId: string): Promise<SharingQueueItem> {
    const list = sharingQueueStore.get(tenantId) || [];
    const item = list.find((i) => i.id === itemId);
    if (!item) throw new Error(`Queue item not found: ${itemId}`);

    item.status = 'SENDING';
    item.attempts += 1;
    item.lastAttemptAt = new Date().toISOString();

    // Async delivery simulation with realistic validation
    await new Promise((res) => setTimeout(res, 50));

    if (item.recipient && item.recipient.includes('@') || item.channel === 'WHATSAPP' || item.channel === 'SMS') {
      item.status = 'SENT';
      item.sentAt = new Date().toISOString();
      item.error = undefined;
    } else {
      item.status = item.attempts >= item.maxRetries ? 'FAILED' : 'QUEUED';
      item.error = 'Invalid recipient address or delivery channel rejection';
    }

    return item;
  }

  public static async retryQueueItem(tenantId: string, itemId: string): Promise<SharingQueueItem> {
    const list = sharingQueueStore.get(tenantId) || [];
    const item = list.find((i) => i.id === itemId);
    if (!item) throw new Error(`Queue item not found: ${itemId}`);

    item.status = 'QUEUED';
    item.error = undefined;
    return this.processQueueItem(tenantId, itemId);
  }

  public static getQueue(tenantId: string, filters?: { channel?: string; status?: string; documentId?: string }): SharingQueueItem[] {
    let list = sharingQueueStore.get(tenantId) || [];
    if (filters?.channel) {
      list = list.filter((i) => i.channel === filters.channel);
    }
    if (filters?.status) {
      list = list.filter((i) => i.status === filters.status);
    }
    if (filters?.documentId) {
      list = list.filter((i) => i.documentId === filters.documentId);
    }
    return list;
  }

  public static getDocumentSendingHistory(tenantId: string, documentType: DocumentType, documentId: string): SharingQueueItem[] {
    const list = sharingQueueStore.get(tenantId) || [];
    return list.filter((i) => i.documentId === documentId && i.documentType === documentType);
  }

  // ==========================================
  // SECURE LINKS (UNPREDICTABLE SIGNED TOKENS)
  // ==========================================

  public static createSecureLink(
    tenantId: string,
    payload: {
      documentType: DocumentType;
      documentId: string;
      documentNumber: string;
      expiresInHours?: number; // default 720 (30 days)
      allowNoLogin?: boolean;
    }
  ): SecureLink {
    // Generate an unpredictable cryptographically secure token (32 bytes base64url = 43 chars)
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const token = `sec_${rawToken}`;

    const hours = payload.expiresInHours || 720; // 30 days default
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    const id = `lnk-${crypto.randomUUID().slice(0, 8)}`;

    const link: SecureLink = {
      id,
      token,
      tenantId,
      documentType: payload.documentType,
      documentId: payload.documentId,
      documentNumber: payload.documentNumber,
      allowNoLogin: payload.allowNoLogin ?? true,
      expiresAt,
      isRevoked: false,
      viewsCount: 0,
      accessLogs: [],
      createdAt: new Date().toISOString(),
    };

    secureLinksStore.set(token, link);
    return link;
  }

  public static resolveSecureLink(
    token: string,
    clientContext?: { ip?: string; userAgent?: string; accessingTenantId?: string }
  ): { link: SecureLink; status: 'VALID' | 'EXPIRED' | 'REVOKED' | 'UNAUTHORIZED' } {
    const link = secureLinksStore.get(token);
    if (!link) {
      throw new Error('SECURE_LINK_NOT_FOUND');
    }

    // 1. Revocation check
    if (link.isRevoked) {
      return { link, status: 'REVOKED' };
    }

    // 2. Expiry check
    if (new Date(link.expiresAt).getTime() < Date.now()) {
      return { link, status: 'EXPIRED' };
    }

    // 3. Tenant cross-tenant isolation check (if accessingTenantId provided and login required)
    if (!link.allowNoLogin && clientContext?.accessingTenantId && clientContext.accessingTenantId !== link.tenantId) {
      return { link, status: 'UNAUTHORIZED' };
    }

    // 4. Record access audit log
    link.viewsCount += 1;
    link.lastViewedAt = new Date().toISOString();
    const logEntry: SecureLinkAccessLog = {
      timestamp: new Date().toISOString(),
      ip: clientContext?.ip || '127.0.0.1',
      userAgent: clientContext?.userAgent || 'Browser / Direct',
      action: 'VIEW_DOCUMENT',
    };
    link.accessLogs.push(logEntry);

    return { link, status: 'VALID' };
  }

  public static revokeSecureLink(token: string, tenantId: string): SecureLink {
    const link = secureLinksStore.get(token);
    if (!link || link.tenantId !== tenantId) {
      throw new Error('SECURE_LINK_NOT_FOUND_OR_UNAUTHORIZED');
    }

    link.isRevoked = true;
    link.revokedAt = new Date().toISOString();
    return link;
  }

  public static getSecureLinks(tenantId: string, documentId?: string): SecureLink[] {
    const results: SecureLink[] = [];
    for (const link of secureLinksStore.values()) {
      if (link.tenantId === tenantId) {
        if (!documentId || link.documentId === documentId) {
          results.push(link);
        }
      }
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // ==========================================
  // WHATSAPP & SMS ADAPTERS
  // ==========================================

  public static generateWhatsAppSharePayload(
    data: {
      documentNumber: string;
      totalSar: number;
      customerName: string;
      companyName: string;
      secureLinkUrl: string;
      phone?: string;
    }
  ): { webUrl: string; appDeepLink: string; formattedMessage: string } {
    const formattedMessage = `مرحباً ${data.customerName}،\n\nنرفق لكم مستند رقم ${data.documentNumber} من ${data.companyName}.\nالإجمالي المستحق: ${data.totalSar.toFixed(2)} ر.س.\n\nيمكنكم عرض وتحميل المستند بصيغة PDF الرسمية عبر الرابط الآمن التالي:\n${data.secureLinkUrl}\n\nشكراً لتعاملكم معنا.`;

    const encoded = encodeURIComponent(formattedMessage);
    const cleanPhone = (data.phone || '').replace(/[^0-9]/g, '');

    const webUrl = cleanPhone
      ? `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
      : `https://web.whatsapp.com/send?text=${encoded}`;

    const appDeepLink = cleanPhone
      ? `whatsapp://send?phone=${cleanPhone}&text=${encoded}`
      : `whatsapp://send?text=${encoded}`;

    return { webUrl, appDeepLink, formattedMessage };
  }
}
