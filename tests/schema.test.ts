import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';
import {
  systemRoles,
  systemTaxRates,
  chartTemplateAccounts,
} from '../src/db/schema';

describe('system schema', () => {
  it('defines stable table names for initial system defaults', () => {
    expect(getTableName(systemRoles)).toBe('system_roles');
    expect(getTableName(systemTaxRates)).toBe('system_tax_rates');
    expect(getTableName(chartTemplateAccounts)).toBe('chart_template_accounts');
  });
});
