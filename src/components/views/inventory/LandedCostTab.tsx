import React, { useState, useEffect } from 'react';
import { useI18n } from '../../../i18n/context.js';
import { Button } from '../../ui/Button.js';
import { Badge } from '../../ui/Badge.js';
import { useToast } from '../../ui/Toast.js';
import {
  Ship,
  Plus,
  RefreshCw,
  Coins,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Building2,
  Trash2,
  Layers,
  FileSpreadsheet,
} from 'lucide-react';
import { LandedCostDocument, LandedCostAllocationMethod, LandedCostCategory } from '../../../lib/inventory.js';

interface LandedCostTabProps {
  items: Array<{
    id: string;
    sku: string;
    nameAr: string;
    baseUnit: string;
    cost?: number;
    currentWac?: number;
  }>;
  getAuthHeaders: () => Record<string, string>;
}

export const LandedCostTab: React.FC<LandedCostTabProps> = ({ items, getAuthHeaders }) => {
  const { language, isRTL } = useI18n();
  const isAr = language === 'ar';
  const toast = useToast();

  const [documents, setDocuments] = useState<LandedCostDocument[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New Landed Cost Modal
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [purchaseInvoiceId, setPurchaseInvoiceId] = useState<string>('BILL-2026-0001');
  const [allocationMethod, setAllocationMethod] = useState<LandedCostAllocationMethod>('VALUE');
  const [costLines, setCostLines] = useState<
    Array<{ type: LandedCostCategory; description: string; amountSar: number }>
  >([
    { type: 'CUSTOMS', description: 'رسوم جمارك ميناء الملك عبد العزيز', amountSar: 1500 },
    { type: 'FREIGHT', description: 'أجور شحن ونقل بري', amountSar: 800 },
  ]);
  const [selectedItems, setSelectedItems] = useState<
    Array<{ itemId: string; quantity: number; basePrice: number; weightKg?: number }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v1/inventory/landed-costs', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const d = await res.json();
        setDocuments(d.documents || []);
      }
    } catch {
      toast.error(isAr ? 'فشل جلب وثائق تكاليف الاستيراد' : 'Failed to fetch landed cost documents');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleOpenNewModal = () => {
    if (items.length > 0) {
      setSelectedItems([
        {
          itemId: items[0].id,
          quantity: 100,
          basePrice: items[0].cost || 25,
          weightKg: 2,
        },
        ...(items.length > 1
          ? [
              {
                itemId: items[1].id,
                quantity: 50,
                basePrice: items[1].cost || 50,
                weightKg: 5,
              },
            ]
          : []),
      ]);
    }
    setShowNewModal(true);
  };

  const handleAddCostLine = () => {
    setCostLines([
      ...costLines,
      { type: 'CLEARANCE', description: 'تخليص ومناولة', amountSar: 450 },
    ]);
  };

  const handleRemoveCostLine = (index: number) => {
    setCostLines(costLines.filter((_, idx) => idx !== index));
  };

  const handleCostLineChange = (index: number, field: string, value: any) => {
    const updated = [...costLines];
    updated[index] = { ...updated[index], [field]: value };
    setCostLines(updated);
  };

  const handleAddItemLine = () => {
    if (items.length === 0) return;
    const it = items[0];
    setSelectedItems([
      ...selectedItems,
      { itemId: it.id, quantity: 10, basePrice: it.cost || 20, weightKg: 1 },
    ]);
  };

  const handleRemoveItemLine = (index: number) => {
    setSelectedItems(selectedItems.filter((_, idx) => idx !== index));
  };

  const handleItemLineChange = (index: number, field: string, value: any) => {
    const updated = [...selectedItems];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedItems(updated);
  };

  const totalExpenses = costLines.reduce((acc, c) => acc + (Number(c.amountSar) || 0), 0);
  const totalBaseValue = selectedItems.reduce(
    (acc, i) => acc + (Number(i.quantity) || 0) * (Number(i.basePrice) || 0),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalExpenses <= 0) {
      toast.error(isAr ? 'يجب إدخال تكاليف إضافية أكبر من الصفر' : 'Total costs must be > 0');
      return;
    }
    if (selectedItems.length === 0) {
      toast.error(isAr ? 'يجب اختيار أصناف للتوزيع عليها' : 'Select at least one item');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/inventory/landed-costs', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceBillId: purchaseInvoiceId,
          sourceBillNumber: purchaseInvoiceId,
          allocationMethod,
          costLines,
          items: selectedItems,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'فشل تخصيص تكاليف الشحن');
      }

      toast.success(isAr ? 'تم توزيع التكاليف بنجاح وتحديث WAC للأصناف' : 'Landed costs allocated & WAC updated');
      setShowNewModal(false);
      fetchDocuments();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getMethodBadge = (method: LandedCostAllocationMethod) => {
    switch (method) {
      case 'VALUE':
        return <Badge variant="brand">{isAr ? 'حسب القيمة المالية' : 'By Value'}</Badge>;
      case 'QUANTITY':
        return <Badge variant="info">{isAr ? 'حسب الكمية' : 'By Quantity'}</Badge>;
      case 'WEIGHT':
        return <Badge variant="warning">{isAr ? 'حسب الوزن' : 'By Weight'}</Badge>;
      case 'VOLUME':
        return <Badge variant="default">{isAr ? 'حسب الحجم' : 'By Volume'}</Badge>;
      case 'MANUAL':
        return <Badge variant="default">{isAr ? 'يدوي' : 'Manual'}</Badge>;
      default:
        return <Badge variant="default">{method}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Card */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Ship className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-neutral-900 text-sm">
              {isAr ? 'إدارة وتحميل تكاليف الاستيراد والشحن' : 'Landed Cost Allocation Engine'}
            </h3>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            {isAr
              ? 'توزيع تكاليف الشحن، الجمارك، والتأمين على تكلفة الشراء الأساسية للأصناف وتحديث متوسط التكلفة WAC آلياً'
              : 'Allocate freight, customs duty, and clearance onto purchase lots & update perpetual WAC.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchDocuments} disabled={isLoading}>
            <RefreshCw className={`w-3.5 h-3.5 me-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isAr ? 'تحديث' : 'Refresh'}
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenNewModal}>
            <Plus className="w-3.5 h-3.5 me-1.5" />
            {isAr ? 'تحميل تكاليف جديدة' : 'Allocate Landed Cost'}
          </Button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500">{isAr ? 'إجمالي الوثائق المحملة' : 'Allocated Documents'}</span>
          <div className="mt-1 text-2xl font-bold text-neutral-900">{documents.length}</div>
          <div className="text-[11px] text-neutral-400 mt-0.5">{isAr ? 'وثائق شحن وجمارك مرحلة' : 'Posted to GL & Inventory'}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500">{isAr ? 'إجمالي مصاريف الشحن والجمارك' : 'Total Landed Costs'}</span>
          <div className="mt-1 text-2xl font-bold text-indigo-700 font-mono">
            {documents
              .reduce((acc, d) => acc + (d.totalLandedCostSar || 0), 0)
              .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
            ر.س
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5">{isAr ? 'محملة بالكامل على تكلفة البضاعة' : 'Capitalized into inventory value'}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500">{isAr ? 'طرق التوزيع المدعومة' : 'Supported Methods'}</span>
          <div className="mt-1 text-sm font-semibold text-neutral-800">
            {isAr ? 'القيمة • الكمية • الوزن • الحجم • يدوي' : 'Value • Qty • Weight • Volume • Manual'}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5 flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            {isAr ? 'مطابق لمعايير المحاسبة الدولية IAS 2' : 'IAS 2 Compliant'}
          </div>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600">
              <tr>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'رقم الوثيقة' : 'Doc #'}</th>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'فاتورة الشراء المرجعية' : 'Purchase Bill'}</th>
                <th className="py-3 px-4 font-semibold text-start">{isAr ? 'طريقة التوزيع' : 'Allocation Method'}</th>
                <th className="py-3 px-4 font-semibold text-end">{isAr ? 'إجمالي المصاريف (ر.س)' : 'Total Costs (SAR)'}</th>
                <th className="py-3 px-4 font-semibold text-end">{isAr ? 'الأصناف المحملة' : 'Items'}</th>
                <th className="py-3 px-4 font-semibold text-center">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="py-3 px-4 font-semibold text-center">{isAr ? 'التفاصيل' : 'Details'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-500">
                    <Ship className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                    {isAr ? 'لا توجد وثائق تكاليف استيراد مسجلة' : 'No landed cost documents yet'}
                  </td>
                </tr>
              ) : (
                documents.map((doc) => {
                  const isExpanded = expandedId === doc.id;
                  return (
                    <React.Fragment key={doc.id}>
                      <tr className="hover:bg-neutral-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-primary-700">
                          {doc.documentNumber}
                        </td>
                        <td className="py-3 px-4 font-mono text-neutral-800">{doc.sourceBillNumber || doc.sourceBillId}</td>
                        <td className="py-3 px-4 whitespace-nowrap">{getMethodBadge(doc.allocationMethod)}</td>
                        <td className="py-3 px-4 text-end font-mono font-bold text-emerald-700">
                          {(doc.totalLandedCostSar || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-end font-mono text-neutral-700">{doc.allocations?.length || 0}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant="success">{isAr ? 'موزع ومرحل' : 'Allocated'}</Badge>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        </td>
                      </tr>

                      {/* Line breakdown */}
                      {isExpanded && (
                        <tr className="bg-neutral-50/70">
                          <td colSpan={7} className="py-3 px-6">
                            <div className="bg-white p-3 rounded-lg border border-neutral-200 space-y-3">
                              <div>
                                <h4 className="text-xs font-semibold text-neutral-700 mb-1.5">
                                  {isAr ? 'عناصر التكاليف الإضافية:' : 'Cost Components:'}
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  {doc.costLines.map((c, i) => (
                                    <div key={i} className="bg-neutral-50 p-2 rounded border border-neutral-200">
                                      <div className="text-[11px] font-semibold text-neutral-800">{c.description}</div>
                                      <div className="text-xs font-mono font-bold text-emerald-700 mt-0.5">
                                        {c.amountSar.toFixed(2)} ر.س
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <h4 className="text-xs font-semibold text-neutral-700 mb-1.5">
                                  {isAr ? 'أثر التوزيع على تكلفة الوحدة ومتوسط التكلفة WAC:' : 'Unit Cost & WAC Impact:'}
                                </h4>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-neutral-500 border-b border-neutral-100">
                                      <th className="py-1 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                                      <th className="py-1 text-end">{isAr ? 'الكمية' : 'Qty'}</th>
                                      <th className="py-1 text-end">{isAr ? 'سعر الشراء الأساسي' : 'Base Price'}</th>
                                      <th className="py-1 text-end">{isAr ? 'المصروف المخصص للوحدة' : 'Allocated/Unit'}</th>
                                      <th className="py-1 text-end font-bold text-primary-800">{isAr ? 'التكلفة النهائية للوحدة' : 'Final Unit Cost'}</th>
                                      <th className="py-1 text-end font-bold text-emerald-700">{isAr ? 'إجمالي المحمل (ر.س)' : 'Total Allocated'}</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-neutral-100">
                                    {(doc.allocations || []).map((ai, idx) => (
                                      <tr key={idx}>
                                        <td className="py-1.5 font-medium text-neutral-800">{ai.itemNameAr || ai.sku || ai.itemId}</td>
                                        <td className="py-1.5 text-end font-mono text-neutral-700">{ai.quantity}</td>
                                        <td className="py-1.5 text-end font-mono text-neutral-600">{ai.basePrice.toFixed(2)}</td>
                                        <td className="py-1.5 text-end font-mono text-indigo-700">+{(ai.additionalCostPerUnit || 0).toFixed(2)}</td>
                                        <td className="py-1.5 text-end font-mono font-bold text-neutral-900">{(ai.effectiveUnitCost || 0).toFixed(2)}</td>
                                        <td className="py-1.5 text-end font-mono font-bold text-emerald-700">{(ai.allocatedAmount || 0).toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Landed Cost Document Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-neutral-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-neutral-200">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
              <div className="flex items-center gap-2">
                <Ship className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-semibold text-neutral-900">
                    {isAr ? 'إثبات وتوزيع تكاليف الشحن والاستيراد' : 'Allocate Landed Cost Document'}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {isAr
                      ? 'تحميل مصاريف الشحن والجمارك على المخزون وتحديث WAC آلياً'
                      : 'Capitalize landed expenses to inventory & recalculate WAC'}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowNewModal(false)}>
                ✕
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-700 mb-1">
                    {isAr ? 'رقم فاتورة الشراء الأصلية *' : 'Purchase Bill Reference *'}
                  </label>
                  <input
                    type="text"
                    value={purchaseInvoiceId}
                    onChange={(e) => setPurchaseInvoiceId(e.target.value)}
                    className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800 font-mono"
                    placeholder="e.g. BILL-2026-0001"
                    required
                  />
                </div>

                <div>
                  <label className="block font-medium text-neutral-700 mb-1">
                    {isAr ? 'طريقة احتساب وتوزيع التكاليف *' : 'Allocation Math Method *'}
                  </label>
                  <select
                    value={allocationMethod}
                    onChange={(e: any) => setAllocationMethod(e.target.value)}
                    className="w-full text-xs rounded-lg border border-neutral-300 p-2 text-neutral-800"
                    required
                  >
                    <option value="VALUE">{isAr ? 'نسبياً حسب القيمة المالية الأصلية (By Value)' : 'By Value'}</option>
                    <option value="QUANTITY">{isAr ? 'بالتساوي حسب عدد الوحدات والكمية (By Quantity)' : 'By Quantity'}</option>
                    <option value="WEIGHT">{isAr ? 'نسبياً حسب الوزن الإجمالي كجم (By Weight)' : 'By Weight'}</option>
                    <option value="VOLUME">{isAr ? 'نسبياً حسب الحجم التخزيني م³ (By Volume)' : 'By Volume'}</option>
                    <option value="MANUAL">{isAr ? 'تخصيص يدوي مباشر (Manual)' : 'Manual'}</option>
                  </select>
                </div>
              </div>

              {/* Cost Elements */}
              <div className="border border-neutral-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-semibold text-neutral-800">
                    {isAr ? 'عناصر ومصاريف الشحن والاستيراد (ر.س)' : 'Cost Elements (SAR)'}
                  </h4>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddCostLine}>
                    <Plus className="w-3.5 h-3.5 me-1" />
                    {isAr ? 'إضافة بند مصروف' : 'Add Cost Line'}
                  </Button>
                </div>

                <div className="space-y-2">
                  {costLines.map((cl, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-neutral-50 p-2 rounded-lg border border-neutral-200">
                      <select
                        value={cl.type}
                        onChange={(e: any) => handleCostLineChange(idx, 'type', e.target.value)}
                        className="w-36 text-xs rounded border border-neutral-300 p-1.5 bg-white text-neutral-800"
                      >
                        <option value="CUSTOMS">{isAr ? 'رسوم جمركية' : 'Customs Duty'}</option>
                        <option value="FREIGHT">{isAr ? 'شحن ونقل' : 'Freight'}</option>
                        <option value="CLEARANCE">{isAr ? 'تخليص جمركي' : 'Clearance'}</option>
                        <option value="INSURANCE">{isAr ? 'تأمين نقل' : 'Insurance'}</option>
                        <option value="HANDLING">{isAr ? 'مناولة وتفريغ' : 'Handling'}</option>
                        <option value="OTHER">{isAr ? 'أخرى' : 'Other'}</option>
                      </select>

                      <input
                        type="text"
                        placeholder={isAr ? 'بيان المصروف' : 'Description'}
                        value={cl.description}
                        onChange={(e) => handleCostLineChange(idx, 'description', e.target.value)}
                        className="flex-1 text-xs rounded border border-neutral-300 p-1.5 bg-white text-neutral-800"
                        required
                      />

                      <div className="w-28">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={isAr ? 'المبلغ ر.س' : 'Amount SAR'}
                          value={cl.amountSar}
                          onChange={(e) => handleCostLineChange(idx, 'amountSar', Number(e.target.value))}
                          className="w-full text-xs rounded border border-neutral-300 p-1.5 bg-white text-neutral-800 font-mono font-bold text-end"
                          required
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveCostLine(idx)}
                        className="text-neutral-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-1 font-bold text-xs text-neutral-800">
                  <span>{isAr ? 'إجمالي المصاريف الإضافية:' : 'Total Expenses:'} </span>
                  <span className="font-mono text-emerald-700 ms-2">{totalExpenses.toFixed(2)} ر.س</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-neutral-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-semibold text-neutral-800">
                    {isAr ? 'الأصناف المراد تحميل التكلفة عليها' : 'Items to Distribute Costs Over'}
                  </h4>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddItemLine}>
                    <Plus className="w-3.5 h-3.5 me-1" />
                    {isAr ? 'إضافة صنف' : 'Add Item'}
                  </Button>
                </div>

                <div className="space-y-2">
                  {selectedItems.map((itLine, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-neutral-50 p-2 rounded-lg border border-neutral-200">
                      <div className="flex-1">
                        <select
                          value={itLine.itemId}
                          onChange={(e) => handleItemLineChange(idx, 'itemId', e.target.value)}
                          className="w-full text-xs rounded border border-neutral-300 p-1.5 bg-white text-neutral-800"
                        >
                          {items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.sku} - {i.nameAr} ({i.baseUnit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-24">
                        <label className="text-[10px] text-neutral-500 block">{isAr ? 'الكمية' : 'Qty'}</label>
                        <input
                          type="number"
                          min="1"
                          value={itLine.quantity}
                          onChange={(e) => handleItemLineChange(idx, 'quantity', Number(e.target.value))}
                          className="w-full text-xs rounded border border-neutral-300 p-1 bg-white text-neutral-800 font-bold"
                          required
                        />
                      </div>

                      <div className="w-28">
                        <label className="text-[10px] text-neutral-500 block">{isAr ? 'سعر الشراء' : 'Base Price'}</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={itLine.basePrice}
                          onChange={(e) => handleItemLineChange(idx, 'basePrice', Number(e.target.value))}
                          className="w-full text-xs rounded border border-neutral-300 p-1 bg-white text-neutral-800 font-mono"
                          required
                        />
                      </div>

                      {allocationMethod === 'WEIGHT' && (
                        <div className="w-24">
                          <label className="text-[10px] text-neutral-500 block">{isAr ? 'الوزن (كجم)' : 'Weight'}</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={itLine.weightKg || 1}
                            onChange={(e) => handleItemLineChange(idx, 'weightKg', Number(e.target.value))}
                            className="w-full text-xs rounded border border-neutral-300 p-1 bg-white text-neutral-800 font-mono"
                          />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveItemLine(idx)}
                        className="text-neutral-400 hover:text-rose-600 p-1 self-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-1 font-bold text-xs text-neutral-800">
                  <span>{isAr ? 'إجمالي قيمة الأصناف الأساسية:' : 'Base Items Value:'} </span>
                  <span className="font-mono text-neutral-700 ms-2">{totalBaseValue.toFixed(2)} ر.س</span>
                </div>
              </div>

              {/* Accounting preview */}
              <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-lg text-indigo-900 text-[11px] flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <p>
                  {isAr
                    ? 'سيتم توليد قيد اليومية المتزن تلقائياً: مدين: مخزون البضائع (10401) / دائن: حساب مستحقات الموردين / النقدية (20101) بمبلغ إجمالي متطابق تماماً.'
                    : 'Auto-balanced GL Journal: Dr Inventory (10401) / Cr Payables (20101).'}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewModal(false)}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={isSubmitting || selectedItems.length === 0}>
                  {isSubmitting ? (isAr ? 'جاري التوزيع...' : 'Allocating...') : (isAr ? 'اعتماد وترحيل التكاليف' : 'Post Allocation')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
