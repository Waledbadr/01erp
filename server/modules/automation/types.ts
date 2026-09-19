/**
 * Automation Engine Types & Schemas — Saudi ERP Platform
 * Supporting Rule Engine, Nested Condition Trees, Action Pipelines, and Execution Audits.
 */

export type TriggerType =
  | 'document_created'
  | 'document_submitted'
  | 'document_approved'
  | 'document_posted'
  | 'payment_received'
  | 'low_stock_detected'
  | 'credit_limit_breached'
  | 'invoice_overdue'
  | 'zatca_failure'
  | 'backup_failure'
  | 'subscription_event';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'contains'
  | 'not_contains'
  | 'in_list'
  | 'not_in_list'
  | 'is_empty'
  | 'is_not_empty';

export interface SingleCondition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value: any;
}

export interface ConditionGroup {
  id: string;
  logicalOperator: 'AND' | 'OR';
  conditions: (SingleCondition | ConditionGroup)[];
}

export type ActionType =
  | 'send_notification'
  | 'send_email'
  | 'create_task'
  | 'create_draft_document'
  | 'change_status'
  | 'tag_record'
  | 'call_webhook'
  | 'delay_schedule';

export interface NotificationActionParams {
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  targetRoles?: string[];
  targetUserIds?: string[];
  deepLink?: {
    path: string;
    labelAr: string;
    labelEn: string;
  };
}

export interface EmailActionParams {
  to: string;
  subject: string;
  body: string;
  templateId?: string;
  cc?: string[];
}

export interface TaskActionParams {
  title: string;
  description: string;
  assignedToRole?: string;
  assignedToUserId?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  dueDaysOffset: number;
}

export interface DraftDocumentActionParams {
  documentType: 'PURCHASE_REQUEST' | 'EXPENSE_VOUCHER' | 'JOURNAL_ENTRY' | 'PAYMENT_REMINDER';
  title: string;
  details: Record<string, any>;
}

export interface ChangeStatusActionParams {
  entityType: 'INVOICE' | 'PURCHASE_BILL' | 'CUSTOMER' | 'ITEM' | 'PAYMENT';
  targetStatus: string;
  reason?: string;
}

export interface TagRecordActionParams {
  tagsToAdd: string[];
  tagsToRemove?: string[];
}

export interface WebhookActionParams {
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  secretKey?: string;
  signHmacSha256?: boolean;
  timeoutMs?: number;
  retryCount?: number;
}

export interface DelayScheduleActionParams {
  delayMinutes: number;
  scheduledFor?: string;
  nestedActionType: ActionType;
  nestedActionParams: Record<string, any>;
}

export interface AutomationAction {
  id: string;
  type: ActionType;
  params:
    | NotificationActionParams
    | EmailActionParams
    | TaskActionParams
    | DraftDocumentActionParams
    | ChangeStatusActionParams
    | TagRecordActionParams
    | WebhookActionParams
    | DelayScheduleActionParams
    | Record<string, any>;
  enabled: boolean;
  order: number;
}

export interface AutomationRule {
  id: string;
  tenantId: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  trigger: TriggerType;
  conditionTree: ConditionGroup;
  actions: AutomationAction[];
  enabled: boolean;
  priority: number; // 1 (lowest) to 100 (highest)
  effectiveWindow?: {
    validFrom?: string;
    validTo?: string;
  };
  retryPolicy: {
    maxAttempts: number;
    backoffMinutes: number;
    retryOnFailure: boolean;
  };
  stats: {
    totalRuns: number;
    successRuns: number;
    failedRuns: number;
    lastRunAt?: string;
    lastRunStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  };
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface ConditionEvaluationResult {
  conditionId: string;
  field: string;
  operator: ConditionOperator;
  expectedValue: any;
  actualValue: any;
  matched: boolean;
}

export interface ActionResultLog {
  actionId: string;
  actionType: ActionType;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'DELAYED';
  executionTimeMs: number;
  result?: any;
  error?: string;
  retryAttempt?: number;
}

export interface ExecutionHistoryLog {
  runId: string;
  ruleId: string;
  ruleNameAr: string;
  ruleNameEn: string;
  tenantId: string;
  trigger: TriggerType;
  triggerPayload: Record<string, any>;
  timestamp: string;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  conditionMatched: boolean;
  conditionTrace: ConditionEvaluationResult[];
  actionResults: ActionResultLog[];
  dryRun: boolean;
  errorDetails?: string;
}

export interface DryRunResponse {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  conditionTrace: ConditionEvaluationResult[];
  simulatedActions: Array<{
    actionType: ActionType;
    wouldExecute: boolean;
    description: string;
    previewPayload: Record<string, any>;
  }>;
  evaluatedAt: string;
}
