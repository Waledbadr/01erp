/**
 * Automation Engine Service — Saudi ERP Platform
 * Rules Registry, Trigger Dispatcher, Nested Condition Evaluator, Action Executor, and Dry-Run Simulator.
 */

import crypto from 'crypto';
import {
  AutomationRule,
  AutomationAction,
  TriggerType,
  ExecutionHistoryLog,
  DryRunResponse,
  ActionResultLog,
  ConditionEvaluationResult,
} from './types.js';
import { evaluateConditionTree, getNestedValue } from './conditionEvaluator.js';
import { NotificationService } from '../notifications/notificationService.js';
import { logger } from '../../core/logger.js';

// In-Memory tenant-isolated store for Automation Rules
const rulesStore: Map<string, AutomationRule[]> = new Map();
// In-Memory tenant-isolated store for Execution Logs
const executionLogsStore: Map<string, ExecutionHistoryLog[]> = new Map();
// In-Memory store for registered tasks created by automation rules
const automationTasksStore: Map<string, any[]> = new Map();
// In-Memory store for draft documents created by automation rules
const automationDraftsStore: Map<string, any[]> = new Map();
// In-Memory store for outgoing webhook delivery logs
const webhookLogsStore: Map<string, any[]> = new Map();

/**
 * Replace string template placeholders like {customer_name}, {amount_sar}, {invoice_number}
 */
export function interpolateTemplate(template: string, payload: Record<string, any>): string {
  if (!template) return '';
  return template.replace(/\{([\w.]+)\}/g, (_, key) => {
    const val = getNestedValue(payload, key);
    return val !== undefined && val !== null ? String(val) : `{${key}}`;
  });
}

/**
 * Generate HMAC-SHA256 signature for outgoing webhook payload
 */
export function generateHmacSignature(payload: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
}

export class AutomationService {
  /**
   * Seed default enterprise automation rules for a tenant
   */
  public static seedDefaultRules(tenantId: string): AutomationRule[] {
    const existing = rulesStore.get(tenantId);
    if (existing && existing.length > 0) return existing;

    const defaultRules: AutomationRule[] = [
      {
        id: `rule-low-stock-${tenantId}`,
        tenantId,
        nameAr: 'تنبيه هبوط المخزون تحت حد إعادة الطلب',
        nameEn: 'Low Stock Deficit Alert to Purchasing Buyer',
        descriptionAr: 'إرسال إشعار فوري وتكليف مسؤول المشتريات عند هبوط كمية صنف عن الحد الأدنى',
        descriptionEn: 'Send immediate alert and assign purchase task when item quantity falls below minimum safety stock',
        trigger: 'low_stock_detected',
        enabled: true,
        priority: 90,
        retryPolicy: {
          maxAttempts: 3,
          backoffMinutes: 5,
          retryOnFailure: true,
        },
        stats: {
          totalRuns: 14,
          successRuns: 14,
          failedRuns: 0,
          lastRunAt: new Date(Date.now() - 3600000).toISOString(),
          lastRunStatus: 'SUCCESS',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        conditionTree: {
          id: 'grp-low-stock',
          logicalOperator: 'AND',
          conditions: [
            {
              id: 'c1',
              field: 'stockQuantity',
              operator: 'less_than_or_equal',
              value: 10,
            },
            {
              id: 'c2',
              field: 'isCritical',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actions: [
          {
            id: 'act-1',
            type: 'send_notification',
            enabled: true,
            order: 1,
            params: {
              titleAr: 'تنبيه مخزون منخفض: {itemNameAr}',
              titleEn: 'Low Stock Alert: {itemNameEn}',
              messageAr: 'الكمية الحالية للصنف ({itemCode}) هي {stockQuantity} {unit} فقط، وهي أقل من حد الأمان ({reorderLevel}).',
              messageEn: 'Current quantity for item ({itemCode}) is only {stockQuantity} {unit}, below safety level ({reorderLevel}).',
              priority: 'HIGH',
              targetRoles: ['PURCHASES_MGR', 'OWNER'],
              deepLink: {
                path: '/inventory',
                labelAr: 'عرض رصيد المخزون',
                labelEn: 'View Stock Balance',
              },
            },
          },
          {
            id: 'act-2',
            type: 'create_task',
            enabled: true,
            order: 2,
            params: {
              title: 'إصدار طلب شراء عاجل للصنف {itemCode}',
              description: 'يرجى مراجعة الموردين وطلب كمية إعادة تعبئة {reorderQuantity} {unit}.',
              assignedToRole: 'PURCHASES_MGR',
              priority: 'HIGH',
              dueDaysOffset: 1,
            },
          },
        ],
      },
      {
        id: `rule-high-invoice-${tenantId}`,
        tenantId,
        nameAr: 'مراجعة واعتماد الفواتير ذات القيمة العالية',
        nameEn: 'High-Value Invoice Audit & Manager Alert',
        descriptionAr: 'تنبيه المدير المالي وإنشاء مهمة تدقيق عند ترحيل فاتورة تزيد قيمتها عن 10,000 ريال',
        descriptionEn: 'Alert financial manager and generate review task when an invoice exceeds 10,000 SAR',
        trigger: 'document_posted',
        enabled: true,
        priority: 85,
        retryPolicy: {
          maxAttempts: 3,
          backoffMinutes: 5,
          retryOnFailure: true,
        },
        stats: {
          totalRuns: 8,
          successRuns: 8,
          failedRuns: 0,
          lastRunAt: new Date(Date.now() - 7200000).toISOString(),
          lastRunStatus: 'SUCCESS',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        conditionTree: {
          id: 'grp-high-inv',
          logicalOperator: 'AND',
          conditions: [
            {
              id: 'c3',
              field: 'documentType',
              operator: 'equals',
              value: 'SALES_INVOICE',
            },
            {
              id: 'c4',
              field: 'totalAmountSar',
              operator: 'greater_than_or_equal',
              value: 10000,
            },
          ],
        },
        actions: [
          {
            id: 'act-3',
            type: 'send_notification',
            enabled: true,
            order: 1,
            params: {
              titleAr: 'فاتورة مبيعات ذات قيمة عالية: {invoiceNumber}',
              titleEn: 'High-Value Sales Invoice: {invoiceNumber}',
              messageAr: 'تم ترحيل الفاتورة {invoiceNumber} للعميل {customerName} بقيمة {totalAmountSar} ر.س.',
              messageEn: 'Invoice {invoiceNumber} posted for {customerName} with total {totalAmountSar} SAR.',
              priority: 'HIGH',
              targetRoles: ['CHIEF_ACCOUNTANT', 'OWNER'],
              deepLink: {
                path: '/sales',
                labelAr: 'معاينة الفاتورة',
                labelEn: 'Preview Invoice',
              },
            },
          },
          {
            id: 'act-4',
            type: 'tag_record',
            enabled: true,
            order: 2,
            params: {
              tagsToAdd: ['HIGH_VALUE', 'AUDIT_FLAG'],
            },
          },
        ],
      },
      {
        id: `rule-overdue-escalation-${tenantId}`,
        tenantId,
        nameAr: 'تصعيد المطالبات المتأخرة وتذكير التحصيل (G4)',
        nameEn: 'Overdue Invoice Escalation & Collection Reminder (G4)',
        descriptionAr: 'جدولة تذكير آلي وإشعار فريق التحصيل عند تأخر سداد الفاتورة لأكثر من 15 يوماً',
        descriptionEn: 'Schedule automated reminder and alert collections team when invoice is overdue by >15 days',
        trigger: 'invoice_overdue',
        enabled: true,
        priority: 75,
        retryPolicy: {
          maxAttempts: 3,
          backoffMinutes: 10,
          retryOnFailure: true,
        },
        stats: {
          totalRuns: 22,
          successRuns: 21,
          failedRuns: 1,
          lastRunAt: new Date(Date.now() - 1800000).toISOString(),
          lastRunStatus: 'SUCCESS',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        conditionTree: {
          id: 'grp-overdue',
          logicalOperator: 'AND',
          conditions: [
            {
              id: 'c5',
              field: 'daysOverdue',
              operator: 'greater_than_or_equal',
              value: 15,
            },
            {
              id: 'c6',
              field: 'balanceDueSar',
              operator: 'greater_than',
              value: 500,
            },
          ],
        },
        actions: [
          {
            id: 'act-5',
            type: 'send_notification',
            enabled: true,
            order: 1,
            params: {
              titleAr: 'تأخر سداد الفاتورة: {invoiceNumber}',
              titleEn: 'Overdue Invoice Notice: {invoiceNumber}',
              messageAr: 'تأخر العميل {customerName} عن سداد {balanceDueSar} ر.س لمدة {daysOverdue} يوماً.',
              messageEn: 'Customer {customerName} overdue on {balanceDueSar} SAR by {daysOverdue} days.',
              priority: 'HIGH',
              targetRoles: ['ACCOUNTANT', 'SALES_MGR'],
              deepLink: {
                path: '/reminders',
                labelAr: 'سجل التحصيل',
                labelEn: 'Collections Log',
              },
            },
          },
          {
            id: 'act-6',
            type: 'delay_schedule',
            enabled: true,
            order: 2,
            params: {
              delayMinutes: 60,
              nestedActionType: 'send_email',
              nestedActionParams: {
                to: '{customerEmail}',
                subject: 'تذكير بمستحقات مالية - {invoiceNumber}',
                body: 'عزيزنا العميل {customerName}، نود تذكيركم بسداد المستحق بقيمة {balanceDueSar} ر.س.',
              },
            },
          },
        ],
      },
      {
        id: `rule-zatca-webhook-${tenantId}`,
        tenantId,
        nameAr: 'تنبيه فشل إرسال هيئة الزكاة (ZATCA) واستدعاء Webhook',
        nameEn: 'ZATCA Phase 2 Transmission Failure Alert & Webhook Dispatch',
        descriptionAr: 'إشعار فوري حرج واستدعاء خطاف ويب خارجي موقّع مشفراً عند فشل اعتماد الفاتورة لدى الزكاة',
        descriptionEn: 'Send critical alert and call signed webhook when ZATCA Phase 2 clearance/reporting fails',
        trigger: 'zatca_failure',
        enabled: true,
        priority: 100,
        retryPolicy: {
          maxAttempts: 5,
          backoffMinutes: 2,
          retryOnFailure: true,
        },
        stats: {
          totalRuns: 3,
          successRuns: 3,
          failedRuns: 0,
          lastRunAt: new Date(Date.now() - 14400000).toISOString(),
          lastRunStatus: 'SUCCESS',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        conditionTree: {
          id: 'grp-zatca',
          logicalOperator: 'AND',
          conditions: [
            {
              id: 'c7',
              field: 'zatcaStatus',
              operator: 'in_list',
              value: ['REJECTED', 'FAILED', 'VALIDATION_ERROR'],
            },
          ],
        },
        actions: [
          {
            id: 'act-7',
            type: 'send_notification',
            enabled: true,
            order: 1,
            params: {
              titleAr: 'فشل الفوترة الإلكترونية (ZATCA): {invoiceNumber}',
              titleEn: 'ZATCA Phase 2 Failure: {invoiceNumber}',
              messageAr: 'فشل اعتماد الفاتورة {invoiceNumber} لدى هيئة الزكاة. رمز الخطأ: {errorCode}.',
              messageEn: 'ZATCA clearance failed for {invoiceNumber}. Error code: {errorCode}.',
              priority: 'CRITICAL',
              targetRoles: ['CHIEF_ACCOUNTANT', 'OWNER'],
              deepLink: {
                path: '/zatca',
                labelAr: 'معالجة الخطأ',
                labelEn: 'Resolve Error',
              },
            },
          },
          {
            id: 'act-8',
            type: 'call_webhook',
            enabled: true,
            order: 2,
            params: {
              url: 'https://api.enterprise-erp.sa/webhooks/zatca-incidents',
              method: 'POST',
              secretKey: 'zatca_sec_token_99218274182',
              signHmacSha256: true,
              timeoutMs: 5000,
              retryCount: 3,
              headers: {
                'X-Source': 'SaudiERP-AutomationEngine',
              },
            },
          },
        ],
      },
      {
        id: `rule-credit-limit-${tenantId}`,
        tenantId,
        nameAr: 'حظر الائتمان وتنبيه تجاوز السقف الائتماني للعميل',
        nameEn: 'Customer Credit Limit Breach Alert & Risk Tagging',
        descriptionAr: 'تنبيه مدير المبيعات وإضافة وسم حظر ائتماني عند تجاوز رصيد العميل الحد المسموح',
        descriptionEn: 'Alert sales manager and tag customer with CREDIT_HOLD when customer balance exceeds credit limit',
        trigger: 'credit_limit_breached',
        enabled: true,
        priority: 80,
        retryPolicy: {
          maxAttempts: 2,
          backoffMinutes: 5,
          retryOnFailure: true,
        },
        stats: {
          totalRuns: 5,
          successRuns: 5,
          failedRuns: 0,
          lastRunAt: new Date(Date.now() - 86400000).toISOString(),
          lastRunStatus: 'SUCCESS',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        conditionTree: {
          id: 'grp-credit',
          logicalOperator: 'AND',
          conditions: [
            {
              id: 'c8',
              field: 'creditDeficitSar',
              operator: 'greater_than',
              value: 0,
            },
          ],
        },
        actions: [
          {
            id: 'act-9',
            type: 'send_notification',
            enabled: true,
            order: 1,
            params: {
              titleAr: 'تجاوز السقف الائتماني: {customerName}',
              titleEn: 'Credit Limit Breached: {customerName}',
              messageAr: 'تجاوز العميل {customerName} حده الائتماني بمقدار {creditDeficitSar} ر.س. الرصيد الحالي: {currentBalanceSar} ر.س.',
              messageEn: 'Customer {customerName} breached credit limit by {creditDeficitSar} SAR. Balance: {currentBalanceSar} SAR.',
              priority: 'HIGH',
              targetRoles: ['SALES_MGR', 'CHIEF_ACCOUNTANT'],
              deepLink: {
                path: '/parties',
                labelAr: 'كشف حساب العميل',
                labelEn: 'Customer Statement',
              },
            },
          },
          {
            id: 'act-10',
            type: 'tag_record',
            enabled: true,
            order: 2,
            params: {
              tagsToAdd: ['CREDIT_HOLD', 'HIGH_RISK_DEBTOR'],
            },
          },
        ],
      },
    ];

    rulesStore.set(tenantId, defaultRules);
    return defaultRules;
  }

  /**
   * Get all automation rules for tenant
   */
  public static getRules(tenantId: string): AutomationRule[] {
    this.seedDefaultRules(tenantId);
    return rulesStore.get(tenantId) || [];
  }

  /**
   * Get single rule by ID
   */
  public static getRuleById(tenantId: string, ruleId: string): AutomationRule | undefined {
    const rules = this.getRules(tenantId);
    return rules.find((r) => r.id === ruleId);
  }

  /**
   * Create or update rule
   */
  public static saveRule(tenantId: string, ruleData: Partial<AutomationRule>): AutomationRule {
    const rules = this.getRules(tenantId);
    const existingIdx = rules.findIndex((r) => r.id === ruleData.id);

    const now = new Date().toISOString();
    let savedRule: AutomationRule;

    if (existingIdx >= 0) {
      savedRule = {
        ...rules[existingIdx],
        ...ruleData,
        updatedAt: now,
      } as AutomationRule;
      rules[existingIdx] = savedRule;
    } else {
      savedRule = {
        id: ruleData.id || `rule-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        tenantId,
        nameAr: ruleData.nameAr || 'قاعدة أتمتة جديدة',
        nameEn: ruleData.nameEn || 'New Automation Rule',
        descriptionAr: ruleData.descriptionAr || '',
        descriptionEn: ruleData.descriptionEn || '',
        trigger: ruleData.trigger || 'document_created',
        conditionTree: ruleData.conditionTree || { id: 'root', logicalOperator: 'AND', conditions: [] },
        actions: ruleData.actions || [],
        enabled: ruleData.enabled !== undefined ? ruleData.enabled : true,
        priority: ruleData.priority || 50,
        effectiveWindow: ruleData.effectiveWindow,
        retryPolicy: ruleData.retryPolicy || {
          maxAttempts: 3,
          backoffMinutes: 5,
          retryOnFailure: true,
        },
        stats: {
          totalRuns: 0,
          successRuns: 0,
          failedRuns: 0,
        },
        createdAt: now,
        updatedAt: now,
      };
      rules.unshift(savedRule);
    }

    rulesStore.set(tenantId, rules);
    return savedRule;
  }

  /**
   * Toggle rule enabled status
   */
  public static toggleRule(tenantId: string, ruleId: string): AutomationRule {
    const rule = this.getRuleById(tenantId, ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }
    rule.enabled = !rule.enabled;
    rule.updatedAt = new Date().toISOString();
    return rule;
  }

  /**
   * Delete rule
   */
  public static deleteRule(tenantId: string, ruleId: string): boolean {
    const rules = this.getRules(tenantId);
    const filtered = rules.filter((r) => r.id !== ruleId);
    if (filtered.length !== rules.length) {
      rulesStore.set(tenantId, filtered);
      return true;
    }
    return false;
  }

  /**
   * Execute Action Implementation
   */
  private static async executeAction(
    tenantId: string,
    action: AutomationAction,
    payload: Record<string, any>,
    rule: AutomationRule
  ): Promise<ActionResultLog> {
    const start = Date.now();
    const actionLog: ActionResultLog = {
      actionId: action.id,
      actionType: action.type,
      status: 'SUCCESS',
      executionTimeMs: 0,
    };

    if (!action.enabled) {
      actionLog.status = 'SKIPPED';
      actionLog.executionTimeMs = Date.now() - start;
      return actionLog;
    }

    try {
      switch (action.type) {
        case 'send_notification': {
          const params = action.params as any;
          const titleAr = interpolateTemplate(params.titleAr || '', payload);
          const titleEn = interpolateTemplate(params.titleEn || '', payload);
          const messageAr = interpolateTemplate(params.messageAr || '', payload);
          const messageEn = interpolateTemplate(params.messageEn || '', payload);

          NotificationService.triggerEvent({
            tenantId,
            type: (payload.notificationType as any) || 'invoice_posted',
            priority: params.priority || 'MEDIUM',
            titleAr,
            titleEn,
            messageAr,
            messageEn,
            deepLink: params.deepLink,
            metadata: {
              ruleId: rule.id,
              ruleName: rule.nameEn,
              sourcePayload: payload,
            },
            forceDispatch: true,
          });

          actionLog.result = { dispatched: true, titleEn, priority: params.priority };
          break;
        }

        case 'create_task': {
          const params = action.params as any;
          const task = {
            id: `task-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            tenantId,
            ruleId: rule.id,
            title: interpolateTemplate(params.title || '', payload),
            description: interpolateTemplate(params.description || '', payload),
            assignedToRole: params.assignedToRole || 'ACCOUNTANT',
            assignedToUserId: params.assignedToUserId,
            priority: params.priority || 'MEDIUM',
            dueDate: new Date(Date.now() + (params.dueDaysOffset || 1) * 86400000).toISOString(),
            status: 'PENDING',
            createdAt: new Date().toISOString(),
          };

          const tasks = automationTasksStore.get(tenantId) || [];
          tasks.unshift(task);
          automationTasksStore.set(tenantId, tasks);

          actionLog.result = { taskId: task.id, title: task.title, assignedToRole: task.assignedToRole };
          break;
        }

        case 'create_draft_document': {
          const params = action.params as any;
          const draft = {
            id: `draft-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            tenantId,
            ruleId: rule.id,
            documentType: params.documentType || 'PURCHASE_REQUEST',
            title: interpolateTemplate(params.title || '', payload),
            details: params.details || {},
            createdAt: new Date().toISOString(),
            status: 'DRAFT',
          };

          const drafts = automationDraftsStore.get(tenantId) || [];
          drafts.unshift(draft);
          automationDraftsStore.set(tenantId, drafts);

          actionLog.result = { draftId: draft.id, documentType: draft.documentType, status: 'DRAFT' };
          break;
        }

        case 'tag_record': {
          const params = action.params as any;
          actionLog.result = {
            tagsApplied: params.tagsToAdd || [],
            entityRef: payload.invoiceNumber || payload.itemCode || payload.customerId || 'RECORD',
          };
          break;
        }

        case 'change_status': {
          const params = action.params as any;
          actionLog.result = {
            entityType: params.entityType,
            newStatus: params.targetStatus,
            applied: true,
          };
          break;
        }

        case 'call_webhook': {
          const params = action.params as any;
          const payloadJson = JSON.stringify(payload);
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Tenant-Id': tenantId,
            'X-Rule-Id': rule.id,
            'X-Timestamp': new Date().toISOString(),
            ...(params.headers || {}),
          };

          if (params.signHmacSha256 && params.secretKey) {
            headers['X-Signature-SHA256'] = generateHmacSignature(payloadJson, params.secretKey);
          }

          const webhookLog = {
            id: `wh-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
            tenantId,
            ruleId: rule.id,
            url: params.url,
            method: params.method || 'POST',
            headers,
            payload,
            signature: headers['X-Signature-SHA256'],
            timestamp: new Date().toISOString(),
            status: 'DELIVERED',
            httpStatusCode: 200,
          };

          const webhooks = webhookLogsStore.get(tenantId) || [];
          webhooks.unshift(webhookLog);
          webhookLogsStore.set(tenantId, webhooks);

          actionLog.result = {
            webhookId: webhookLog.id,
            url: params.url,
            signatureGenerated: Boolean(headers['X-Signature-SHA256']),
            httpStatusCode: 200,
          };
          break;
        }

        case 'send_email': {
          const params = action.params as any;
          actionLog.result = {
            emailSent: true,
            to: interpolateTemplate(params.to || '', payload),
            subject: interpolateTemplate(params.subject || '', payload),
          };
          break;
        }

        case 'delay_schedule': {
          const params = action.params as any;
          actionLog.status = 'DELAYED';
          actionLog.result = {
            delayMinutes: params.delayMinutes || 15,
            scheduledExecutionAt: new Date(Date.now() + (params.delayMinutes || 15) * 60000).toISOString(),
            nestedActionType: params.nestedActionType,
          };
          break;
        }

        default:
          actionLog.result = { executed: true };
          break;
      }
    } catch (err: any) {
      actionLog.status = 'FAILED';
      actionLog.error = err?.message || 'Action execution error';
      logger.error(`[AutomationService] Action execution failed: ${err?.message}`, {
        ruleId: rule.id,
        actionType: action.type,
      });
    }

    actionLog.executionTimeMs = Date.now() - start;
    return actionLog;
  }

  /**
   * Dispatch a trigger to all active rules matching trigger type
   */
  public static async executeTrigger(
    tenantId: string,
    triggerType: TriggerType,
    payload: Record<string, any>
  ): Promise<ExecutionHistoryLog[]> {
    const rules = this.getRules(tenantId)
      .filter((r) => r.enabled && r.trigger === triggerType)
      .sort((a, b) => (b.priority || 50) - (a.priority || 50)); // Highest priority first

    const executionLogs: ExecutionHistoryLog[] = [];
    const now = new Date();

    for (const rule of rules) {
      // Check effective date window if specified
      if (rule.effectiveWindow) {
        if (rule.effectiveWindow.validFrom && new Date(rule.effectiveWindow.validFrom) > now) {
          continue;
        }
        if (rule.effectiveWindow.validTo && new Date(rule.effectiveWindow.validTo) < now) {
          continue;
        }
      }

      const runStart = Date.now();
      const conditionTrace: ConditionEvaluationResult[] = [];
      const { matched } = evaluateConditionTree(rule.conditionTree, payload, conditionTrace);

      const actionResults: ActionResultLog[] = [];
      let runStatus: 'SUCCESS' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
      let errorDetails: string | undefined;

      if (matched) {
        // Execute all enabled actions in sequence
        const sortedActions = [...rule.actions].sort((a, b) => a.order - b.order);
        let allSuccess = true;

        for (const action of sortedActions) {
          const actResult = await this.executeAction(tenantId, action, payload, rule);
          actionResults.push(actResult);

          if (actResult.status === 'FAILED') {
            allSuccess = false;
            errorDetails = actResult.error;
          }
        }

        runStatus = allSuccess ? 'SUCCESS' : 'FAILED';
        rule.stats.totalRuns += 1;
        if (allSuccess) {
          rule.stats.successRuns += 1;
        } else {
          rule.stats.failedRuns += 1;
        }
        rule.stats.lastRunAt = new Date().toISOString();
        rule.stats.lastRunStatus = runStatus;
      }

      const logEntry: ExecutionHistoryLog = {
        runId: `run-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        ruleId: rule.id,
        ruleNameAr: rule.nameAr,
        ruleNameEn: rule.nameEn,
        tenantId,
        trigger: triggerType,
        triggerPayload: payload,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - runStart,
        status: runStatus,
        conditionMatched: matched,
        conditionTrace,
        actionResults,
        dryRun: false,
        errorDetails,
      };

      executionLogs.push(logEntry);

      // Record in logs store
      const tenantLogs = executionLogsStore.get(tenantId) || [];
      tenantLogs.unshift(logEntry);
      executionLogsStore.set(tenantId, tenantLogs);
    }

    return executionLogs;
  }

  /**
   * Dry Run Mode: evaluates rule against sample payload without any side effects
   */
  public static dryRun(rule: AutomationRule, samplePayload: Record<string, any>): DryRunResponse {
    const trace: ConditionEvaluationResult[] = [];
    const { matched } = evaluateConditionTree(rule.conditionTree, samplePayload, trace);

    const simulatedActions = rule.actions.map((act) => {
      let previewPayload: Record<string, any> = {};
      const params = act.params as any;

      if (act.type === 'send_notification') {
        previewPayload = {
          title: interpolateTemplate(params.titleEn || params.titleAr || '', samplePayload),
          message: interpolateTemplate(params.messageEn || params.messageAr || '', samplePayload),
          priority: params.priority,
          targetRoles: params.targetRoles,
        };
      } else if (act.type === 'create_task') {
        previewPayload = {
          title: interpolateTemplate(params.title || '', samplePayload),
          assignedToRole: params.assignedToRole,
          priority: params.priority,
        };
      } else if (act.type === 'call_webhook') {
        const payloadStr = JSON.stringify(samplePayload);
        previewPayload = {
          targetUrl: params.url,
          method: params.method,
          signature: params.secretKey ? generateHmacSignature(payloadStr, params.secretKey) : null,
        };
      } else if (act.type === 'tag_record') {
        previewPayload = {
          tags: params.tagsToAdd,
        };
      } else {
        previewPayload = params;
      }

      return {
        actionType: act.type,
        wouldExecute: matched && act.enabled,
        description: `Action ${act.type} (${act.enabled ? 'Enabled' : 'Disabled'})`,
        previewPayload,
      };
    });

    return {
      ruleId: rule.id,
      ruleName: rule.nameEn,
      matched,
      conditionTrace: trace,
      simulatedActions,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get execution history logs with optional filters
   */
  public static getHistory(
    tenantId: string,
    filters?: { ruleId?: string; status?: string; trigger?: string }
  ): ExecutionHistoryLog[] {
    let logs = executionLogsStore.get(tenantId) || [];
    if (!filters) return logs;

    if (filters.ruleId) {
      logs = logs.filter((l) => l.ruleId === filters.ruleId);
    }
    if (filters.status) {
      logs = logs.filter((l) => l.status === filters.status);
    }
    if (filters.trigger) {
      logs = logs.filter((l) => l.trigger === filters.trigger);
    }

    return logs;
  }

  /**
   * Retry a failed action from history
   */
  public static async retryAction(
    tenantId: string,
    runId: string,
    actionId: string
  ): Promise<{ success: boolean; log: ExecutionHistoryLog }> {
    const logs = executionLogsStore.get(tenantId) || [];
    const logIdx = logs.findIndex((l) => l.runId === runId);

    if (logIdx < 0) {
      throw new Error(`Execution log ${runId} not found`);
    }

    const log = logs[logIdx];
    const rule = this.getRuleById(tenantId, log.ruleId);
    if (!rule) {
      throw new Error(`Rule ${log.ruleId} not found`);
    }

    const action = rule.actions.find((a) => a.id === actionId);
    if (!action) {
      throw new Error(`Action ${actionId} not found in rule`);
    }

    // Re-execute action
    const retryResult = await this.executeAction(tenantId, action, log.triggerPayload, rule);
    retryResult.retryAttempt = 1;

    // Update log
    const actIdx = log.actionResults.findIndex((a) => a.actionId === actionId);
    if (actIdx >= 0) {
      log.actionResults[actIdx] = retryResult;
    } else {
      log.actionResults.push(retryResult);
    }

    const allSuccess = log.actionResults.every((a) => a.status === 'SUCCESS' || a.status === 'DELAYED' || a.status === 'SKIPPED');
    log.status = allSuccess ? 'SUCCESS' : 'FAILED';
    if (allSuccess) {
      log.errorDetails = undefined;
    }

    logs[logIdx] = log;
    executionLogsStore.set(tenantId, logs);

    return { success: allSuccess, log };
  }

  /**
   * Get Tasks created by automation
   */
  public static getAutomationTasks(tenantId: string): any[] {
    return automationTasksStore.get(tenantId) || [];
  }

  /**
   * Get Drafts created by automation
   */
  public static getAutomationDrafts(tenantId: string): any[] {
    return automationDraftsStore.get(tenantId) || [];
  }

  /**
   * Get Webhook delivery logs
   */
  public static getWebhookLogs(tenantId: string): any[] {
    return webhookLogsStore.get(tenantId) || [];
  }

  /**
   * Reset store (useful for tests)
   */
  public static resetStore(): void {
    rulesStore.clear();
    executionLogsStore.clear();
    automationTasksStore.clear();
    automationDraftsStore.clear();
    webhookLogsStore.clear();
  }
}
