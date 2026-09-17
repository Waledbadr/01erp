import { sql } from 'drizzle-orm';
import {
  check,
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
} from 'drizzle-orm/pg-core';

export const systemRoles = pgTable('system_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  labelEn: varchar('label_en', { length: 100 }).notNull(),
  labelAr: varchar('label_ar', { length: 100 }).notNull(),
});

export const systemUnits = pgTable('system_units', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 24 }).notNull().unique(),
  labelEn: varchar('label_en', { length: 100 }).notNull(),
  labelAr: varchar('label_ar', { length: 100 }).notNull(),
});

export const systemTaxRates = pgTable(
  'system_tax_rates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 24 }).notNull().unique(),
    rate: numeric('rate', { precision: 7, scale: 4 }).notNull(),
    classification: varchar('classification', { length: 24 }).notNull(),
  },
  (table) => [
    check(
      'system_tax_rates_rate_range',
      sql`${table.rate} >= 0 AND ${table.rate} <= 1`,
    ),
  ],
);

export const systemDocumentTypes = pgTable('system_document_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  labelEn: varchar('label_en', { length: 100 }).notNull(),
  labelAr: varchar('label_ar', { length: 100 }).notNull(),
});

export const chartTemplateAccounts = pgTable('chart_template_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  nameEn: varchar('name_en', { length: 120 }).notNull(),
  nameAr: varchar('name_ar', { length: 120 }).notNull(),
  kind: varchar('kind', { length: 20 }).notNull(),
  parentCode: varchar('parent_code', { length: 20 }),
});

export const migrationAudit = pgTable('migration_audit', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SystemRole = typeof systemRoles.$inferSelect;
