import React, { useState, useEffect } from 'react';
import {
  Zap,
  Plus,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
  Search,
  ChevronRight,
  ChevronDown,
  Trash2,
  Copy,
  Edit3,
  RefreshCw,
  Bell,
  Mail,
  CheckSquare,
  FileText,
  Tag,
  Webhook,
  Calendar,
  Layers,
  Shield,
  Boxes,
  FileCheck,
  Send,
  Sliders,
  Code2,
  Eye,
  ArrowRight,
  Sparkles,
  Info,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { useToast } from '../ui/Toast.js';
import {
  AutomationRule,
  TriggerType,
  ActionType,
  ConditionOperator,
  SingleCondition,
  ConditionGroup,
  ExecutionHistoryLog,
  DryRunResponse,
  AVAILABLE_FIELDS,
  TRIGGER_METADATA,
  ACTION_METADATA,
  apiFetchRules,
  apiSaveRule,
  apiToggleRule,
  apiDeleteRule,
  apiDryRun,
  apiTriggerEvent,
  apiFetchHistory,
  apiRetryAction,
  apiFetchSamplePayloads,
} from '../../lib/automation.js';

interface AutomationEngineViewProps {
  onNavigate?: (route: string) => void;
  initialTab?: 'rules' | 'builder' | 'history' | 'simulator';
}

export const AutomationEngineView: React.FC<AutomationEngineViewProps> = ({
  onNavigate,
  initialTab = 'rules',
}) => {
  const { language } = useI18n();
  const isAr = language === 'ar';
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const [activeTab, setActiveTab] = useState<'rules' | 'builder' | 'history' | 'simulator'>(initialTab);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [historyLogs, setHistoryLogs] = useState<ExecutionHistoryLog[]>([]);
  const [samplePayloads, setSamplePayloads] = useState<Record<TriggerType, Record<string, any>>>({} as any);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters for Rules List
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTriggerFilter, setSelectedTriggerFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // Filters for History
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>('ALL');
  const [historyRuleFilter, setHistoryRuleFilter] = useState<string>('ALL');
  const [selectedLogDetail, setSelectedLogDetail] = useState<ExecutionHistoryLog | null>(null);

  // Rule Builder State
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [builderNameAr, setBuilderNameAr] = useState<string>('');
  const [builderNameEn, setBuilderNameEn] = useState<string>('');
  const [builderDescAr, setBuilderDescAr] = useState<string>('');
  const [builderDescEn, setBuilderDescEn] = useState<string>('');
  const [builderTrigger, setBuilderTrigger] = useState<TriggerType>('low_stock_detected');
  const [builderPriority, setBuilderPriority] = useState<number>(80);
  const [builderConditionTree, setBuilderConditionTree] = useState<ConditionGroup>({
    id: 'root',
    logicalOperator: 'AND',
    conditions: [
      {
        id: 'c1',
        field: 'stockQuantity',
        operator: 'less_than_or_equal',
        value: 10,
      },
    ],
  });
  const [builderActions, setBuilderActions] = useState<any[]>([
    {
      id: 'act-1',
      type: 'send_notification',
      enabled: true,
      order: 1,
      params: {
        titleAr: 'تنبيه مخزون منخفض: {itemNameAr}',
        titleEn: 'Low Stock Alert: {itemNameEn}',
        messageAr: 'الكمية الحالية للصنف ({itemCode}) هي {stockQuantity} فقط.',
        messageEn: 'Current quantity for item ({itemCode}) is only {stockQuantity}.',
        priority: 'HIGH',
        targetRoles: ['PURCHASES_MGR'],
      },
    },
  ]);
  const [builderMaxAttempts, setBuilderMaxAttempts] = useState<number>(3);
  const [builderBackoffMinutes, setBuilderBackoffMinutes] = useState<number>(5);

  // Dry Run State
  const [dryRunModalOpen, setDryRunModalOpen] = useState<boolean>(false);
  const [dryRunRule, setDryRunRule] = useState<AutomationRule | null>(null);
  const [dryRunPayloadJson, setDryRunPayloadJson] = useState<string>('{}');
  const [dryRunResult, setDryRunResult] = useState<DryRunResponse | null>(null);
  const [isDryRunning, setIsDryRunning] = useState<boolean>(false);

  // Simulator State
  const [simTrigger, setSimTrigger] = useState<TriggerType>('low_stock_detected');
  const [simPayloadJson, setSimPayloadJson] = useState<string>('{}');
  const [simResults, setSimResults] = useState<ExecutionHistoryLog[]>([]);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Load Data
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [fetchedRules, fetchedLogs, fetchedSamples] = await Promise.all([
        apiFetchRules(),
        apiFetchHistory(),
        apiFetchSamplePayloads(),
      ]);
      setRules(fetchedRules);
      setHistoryLogs(fetchedLogs);
      setSamplePayloads(fetchedSamples);

      if (fetchedSamples && fetchedSamples[simTrigger]) {
        setSimPayloadJson(JSON.stringify(fetchedSamples[simTrigger], null, 2));
      }
    } catch (err: any) {
      toastError(isAr ? 'حدث خطأ أثناء تحميل بيانات الأتمتة' : 'Failed to load automation data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Update simulator payload when trigger changes
  useEffect(() => {
    if (samplePayloads[simTrigger]) {
      setSimPayloadJson(JSON.stringify(samplePayloads[simTrigger], null, 2));
    }
  }, [simTrigger, samplePayloads]);

  // Handle Toggle Rule
  const handleToggleRule = async (ruleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await apiToggleRule(ruleId);
      setRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)));
      toastSuccess(
        isAr
          ? `تم ${updated.enabled ? 'تفعيل' : 'تعطيل'} القاعدة بنجاح`
          : `Rule ${updated.enabled ? 'enabled' : 'disabled'} successfully`
      );
    } catch (err: any) {
      toastError(err.message);
    }
  };

  // Handle Delete Rule
  const handleDeleteRule = async (ruleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(isAr ? 'هل أنت متأكد من حذف هذه القاعدة نهائياً؟' : 'Are you sure you want to delete this rule?')) {
      return;
    }
    try {
      const ok = await apiDeleteRule(ruleId);
      if (ok) {
        setRules((prev) => prev.filter((r) => r.id !== ruleId));
        toastSuccess(isAr ? 'تم حذف القاعدة بنجاح' : 'Rule deleted successfully');
      }
    } catch (err: any) {
      toastError(err.message);
    }
  };

  // Open Builder for New Rule
  const handleCreateNewRule = () => {
    setEditingRuleId(null);
    setBuilderNameAr('قاعدة أتمتة مخصصة');
    setBuilderNameEn('Custom Automation Rule');
    setBuilderDescAr('توصيف مختصر لإجراءات القاعدة وشروطها');
    setBuilderDescEn('Brief description of rule triggers and conditions');
    setBuilderTrigger('document_posted');
    setBuilderPriority(70);
    setBuilderConditionTree({
      id: 'root',
      logicalOperator: 'AND',
      conditions: [
        {
          id: `c-${Date.now()}`,
          field: 'totalAmountSar',
          operator: 'greater_than_or_equal',
          value: 10000,
        },
      ],
    });
    setBuilderActions([
      {
        id: `act-${Date.now()}`,
        type: 'send_notification',
        enabled: true,
        order: 1,
        params: {
          titleAr: 'ترحيل فاتورة ذات قيمة عالية: {invoiceNumber}',
          titleEn: 'High Value Invoice Posted: {invoiceNumber}',
          messageAr: 'تم ترحيل الفاتورة {invoiceNumber} بقيمة {totalAmountSar} ر.س.',
          messageEn: 'Invoice {invoiceNumber} posted with total {totalAmountSar} SAR.',
          priority: 'HIGH',
          targetRoles: ['CHIEF_ACCOUNTANT', 'OWNER'],
        },
      },
    ]);
    setActiveTab('builder');
  };

  // Open Builder for Existing Rule
  const handleEditRule = (rule: AutomationRule) => {
    setEditingRuleId(rule.id);
    setBuilderNameAr(rule.nameAr);
    setBuilderNameEn(rule.nameEn);
    setBuilderDescAr(rule.descriptionAr || '');
    setBuilderDescEn(rule.descriptionEn || '');
    setBuilderTrigger(rule.trigger);
    setBuilderPriority(rule.priority || 50);
    setBuilderConditionTree(JSON.parse(JSON.stringify(rule.conditionTree)));
    setBuilderActions(JSON.parse(JSON.stringify(rule.actions)));
    setBuilderMaxAttempts(rule.retryPolicy?.maxAttempts || 3);
    setBuilderBackoffMinutes(rule.retryPolicy?.backoffMinutes || 5);
    setActiveTab('builder');
  };

  // Duplicate Rule
  const handleDuplicateRule = (rule: AutomationRule, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: Partial<AutomationRule> = {
      nameAr: `${rule.nameAr} (نسخة)`,
      nameEn: `${rule.nameEn} (Copy)`,
      descriptionAr: rule.descriptionAr,
      descriptionEn: rule.descriptionEn,
      trigger: rule.trigger,
      priority: rule.priority,
      conditionTree: JSON.parse(JSON.stringify(rule.conditionTree)),
      actions: JSON.parse(JSON.stringify(rule.actions)),
      enabled: false,
    };
    handleEditRule({ ...rule, ...duplicated, id: '' } as AutomationRule);
    toastInfo(isAr ? 'تم نسخ القاعدة إلى المحرر' : 'Rule copied to editor');
  };

  // Save Rule from Builder
  const handleSaveRuleFromBuilder = async () => {
    if (!builderNameAr.trim() || !builderNameEn.trim()) {
      toastError(isAr ? 'يرجى إدخال اسم القاعدة بالعربية والإنجليزية' : 'Please provide rule names in Arabic and English');
      return;
    }

    try {
      const payload: Partial<AutomationRule> = {
        id: editingRuleId || undefined,
        nameAr: builderNameAr,
        nameEn: builderNameEn,
        descriptionAr: builderDescAr,
        descriptionEn: builderDescEn,
        trigger: builderTrigger,
        priority: builderPriority,
        conditionTree: builderConditionTree,
        actions: builderActions,
        enabled: true,
        retryPolicy: {
          maxAttempts: builderMaxAttempts,
          backoffMinutes: builderBackoffMinutes,
          retryOnFailure: true,
        },
      };

      const saved = await apiSaveRule(payload);
      toastSuccess(isAr ? 'تم حفظ قاعدة الأتمتة بنجاح' : 'Automation rule saved successfully');
      await loadAllData();
      setActiveTab('rules');
    } catch (err: any) {
      toastError(err.message || 'Failed to save rule');
    }
  };

  // Open Dry Run Modal
  const handleOpenDryRun = (rule: AutomationRule, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDryRunRule(rule);
    const sample = samplePayloads[rule.trigger] || {
      stockQuantity: 5,
      totalAmountSar: 15000,
      daysOverdue: 20,
      zatcaStatus: 'REJECTED',
    };
    setDryRunPayloadJson(JSON.stringify(sample, null, 2));
    setDryRunResult(null);
    setDryRunModalOpen(true);
  };

  // Execute Dry Run
  const handleExecuteDryRun = async () => {
    if (!dryRunRule) return;
    setIsDryRunning(true);
    try {
      const parsedPayload = JSON.parse(dryRunPayloadJson);
      const res = await apiDryRun(dryRunRule, parsedPayload);
      setDryRunResult(res);
      if (res.matched) {
        toastSuccess(isAr ? 'تمت مطابقة الشروط بنجاح — الإجراءات جاهزة للتنفيذ' : 'Conditions matched — Actions ready to execute');
      } else {
        toastInfo(isAr ? 'لم تتطابق الشروط مع عينة البيانات' : 'Conditions did not match sample payload');
      }
    } catch (err: any) {
      toastError(isAr ? 'صيغة JSON غير صحيحة أو حدث خطأ' : 'Invalid JSON or dry-run error');
    } finally {
      setIsDryRunning(false);
    }
  };

  // Fire Simulator Trigger
  const handleFireSimulatorTrigger = async () => {
    setIsSimulating(true);
    try {
      const parsedPayload = JSON.parse(simPayloadJson);
      const logs = await apiTriggerEvent(simTrigger, parsedPayload);
      setSimResults(logs);
      toastSuccess(
        isAr
          ? `تم إطلاق الحدث (${logs.length} قواعد تم تقييمها)`
          : `Trigger fired (${logs.length} rules evaluated)`
      );
      // Reload history
      const updatedLogs = await apiFetchHistory();
      setHistoryLogs(updatedLogs);
    } catch (err: any) {
      toastError(err.message || 'Simulation trigger failed');
    } finally {
      setIsSimulating(false);
    }
  };

  // Retry Failed Action
  const handleRetryAction = async (runId: string, actionId: string) => {
    try {
      const res = await apiRetryAction(runId, actionId);
      toastSuccess(isAr ? 'تمت إعادة تنفيذ الإجراء بنجاح' : 'Action retried successfully');
      await loadAllData();
      if (selectedLogDetail && selectedLogDetail.runId === runId) {
        setSelectedLogDetail(res.log);
      }
    } catch (err: any) {
      toastError(err.message || 'Retry failed');
    }
  };

  // Condition Tree Builder Helper Functions
  const addConditionToGroup = (groupId: string) => {
    const newCond: SingleCondition = {
      id: `c-${Date.now()}`,
      field: 'totalAmountSar',
      operator: 'greater_than_or_equal',
      value: 1000,
    };

    const updateGroup = (grp: ConditionGroup): ConditionGroup => {
      if (grp.id === groupId) {
        return { ...grp, conditions: [...grp.conditions, newCond] };
      }
      return {
        ...grp,
        conditions: grp.conditions.map((item) => {
          if ('logicalOperator' in item) {
            return updateGroup(item as ConditionGroup);
          }
          return item;
        }),
      };
    };

    setBuilderConditionTree(updateGroup(builderConditionTree));
  };

  const addSubGroupToGroup = (groupId: string) => {
    const newSubGroup: ConditionGroup = {
      id: `grp-${Date.now()}`,
      logicalOperator: 'AND',
      conditions: [
        {
          id: `c-${Date.now()}`,
          field: 'branchId',
          operator: 'equals',
          value: 'BR-RYD',
        },
      ],
    };

    const updateGroup = (grp: ConditionGroup): ConditionGroup => {
      if (grp.id === groupId) {
        return { ...grp, conditions: [...grp.conditions, newSubGroup] };
      }
      return {
        ...grp,
        conditions: grp.conditions.map((item) => {
          if ('logicalOperator' in item) {
            return updateGroup(item as ConditionGroup);
          }
          return item;
        }),
      };
    };

    setBuilderConditionTree(updateGroup(builderConditionTree));
  };

  const removeConditionOrGroup = (targetId: string) => {
    const filterGroup = (grp: ConditionGroup): ConditionGroup => {
      return {
        ...grp,
        conditions: grp.conditions
          .filter((item) => item.id !== targetId)
          .map((item) => {
            if ('logicalOperator' in item) {
              return filterGroup(item as ConditionGroup);
            }
            return item;
          }),
      };
    };

    setBuilderConditionTree(filterGroup(builderConditionTree));
  };

  const updateSingleCondition = (condId: string, updates: Partial<SingleCondition>) => {
    const updateInGroup = (grp: ConditionGroup): ConditionGroup => {
      return {
        ...grp,
        conditions: grp.conditions.map((item) => {
          if ('logicalOperator' in item) {
            return updateInGroup(item as ConditionGroup);
          }
          if (item.id === condId) {
            return { ...(item as SingleCondition), ...updates };
          }
          return item;
        }),
      };
    };

    setBuilderConditionTree(updateInGroup(builderConditionTree));
  };

  const updateGroupOperator = (groupId: string, operator: 'AND' | 'OR') => {
    const updateInGroup = (grp: ConditionGroup): ConditionGroup => {
      if (grp.id === groupId) {
        return { ...grp, logicalOperator: operator };
      }
      return {
        ...grp,
        conditions: grp.conditions.map((item) => {
          if ('logicalOperator' in item) {
            return updateInGroup(item as ConditionGroup);
          }
          return item;
        }),
      };
    };

    setBuilderConditionTree(updateInGroup(builderConditionTree));
  };

  // Add Action Helper
  const handleAddAction = (type: ActionType) => {
    let defaultParams: any = {};
    if (type === 'send_notification') {
      defaultParams = {
        titleAr: 'إشعار أتمتة جديد',
        titleEn: 'New Automation Alert',
        messageAr: 'تم تنفيذ قاعدة الأتمتة بنجاح.',
        messageEn: 'Automation rule executed successfully.',
        priority: 'MEDIUM',
        targetRoles: ['OWNER', 'CHIEF_ACCOUNTANT'],
      };
    } else if (type === 'send_email') {
      defaultParams = {
        to: '{customerEmail}',
        subject: 'إشعار من النظام - {documentNumber}',
        body: 'مرحباً، نود إحاطتكم بتحديث المعاملة.',
      };
    } else if (type === 'create_task') {
      defaultParams = {
        title: 'مهمة متابعة آلية',
        description: 'يرجى مراجعة المستند أو الصنف.',
        assignedToRole: 'ACCOUNTANT',
        priority: 'MEDIUM',
        dueDaysOffset: 2,
      };
    } else if (type === 'call_webhook') {
      defaultParams = {
        url: 'https://api.external-system.com/webhook',
        method: 'POST',
        signHmacSha256: true,
        secretKey: 'my_secret_token_123',
      };
    } else if (type === 'tag_record') {
      defaultParams = {
        tagsToAdd: ['AUTO_PROCESSED', 'HIGH_PRIORITY'],
      };
    } else if (type === 'create_draft_document') {
      defaultParams = {
        documentType: 'PURCHASE_REQUEST',
        title: 'طلب شراء آلي لإعادة التعبئة',
        details: {},
      };
    } else if (type === 'change_status') {
      defaultParams = {
        entityType: 'INVOICE',
        targetStatus: 'UNDER_REVIEW',
      };
    } else if (type === 'delay_schedule') {
      defaultParams = {
        delayMinutes: 30,
        nestedActionType: 'send_notification',
        nestedActionParams: {},
      };
    }

    const newAction = {
      id: `act-${Date.now()}`,
      type,
      enabled: true,
      order: builderActions.length + 1,
      params: defaultParams,
    };

    setBuilderActions([...builderActions, newAction]);
  };

  // KPI calculations
  const totalRulesCount = rules.length;
  const activeRulesCount = rules.filter((r) => r.enabled).length;
  const totalRunsCount = rules.reduce((sum, r) => sum + (r.stats?.totalRuns || 0), 0);
  const successRunsCount = rules.reduce((sum, r) => sum + (r.stats?.successRuns || 0), 0);
  const successRate = totalRunsCount > 0 ? Math.round((successRunsCount / totalRunsCount) * 100) : 100;

  // Filtered Rules
  const filteredRules = rules.filter((r) => {
    if (selectedTriggerFilter !== 'ALL' && r.trigger !== selectedTriggerFilter) return false;
    if (selectedStatusFilter === 'ACTIVE' && !r.enabled) return false;
    if (selectedStatusFilter === 'INACTIVE' && r.enabled) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        r.nameAr.toLowerCase().includes(q) ||
        r.nameEn.toLowerCase().includes(q) ||
        (r.descriptionAr && r.descriptionAr.toLowerCase().includes(q)) ||
        (r.descriptionEn && r.descriptionEn.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Filtered History
  const filteredHistory = historyLogs.filter((l) => {
    if (historyStatusFilter !== 'ALL' && l.status !== historyStatusFilter) return false;
    if (historyRuleFilter !== 'ALL' && l.ruleId !== historyRuleFilter) return false;
    return true;
  });

  // Render Condition Node Recursively
  const renderConditionNode = (node: SingleCondition | ConditionGroup, parentGroupId: string, level = 0) => {
    if ('logicalOperator' in node) {
      const group = node as ConditionGroup;
      const isRoot = level === 0;

      return (
        <div
          key={group.id}
          className={`rounded-2xl border p-4 transition-all ${
            isRoot
              ? 'bg-slate-50/80 border-slate-200'
              : 'bg-white border-slate-200/90 shadow-2xs mt-3 ms-4 border-s-4 border-s-emerald-600'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {isAr ? 'مطابقة الشروط:' : 'Match Conditions:'}
              </span>
              <div className="inline-flex rounded-lg bg-slate-200/80 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => updateGroupOperator(group.id, 'AND')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    group.logicalOperator === 'AND'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isAr ? 'جميع الشروط (AND)' : 'ALL (AND)'}
                </button>
                <button
                  type="button"
                  onClick={() => updateGroupOperator(group.id, 'OR')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    group.logicalOperator === 'OR'
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {isAr ? 'أي شرط (OR)' : 'ANY (OR)'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => addConditionToGroup(group.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {isAr ? 'إضافة شرط' : 'Add Condition'}
              </button>
              <button
                type="button"
                onClick={() => addSubGroupToGroup(group.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
                {isAr ? 'إضافة مجموعة فرعية' : 'Add Sub-Group'}
              </button>
              {!isRoot && (
                <button
                  type="button"
                  onClick={() => removeConditionOrGroup(group.id)}
                  className="p-1 text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                  title={isAr ? 'حذف المجموعة' : 'Delete Group'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {group.conditions.length === 0 ? (
              <div className="text-center py-4 bg-white/60 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
                {isAr ? 'لا توجد شروط في هذه المجموعة. سيتم تطبيق الإجراءات على جميع السجلات.' : 'No conditions. Actions will run for all records.'}
              </div>
            ) : (
              group.conditions.map((child) => renderConditionNode(child, group.id, level + 1))
            )}
          </div>
        </div>
      );
    }

    // Single Condition Row
    const cond = node as SingleCondition;
    const fieldDef = AVAILABLE_FIELDS.find((f) => f.field === cond.field);

    return (
      <div
        key={cond.id}
        className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all"
      >
        {/* Field Selector */}
        <div className="min-w-[180px] flex-1">
          <select
            value={cond.field}
            onChange={(e) => updateSingleCondition(cond.id, { field: e.target.value })}
            className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {AVAILABLE_FIELDS.map((f) => (
              <option key={f.field} value={f.field}>
                [{f.category}] {isAr ? f.labelAr : f.labelEn} ({f.field})
              </option>
            ))}
          </select>
        </div>

        {/* Operator Selector */}
        <div className="w-36">
          <select
            value={cond.operator}
            onChange={(e) => updateSingleCondition(cond.id, { operator: e.target.value as ConditionOperator })}
            className="w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="equals">{isAr ? 'يساوي (=)' : 'Equals (=)'}</option>
            <option value="not_equals">{isAr ? 'لا يساوي (≠)' : 'Not Equals (≠)'}</option>
            <option value="greater_than">{isAr ? 'أكبر من (>)' : 'Greater Than (>)'}</option>
            <option value="greater_than_or_equal">{isAr ? 'أكبر من أو يساوي (≥)' : 'Greater or Equal (≥)'}</option>
            <option value="less_than">{isAr ? 'أقل من (<)' : 'Less Than (<)'}</option>
            <option value="less_than_or_equal">{isAr ? 'أقل من أو يساوي (≤)' : 'Less or Equal (≤)'}</option>
            <option value="contains">{isAr ? 'يحتوي على' : 'Contains'}</option>
            <option value="not_contains">{isAr ? 'لا يحتوي على' : 'Does Not Contain'}</option>
            <option value="in_list">{isAr ? 'ضمن قائمة (In List)' : 'In List'}</option>
            <option value="not_in_list">{isAr ? 'ليس ضمن قائمة' : 'Not In List'}</option>
            <option value="is_empty">{isAr ? 'فارغ / غير محدد' : 'Is Empty'}</option>
            <option value="is_not_empty">{isAr ? 'غير فارغ / محدد' : 'Is Not Empty'}</option>
          </select>
        </div>

        {/* Value Input */}
        {cond.operator !== 'is_empty' && cond.operator !== 'is_not_empty' && (
          <div className="min-w-[140px] flex-1">
            {fieldDef?.type === 'boolean' ? (
              <select
                value={String(cond.value)}
                onChange={(e) => updateSingleCondition(cond.id, { value: e.target.value === 'true' })}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="true">{isAr ? 'صحيح (True)' : 'True'}</option>
                <option value="false">{isAr ? 'خطأ (False)' : 'False'}</option>
              </select>
            ) : fieldDef?.type === 'number' ? (
              <input
                type="number"
                value={cond.value !== undefined ? cond.value : ''}
                onChange={(e) => updateSingleCondition(cond.id, { value: Number(e.target.value) })}
                placeholder={isAr ? 'القيمة الرقمية' : 'Numeric value'}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            ) : (
              <input
                type="text"
                value={Array.isArray(cond.value) ? cond.value.join(', ') : cond.value || ''}
                onChange={(e) => {
                  const val = cond.operator === 'in_list' || cond.operator === 'not_in_list'
                    ? e.target.value.split(',').map((s) => s.trim())
                    : e.target.value;
                  updateSingleCondition(cond.id, { value: val });
                }}
                placeholder={
                  cond.operator === 'in_list' || cond.operator === 'not_in_list'
                    ? isAr
                      ? 'قيم مفصولة بفواصل (مثل: REJECTED, FAILED)'
                      : 'Comma separated values (e.g. REJECTED, FAILED)'
                    : isAr
                    ? 'القيمة المطلوبة'
                    : 'Target value'
                }
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            )}
          </div>
        )}

        {/* Delete Single Condition */}
        <button
          type="button"
          onClick={() => removeConditionOrGroup(cond.id)}
          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
          title={isAr ? 'حذف الشرط' : 'Remove Condition'}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Page Header */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center text-white shadow-md">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  {isAr ? 'محرك الأتمتة وقواعد الأعمال (Phase 14)' : 'Automation Engine & Business Rules'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {isAr ? 'نظام حي متكامل' : 'Production Ready'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {isAr
                  ? 'بناء قواعد الأتمتة المرئية، معالجة الأحداث التلقائية، التنبيهات الذكية، استدعاء الـ Webhooks، وإعادة المحاولة الآلية'
                  : 'Visual condition trees, trigger dispatching, smart alert pipelines, signed webhook dispatches & auto-retries'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setActiveTab('simulator')}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-xl border border-teal-200 transition-all shadow-2xs"
            >
              <Play className="w-4 h-4 text-teal-600" />
              <span>{isAr ? 'استوديو المحاكاة' : 'Simulator Studio'}</span>
            </button>
            <button
              onClick={handleCreateNewRule}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إنشاء قاعدة جديدة' : 'New Automation Rule'}</span>
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-medium">{isAr ? 'إجمالي القواعد' : 'Total Rules'}</span>
              <Sliders className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-xl font-bold text-slate-900">{totalRulesCount}</div>
          </div>

          <div className="bg-emerald-50/50 rounded-xl p-3.5 border border-emerald-100">
            <div className="flex items-center justify-between text-emerald-600 mb-1">
              <span className="text-xs font-medium">{isAr ? 'القواعد النشطة' : 'Active Rules'}</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold text-emerald-800">{activeRulesCount}</div>
          </div>

          <div className="bg-teal-50/50 rounded-xl p-3.5 border border-teal-100">
            <div className="flex items-center justify-between text-teal-600 mb-1">
              <span className="text-xs font-medium">{isAr ? 'مرات التشغيل' : 'Total Runs'}</span>
              <RefreshCw className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-xl font-bold text-teal-800">{totalRunsCount}</div>
          </div>

          <div className="bg-amber-50/50 rounded-xl p-3.5 border border-amber-100">
            <div className="flex items-center justify-between text-amber-600 mb-1">
              <span className="text-xs font-medium">{isAr ? 'نسبة النجاح' : 'Success Rate'}</span>
              <Sparkles className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-xl font-bold text-amber-800">{successRate}%</div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 mt-6 -mb-6 px-1 gap-6">
          <button
            onClick={() => setActiveTab('rules')}
            className={`pb-3 text-xs font-bold transition-all relative ${
              activeTab === 'rules'
                ? 'text-emerald-800 border-b-2 border-emerald-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {isAr ? 'قواعد الأتمتة النشطة' : 'Active Rules'} ({rules.length})
          </button>
          <button
            onClick={() => setActiveTab('builder')}
            className={`pb-3 text-xs font-bold transition-all relative ${
              activeTab === 'builder'
                ? 'text-emerald-800 border-b-2 border-emerald-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {isAr ? 'منشئ القواعد المرئي' : 'Visual Rule Builder'}
            {editingRuleId && <span className="ms-1.5 px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800">Edit</span>}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 text-xs font-bold transition-all relative ${
              activeTab === 'history'
                ? 'text-emerald-800 border-b-2 border-emerald-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {isAr ? 'سجل التشغيل والتدقيق' : 'Execution History & Audits'} ({historyLogs.length})
          </button>
          <button
            onClick={() => setActiveTab('simulator')}
            className={`pb-3 text-xs font-bold transition-all relative ${
              activeTab === 'simulator'
                ? 'text-emerald-800 border-b-2 border-emerald-700'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {isAr ? 'استوديو المحاكاة والاختبار' : 'Simulator Studio'}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: RULES LIST */}
      {/* ========================================================================= */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'البحث في القواعد بالاسم أو الوصف...' : 'Search rules by name or description...'}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl ps-9 pe-3 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedTriggerFilter}
                onChange={(e) => setSelectedTriggerFilter(e.target.value)}
                className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">{isAr ? 'جميع الأحداث والمشغلات' : 'All Triggers'}</option>
                {Object.entries(TRIGGER_METADATA).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {isAr ? meta.labelAr : meta.labelEn}
                  </option>
                ))}
              </select>

              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
                <option value="ACTIVE">{isAr ? 'مفعل فقط' : 'Active Only'}</option>
                <option value="INACTIVE">{isAr ? 'معطل فقط' : 'Inactive Only'}</option>
              </select>
            </div>
          </div>

          {/* Rules Cards Grid */}
          {filteredRules.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
              <Zap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-700">
                {isAr ? 'لم يتم العثور على قواعد مطابقة' : 'No automation rules found'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 mb-4">
                {isAr ? 'قم بإنشاء قاعدة جديدة أو تغيير خيارات الفلترة' : 'Create a new rule or adjust your filter'}
              </p>
              <button
                onClick={handleCreateNewRule}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>{isAr ? 'إنشاء قاعدة الآن' : 'Create Rule Now'}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredRules.map((rule) => {
                const trigMeta = TRIGGER_METADATA[rule.trigger] || {
                  labelAr: rule.trigger,
                  labelEn: rule.trigger,
                  icon: 'Zap',
                  category: 'General',
                };

                return (
                  <div
                    key={rule.id}
                    className={`bg-white rounded-2xl border p-5 transition-all hover:shadow-md ${
                      rule.enabled
                        ? 'border-slate-200 hover:border-emerald-200'
                        : 'border-slate-200/60 bg-slate-50/50 opacity-80'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      {/* Left: Info & Details */}
                      <div className="flex items-start gap-3.5 flex-1">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            rule.enabled
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-400 border border-slate-200'
                          }`}
                        >
                          <Zap className="w-5 h-5" />
                        </div>

                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900">
                              {isAr ? rule.nameAr : rule.nameEn}
                            </h3>
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              {isAr ? trigMeta.labelAr : trigMeta.labelEn}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              {isAr ? `أولوية ${rule.priority}` : `Priority ${rule.priority}`}
                            </span>
                          </div>

                          <p className="text-xs text-slate-500">
                            {isAr ? rule.descriptionAr : rule.descriptionEn}
                          </p>

                          {/* Conditions & Actions pills */}
                          <div className="flex flex-wrap items-center gap-3 pt-2">
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <Filter className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-semibold text-slate-700">
                                {rule.conditionTree.conditions.length} {isAr ? 'شروط' : 'Conditions'}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                ({rule.conditionTree.logicalOperator})
                              </span>
                            </div>

                            <div className="h-3 w-px bg-slate-200" />

                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <Layers className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-semibold text-slate-700">
                                {rule.actions.length} {isAr ? 'إجراءات' : 'Actions'}
                              </span>
                              <div className="flex items-center gap-1 ms-1">
                                {rule.actions.map((act) => (
                                  <span
                                    key={act.id}
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200"
                                    title={act.type}
                                  >
                                    {act.type.replace('_', ' ')}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Actions, Toggle, and Stats */}
                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        {/* Stats mini badge */}
                        <div className="text-end">
                          <div className="text-xs font-bold text-slate-700">
                            {rule.stats?.totalRuns || 0} {isAr ? 'تشغيل' : 'runs'}
                          </div>
                          {rule.stats?.lastRunAt && (
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 justify-end">
                              <Clock className="w-3 h-3" />
                              <span>{new Date(rule.stats.lastRunAt).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>

                        {/* Enable/Disable Toggle */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleRule(rule.id, e)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            rule.enabled ? 'bg-emerald-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                              rule.enabled ? (isAr ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                            }`}
                          />
                        </button>

                        {/* Button Group */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleOpenDryRun(rule, e)}
                            className="p-2 text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition-colors"
                            title={isAr ? 'تجربة ومحاكاة (Dry Run)' : 'Test Dry Run'}
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleEditRule(rule)}
                            className="p-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            title={isAr ? 'تعديل القاعدة' : 'Edit Rule'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDuplicateRule(rule, e)}
                            className="p-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                            title={isAr ? 'نسخ القاعدة' : 'Duplicate Rule'}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteRule(rule.id, e)}
                            className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
                            title={isAr ? 'حذف القاعدة' : 'Delete Rule'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: VISUAL RULE BUILDER */}
      {/* ========================================================================= */}
      {activeTab === 'builder' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-700" />
                <h2 className="text-base font-bold text-slate-900">
                  {editingRuleId
                    ? isAr
                      ? 'تعديل قاعدة الأتمتة'
                      : 'Edit Automation Rule'
                    : isAr
                    ? 'إنشاء قاعدة أتمتة جديدة'
                    : 'Create New Automation Rule'}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const tempRule: AutomationRule = {
                      id: editingRuleId || 'temp',
                      tenantId: 'current',
                      nameAr: builderNameAr,
                      nameEn: builderNameEn,
                      descriptionAr: builderDescAr,
                      descriptionEn: builderDescEn,
                      trigger: builderTrigger,
                      conditionTree: builderConditionTree,
                      actions: builderActions,
                      enabled: true,
                      priority: builderPriority,
                      retryPolicy: { maxAttempts: builderMaxAttempts, backoffMinutes: builderBackoffMinutes, retryOnFailure: true },
                      stats: { totalRuns: 0, successRuns: 0, failedRuns: 0 },
                      createdAt: '',
                      updatedAt: '',
                    };
                    handleOpenDryRun(tempRule);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-colors"
                >
                  <Play className="w-3.5 h-3.5 text-teal-600" />
                  <span>{isAr ? 'تجربة ومحاكاة (Dry Run)' : 'Test Dry Run'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveRuleFromBuilder}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition-colors"
                >
                  <Check className="w-4 h-4" />
                  <span>{isAr ? 'حفظ ونشر القاعدة' : 'Save & Publish Rule'}</span>
                </button>
              </div>
            </div>

            {/* Section 1: General Info */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {isAr ? '1. البيانات الأساسية والمشغل (Trigger)' : '1. General Info & Trigger'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم القاعدة (عربي)' : 'Rule Name (Arabic)'} *
                  </label>
                  <input
                    type="text"
                    value={builderNameAr}
                    onChange={(e) => setBuilderNameAr(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'اسم القاعدة (إنجليزي)' : 'Rule Name (English)'} *
                  </label>
                  <input
                    type="text"
                    value={builderNameEn}
                    onChange={(e) => setBuilderNameEn(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'وصف القاعدة (عربي)' : 'Description (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={builderDescAr}
                    onChange={(e) => setBuilderDescAr(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'وصف القاعدة (إنجليزي)' : 'Description (English)'}
                  </label>
                  <input
                    type="text"
                    value={builderDescEn}
                    onChange={(e) => setBuilderDescEn(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Trigger Selector Grid */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  {isAr ? 'حدث المشغل (When Event Occurs):' : 'Trigger Event:'}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {Object.entries(TRIGGER_METADATA).map(([tKey, tMeta]) => {
                    const isSelected = builderTrigger === tKey;
                    return (
                      <div
                        key={tKey}
                        onClick={() => setBuilderTrigger(tKey as TriggerType)}
                        className={`cursor-pointer rounded-xl p-3 border transition-all ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-600 ring-2 ring-emerald-500/20'
                            : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/80'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-800">
                            {isAr ? tMeta.labelAr : tMeta.labelEn}
                          </span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          {isAr ? tMeta.descriptionAr : tMeta.descriptionEn}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Priority & Retry Policy */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'درجة الأولوية (1 - 100)' : 'Priority (1 - 100)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={builderPriority}
                    onChange={(e) => setBuilderPriority(Number(e.target.value))}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'الحد الأقصى للمحاولات عند الفشل' : 'Max Retry Attempts'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={builderMaxAttempts}
                    onChange={(e) => setBuilderMaxAttempts(Number(e.target.value))}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'فترة الانتظار قبل إعادة المحاولة (دقائق)' : 'Backoff Delay (Minutes)'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={builderBackoffMinutes}
                    onChange={(e) => setBuilderBackoffMinutes(Number(e.target.value))}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Visual Condition Tree */}
            <div className="space-y-4 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {isAr ? '2. شجرة الشروط المرئية (Visual Condition Tree)' : '2. Visual Condition Tree'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isAr
                      ? 'حدد الحقول والمعاملات الحسابية والمجموعات المتداخلة (AND / OR) التي تحدد متى يتم تفعيل القاعدة'
                      : 'Define nested condition groups (AND / OR) and operators that evaluate when rule executes'}
                  </p>
                </div>
              </div>

              {renderConditionNode(builderConditionTree, 'root', 0)}
            </div>

            {/* Section 3: Action Pipeline */}
            <div className="space-y-4 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {isAr ? '3. خط أنابيب الإجراءات (Actions Pipeline)' : '3. Actions Pipeline'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isAr
                      ? 'الإجراءات التي يتم تنفيذها تلقائياً بالترتيب عند مطابقة الشروط'
                      : 'Actions dispatched automatically in order when conditions evaluate to true'}
                  </p>
                </div>

                {/* Add Action Dropdown */}
                <div className="relative group">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إضافة إجراء جديد' : 'Add Action'}</span>
                    <ChevronDown className="w-3.5 h-3.5 ms-1" />
                  </button>

                  <div className="absolute end-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-30 hidden group-hover:block hover:block">
                    {Object.entries(ACTION_METADATA).map(([aKey, aMeta]) => (
                      <button
                        key={aKey}
                        type="button"
                        onClick={() => handleAddAction(aKey as ActionType)}
                        className="w-full text-start px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                      >
                        <span>{isAr ? aMeta.labelAr : aMeta.labelEn}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions List */}
              <div className="space-y-3">
                {builderActions.map((action, idx) => {
                  const actMeta = ACTION_METADATA[action.type as ActionType] || {
                    labelAr: action.type,
                    labelEn: action.type,
                    icon: 'Zap',
                  };

                  return (
                    <div
                      key={action.id}
                      className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-emerald-700 text-white text-xs font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {isAr ? actMeta.labelAr : actMeta.labelEn}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-200 text-slate-700 font-mono">
                            {action.type}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = builderActions.filter((a) => a.id !== action.id);
                              setBuilderActions(updated);
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title={isAr ? 'حذف الإجراء' : 'Remove Action'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Action Specific Inputs */}
                      {action.type === 'send_notification' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-slate-200/80">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {isAr ? 'عنوان الإشعار (عربي)' : 'Title (Arabic)'}
                            </label>
                            <input
                              type="text"
                              value={action.params.titleAr || ''}
                              onChange={(e) => {
                                const newParams = { ...action.params, titleAr: e.target.value };
                                setBuilderActions(builderActions.map((a) => (a.id === action.id ? { ...a, params: newParams } : a)));
                              }}
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {isAr ? 'عنوان الإشعار (إنجليزي)' : 'Title (English)'}
                            </label>
                            <input
                              type="text"
                              value={action.params.titleEn || ''}
                              onChange={(e) => {
                                const newParams = { ...action.params, titleEn: e.target.value };
                                setBuilderActions(builderActions.map((a) => (a.id === action.id ? { ...a, params: newParams } : a)));
                              }}
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {isAr ? 'نص الرسالة (يدعم المتغيرات مثل {invoiceNumber})' : 'Message Body (Supports variables like {invoiceNumber})'}
                            </label>
                            <input
                              type="text"
                              value={action.params.messageAr || ''}
                              onChange={(e) => {
                                const newParams = { ...action.params, messageAr: e.target.value };
                                setBuilderActions(builderActions.map((a) => (a.id === action.id ? { ...a, params: newParams } : a)));
                              }}
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                            />
                          </div>
                        </div>
                      )}

                      {action.type === 'call_webhook' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-slate-200/80">
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {isAr ? 'رابط الـ Webhook المستهدف (URL)' : 'Target Webhook URL'}
                            </label>
                            <input
                              type="url"
                              value={action.params.url || ''}
                              onChange={(e) => {
                                const newParams = { ...action.params, url: e.target.value };
                                setBuilderActions(builderActions.map((a) => (a.id === action.id ? { ...a, params: newParams } : a)));
                              }}
                              placeholder="https://api.domain.com/webhooks/endpoint"
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {isAr ? 'المفتاح السري للتوقيع (Secret Key)' : 'HMAC Secret Key'}
                            </label>
                            <input
                              type="text"
                              value={action.params.secretKey || ''}
                              onChange={(e) => {
                                const newParams = { ...action.params, secretKey: e.target.value };
                                setBuilderActions(builderActions.map((a) => (a.id === action.id ? { ...a, params: newParams } : a)));
                              }}
                              placeholder="secret_token_123"
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono"
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-4">
                            <input
                              type="checkbox"
                              id={`hmac-${action.id}`}
                              checked={action.params.signHmacSha256 !== false}
                              onChange={(e) => {
                                const newParams = { ...action.params, signHmacSha256: e.target.checked };
                                setBuilderActions(builderActions.map((a) => (a.id === action.id ? { ...a, params: newParams } : a)));
                              }}
                              className="rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <label htmlFor={`hmac-${action.id}`} className="text-xs font-semibold text-slate-700">
                              {isAr ? 'توقيع الحمولة بـ HMAC-SHA256 في ترويسة X-Signature' : 'Sign payload with HMAC-SHA256 in X-Signature header'}
                            </label>
                          </div>
                        </div>
                      )}

                      {action.type === 'create_task' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-slate-200/80">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {isAr ? 'عنوان المهمة' : 'Task Title'}
                            </label>
                            <input
                              type="text"
                              value={action.params.title || ''}
                              onChange={(e) => {
                                const newParams = { ...action.params, title: e.target.value };
                                setBuilderActions(builderActions.map((a) => (a.id === action.id ? { ...a, params: newParams } : a)));
                              }}
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              {isAr ? 'إسناد للدور (Role)' : 'Assign to Role'}
                            </label>
                            <select
                              value={action.params.assignedToRole || 'ACCOUNTANT'}
                              onChange={(e) => {
                                const newParams = { ...action.params, assignedToRole: e.target.value };
                                setBuilderActions(builderActions.map((a) => (a.id === action.id ? { ...a, params: newParams } : a)));
                              }}
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                            >
                              <option value="OWNER">مالك المنشأة (Owner)</option>
                              <option value="CHIEF_ACCOUNTANT">رئيس الحسابات (Chief Accountant)</option>
                              <option value="ACCOUNTANT">محاسب (Accountant)</option>
                              <option value="SALES_MGR">مدير المبيعات (Sales Mgr)</option>
                              <option value="PURCHASES_MGR">مدير المشتريات (Purchases Mgr)</option>
                              <option value="CASHIER">أمين الصندوق (Cashier)</option>
                            </select>
                          </div>
                        </div>
                      )}

                      {action.type === 'tag_record' && (
                        <div className="bg-white p-3 rounded-xl border border-slate-200/80">
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            {isAr ? 'الوسوم المطلوب إضافتها (مفصولة بفواصل)' : 'Tags to add (comma-separated)'}
                          </label>
                          <input
                            type="text"
                            value={Array.isArray(action.params.tagsToAdd) ? action.params.tagsToAdd.join(', ') : action.params.tagsToAdd || ''}
                            onChange={(e) => {
                              const tags = e.target.value.split(',').map((s) => s.trim());
                              const newParams = { ...action.params, tagsToAdd: tags };
                              setBuilderActions(builderActions.map((a) => (a.id === action.id ? { ...a, params: newParams } : a)));
                            }}
                            placeholder="VIP, HIGH_VALUE, FLAGGED_RISK"
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Save Bar */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveTab('rules')}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                {isAr ? 'إلغاء والعودة للقائمة' : 'Cancel & Back to List'}
              </button>
              <button
                type="button"
                onClick={handleSaveRuleFromBuilder}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm transition-all"
              >
                <Check className="w-4 h-4" />
                <span>{isAr ? 'حفظ ونشر قاعدة الأتمتة' : 'Save & Publish Automation Rule'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: EXECUTION HISTORY & AUDITS */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* History Filters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value)}
                className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">{isAr ? 'جميع حالات التشغيل' : 'All Run Statuses'}</option>
                <option value="SUCCESS">{isAr ? 'ناجح (SUCCESS)' : 'Success'}</option>
                <option value="FAILED">{isAr ? 'فاشل (FAILED)' : 'Failed'}</option>
                <option value="SKIPPED">{isAr ? 'تم التخطي (SKIPPED)' : 'Skipped'}</option>
              </select>

              <select
                value={historyRuleFilter}
                onChange={(e) => setHistoryRuleFilter(e.target.value)}
                className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">{isAr ? 'جميع القواعد' : 'All Rules'}</option>
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {isAr ? r.nameAr : r.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={loadAllData}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isAr ? 'تحديث السجل' : 'Refresh Logs'}</span>
            </button>
          </div>

          {/* History Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            {filteredHistory.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                {isAr ? 'لا توجد سجلات تشغيل مطابقة' : 'No execution logs found'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-4 text-start">{isAr ? 'معرف التشغيل' : 'Run ID'}</th>
                      <th className="py-3 px-4 text-start">{isAr ? 'القاعدة' : 'Rule'}</th>
                      <th className="py-3 px-4 text-start">{isAr ? 'المشغل' : 'Trigger'}</th>
                      <th className="py-3 px-4 text-start">{isAr ? 'مطابقة الشروط' : 'Condition Match'}</th>
                      <th className="py-3 px-4 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                      <th className="py-3 px-4 text-start">{isAr ? 'المدة' : 'Duration'}</th>
                      <th className="py-3 px-4 text-start">{isAr ? 'التاريخ والوقت' : 'Timestamp'}</th>
                      <th className="py-3 px-4 text-center">{isAr ? 'التفاصيل' : 'Details'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredHistory.map((log) => (
                      <tr key={log.runId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">
                          {log.runId.slice(0, 16)}...
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {isAr ? log.ruleNameAr : log.ruleNameEn}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono">
                            {log.trigger}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {log.conditionMatched ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {isAr ? 'متطابق' : 'Matched'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400 text-[11px]">
                              <X className="w-3.5 h-3.5" />
                              {isAr ? 'غير متطابق' : 'No Match'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              log.status === 'SUCCESS'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : log.status === 'FAILED'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono">
                          {log.durationMs} ms
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px]">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedLogDetail(log)}
                            className="p-1 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            title={isAr ? 'عرض التفاصيل الكاملة' : 'View Details'}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SIMULATOR & TRIGGER TESTER */}
      {/* ========================================================================= */}
      {activeTab === 'simulator' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-700" />
                <span>{isAr ? 'استوديو إطلاق الأحداث والمحاكاة الحية' : 'Live Event Trigger & Simulator Studio'}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {isAr
                  ? 'اختبر إطلاق أحداث ERP الحية (مثل هبوط المخزون، ترحيل الفواتير، وفشل الزكاة) لمعاينة تشغيل القواعد وتوليد التنبيهات والمهام فورياً'
                  : 'Test live event dispatching against current active rules to verify instant notifications, tasks and webhooks'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Trigger Selection & Payload Editor */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {isAr ? 'اختر الحدث المشغل (Trigger Event):' : 'Select Trigger Event:'}
                  </label>
                  <select
                    value={simTrigger}
                    onChange={(e) => setSimTrigger(e.target.value as TriggerType)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {Object.entries(TRIGGER_METADATA).map(([tKey, meta]) => (
                      <option key={tKey} value={tKey}>
                        {isAr ? meta.labelAr : meta.labelEn} ({tKey})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      {isAr ? 'بيانات حمولة الحدث (Payload JSON):' : 'Event Payload JSON:'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (samplePayloads[simTrigger]) {
                          setSimPayloadJson(JSON.stringify(samplePayloads[simTrigger], null, 2));
                        }
                      }}
                      className="text-[11px] text-emerald-700 hover:underline font-semibold"
                    >
                      {isAr ? 'استعادة العينة الافتراضية' : 'Reset to Default Sample'}
                    </button>
                  </div>
                  <textarea
                    rows={12}
                    value={simPayloadJson}
                    onChange={(e) => setSimPayloadJson(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-900 text-emerald-400 rounded-xl p-3 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleFireSimulatorTrigger}
                  disabled={isSimulating}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  <Zap className="w-4 h-4" />
                  <span>{isSimulating ? (isAr ? 'جاري التنفيذ...' : 'Executing...') : isAr ? 'إطلاق الحدث وتقييم القواعد الآن' : 'Fire Trigger & Evaluate Rules Now'}</span>
                </button>
              </div>

              {/* Right: Simulation Live Execution Results */}
              <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
                    <span>{isAr ? 'نتائج تشغيل المحاكاة:' : 'Simulation Execution Results:'}</span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      {simResults.length} {isAr ? 'قواعد تم تشغيلها' : 'rules evaluated'}
                    </span>
                  </h3>

                  {simResults.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-xs">
                      {isAr
                        ? 'انقر على "إطلاق الحدث" لمعاينة تقييم شروط القواعد ونتائج الإجراءات هنا'
                        : 'Click "Fire Trigger" to view live evaluation and action dispatch outcomes here'}
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[440px] overflow-y-auto pe-1">
                      {simResults.map((res) => (
                        <div
                          key={res.runId}
                          className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-900">
                              {isAr ? res.ruleNameAr : res.ruleNameEn}
                            </h4>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                res.status === 'SUCCESS'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : res.status === 'FAILED'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {res.status}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-600">
                            {res.conditionMatched ? (
                              <span className="text-emerald-700 font-semibold">
                                ✓ {isAr ? 'تطابقت الشروط وتم تنفيذ الإجراءات' : 'Conditions matched & actions executed'}
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                ✗ {isAr ? 'لم تتطابق الشروط (تم تخطي الإجراءات)' : 'Conditions did not match (Skipped)'}
                              </span>
                            )}
                          </div>

                          {res.actionResults.length > 0 && (
                            <div className="bg-slate-50 rounded-lg p-2 text-[11px] font-mono text-slate-700 space-y-1">
                              {res.actionResults.map((act, idx) => (
                                <div key={idx} className="flex items-center justify-between">
                                  <span>{act.actionType}</span>
                                  <span
                                    className={
                                      act.status === 'SUCCESS'
                                        ? 'text-emerald-600 font-bold'
                                        : 'text-rose-600 font-bold'
                                    }
                                  >
                                    {act.status} ({act.executionTimeMs}ms)
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>{isAr ? 'المحرك متصل بنظام الإشعارات والـ Webhooks' : 'Connected to Notifications & Webhook queue'}</span>
                  <button
                    onClick={() => setActiveTab('history')}
                    className="text-emerald-700 font-semibold hover:underline"
                  >
                    {isAr ? 'عرض سجل التدقيق الكامل' : 'View Full Audit History'} →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRY RUN MODAL */}
      {/* ========================================================================= */}
      {dryRunModalOpen && dryRunRule && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {isAr ? 'محاكاة واختبار القاعدة (Dry-Run Mode)' : 'Rule Dry-Run Simulator'}
                </h3>
              </div>
              <button
                onClick={() => setDryRunModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-800 mb-1">
                {isAr ? dryRunRule.nameAr : dryRunRule.nameEn}
              </h4>
              <p className="text-xs text-slate-500">
                {isAr ? dryRunRule.descriptionAr : dryRunRule.descriptionEn}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isAr ? 'عينة حمولة الاختبار (Sample Payload JSON):' : 'Sample Payload JSON:'}
              </label>
              <textarea
                rows={6}
                value={dryRunPayloadJson}
                onChange={(e) => setDryRunPayloadJson(e.target.value)}
                className="w-full text-xs font-mono bg-slate-900 text-emerald-400 rounded-xl p-3 border border-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <button
              onClick={handleExecuteDryRun}
              disabled={isDryRunning}
              className="w-full py-2.5 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-xl shadow-xs transition-all"
            >
              {isDryRunning ? (isAr ? 'جاري التحقق...' : 'Evaluating...') : isAr ? 'اختبار الشروط ومحاكاة الإجراءات (بدون تأثير)' : 'Evaluate Conditions & Simulate (Zero Side Effects)'}
            </button>

            {/* Dry Run Results */}
            {dryRunResult && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    {isAr ? 'نتيجة تقييم الشروط الإجمالية:' : 'Overall Match Evaluation:'}
                  </span>
                  <span
                    className={`px-3 py-0.5 rounded-full text-xs font-bold ${
                      dryRunResult.matched
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {dryRunResult.matched ? (isAr ? 'متطابق ✓' : 'MATCHED ✓') : (isAr ? 'غير متطابق ✗' : 'NO MATCH ✗')}
                  </span>
                </div>

                {/* Condition Trace Table */}
                {dryRunResult.conditionTrace.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-500 uppercase">
                      {isAr ? 'مسار تقييم الشروط التفصيلي:' : 'Condition Evaluation Trace:'}
                    </span>
                    <div className="space-y-1">
                      {dryRunResult.conditionTrace.map((tr, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200"
                        >
                          <span className="font-mono text-slate-700">{tr.field}</span>
                          <span className="text-slate-500 font-semibold">{tr.operator}</span>
                          <span className="font-mono text-slate-600">
                            {isAr ? 'الفعلي:' : 'Actual:'} {JSON.stringify(tr.actualValue)}
                          </span>
                          <span
                            className={
                              tr.matched
                                ? 'text-emerald-700 font-bold'
                                : 'text-rose-700 font-bold'
                            }
                          >
                            {tr.matched ? 'TRUE' : 'FALSE'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Simulated Actions Preview */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">
                    {isAr ? 'معاينة الإجراءات المخطط تنفيذها:' : 'Simulated Actions Output:'}
                  </span>
                  <div className="space-y-1.5">
                    {dryRunResult.simulatedActions.map((act, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">{act.description}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              act.wouldExecute
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {act.wouldExecute ? (isAr ? 'سيتم التنفيذ' : 'Would Execute') : (isAr ? 'لن يتم التنفيذ' : 'Skipped')}
                          </span>
                        </div>
                        <pre className="text-[10px] font-mono text-slate-600 bg-slate-50 p-1.5 rounded overflow-x-auto">
                          {JSON.stringify(act.previewPayload, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* LOG DETAIL DRAWER */}
      {/* ========================================================================= */}
      {selectedLogDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">
                  {isAr ? 'تفاصيل سجل تشغيل الأتمتة والتدقيق' : 'Execution Log & Audit Details'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">{isAr ? 'معرف التشغيل' : 'Run ID'}</span>
                <span className="font-mono font-bold text-slate-800">{selectedLogDetail.runId}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">{isAr ? 'حالة التشغيل' : 'Status'}</span>
                <span
                  className={`font-bold ${
                    selectedLogDetail.status === 'SUCCESS' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {selectedLogDetail.status}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">{isAr ? 'زمن التنفيذ' : 'Duration'}</span>
                <span className="font-mono font-bold text-slate-800">{selectedLogDetail.durationMs} ms</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">{isAr ? 'التاريخ والوقت' : 'Timestamp'}</span>
                <span className="text-slate-800">{new Date(selectedLogDetail.timestamp).toLocaleString()}</span>
              </div>
            </div>

            {/* Error detail if failed */}
            {selectedLogDetail.errorDetails && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-xs">
                <span className="font-bold block mb-1">{isAr ? 'رسالة الخطأ:' : 'Error Message:'}</span>
                <span>{selectedLogDetail.errorDetails}</span>
              </div>
            )}

            {/* Condition Trace */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {isAr ? 'تتبع تقييم الشروط (Condition Trace):' : 'Condition Trace:'}
              </h4>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5">
                {selectedLogDetail.conditionTrace.map((tr, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200">
                    <span className="font-mono text-slate-700">{tr.field}</span>
                    <span className="text-slate-500">{tr.operator}</span>
                    <span className="text-slate-600 font-mono">
                      {JSON.stringify(tr.actualValue)} vs {JSON.stringify(tr.expectedValue)}
                    </span>
                    <span className={tr.matched ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                      {tr.matched ? 'TRUE' : 'FALSE'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Results & Retry Button */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {isAr ? 'نتائج تنفيذ الإجراءات وإعادة المحاولة:' : 'Action Results & Retries:'}
              </h4>
              <div className="space-y-2">
                {selectedLogDetail.actionResults.map((act, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{act.actionType}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            act.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {act.status}
                        </span>
                      </div>
                      {act.error && <span className="text-rose-600 text-[11px] mt-1 block">{act.error}</span>}
                    </div>

                    {act.status === 'FAILED' && (
                      <button
                        onClick={() => handleRetryAction(selectedLogDetail.runId, act.actionId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg transition-colors shadow-2xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{isAr ? 'إعادة المحاولة الآن' : 'Retry Action Now'}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Trigger Payload */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {isAr ? 'حمولة الحدث الأولية (Trigger Payload JSON):' : 'Trigger Payload JSON:'}
              </h4>
              <pre className="text-xs font-mono bg-slate-900 text-emerald-400 p-3 rounded-xl overflow-x-auto max-h-48 border border-slate-800">
                {JSON.stringify(selectedLogDetail.triggerPayload, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
