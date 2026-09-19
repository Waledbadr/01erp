import React, { useState } from 'react';
import { useI18n } from '../../../i18n/context.js';
import {
  Truck,
  Plus,
  Search,
  CheckCircle,
  AlertTriangle,
  Clock,
  Layers,
  Sparkles,
  Ship,
  Eye,
  FileCheck,
} from 'lucide-react';
import {
  GoodsReceiptNote,
  PurchaseOrder,
  roundHalalas,
} from '../../../lib/purchasing.js';

interface GoodsReceiptNotesTabProps {
  receipts: GoodsReceiptNote[];
  orders: PurchaseOrder[];
  warehouses: Array<{ id: string; nameAr: string }>;
  items: Array<{ id: string; sku: string; nameAr: string; nameEn: string }>;
  onRefresh: () => void;
  onOpenLandedCostModal?: (grnId: string) => void;
}

export const GoodsReceiptNotesTab: React.FC<GoodsReceiptNotesTabProps> = ({
  receipts,
  orders,
  warehouses,
  items,
  onRefresh,
  onOpenLandedCostModal,
}) => {
  const { isAr, formatCurrency, formatDate } = useI18n();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Create GRN Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedPOId, setSelectedPOId] = useState('');
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || '');
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [grnNotes, setGrnNotes] = useState('');
  const [grnLines, setGrnLines] = useState<
    Array<{
      poLineId: string;
      itemId: string;
      orderedQuantity: number;
      receivedQuantity: number;
      acceptedQuantity: number;
      rejectedQuantity: number;
      rejectionReason?: string;
      batchNumber?: string;
      expiryDate?: string;
    }>
  >([]);

  const [actionLoading, setActionLoading] = useState(false);
  const [viewingGRN, setViewingGRN] = useState<GoodsReceiptNote | null>(null);

  const filteredReceipts = receipts.filter((r) => {
    const matchSearch =
      searchQuery === '' ||
      r.grnNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.supplierNameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.purchaseOrderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.deliveryNoteNumber && r.deliveryNoteNumber.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleSelectPO = (poId: string) => {
    setSelectedPOId(poId);
    const po = orders.find((o) => o.id === poId);
    if (!po) return;

    setGrnLines(
      po.lines.map((l) => ({
        poLineId: l.id,
        itemId: l.itemId,
        orderedQuantity: l.quantity,
        receivedQuantity: l.remainingQuantity || l.quantity,
        acceptedQuantity: l.remainingQuantity || l.quantity,
        rejectedQuantity: 0,
        batchNumber: `BAT-${Date.now().toString().slice(-4)}`,
        expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      }))
    );
  };

  const handleCreateGRN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPOId || !warehouseId || grnLines.length === 0) return;

    try {
      setActionLoading(true);
      const res = await fetch('/api/v1/purchasing/grn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseOrderId: selectedPOId,
          warehouseId,
          deliveryNoteNumber: deliveryNoteNumber.trim() || undefined,
          carrierName: carrierName.trim() || undefined,
          driverName: driverName.trim() || undefined,
          vehiclePlate: vehiclePlate.trim() || undefined,
          notes: grnNotes,
          lines: grnLines,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create GRN');
      }

      setIsCreateOpen(false);
      setSelectedPOId('');
      setDeliveryNoteNumber('');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-xs overflow-hidden">
      {/* Top Filter Bar */}
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between bg-slate-50/50">
        <div className="flex flex-1 items-center gap-3 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={isAr ? 'بحث برقم السند، أمر الشراء، بوليصة الشحن، أو المورد...' : 'Search GRN #, PO #, delivery note, or supplier...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full ps-9 pe-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700"
          >
            <option value="ALL">{isAr ? 'كافة الحالات' : 'All Statuses'}</option>
            <option value="COMPLETED">{isAr ? 'مكتمل الاستلام' : 'Completed'}</option>
            <option value="DRAFT">{isAr ? 'مسودة' : 'Draft'}</option>
            <option value="INSPECTED">{isAr ? 'تم الفحص' : 'Inspected'}</option>
          </select>
        </div>

        <button
          onClick={() => {
            if (orders.length > 0 && !selectedPOId) {
              handleSelectPO(orders[0].id);
            }
            setIsCreateOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? 'سند استلام بضاعة جديد (GRN)' : 'New Goods Receipt (GRN)'}</span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-start text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-start">{isAr ? 'رقم السند' : 'GRN Number'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'أمر الشراء' : 'PO Number'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'المورد' : 'Supplier'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'المستودع / الاستلام' : 'Warehouse / Date'}</th>
              <th className="px-4 py-3 text-center">{isAr ? 'البنود المستلمة' : 'Received Qty'}</th>
              <th className="px-4 py-3 text-end">{isAr ? 'تكلفة إنزال مخصصة' : 'Landed Cost'}</th>
              <th className="px-4 py-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
              <th className="px-4 py-3 text-end">{isAr ? 'الإجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredReceipts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                  {isAr ? 'لا توجد سندات استلام مسجلة' : 'No goods receipt notes found'}
                </td>
              </tr>
            ) : (
              filteredReceipts.map((grn) => {
                const totalAccepted = grn.lines.reduce((acc, l) => acc + l.quantity, 0);
                const totalRejected = 0;

                return (
                  <tr key={grn.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-semibold text-indigo-600">
                      {grn.grnNumber}
                      {grn.deliveryNoteNumber && (
                        <div className="text-xs text-slate-400 font-normal">
                          {isAr ? 'بوليصة:' : 'DN:'} {grn.deliveryNoteNumber}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-900">
                      {grn.purchaseOrderNumber}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-900">{grn.supplierNameAr}</div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500">
                      <div className="font-medium text-slate-700">{grn.warehouseNameAr}</div>
                      <div>{formatDate(grn.receiptDate)}</div>
                    </td>
                    <td className="px-4 py-3.5 text-center text-xs">
                      <span className="font-bold text-emerald-600">{totalAccepted}</span>
                      {totalRejected > 0 && (
                        <span className="text-rose-600 font-semibold ms-1.5">
                          ({isAr ? 'مرفوض:' : 'Rej:'} {totalRejected})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-end font-semibold text-slate-900">
                      {(grn.landedCostAllocatedSar || 0) > 0 ? (
                        <span className="text-purple-600">
                          +{formatCurrency(grn.landedCostAllocatedSar || 0)}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                        {isAr ? 'مكتمل ومضاف للمخزون' : 'Completed'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewingGRN(grn)}
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title={isAr ? 'عرض التفاصيل' : 'View Details'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {onOpenLandedCostModal && (
                          <button
                            onClick={() => onOpenLandedCostModal(grn.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg flex items-center gap-1"
                            title={isAr ? 'تخصيص تكاليف شحن وجمارك' : 'Allocate Landed Cost'}
                          >
                            <Ship className="w-3.5 h-3.5" />
                            <span>{isAr ? 'تكاليف إضافية' : 'Landed Cost'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Create GRN */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <h2 className="text-lg font-bold text-slate-900 mb-2">
              {isAr ? 'سند استلام بضاعة ومطابقة المستودع (GRN)' : 'Goods Receipt Note & Quality Inspection'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {isAr
                ? 'استلام البضائع يحدّث أرصدة المخزون بالدفعات (Batches) وتواريخ الصلاحية، ويمكّن المطابقة الثلاثية 3-Way Matching.'
                : 'Receiving items updates perpetual inventory batches & expiry dates, unlocking 3-Way Matching against bills.'}
            </p>

            <form onSubmit={handleCreateGRN} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'أمر الشراء المرجعي' : 'Purchase Order'}
                  </label>
                  <select
                    value={selectedPOId}
                    onChange={(e) => handleSelectPO(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    required
                  >
                    <option value="">{isAr ? '-- اختر أمر الشراء --' : '-- Select Purchase Order --'}</option>
                    {orders
                      .filter((o) => o.status === 'CONFIRMED' || o.status === 'PARTIALLY_RECEIVED')
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.orderNumber} - {o.supplierNameAr} ({isAr ? 'إجمالي:' : 'Total:'} {formatCurrency(o.totalAmountSar)})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'مستودع الاستلام' : 'Destination Warehouse'}
                  </label>
                  <select
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    required
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'رقم بوليصة الشحن / سند تسليم المورد' : 'Supplier Delivery Note #'}
                  </label>
                  <input
                    type="text"
                    value={deliveryNoteNumber}
                    onChange={(e) => setDeliveryNoteNumber(e.target.value)}
                    placeholder="DN-2026-XYZ"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'شركة الشحن / السائق / رقم اللوحة' : 'Carrier / Driver / Plate #'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={carrierName}
                      onChange={(e) => setCarrierName(e.target.value)}
                      placeholder={isAr ? 'الناقل' : 'Carrier'}
                      className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs"
                    />
                    <input
                      type="text"
                      value={vehiclePlate}
                      onChange={(e) => setVehiclePlate(e.target.value)}
                      placeholder={isAr ? 'لوحة الشاحنة' : 'Plate #'}
                      className="w-full px-2 py-2 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Line Items Receiving & Inspection */}
              {grnLines.length > 0 && (
                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-2">
                    {isAr ? 'فحص واستلام البنود (مع أرقام التشغيلات والصلاحية)' : 'Line Item Inspection, Batches & Expiry'}
                  </span>

                  <div className="space-y-2 max-h-64 overflow-y-auto border border-slate-200 p-2 rounded-xl bg-slate-50/50">
                    {grnLines.map((line, idx) => {
                      const item = items.find((i) => i.id === line.itemId);
                      return (
                        <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">
                              {item?.sku} - {isAr ? item?.nameAr : item?.nameEn}
                            </span>
                            <span className="text-slate-500">
                              {isAr ? 'الكمية في أمر الشراء:' : 'PO Qty:'} <strong>{line.orderedQuantity}</strong>
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <label className="block text-slate-500 text-[10px] mb-0.5">
                                {isAr ? 'الكمية المستلمة' : 'Received Qty'}
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={line.receivedQuantity}
                                onChange={(e) => {
                                  const updated = [...grnLines];
                                  const val = Number(e.target.value);
                                  updated[idx].receivedQuantity = val;
                                  updated[idx].acceptedQuantity = val - (updated[idx].rejectedQuantity || 0);
                                  setGrnLines(updated);
                                }}
                                className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs font-semibold text-indigo-600"
                              />
                            </div>

                            <div>
                              <label className="block text-slate-500 text-[10px] mb-0.5">
                                {isAr ? 'المقبول (سليم)' : 'Accepted Qty'}
                              </label>
                              <input
                                type="number"
                                min="0"
                                value={line.acceptedQuantity}
                                onChange={(e) => {
                                  const updated = [...grnLines];
                                  updated[idx].acceptedQuantity = Number(e.target.value);
                                  setGrnLines(updated);
                                }}
                                className="w-full px-2 py-1 border border-emerald-300 bg-emerald-50/30 rounded-md text-xs font-semibold text-emerald-700"
                              />
                            </div>

                            <div>
                              <label className="block text-slate-500 text-[10px] mb-0.5">
                                {isAr ? 'رقم التشغيلة (Batch)' : 'Batch Number'}
                              </label>
                              <input
                                type="text"
                                value={line.batchNumber}
                                onChange={(e) => {
                                  const updated = [...grnLines];
                                  updated[idx].batchNumber = e.target.value;
                                  setGrnLines(updated);
                                }}
                                className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-slate-500 text-[10px] mb-0.5">
                                {isAr ? 'تاريخ الصلاحية' : 'Expiry Date'}
                              </label>
                              <input
                                type="date"
                                value={line.expiryDate}
                                onChange={(e) => {
                                  const updated = [...grnLines];
                                  updated[idx].expiryDate = e.target.value;
                                  setGrnLines(updated);
                                }}
                                className="w-full px-2 py-1 border border-slate-200 rounded-md text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !selectedPOId}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-xs"
                >
                  {isAr ? 'تأكيد الاستلام وإضافة للمخزون' : 'Confirm Receipt & Post to Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View GRN Details */}
      {viewingGRN && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {viewingGRN.grnNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  {viewingGRN.supplierNameAr} | {viewingGRN.purchaseOrderNumber}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                {isAr ? 'مكتمل' : 'Completed'}
              </span>
            </div>

            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {viewingGRN.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs">
                  <div>
                    <div className="font-bold text-slate-800">{l.nameAr}</div>
                    <div className="text-slate-400">
                      {isAr ? 'تشغيلة:' : 'Batch:'} {l.batchNumber || '-'} | {isAr ? 'صلاحية:' : 'Exp:'} {l.expiryDate ? formatDate(l.expiryDate) : '-'}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="font-bold text-emerald-600">{l.quantity} {l.uomName}</div>
                    {(l.landedCostShareSar || 0) > 0 && (
                      <div className="text-[10px] text-purple-600">
                        +{formatCurrency(l.landedCostShareSar || 0)} {isAr ? 'تكاليف إضافية' : 'landed'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setViewingGRN(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
