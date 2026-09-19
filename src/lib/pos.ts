/**
 * Point of Sale (POS) Client Library & Offline Sync Engine — Saudi ERP Platform
 * Manages Fast Checkout, Offline Local Queue, Hardware Wedge Barcode Scanner, Audio Synthesizer, and Thermal Print Generation.
 */

import {
  PosRegister,
  PosShift,
  CashMovement,
  PosOrder,
  HeldCart,
  XReportData,
  ZReportData,
  PosCartItem,
  PosPaymentSplit,
  PosTenderType,
} from '../../server/modules/pos/types.js';

export interface PosProduct {
  itemId: string;
  itemCode: string;
  barcode: string;
  nameAr: string;
  nameEn: string;
  categoryAr: string;
  categoryEn: string;
  uom: string;
  unitPriceSar: number;
  costPriceSar?: number;
  vatRate: number;
  stockQuantity: number;
  quickKey?: string;
  isFavorite?: boolean;
  imageUrl?: string;
}

export interface OfflinePosOrder {
  offlineId: string;
  shiftId: string;
  registerId: string;
  items: PosCartItem[];
  payments: PosPaymentSplit[];
  customerId?: string;
  customerName?: string;
  createdAt: string;
  totalSar: number;
}

const OFFLINE_QUEUE_KEY = 'saudi_erp_pos_offline_queue_v1';
const ACTIVE_REGISTER_KEY = 'saudi_erp_pos_selected_register_v1';

// Web Audio API Synthesizer for POS Sound Feedback
class PosAudioSynth {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  public playScanBeep() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, this.ctx.currentTime); // High clear A6 tone
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch {
      // Audio context may be restricted by browser policy before first interaction
    }
  }

  public playSuccessChime() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      [1046.5, 1318.5, 1567.98, 2093.0].forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        gain.gain.setValueAtTime(0.15, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.18);
      });
    } catch {}
  }

  public playErrorBuzzer() {
    try {
      this.initCtx();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {}
  }
}

export const posAudio = new PosAudioSynth();

/**
 * Offline Storage Engine for POS
 */
export const PosOfflineStore = {
  getQueue(): OfflinePosOrder[] {
    try {
      const data = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  enqueue(order: OfflinePosOrder): void {
    const queue = this.getQueue();
    queue.push(order);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  },

  clearQueue(): void {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  },

  removeItems(ids: string[]): void {
    const queue = this.getQueue().filter((o) => !ids.includes(o.offlineId));
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  },

  getSavedRegisterId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_REGISTER_KEY);
    } catch {
      return null;
    }
  },

  saveRegisterId(registerId: string): void {
    localStorage.setItem(ACTIVE_REGISTER_KEY, registerId);
  },
};

/**
 * Client-Side POS API Service
 */
export async function apiFetchPosCatalog(): Promise<PosProduct[]> {
  const res = await fetch('/api/pos/catalog');
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to fetch POS catalog');
  return data.catalog;
}

export async function apiFetchRegisters(tenantId = 'default-tenant'): Promise<PosRegister[]> {
  const res = await fetch(`/api/pos/registers?tenantId=${encodeURIComponent(tenantId)}`);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to fetch registers');
  return data.registers;
}

export async function apiFetchActiveShift(
  registerId: string,
  tenantId = 'default-tenant'
): Promise<{ hasActiveShift: boolean; shift: PosShift | null; register: PosRegister | null }> {
  const res = await fetch(
    `/api/pos/shifts/active/${encodeURIComponent(registerId)}?tenantId=${encodeURIComponent(tenantId)}`
  );
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to fetch active shift');
  return data;
}

export async function apiOpenShift(payload: {
  registerId: string;
  cashierId?: string;
  cashierName?: string;
  cashierRole?: string;
  openingFloatSar: number;
  tenantId?: string;
}): Promise<PosShift> {
  const res = await fetch('/api/pos/shifts/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to open shift');
  return data.shift;
}

export async function apiRecordCashMovement(payload: {
  shiftId: string;
  type: 'CASH_IN' | 'CASH_OUT';
  amountSar: number;
  reason?: string;
  performedBy?: string;
  tenantId?: string;
}): Promise<CashMovement> {
  const res = await fetch('/api/pos/shifts/cash-movement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to record cash movement');
  return data.movement;
}

export async function apiGenerateXReport(shiftId: string, tenantId = 'default-tenant'): Promise<XReportData> {
  const res = await fetch(`/api/pos/shifts/${encodeURIComponent(shiftId)}/x-report?tenantId=${encodeURIComponent(tenantId)}`);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to generate X-report');
  return data.report;
}

export async function apiCloseShift(
  shiftId: string,
  payload: {
    actualCashCountedSar: number;
    discrepancyReason?: string;
    supervisorApprovalId?: string;
    supervisorNotes?: string;
    tenantId?: string;
  }
): Promise<ZReportData> {
  const res = await fetch(`/api/pos/shifts/${encodeURIComponent(shiftId)}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to close shift');
  return data.zReport;
}

export async function apiProcessPosOrder(payload: {
  shiftId: string;
  registerId: string;
  items: PosCartItem[];
  payments: PosPaymentSplit[];
  customerId?: string;
  customerName?: string;
  customerVatNumber?: string;
  tenantId?: string;
}): Promise<PosOrder> {
  const res = await fetch('/api/pos/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to process POS order');
  return data.order;
}

export async function apiSyncOfflineOrders(
  offlineOrders: OfflinePosOrder[],
  tenantId = 'default-tenant'
): Promise<{ syncedCount: number; syncedOrders: PosOrder[]; errors: Array<{ offlineId: string; error: string }> }> {
  const res = await fetch('/api/pos/orders/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offlineOrders, tenantId }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to sync offline orders');
  return data;
}

export async function apiFetchHeldCarts(registerId?: string, tenantId = 'default-tenant'): Promise<HeldCart[]> {
  const url = registerId
    ? `/api/pos/held-carts?registerId=${encodeURIComponent(registerId)}&tenantId=${encodeURIComponent(tenantId)}`
    : `/api/pos/held-carts?tenantId=${encodeURIComponent(tenantId)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to fetch held carts');
  return data.heldCarts;
}

export async function apiHoldCart(payload: {
  registerId: string;
  cashierId: string;
  items: PosCartItem[];
  customerName?: string;
  note?: string;
  tenantId?: string;
}): Promise<HeldCart> {
  const res = await fetch('/api/pos/held-carts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to hold cart');
  return data.heldCart;
}

export async function apiResumeHeldCart(heldCartId: string, tenantId = 'default-tenant'): Promise<HeldCart> {
  const res = await fetch(`/api/pos/held-carts/${encodeURIComponent(heldCartId)}/resume?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to resume held cart');
  return data.resumedCart;
}

export async function apiDeleteHeldCart(heldCartId: string, tenantId = 'default-tenant'): Promise<boolean> {
  const res = await fetch(`/api/pos/held-carts/${encodeURIComponent(heldCartId)}?tenantId=${encodeURIComponent(tenantId)}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  return data.success;
}

export async function apiFetchOrders(shiftId?: string, registerId?: string, tenantId = 'default-tenant'): Promise<PosOrder[]> {
  let url = `/api/pos/orders?tenantId=${encodeURIComponent(tenantId)}`;
  if (shiftId) url += `&shiftId=${encodeURIComponent(shiftId)}`;
  if (registerId) url += `&registerId=${encodeURIComponent(registerId)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to fetch orders');
  return data.orders;
}
