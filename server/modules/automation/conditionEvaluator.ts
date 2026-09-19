/**
 * Condition Tree Evaluator Engine
 * Evaluates recursive AND / OR trees against payload contexts with high precision and trace logging.
 */

import { ConditionGroup, SingleCondition, ConditionOperator, ConditionEvaluationResult } from './types.js';

/**
 * Resolve nested dotted field paths like 'customer.name' or 'totals.netAmountSar'
 */
export function getNestedValue(obj: Record<string, any>, path: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  if (!path) return undefined;

  // Direct key lookup first
  if (path in obj) {
    return obj[path];
  }

  // Handle dotted paths
  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Compare two values based on the operator
 */
export function compareValues(actual: any, operator: ConditionOperator, expected: any): boolean {
  // Handle empty checks
  if (operator === 'is_empty') {
    if (actual === null || actual === undefined) return true;
    if (typeof actual === 'string' && actual.trim() === '') return true;
    if (Array.isArray(actual) && actual.length === 0) return true;
    if (typeof actual === 'object' && Object.keys(actual).length === 0) return true;
    return false;
  }

  if (operator === 'is_not_empty') {
    if (actual === null || actual === undefined) return false;
    if (typeof actual === 'string' && actual.trim() === '') return false;
    if (Array.isArray(actual) && actual.length === 0) return false;
    if (typeof actual === 'object' && Object.keys(actual).length === 0) return false;
    return true;
  }

  // If actual is undefined / null and operator is not is_empty, return false
  if (actual === undefined || actual === null) {
    return operator === 'not_equals';
  }

  switch (operator) {
    case 'equals': {
      if (typeof actual === 'number' || typeof expected === 'number') {
        return Number(actual) === Number(expected);
      }
      if (typeof actual === 'boolean' || typeof expected === 'boolean') {
        return Boolean(actual) === Boolean(expected);
      }
      return String(actual).toLowerCase().trim() === String(expected).toLowerCase().trim();
    }

    case 'not_equals': {
      if (typeof actual === 'number' || typeof expected === 'number') {
        return Number(actual) !== Number(expected);
      }
      if (typeof actual === 'boolean' || typeof expected === 'boolean') {
        return Boolean(actual) !== Boolean(expected);
      }
      return String(actual).toLowerCase().trim() !== String(expected).toLowerCase().trim();
    }

    case 'greater_than': {
      const numAct = Number(actual);
      const numExp = Number(expected);
      if (isNaN(numAct) || isNaN(numExp)) return false;
      return numAct > numExp;
    }

    case 'greater_than_or_equal': {
      const numAct = Number(actual);
      const numExp = Number(expected);
      if (isNaN(numAct) || isNaN(numExp)) return false;
      return numAct >= numExp;
    }

    case 'less_than': {
      const numAct = Number(actual);
      const numExp = Number(expected);
      if (isNaN(numAct) || isNaN(numExp)) return false;
      return numAct < numExp;
    }

    case 'less_than_or_equal': {
      const numAct = Number(actual);
      const numExp = Number(expected);
      if (isNaN(numAct) || isNaN(numExp)) return false;
      return numAct <= numExp;
    }

    case 'contains': {
      if (Array.isArray(actual)) {
        return actual.some((item) => String(item).toLowerCase().includes(String(expected).toLowerCase()));
      }
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    }

    case 'not_contains': {
      if (Array.isArray(actual)) {
        return !actual.some((item) => String(item).toLowerCase().includes(String(expected).toLowerCase()));
      }
      return !String(actual).toLowerCase().includes(String(expected).toLowerCase());
    }

    case 'in_list': {
      let list: any[] = [];
      if (Array.isArray(expected)) {
        list = expected;
      } else if (typeof expected === 'string') {
        list = expected.split(',').map((s) => s.trim());
      }
      const actStr = String(actual).toLowerCase().trim();
      return list.some((item) => String(item).toLowerCase().trim() === actStr);
    }

    case 'not_in_list': {
      let list: any[] = [];
      if (Array.isArray(expected)) {
        list = expected;
      } else if (typeof expected === 'string') {
        list = expected.split(',').map((s) => s.trim());
      }
      const actStr = String(actual).toLowerCase().trim();
      return !list.some((item) => String(item).toLowerCase().trim() === actStr);
    }

    default:
      return false;
  }
}

/**
 * Recursively evaluate a condition group against payload
 */
export function evaluateConditionTree(
  group: ConditionGroup,
  payload: Record<string, any>,
  trace: ConditionEvaluationResult[] = []
): { matched: boolean; trace: ConditionEvaluationResult[] } {
  if (!group || !Array.isArray(group.conditions) || group.conditions.length === 0) {
    // Empty condition tree means always match (all records pass)
    return { matched: true, trace };
  }

  const isAnd = group.logicalOperator === 'AND';
  const results: boolean[] = [];

  for (const item of group.conditions) {
    if ('logicalOperator' in item && Array.isArray((item as ConditionGroup).conditions)) {
      // Nested Condition Group
      const nestedEval = evaluateConditionTree(item as ConditionGroup, payload, trace);
      results.push(nestedEval.matched);
    } else {
      // Single Condition
      const cond = item as SingleCondition;
      const actualValue = getNestedValue(payload, cond.field);
      const isMatch = compareValues(actualValue, cond.operator, cond.value);

      trace.push({
        conditionId: cond.id,
        field: cond.field,
        operator: cond.operator,
        expectedValue: cond.value,
        actualValue: actualValue !== undefined ? actualValue : null,
        matched: isMatch,
      });

      results.push(isMatch);
    }
  }

  const finalMatch = isAnd ? results.every((r) => r === true) : results.some((r) => r === true);

  return { matched: finalMatch, trace };
}
