import { describe, it, expect } from 'vitest';
import { evaluateConditionTree } from '../../server/modules/automation/conditionEvaluator.js';
import { AutomationService } from '../../server/modules/automation/automationService.js';
import { ConditionGroup, AutomationRule, TriggerType } from '../../server/modules/automation/types.js';

describe('Phase 14: Automation Engine & Business Rules', () => {
  const tenantId = 'test-tenant-01';

  describe('1. Condition Evaluator with Nested Logic', () => {
    it('evaluates simple numeric comparisons (greater_than_or_equal)', () => {
      const group: ConditionGroup = {
        id: 'g1',
        logicalOperator: 'AND',
        conditions: [
          {
            id: 'c1',
            field: 'stockQuantity',
            operator: 'less_than_or_equal',
            value: 10,
          },
        ],
      };

      const trace: any[] = [];
      const resMatch = evaluateConditionTree(group, { stockQuantity: 5 }, trace);
      expect(resMatch.matched).toBe(true);
      expect(trace.length).toBe(1);
      expect(trace[0].matched).toBe(true);

      const resNoMatch = evaluateConditionTree(group, { stockQuantity: 25 }, []);
      expect(resNoMatch.matched).toBe(false);
    });

    it('evaluates string equality, contains, and in_list operators', () => {
      const group: ConditionGroup = {
        id: 'g2',
        logicalOperator: 'AND',
        conditions: [
          {
            id: 'c1',
            field: 'zatcaStatus',
            operator: 'in_list',
            value: ['REJECTED', 'FAILED', 'WARNING'],
          },
          {
            id: 'c2',
            field: 'customerName',
            operator: 'contains',
            value: 'شركة',
          },
        ],
      };

      const payload = {
        zatcaStatus: 'REJECTED',
        customerName: 'شركة الرياض للتجارة',
      };

      expect(evaluateConditionTree(group, payload).matched).toBe(true);

      const invalidPayload = {
        zatcaStatus: 'REPORTED',
        customerName: 'شركة الرياض للتجارة',
      };
      expect(evaluateConditionTree(group, invalidPayload).matched).toBe(false);
    });

    it('handles nested AND / OR groups accurately', () => {
      // Logic: (amount >= 10000 AND branch == 'BR-RYD') OR (isVip == true)
      const group: ConditionGroup = {
        id: 'root',
        logicalOperator: 'OR',
        conditions: [
          {
            id: 'sub-and',
            logicalOperator: 'AND',
            conditions: [
              {
                id: 'c1',
                field: 'totalAmountSar',
                operator: 'greater_than_or_equal',
                value: 10000,
              },
              {
                id: 'c2',
                field: 'branchId',
                operator: 'equals',
                value: 'BR-RYD',
              },
            ],
          },
          {
            id: 'c3',
            field: 'isVip',
            operator: 'equals',
            value: true,
          },
        ],
      };

      // Case 1: sub-and is true
      expect(
        evaluateConditionTree(group, {
          totalAmountSar: 15000,
          branchId: 'BR-RYD',
          isVip: false,
        }).matched
      ).toBe(true);

      // Case 2: only isVip is true
      expect(
        evaluateConditionTree(group, {
          totalAmountSar: 500,
          branchId: 'BR-JED',
          isVip: true,
        }).matched
      ).toBe(true);

      // Case 3: neither is true
      expect(
        evaluateConditionTree(group, {
          totalAmountSar: 500,
          branchId: 'BR-RYD',
          isVip: false,
        }).matched
      ).toBe(false);
    });

    it('resolves nested object fields with dot notation', () => {
      const group: ConditionGroup = {
        id: 'g3',
        logicalOperator: 'AND',
        conditions: [
          {
            id: 'c1',
            field: 'customer.taxDetails.vatRate',
            operator: 'equals',
            value: 0.15,
          },
        ],
      };

      const payload = {
        customer: {
          taxDetails: {
            vatRate: 0.15,
          },
        },
      };

      expect(evaluateConditionTree(group, payload).matched).toBe(true);
    });
  });

  describe('2. Automation Service & Rule Lifecycle', () => {
    it('creates and lists rules per tenant with isolation', () => {
      const rule: AutomationRule = {
        id: 'test-rule-01',
        tenantId,
        nameAr: 'تنبيه هبوط المخزون للمستودع الرئيسي',
        nameEn: 'Main Warehouse Low Stock Alert',
        descriptionAr: 'تنبيه هبوط المخزون',
        descriptionEn: 'Low Stock Alert',
        trigger: 'low_stock_detected',
        conditionTree: {
          id: 'root',
          logicalOperator: 'AND',
          conditions: [
            {
              id: 'c1',
              field: 'stockQuantity',
              operator: 'less_than_or_equal',
              value: 15,
            },
          ],
        },
        actions: [
          {
            id: 'a1',
            type: 'send_notification',
            enabled: true,
            order: 1,
            params: {
              titleAr: 'تنبيه مخزون: {itemCode}',
              titleEn: 'Stock Alert: {itemCode}',
              messageAr: 'الكمية {stockQuantity} متبقية فقط.',
              priority: 'HIGH',
              targetRoles: ['PURCHASES_MGR'],
            },
          },
        ],
        enabled: true,
        priority: 85,
        retryPolicy: { maxAttempts: 3, backoffMinutes: 5, retryOnFailure: true },
        stats: { totalRuns: 0, successRuns: 0, failedRuns: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      AutomationService.saveRule(tenantId, rule);
      const rules = AutomationService.getRules(tenantId);
      expect(rules.some((r) => r.id === 'test-rule-01')).toBe(true);

      // Verify other tenant cannot see this rule
      const otherTenantRules = AutomationService.getRules('other-tenant-99');
      expect(otherTenantRules.some((r) => r.id === 'test-rule-01')).toBe(false);
    });

    it('executes dry-run without persisting execution logs or side-effects', async () => {
      const rule = AutomationService.getRuleById(tenantId, 'test-rule-01')!;
      const samplePayload = {
        itemCode: 'ITEM-99',
        stockQuantity: 4,
      };

      const dryRunRes = AutomationService.dryRun(rule, samplePayload);
      expect(dryRunRes.matched).toBe(true);
      expect(dryRunRes.simulatedActions.length).toBe(1);
      expect(dryRunRes.simulatedActions[0].wouldExecute).toBe(true);

      // Verify rule stats were NOT incremented during dry-run
      const refreshedRule = AutomationService.getRuleById(tenantId, 'test-rule-01')!;
      expect(refreshedRule.stats.totalRuns).toBe(0);
    });

    it('triggers event, evaluates conditions, and dispatches actions', async () => {
      const payload = {
        itemCode: 'SKU-001',
        itemNameAr: 'طابعة حرارية باركود',
        stockQuantity: 3,
      };

      const logs = await AutomationService.executeTrigger(tenantId, 'low_stock_detected', payload);
      expect(logs.length).toBeGreaterThan(0);

      const matchingLog = logs.find((l) => l.ruleId === 'test-rule-01');
      expect(matchingLog).toBeDefined();
      expect(matchingLog!.status).toBe('SUCCESS');
      expect(matchingLog!.conditionMatched).toBe(true);
      expect(matchingLog!.actionResults[0].status).toBe('SUCCESS');

      // Check stats updated
      const rule = AutomationService.getRuleById(tenantId, 'test-rule-01')!;
      expect(rule.stats.totalRuns).toBe(1);
      expect(rule.stats.successRuns).toBe(1);
    });

    it('retries failed actions on demand', async () => {
      const logs = AutomationService.getHistory(tenantId);
      expect(logs.length).toBeGreaterThan(0);

      const latestLog = logs[0];
      const actionId = latestLog.actionResults[0].actionId;

      const retryRes = await AutomationService.retryAction(tenantId, latestLog.runId, actionId);
      expect(retryRes.success).toBe(true);
    });
  });
});
