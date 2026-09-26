/**
 * Registry of in-memory stores that hold company (tenant) data.
 *
 * Modules register their Maps / arrays here at load time. tenantStatePersistence then saves
 * and restores each company's slice of every registered store. This file has no imports so
 * any module can use it without creating import cycles.
 *
 * A company's slice of a Map is every entry whose
 *   - key equals the tenant id, or starts with `${tenantId}:`, or
 *   - value has `tenantId === tenantId` (or is an array whose first element does), or
 *   - key is in the `owners(tenantId)` set given at registration (e.g. lines keyed by journal id).
 * A company's slice of an array is every element with `tenantId === tenantId`.
 */
export type TenantStateContainer = Map<unknown, unknown> | unknown[];

export interface TenantStateRegistration {
  name: string;
  container: TenantStateContainer;
  owners?: (tenantId: string) => Set<string>;
  /** Called after a company's slice was replaced from the database (rebuild derived indexes). */
  afterLoad?: (tenantId: string) => void;
}

const registrations = new Map<string, TenantStateRegistration>();

export function registerTenantState(
  name: string,
  container: TenantStateContainer,
  options: { owners?: (tenantId: string) => Set<string>; afterLoad?: (tenantId: string) => void } = {},
): void {
  registrations.set(name, { name, container, owners: options.owners, afterLoad: options.afterLoad });
}

export function getTenantStateRegistrations(): TenantStateRegistration[] {
  return [...registrations.values()];
}
