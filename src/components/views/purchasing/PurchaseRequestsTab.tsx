import React, { useState } from 'react';
import { useI18n } from '../../../i18n/context.js';
import {
  FilePlus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  Plus,
  Trash2,
  AlertCircle,
  Building,
} from 'lucide-react';
import {
  PurchaseRequest,
  roundHalalas,
} from '../../../lib/purchasing.js';

interface PurchaseRequestsTabProps {
  requests: PurchaseRequest[];
  suppliers: Array<{ id: string; nameAr: string; nameEn: string; code: string }>;
  items: Array<{ id: string; sku: string; nameAr: string; nameEn: string; cost: number; units?: Array<{ id: string; nameAr: string }> }>;
  onRefresh: () => void;
  onConvertToPO?: (prId: string, supplierId: string) => void;
  getAuthHeaders?: () => Record<string, string>;
}

export const PurchaseRequestsTab: React.FC<PurchaseRequestsTabProps> = ({
  requests,
  suppliers,
  items,
  onRefresh,
  onConvertToPO,
}) => {
  const { isAr, formatCurrency, formatDate } = useI18n();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  // Create PR Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [prDepartment, setPrDepartment] = useState('Operations');
  const [prPriority, setPrPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [prRequiredDate, setPrRequiredDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [prNotes, setPrNotes] = useState('');
  const [prLines, setPrLines] = useState<
    Array<{
      itemId: string;
      uomId: string;
      requestedQuantity: number;
      estimatedUnitCostSar: number;
      purpose?: string;
    }>
  >([]);

  // Action Loading & Modal State
  const [actionLoading, setActionLoading] = useState(false);
  const [convertModalPR, setConvertModalPR] = useState<PurchaseRequest | null>(null);
  const [convertSupplierId, setConvertSupplierId] = useState(suppliers[0]?.id || '');
  const [rejectModalPR, setRejectModalPR] = useState<PurchaseRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const filteredRequests = requests.filter((r) => {
    const matchSearch =
      searchQuery === '' ||
      r.requestNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.requesterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.department.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const matchPriority = priorityFilter === 'ALL' || r.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  const addLine = () => {
    if (items.length === 0) return;
    const item = items[0];
    setPrLines([
      ...prLines,
      {
        itemId: item.id,
        uomId: item.units?.[0]?.id || 'BASE',
        requestedQuantity: 1,
        estimatedUnitCostSar: item.cost || 10,
        purpose: '',
      },
    ]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prLines.length === 0) return;

    try {
      setActionLoading(true);
      const res = await fetch('/api/v1/purchasing/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department: prDepartment,
          priority: prPriority,
          requiredDate: prRequiredDate,
          notes: prNotes,
          lines: prLines,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create request');
      }

      setIsCreateOpen(false);
      setPrLines([]);
      setPrNotes('');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmit = async (id: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/purchasing/requests/${id}/submit`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to submit PR');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/purchasing/requests/${id}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to approve PR');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectModalPR || !rejectReason.trim()) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/purchasing/requests/${rejectModalPR.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) throw new Error('Failed to reject PR');
      setRejectModalPR(null);
      setRejectReason('');
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!convertModalPR || !convertSupplierId) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/purchasing/requests/${convertModalPR.id}/convert-to-po`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: convertSupplierId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to convert to PO');
      }
      setConvertModalPR(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'URGENT':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">{isAr ? 'عاجل جداً' : 'Urgent'}</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{isAr ? 'مرتفع' : 'High'}</span>;
      case 'MEDIUM':
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{isAr ? 'متوسط' : 'Medium'}</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{isAr ? 'عادي' : 'Low'}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">{isAr ? 'معتمد' : 'Approved'}</span>;
      case 'SUBMITTED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{isAr ? 'قيد المراجعة' : 'Submitted'}</span>;
      case 'CONVERTED_TO_PO':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">{isAr ? 'تم التحويل لأمر شراء' : 'Converted to PO'}</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">{isAr ? 'مرفوض' : 'Rejected'}</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{isAr ? 'مسودة' : 'Draft'}</span>;
    }
  };

  return (
    <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-xs overflow-hidden">
      {/* Action Header */}
      <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between bg-slate-50/50">
        <div className="flex flex-1 items-center gap-3 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={isAr ? 'بحث برقم الطلب، اسم مقدم الطلب، أو القسم...' : 'Search PR #, requester, or department...'}
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
            <option value="DRAFT">{isAr ? 'مسودة' : 'Draft'}</option>
            <option value="SUBMITTED">{isAr ? 'قيد المراجعة' : 'Submitted'}</option>
            <option value="APPROVED">{isAr ? 'معتمد' : 'Approved'}</option>
            <option value="CONVERTED_TO_PO">{isAr ? 'تم التحويل' : 'Converted'}</option>
            <option value="REJECTED">{isAr ? 'مرفوض' : 'Rejected'}</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700"
          >
            <option value="ALL">{isAr ? 'كافة الأولويات' : 'All Priorities'}</option>
            <option value="URGENT">{isAr ? 'عاجل جداً' : 'Urgent'}</option>
            <option value="HIGH">{isAr ? 'مرتفع' : 'High'}</option>
            <option value="MEDIUM">{isAr ? 'متوسط' : 'Medium'}</option>
            <option value="LOW">{isAr ? 'منخفض' : 'Low'}</option>
          </select>
        </div>

        <button
          onClick={() => {
            if (prLines.length === 0) addLine();
            setIsCreateOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-xs"
        >
          <FilePlus className="w-4 h-4" />
          <span>{isAr ? 'طلب شراء داخلي جديد' : 'New Purchase Request'}</span>
        </button>
      </div>

      {/* Table List */}
      <div className="overflow-x-auto">
        <table className="w-full text-start text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-start">{isAr ? 'رقم الطلب' : 'PR Number'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'مقدم الطلب / القسم' : 'Requester / Dept'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'تاريخ الطلب / الاستحقاق' : 'Request / Req Date'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'الأولوية' : 'Priority'}</th>
              <th className="px-4 py-3 text-end">{isAr ? 'القيمة التقديرية' : 'Estimated Amount'}</th>
              <th className="px-4 py-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
              <th className="px-4 py-3 text-end">{isAr ? 'الإجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRequests.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  {isAr ? 'لا توجد طلبات شراء مطابقة' : 'No matching purchase requests found'}
                </td>
              </tr>
            ) : (
              filteredRequests.map((pr) => (
                <tr key={pr.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3.5 font-semibold text-indigo-600">
                    {pr.requestNumber}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-900">{pr.requesterName}</div>
                    <div className="text-xs text-slate-400">{pr.department}</div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-500">
                    <div>{formatDate(pr.requestDate)}</div>
                    <div className="text-slate-400">{isAr ? 'مطلوب في:' : 'Due:'} {pr.requiredByDate ? formatDate(pr.requiredByDate) : '—'}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    {getPriorityBadge(pr.priority)}
                  </td>
                  <td className="px-4 py-3.5 text-end font-semibold text-slate-900">
                    {formatCurrency(pr.totalEstimatedSar)}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {getStatusBadge(pr.status)}
                  </td>
                  <td className="px-4 py-3.5 text-end">
                    <div className="flex items-center justify-end gap-1.5">
                      {pr.status === 'DRAFT' && (
                        <button
                          onClick={() => handleSubmit(pr.id)}
                          disabled={actionLoading}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
                        >
                          {isAr ? 'تقديم للمراجعة' : 'Submit'}
                        </button>
                      )}

                      {pr.status === 'SUBMITTED' && (
                        <>
                          <button
                            onClick={() => handleApprove(pr.id)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isAr ? 'اعتماد' : 'Approve'}</span>
                          </button>
                          <button
                            onClick={() => setRejectModalPR(pr)}
                            disabled={actionLoading}
                            className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>{isAr ? 'رفض' : 'Reject'}</span>
                          </button>
                        </>
                      )}

                      {pr.status === 'APPROVED' && (
                        <button
                          onClick={() => setConvertModalPR(pr)}
                          disabled={actionLoading}
                          className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg flex items-center gap-1"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <span>{isAr ? 'تحويل لأمر شراء' : 'Convert to PO'}</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Create PR */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              {isAr ? 'إنشاء طلب شراء داخلي جديد (Purchase Request)' : 'Create Internal Purchase Request'}
            </h2>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'القسم / الإدارة' : 'Department'}
                  </label>
                  <input
                    type="text"
                    value={prDepartment}
                    onChange={(e) => setPrDepartment(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'الأولوية' : 'Priority'}
                  </label>
                  <select
                    value={prPriority}
                    onChange={(e: any) => setPrPriority(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="LOW">{isAr ? 'منخفض' : 'Low'}</option>
                    <option value="MEDIUM">{isAr ? 'متوسط' : 'Medium'}</option>
                    <option value="HIGH">{isAr ? 'مرتفع' : 'High'}</option>
                    <option value="URGENT">{isAr ? 'عاجل جداً' : 'Urgent'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'تاريخ الاحتياج' : 'Required Date'}
                  </label>
                  <input
                    type="date"
                    value={prRequiredDate}
                    onChange={(e) => setPrRequiredDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">
                    {isAr ? 'بنود طلب الشراء' : 'Requested Line Items'}
                  </span>
                  <button
                    type="button"
                    onClick={addLine}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إضافة بند' : 'Add Item'}</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto border border-slate-100 p-2 rounded-xl bg-slate-50/50">
                  {prLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                      <select
                        value={line.itemId}
                        onChange={(e) => {
                          const item = items.find((i) => i.id === e.target.value);
                          const updated = [...prLines];
                          updated[idx] = {
                            ...updated[idx],
                            itemId: e.target.value,
                            estimatedUnitCostSar: item?.cost || 10,
                          };
                          setPrLines(updated);
                        }}
                        className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                      >
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.sku} - {isAr ? i.nameAr : i.nameEn}
                          </option>
                        ))}
                      </select>

                      <div className="w-20">
                        <input
                          type="number"
                          min="1"
                          placeholder={isAr ? 'الكمية' : 'Qty'}
                          value={line.requestedQuantity}
                          onChange={(e) => {
                            const updated = [...prLines];
                            updated[idx].requestedQuantity = Number(e.target.value);
                            setPrLines(updated);
                          }}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-center"
                        />
                      </div>

                      <div className="w-24">
                        <input
                          type="number"
                          step="0.01"
                          placeholder={isAr ? 'التكلفة التقديرية' : 'Est. Cost'}
                          value={line.estimatedUnitCostSar}
                          onChange={(e) => {
                            const updated = [...prLines];
                            updated[idx].estimatedUnitCostSar = Number(e.target.value);
                            setPrLines(updated);
                          }}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-center"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => setPrLines(prLines.filter((_, i) => i !== idx))}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isAr ? 'ملاحظات وتبرير الشراء' : 'Purchase Justification & Notes'}
                </label>
                <textarea
                  value={prNotes}
                  onChange={(e) => setPrNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  placeholder={isAr ? 'سبب طلب المواد...' : 'State the business requirement...'}
                />
              </div>

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
                  disabled={actionLoading || prLines.length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-xs"
                >
                  {isAr ? 'حفظ مسودة الطلب' : 'Save Draft PR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Convert PR to PO */}
      {convertModalPR && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">
              {isAr ? `تحويل الطلب ${convertModalPR.requestNumber} إلى أمر شراء` : `Convert ${convertModalPR.requestNumber} to PO`}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {isAr
                ? 'اختر المورد المعتمد لإنشاء أمر الشراء الرسمي، وسيتم ربط البنود والكميات تلقائياً.'
                : 'Select the approved vendor to issue the formal Purchase Order.'}
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'المورد المعتمد' : 'Selected Supplier'}
              </label>
              <select
                value={convertSupplierId}
                onChange={(e) => setConvertSupplierId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {isAr ? s.nameAr : s.nameEn}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConvertModalPR(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleConvert}
                disabled={actionLoading}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold shadow-xs"
              >
                {isAr ? 'تأكيد وإنشاء أمر الشراء' : 'Confirm & Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reject PR */}
      {rejectModalPR && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-rose-700 mb-2">
              {isAr ? `رفض طلب الشراء ${rejectModalPR.requestNumber}` : `Reject PR ${rejectModalPR.requestNumber}`}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {isAr ? 'يرجى تدوين سبب الرفض لحفظه في سجل التدقيق والمتابعة.' : 'Please enter the reason for rejection.'}
            </p>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder={isAr ? 'سبب الرفض...' : 'Reason...'}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm mb-4"
              required
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRejectModalPR(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold shadow-xs"
              >
                {isAr ? 'تأكيد الرفض' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
