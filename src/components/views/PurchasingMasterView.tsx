import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag,
  Plus,
  Search,
  Filter,
  Eye,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Receipt,
  FileCheck,
  Building2,
  Trash2,
  ArrowDownLeft,
  RefreshCw,
  Sparkles,
  DollarSign,
  Layers,
  Calendar,
  X,
  CreditCard,
  FileText,
  ShieldCheck,
  TrendingDown,
  Truck,
  RotateCcw,
  Check,
  ExternalLink,
  PackageCheck,
  Ship,
  History,
  Sliders,
  Printer,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import {
  PurchaseOrder,
  PurchaseBill,
  VendorDebitNote,
  SupplierPayment,
  PurchaseRequest,
  GoodsReceiptNote,
  calculatePurchasingLine,
  calculatePurchasingTotals,
  roundHalalas,
} from '../../lib/purchasing.js';
import { PurchaseRequestsTab } from './purchasing/PurchaseRequestsTab.js';
import { GoodsReceiptNotesTab } from './purchasing/GoodsReceiptNotesTab.js';
import { ThreeWayMatchingTab } from './purchasing/ThreeWayMatchingTab.js';
import { LandedCostPurchasingTab } from './purchasing/LandedCostPurchasingTab.js';
import { SupplierPriceHistoryTab } from './purchasing/SupplierPriceHistoryTab.js';
import { PaymentReallocationModal } from './purchasing/PaymentReallocationModal.js';
import { DocumentActionModal } from '../documents/DocumentActionModal.js';

interface PurchasingMasterViewProps {
  onNavigate?: (route: string) => void;
}

interface SupplierOption {
  id: string;
  nameAr: string;
  nameEn: string;
  code: string;
  vatNumber?: string;
  crNumber?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  creditLimit?: number;
  ledgerBalanceSar?: number;
}

interface ItemOption {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  baseUnit: string;
  cost: number;
  currentWac: number;
  taxRate: number;
  currentStock: number;
  units?: Array<{ id: string; nameAr: string; conversionFactor: number; cost?: number }>;
}

export function PurchasingMasterView({ onNavigate }: PurchasingMasterViewProps) {
  const { isAr, formatCurrency, formatDate } = useI18n();

  // Primary Navigation Tabs
  const [activeTab, setActiveTab] = useState<
    'BILLS' | 'REQUESTS' | 'ORDERS' | 'GRN' | 'MATCHING' | 'LANDED_COST' | 'DEBIT_NOTES' | 'PAYMENTS' | 'PRICE_HISTORY' | 'AGING'
  >('BILLS');

  // Master Data State
  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [receipts, setReceipts] = useState<GoodsReceiptNote[]>([]);
  const [debitNotes, setDebitNotes] = useState<VendorDebitNote[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; nameAr: string }>>([]);
  const [agingData, setAgingData] = useState<any[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Reallocation Modal
  const [selectedPaymentForReallocation, setSelectedPaymentForReallocation] = useState<SupplierPayment | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterSupplier, setFilterSupplier] = useState<string>('ALL');

  // Modals
  const [isCreateBillOpen, setIsCreateBillOpen] = useState<boolean>(false);
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState<boolean>(false);
  const [isCreatePaymentOpen, setIsCreatePaymentOpen] = useState<boolean>(false);
  const [isCreateDebitNoteOpen, setIsCreateDebitNoteOpen] = useState<boolean>(false);
  const [viewingBill, setViewingBill] = useState<PurchaseBill | null>(null);
  const [selectedBillForDocumentAction, setSelectedBillForDocumentAction] = useState<PurchaseBill | null>(null);

  // Form State: New Purchase Bill
  const [billSupplierId, setBillSupplierId] = useState<string>('');
  const [billWarehouseId, setBillWarehouseId] = useState<string>('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState<string>('');
  const [billIssueDate, setBillIssueDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [billDueDate, setBillDueDate] = useState<string>(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );
  const [billPaymentMethod, setBillPaymentMethod] = useState<'CREDIT_ACCOUNT' | 'CASH' | 'BANK_TRANSFER'>('CREDIT_ACCOUNT');
  const [billNotes, setBillNotes] = useState<string>('');
  const [billPostImmediately, setBillPostImmediately] = useState<boolean>(true);
  const [linkedPurchaseOrderId, setLinkedPurchaseOrderId] = useState<string>('');
  const [billLines, setBillLines] = useState<
    Array<{
      itemId: string;
      uomId: string;
      quantity: number;
      unitCostSar: number;
      discountPercent: number;
      taxRate: number;
    }>
  >([]);

  // Form State: New Purchase Order
  const [orderSupplierId, setOrderSupplierId] = useState<string>('');
  const [orderExpectedDate, setOrderExpectedDate] = useState<string>(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [orderLines, setOrderLines] = useState<
    Array<{
      itemId: string;
      uomId: string;
      quantity: number;
      unitCostSar: number;
      discountPercent: number;
    }>
  >([]);

  // Form State: New Payment
  const [paymentSupplierId, setPaymentSupplierId] = useState<string>('');
  const [paymentAmountSar, setPaymentAmountSar] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'CHEQUE'>('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // Form State: New Debit Note
  const [debitNoteBillId, setDebitNoteBillId] = useState<string>('');
  const [debitNoteReason, setDebitNoteReason] = useState<string>('DAMAGED_GOODS');
  const [debitNoteReturnLines, setDebitNoteReturnLines] = useState<
    Array<{
      itemId: string;
      quantity: number;
      unitCostSar: number;
    }>
  >([]);

  // Initial Data Fetching
  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [billsRes, ordersRes, reqRes, grnRes, debitRes, payRes, suppRes, itemsRes, whRes, agingRes] = await Promise.all([
        fetch('/api/v1/purchasing/bills'),
        fetch('/api/v1/purchasing/orders'),
        fetch('/api/v1/purchasing/requests'),
        fetch('/api/v1/purchasing/grn'),
        fetch('/api/v1/purchasing/debit-notes'),
        fetch('/api/v1/purchasing/payments'),
        fetch('/api/v1/purchasing/suppliers'),
        fetch('/api/v1/inventory/items'),
        fetch('/api/v1/inventory/warehouses'),
        fetch('/api/v1/purchasing/aging'),
      ]);

      if (billsRes.ok) setBills(await billsRes.json());
      if (ordersRes.ok) setOrders(await ordersRes.json());
      if (reqRes.ok) setRequests(await reqRes.json());
      if (grnRes.ok) setReceipts(await grnRes.json());
      if (debitRes.ok) setDebitNotes(await debitRes.json());
      if (payRes.ok) setPayments(await payRes.json());
      if (suppRes.ok) {
        const sData = await suppRes.json();
        const sList = Array.isArray(sData) ? sData : (sData.suppliers || []);
        setSuppliers(sList);
        if (sList.length > 0 && !billSupplierId) {
          setBillSupplierId(sList[0].id);
          setOrderSupplierId(sList[0].id);
          setPaymentSupplierId(sList[0].id);
        }
      }
      if (itemsRes.ok) setItems(await itemsRes.json());
      if (whRes.ok) {
        const wData = await whRes.json();
        setWarehouses(wData);
        if (wData.length > 0 && !billWarehouseId) {
          setBillWarehouseId(wData[0].id);
        }
      }
      if (agingRes.ok) setAgingData(await agingRes.json());
    } catch (err: any) {
      console.error('Failed to load purchasing data', err);
      setFeedback({ type: 'error', message: isAr ? 'فشل تحميل بيانات المشتريات' : 'Failed to fetch purchasing data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Filtered Bills
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const matchSearch =
        searchQuery === '' ||
        b.billNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.supplierNameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.supplierInvoiceNumber && b.supplierInvoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchStatus = filterStatus === 'ALL' || b.status === filterStatus;
      const matchSupplier = filterSupplier === 'ALL' || b.supplierId === filterSupplier;
      return matchSearch && matchStatus && matchSupplier;
    });
  }, [bills, searchQuery, filterStatus, filterSupplier]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalBillsSar = bills.reduce((acc, b) => acc + (b.totalAmountSar || 0), 0);
    const totalPaidSar = bills.reduce((acc, b) => acc + (b.paidAmountSar || 0), 0);
    const totalRemainingSar = bills.reduce((acc, b) => acc + (b.remainingAmountSar || 0), 0);
    const totalInputVatSar = bills.reduce((acc, b) => acc + (b.taxTotalSar || 0), 0);
    const totalDebitNotesSar = debitNotes.reduce((acc, d) => acc + (d.totalAmountSar || 0), 0);

    const matchedCount = bills.filter((b) => b.threeWayMatchStatus === 'MATCHED').length;
    const matchRate = bills.length > 0 ? Math.round((matchedCount / bills.length) * 100) : 100;

    return {
      totalBillsSar: roundHalalas(totalBillsSar),
      totalPaidSar: roundHalalas(totalPaidSar),
      totalRemainingSar: roundHalalas(totalRemainingSar),
      totalInputVatSar: roundHalalas(totalInputVatSar),
      totalDebitNotesSar: roundHalalas(totalDebitNotesSar),
      matchRate,
      activeBillsCount: bills.length,
    };
  }, [bills, debitNotes]);

  // Handle Post Bill
  const handlePostBill = async (billId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/purchasing/bills/${billId}/post`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to post bill');
      }
      setFeedback({
        type: 'success',
        message: isAr
          ? 'تم ترحيل فاتورة المشتريات بنجاح، وتحديث رصيد المخزون، وإعادة احتساب المتوسط المرجح WAC وإنشاء القيد المحاسبي!'
          : 'Purchase bill posted successfully! Inventory balance, WAC cost recalculated, and balanced GL journal created.',
      });
      await fetchAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Create Bill
  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billSupplierId) {
      setFeedback({ type: 'error', message: isAr ? 'يرجى اختيار المورد' : 'Please select a supplier' });
      return;
    }
    if (!supplierInvoiceNumber.trim()) {
      setFeedback({
        type: 'error',
        message: isAr ? 'رقم فاتورة المورد الضريبية إلزامي لاحتساب ضريبة المدخلات' : 'Supplier Invoice Number is mandatory for input VAT deduction',
      });
      return;
    }
    if (billLines.length === 0) {
      setFeedback({ type: 'error', message: isAr ? 'يرجى إضافة بند واحد على الأقل' : 'Please add at least one line item' });
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch('/api/v1/purchasing/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: billSupplierId,
          supplierInvoiceNumber: supplierInvoiceNumber.trim(),
          warehouseId: billWarehouseId,
          issueDate: billIssueDate,
          dueDate: billDueDate,
          paymentMethod: billPaymentMethod,
          purchaseOrderId: linkedPurchaseOrderId || undefined,
          notes: billNotes,
          postImmediately: billPostImmediately,
          lines: billLines.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            unitCostSar: l.unitCostSar,
            discountPercent: l.discountPercent,
            taxRate: l.taxRate,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create bill');
      }

      const created = await res.json();
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم إنشاء فاتورة المشتريات ${created.billNumber} بنجاح ${billPostImmediately ? '(مرحلة إلى الدفاتر)' : '(مسودة)'}`
          : `Purchase bill ${created.billNumber} created successfully!`,
      });
      setIsCreateBillOpen(false);
      setBillLines([]);
      setSupplierInvoiceNumber('');
      setBillNotes('');
      await fetchAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Create PO
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderSupplierId) {
      setFeedback({ type: 'error', message: isAr ? 'يرجى اختيار المورد' : 'Please select a supplier' });
      return;
    }
    if (orderLines.length === 0) {
      setFeedback({ type: 'error', message: isAr ? 'يرجى إضافة بند واحد على الأقل' : 'Please add at least one line item' });
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch('/api/v1/purchasing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: orderSupplierId,
          expectedDeliveryDate: orderExpectedDate,
          notes: orderNotes,
          lines: orderLines.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            unitCostSar: l.unitCostSar,
            discountPercent: l.discountPercent,
            taxRate: 15,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create purchase order');
      }

      const created = await res.json();
      setFeedback({
        type: 'success',
        message: isAr ? `تم إنشاء أمر الشراء ${created.orderNumber} بنجاح` : `Purchase order ${created.orderNumber} created successfully!`,
      });
      setIsCreateOrderOpen(false);
      setOrderLines([]);
      setOrderNotes('');
      await fetchAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Create Supplier Payment
  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentSupplierId || paymentAmountSar <= 0) {
      setFeedback({ type: 'error', message: isAr ? 'يرجى إدخال مورد ومبلغ صحيح' : 'Please enter valid supplier and amount' });
      return;
    }

    try {
      setActionLoading(true);
      const res = await fetch('/api/v1/purchasing/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: paymentSupplierId,
          amountSar: paymentAmountSar,
          paymentMethod,
          paymentDate: new Date().toISOString().slice(0, 10),
          referenceNumber: paymentReference,
          notes: paymentNotes,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create payment');
      }

      setFeedback({
        type: 'success',
        message: isAr ? 'تم تسجيل سند الصرف وتحديث رصيد المورد بنجاح!' : 'Supplier payment voucher recorded successfully!',
      });
      setIsCreatePaymentOpen(false);
      setPaymentAmountSar(0);
      setPaymentReference('');
      setPaymentNotes('');
      await fetchAllData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Add Line to Bill
  const addBillLine = () => {
    if (items.length === 0) return;
    const defaultItem = items[0];
    setBillLines([
      ...billLines,
      {
        itemId: defaultItem.id,
        uomId: defaultItem.units?.[0]?.id || 'BASE',
        quantity: 1,
        unitCostSar: defaultItem.cost || 10,
        discountPercent: 0,
        taxRate: 15,
      },
    ]);
  };

  // Handle Add Line to PO
  const addOrderLine = () => {
    if (items.length === 0) return;
    const defaultItem = items[0];
    setOrderLines([
      ...orderLines,
      {
        itemId: defaultItem.id,
        uomId: defaultItem.units?.[0]?.id || 'BASE',
        quantity: 1,
        unitCostSar: defaultItem.cost || 10,
        discountPercent: 0,
      },
    ]);
  };

  // Convert PO to Bill Helper
  const handleConvertPOToBill = (po: PurchaseOrder) => {
    setBillSupplierId(po.supplierId);
    setLinkedPurchaseOrderId(po.id);
    setSupplierInvoiceNumber(`INV-${po.orderNumber.replace('PO-', '')}`);
    setBillLines(
      po.lines.map((l) => ({
        itemId: l.itemId,
        uomId: l.uomId,
        quantity: l.quantity,
        unitCostSar: l.unitCostSar,
        discountPercent: l.discountPercent,
        taxRate: l.taxRate,
      }))
    );
    setIsCreateBillOpen(true);
    setActiveTab('BILLS');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {isAr ? 'المشتريات وفواتير الموردين' : 'Purchasing & Vendor Bills'}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'أوامر الشراء، مطابقة الفواتير الثلاثية (3-Way Match)، ضريبة المدخلات 15%، وإعادة احتساب WAC'
                  : 'Purchase orders, 3-way matching, 15% input VAT, perpetual WAC recalculation, and vendor balances'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
            title={isAr ? 'تحديث البيانات' : 'Refresh Data'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => {
              if (billLines.length === 0) addBillLine();
              setIsCreateBillOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'فاتورة مشتريات جديدة' : 'New Purchase Bill'}</span>
          </button>

          <button
            onClick={() => {
              if (orderLines.length === 0) addOrderLine();
              setIsCreateOrderOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'أمر شراء جديد' : 'New Purchase Order'}</span>
          </button>

          <button
            onClick={() => setIsCreatePaymentOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            <span>{isAr ? 'سند صرف مورد' : 'Supplier Payment'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="p-1 hover:bg-black/5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Payables */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">{isAr ? 'إجمالي المشتريات' : 'Total Purchases'}</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {formatCurrency(metrics.totalBillsSar)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{isAr ? 'المسدد منها:' : 'Paid:'}</span>
            <span className="font-semibold text-emerald-600">{formatCurrency(metrics.totalPaidSar)}</span>
          </div>
        </div>

        {/* Remaining AP Balance */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">{isAr ? 'مستحقات الموردين المتبقية' : 'Remaining AP Balance'}</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tracking-tight">
            {formatCurrency(metrics.totalRemainingSar)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{isAr ? 'مرتجعات مدينة:' : 'Debit Notes:'}</span>
            <span className="font-semibold text-rose-600">{formatCurrency(metrics.totalDebitNotesSar)}</span>
          </div>
        </div>

        {/* Claimable Input VAT 15% */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">{isAr ? 'ضريبة المدخلات 15% (خصم)' : 'Input VAT 15% (Claimable)'}</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 tracking-tight">
            {formatCurrency(metrics.totalInputVatSar)}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span>{isAr ? 'مؤهلة للإقرار الضريبي لهيئة الزكاة' : 'ZATCA Eligible for Return Offset'}</span>
          </div>
        </div>

        {/* 3-Way Match Rate */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold">{isAr ? 'المطابقة الثلاثية (3-Way)' : '3-Way Match Rate'}</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-purple-600 tracking-tight">
            {metrics.matchRate}%
          </div>
          <div className="mt-2 text-xs text-slate-500">
            <span>{isAr ? 'تطابق أمر الشراء مع الفاتورة والمستودع' : 'PO vs. Bill vs. Warehouse Receipt'}</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-3 pt-2 rounded-t-2xl overflow-x-auto">
        <button
          onClick={() => setActiveTab('BILLS')}
          className={`flex items-center gap-2 px-3.5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'BILLS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Receipt className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'فواتير المشتريات' : 'Purchase Bills'}</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">
            {bills.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('REQUESTS')}
          className={`flex items-center gap-2 px-3.5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'REQUESTS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'طلبات الشراء' : 'Purchase Requests'}</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">
            {requests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ORDERS')}
          className={`flex items-center gap-2 px-3.5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'ORDERS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'أوامر الشراء' : 'Purchase Orders'}</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">
            {orders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('GRN')}
          className={`flex items-center gap-2 px-3.5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'GRN'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <PackageCheck className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'استلام المستودع (GRN)' : 'Goods Receipts (GRN)'}</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">
            {receipts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('MATCHING')}
          className={`flex items-center gap-2 px-3.5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'MATCHING'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileCheck className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'المطابقة الثلاثية (3-Way)' : '3-Way Match'}</span>
        </button>

        <button
          onClick={() => setActiveTab('LANDED_COST')}
          className={`flex items-center gap-2 px-3.5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'LANDED_COST'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Ship className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'تكاليف الإنزال (Landed Cost)' : 'Landed Costs'}</span>
        </button>

        <button
          onClick={() => setActiveTab('DEBIT_NOTES')}
          className={`flex items-center gap-2 px-3.5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'DEBIT_NOTES'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <RotateCcw className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'إشعارات مدينة (مرتجع)' : 'Debit Notes'}</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">
            {debitNotes.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('PAYMENTS')}
          className={`flex items-center gap-2 px-3.5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'PAYMENTS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <CreditCard className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'سندات الصرف' : 'Supplier Payments'}</span>
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-700">
            {payments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('PRICE_HISTORY')}
          className={`flex items-center gap-2 px-3.5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'PRICE_HISTORY'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'سجل أسعار الشراء' : 'Price History'}</span>
        </button>

        <button
          onClick={() => setActiveTab('AGING')}
          className={`flex items-center gap-2 px-3.5 py-3 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'AGING'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          <span>{isAr ? 'أعمار الديون (Aging)' : 'Payables Aging'}</span>
        </button>
      </div>

      {/* Tab 1: Purchase Bills */}
      {activeTab === 'BILLS' && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-xs overflow-hidden">
          {/* Filters Bar */}
          <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between bg-slate-50/50">
            <div className="flex flex-1 items-center gap-3 min-w-[280px]">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={isAr ? 'بحث برقم الفاتورة، فاتورة المورد، أو اسم المورد...' : 'Search by bill #, supplier invoice #, or supplier...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full ps-9 pe-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden"
              >
                <option value="ALL">{isAr ? 'كافة الحالات' : 'All Statuses'}</option>
                <option value="DRAFT">{isAr ? 'مسودة' : 'Draft'}</option>
                <option value="POSTED">{isAr ? 'مرحلة (غير مسددة)' : 'Posted (Unpaid)'}</option>
                <option value="PARTIALLY_PAID">{isAr ? 'مسددة جزئياً' : 'Partially Paid'}</option>
                <option value="PAID">{isAr ? 'مسددة بالكامل' : 'Fully Paid'}</option>
              </select>

              <select
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-hidden"
              >
                <option value="ALL">{isAr ? 'كافة الموردين' : 'All Suppliers'}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {isAr ? s.nameAr : s.nameEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bills Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                <tr>
                  <th className="py-3 px-4 text-start">{isAr ? 'رقم الفاتورة' : 'Bill Number'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'المورد / فاتورة المورد' : 'Supplier / Invoice #'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'المبلغ الإجمالي' : 'Total Amount'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'ضريبة 15%' : 'VAT 15%'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'المتبقي' : 'Remaining'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'المطابقة 3-Way' : '3-Way Match'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-600 mb-2" />
                      <span>{isAr ? 'جاري تحميل فواتير المشتريات...' : 'Loading purchase bills...'}</span>
                    </td>
                  </tr>
                ) : filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <ShoppingBag className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-700">
                        {isAr ? 'لا توجد فواتير مشتريات مطابقة' : 'No purchase bills found'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {isAr ? 'قم بإنشاء فاتورة مشتريات جديدة للبدء' : 'Create a new purchase bill to get started'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-indigo-700">
                        {b.billNumber}
                        {b.purchaseOrderNumber && (
                          <div className="text-[11px] font-sans text-slate-500 font-normal">
                            PO: {b.purchaseOrderNumber}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{isAr ? b.supplierNameAr : b.supplierNameEn}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {isAr ? 'فاتورة مورد:' : 'Sup Inv:'} {b.supplierInvoiceNumber || '—'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <div>{formatDate(b.issueDate)}</div>
                        <div className="text-[11px] text-slate-400">{isAr ? 'استحقاق:' : 'Due:'} {formatDate(b.dueDate)}</div>
                      </td>
                      <td className="py-3 px-4 text-end font-bold text-slate-900">
                        {formatCurrency(b.totalAmountSar)}
                      </td>
                      <td className="py-3 px-4 text-end font-medium text-emerald-600">
                        {formatCurrency(b.taxTotalSar)}
                      </td>
                      <td className="py-3 px-4 text-end font-bold text-amber-600">
                        {formatCurrency(b.remainingAmountSar)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            b.threeWayMatchStatus === 'MATCHED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : b.threeWayMatchStatus === 'VARIANCE'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {b.threeWayMatchStatus === 'MATCHED' ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>{isAr ? 'مطابق' : 'Matched'}</span>
                            </>
                          ) : b.threeWayMatchStatus === 'VARIANCE' ? (
                            <>
                              <AlertCircle className="w-3 h-3" />
                              <span>{isAr ? 'فروقات' : 'Variance'}</span>
                            </>
                          ) : (
                            <span>{isAr ? 'قيد التدقيق' : 'Pending'}</span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            b.status === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : b.status === 'PARTIALLY_PAID'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : b.status === 'POSTED'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {b.status === 'PAID'
                            ? isAr ? 'مسددة' : 'Paid'
                            : b.status === 'PARTIALLY_PAID'
                            ? isAr ? 'مسددة جزئياً' : 'Partially Paid'
                            : b.status === 'POSTED'
                            ? isAr ? 'مرحلة' : 'Posted'
                            : isAr ? 'مسودة' : 'Draft'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setViewingBill(b)}
                            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title={isAr ? 'معاينة الفاتورة والقيد المحاسبي' : 'View Bill & GL Journal'}
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => setSelectedBillForDocumentAction(b)}
                            className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title={isAr ? 'طباعة ومشاركة فاتورة المشتريات' : 'Print & Share Bill'}
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {b.status === 'DRAFT' && (
                            <button
                              onClick={() => handlePostBill(b.id)}
                              disabled={actionLoading}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
                            >
                              {isAr ? 'ترحيل' : 'Post'}
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
        </div>
      )}

      {/* Tab: Purchase Requests (PR) */}
      {activeTab === 'REQUESTS' && (
        <PurchaseRequestsTab
          requests={requests}
          suppliers={suppliers}
          items={items}
          onRefresh={fetchAllData}
        />
      )}

      {/* Tab 2: Purchase Orders */}
      {activeTab === 'ORDERS' && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                <tr>
                  <th className="py-3 px-4 text-start">{isAr ? 'رقم أمر الشراء' : 'PO Number'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'المورد' : 'Supplier'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'تاريخ الأمر' : 'Order Date'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'التسليم المتوقع' : 'Expected Date'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'المجموع قبل الضريبة' : 'Subtotal'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'الضريبة 15%' : 'VAT 15%'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'الإجمالي' : 'Total'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-700">{isAr ? 'لا توجد أوامر شراء حالياً' : 'No purchase orders'}</p>
                    </td>
                  </tr>
                ) : (
                  orders.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-indigo-700">{po.orderNumber}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{isAr ? po.supplierNameAr : po.supplierNameEn}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{formatDate(po.orderDate)}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{po.expectedDeliveryDate ? formatDate(po.expectedDeliveryDate) : '—'}</td>
                      <td className="py-3 px-4 text-end text-slate-700">{formatCurrency(po.subtotalSar)}</td>
                      <td className="py-3 px-4 text-end text-emerald-600">{formatCurrency(po.taxTotalSar)}</td>
                      <td className="py-3 px-4 text-end font-bold text-slate-900">{formatCurrency(po.totalAmountSar)}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            po.status === 'BILLED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : po.status === 'CONFIRMED'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {po.status === 'BILLED'
                            ? isAr ? 'مفوتر بالكامل' : 'Billed'
                            : po.status === 'CONFIRMED'
                            ? isAr ? 'مؤكد' : 'Confirmed'
                            : isAr ? 'مسودة' : 'Draft'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {po.status !== 'BILLED' && (
                          <button
                            onClick={() => handleConvertPOToBill(po)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition-colors mx-auto"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>{isAr ? 'إنشاء فاتورة' : 'Generate Bill'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Goods Receipt Notes (GRN) */}
      {activeTab === 'GRN' && (
        <GoodsReceiptNotesTab
          receipts={receipts}
          orders={orders}
          warehouses={warehouses}
          items={items}
          onRefresh={fetchAllData}
        />
      )}

      {/* Tab: 3-Way Matching Engine */}
      {activeTab === 'MATCHING' && (
        <ThreeWayMatchingTab
          bills={bills}
          orders={orders}
          receipts={receipts}
          onRefresh={fetchAllData}
        />
      )}

      {/* Tab: Landed Cost Capitalization */}
      {activeTab === 'LANDED_COST' && (
        <LandedCostPurchasingTab
          receipts={receipts}
          bills={bills}
          onRefresh={fetchAllData}
        />
      )}

      {/* Tab 3: Debit Notes */}
      {activeTab === 'DEBIT_NOTES' && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                <tr>
                  <th className="py-3 px-4 text-start">{isAr ? 'رقم الإشعار المدين' : 'Debit Note #'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'مرجع فاتورة المشتريات' : 'Original Bill #'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'المورد' : 'Supplier'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'السبب' : 'Reason'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'قيمة المرتجع قبل الضريبة' : 'Subtotal'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'عكس الضريبة 15%' : 'VAT Reversal'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'إجمالي الإشعار' : 'Total Credit'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {debitNotes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <RotateCcw className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-700">{isAr ? 'لا توجد إشعارات مدينة مسجلة' : 'No debit notes recorded'}</p>
                    </td>
                  </tr>
                ) : (
                  debitNotes.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-rose-700">{d.debitNoteNumber}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">{d.originalBillNumber}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{isAr ? d.supplierNameAr : d.supplierNameEn}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{d.reason}</td>
                      <td className="py-3 px-4 text-end text-slate-700">{formatCurrency(d.subtotalSar)}</td>
                      <td className="py-3 px-4 text-end text-rose-600 font-semibold">{formatCurrency(d.taxTotalSar)}</td>
                      <td className="py-3 px-4 text-end font-bold text-rose-700">{formatCurrency(d.totalAmountSar)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {isAr ? 'مرحل ومخصوم من المورد' : 'Posted & Credited'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Payments */}
      {activeTab === 'PAYMENTS' && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                <tr>
                  <th className="py-3 px-4 text-start">{isAr ? 'رقم سند الصرف' : 'Voucher Number'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'المورد' : 'Supplier'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'تاريخ الصرف' : 'Payment Date'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'طريقة السداد' : 'Payment Method'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'المرجع البنكي / الشيك' : 'Reference'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'المبلغ المصروف' : 'Paid Amount'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <CreditCard className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-700">{isAr ? 'لا توجد سندات صرف حالياً' : 'No supplier payments'}</p>
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-emerald-700">{p.paymentNumber}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{isAr ? p.supplierNameAr : p.supplierNameEn}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{formatDate(p.paymentDate)}</td>
                      <td className="py-3 px-4 text-xs font-semibold text-slate-700">{p.paymentMethod}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{p.referenceNumber || '—'}</td>
                      <td className="py-3 px-4 text-end font-bold text-emerald-700">{formatCurrency(p.amountSar)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {isAr ? 'معتمد ومسجل بالدفاتر' : 'Posted to GL'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedPaymentForReallocation(p)}
                          className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors"
                        >
                          {isAr ? 'تخصيص الفواتير' : 'Allocate Bills'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Supplier Price History */}
      {activeTab === 'PRICE_HISTORY' && (
        <SupplierPriceHistoryTab
          suppliers={suppliers}
          items={items}
        />
      )}

      {/* Tab 5: Supplier Aging */}
      {activeTab === 'AGING' && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-xs p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">
              {isAr ? 'تحليل أعمار ذمم الموردين الدائنة (AP Aging Analysis)' : 'Accounts Payable Aging Report'}
            </h2>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'تصنيف المبالغ المستحقة للموردين بحسب فترات الاستحقاق (0-30، 31-60، 61-90، +90 يوماً)'
                : 'Aging breakdown of supplier liabilities by overdue periods'}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                <tr>
                  <th className="py-3 px-4 text-start">{isAr ? 'كود المورد' : 'Code'}</th>
                  <th className="py-3 px-4 text-start">{isAr ? 'اسم المورد' : 'Supplier Name'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'الحالي (0-30 يوم)' : 'Current (0-30d)'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? '31-60 يوم' : '31-60 Days'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? '61-90 يوم' : '61-90 Days'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'أكثر من 90 يوم' : '90+ Days'}</th>
                  <th className="py-3 px-4 text-end">{isAr ? 'إجمالي الرصيد المستحق' : 'Total Outstanding'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agingData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      <CheckCircle className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                      <p className="font-semibold text-slate-700">{isAr ? 'لا توجد مستحقات متأخرة على الموردين' : 'No overdue supplier balances'}</p>
                    </td>
                  </tr>
                ) : (
                  agingData.map((row) => (
                    <tr key={row.supplierId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-indigo-700">{row.supplierCode}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{isAr ? row.supplierNameAr : row.supplierNameEn}</td>
                      <td className="py-3 px-4 text-end text-slate-700">{formatCurrency(row.current0To30)}</td>
                      <td className="py-3 px-4 text-end text-amber-600 font-medium">{formatCurrency(row.days31To60)}</td>
                      <td className="py-3 px-4 text-end text-orange-600 font-medium">{formatCurrency(row.days61To90)}</td>
                      <td className="py-3 px-4 text-end text-rose-600 font-bold">{formatCurrency(row.days90Plus)}</td>
                      <td className="py-3 px-4 text-end font-bold text-slate-900">{formatCurrency(row.totalOutstanding)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create Purchase Bill */}
      {isCreateBillOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {isAr ? 'إنشاء فاتورة مشتريات مورد ضريبية جديدة' : 'Create New Vendor Tax Purchase Bill'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr
                      ? 'خصم ضريبة المدخلات 15%، وتحديث تكلفة المخزون بالمتوسط المرجح WAC (Rule I2)'
                      : 'Input VAT 15% deduction and stock valuation under perpetual WAC'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateBillOpen(false)}
                className="p-2 hover:bg-slate-200/60 rounded-xl text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateBill} className="p-6 space-y-6 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'المورد *' : 'Supplier *'}
                  </label>
                  <select
                    value={billSupplierId}
                    onChange={(e) => setBillSupplierId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {isAr ? s.nameAr : s.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'رقم فاتورة المورد الضريبية *' : 'Supplier Tax Invoice # *'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. INV-98421"
                    value={supplierInvoiceNumber}
                    onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'مستودع الاستلام *' : 'Receiving Warehouse *'}
                  </label>
                  <select
                    value={billWarehouseId}
                    onChange={(e) => setBillWarehouseId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'تاريخ الفاتورة' : 'Issue Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={billIssueDate}
                    onChange={(e) => setBillIssueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'تاريخ الاستحقاق' : 'Due Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={billDueDate}
                    onChange={(e) => setBillDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'طريقة السداد' : 'Payment Method'}
                  </label>
                  <select
                    value={billPaymentMethod}
                    onChange={(e: any) => setBillPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="CREDIT_ACCOUNT">{isAr ? 'آجل على الحساب (AP)' : 'Credit Account (AP)'}</option>
                    <option value="CASH">{isAr ? 'نقداً من الصندوق' : 'Cash Vault'}</option>
                    <option value="BANK_TRANSFER">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                  </select>
                </div>
              </div>

              {/* Line Items Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">
                    {isAr ? 'بنود وأصناف فاتورة المشتريات' : 'Bill Line Items'}
                  </h4>
                  <button
                    type="button"
                    onClick={addBillLine}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إضافة صنف' : 'Add Item'}</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-start text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                        <th className="py-2.5 px-3 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                        <th className="py-2.5 px-3 text-end">{isAr ? 'سعر الشراء (﷼)' : 'Unit Cost (SAR)'}</th>
                        <th className="py-2.5 px-3 text-end">{isAr ? 'خصم %' : 'Disc %'}</th>
                        <th className="py-2.5 px-3 text-end">{isAr ? 'الضريبة 15%' : 'VAT 15%'}</th>
                        <th className="py-2.5 px-3 text-end">{isAr ? 'المجموع' : 'Total'}</th>
                        <th className="py-2.5 px-3 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {billLines.map((line, idx) => {
                        const it = items.find((i) => i.id === line.itemId);
                        const calc = calculatePurchasingLine({
                          quantity: line.quantity,
                          unitCostSar: line.unitCostSar,
                          discountPercent: line.discountPercent,
                          taxRate: 15,
                          conversionFactor: 1,
                        });

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3">
                              <select
                                value={line.itemId}
                                onChange={(e) => {
                                  const selItem = items.find((i) => i.id === e.target.value);
                                  const updated = [...billLines];
                                  updated[idx].itemId = e.target.value;
                                  if (selItem) {
                                    updated[idx].unitCostSar = selItem.cost || 10;
                                  }
                                  setBillLines(updated);
                                }}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                              >
                                {items.map((itOpt) => (
                                  <option key={itOpt.id} value={itOpt.id}>
                                    {itOpt.sku} - {isAr ? itOpt.nameAr : itOpt.nameEn}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3 text-center w-24">
                              <input
                                type="number"
                                min={1}
                                value={line.quantity}
                                onChange={(e) => {
                                  const updated = [...billLines];
                                  updated[idx].quantity = Math.max(1, Number(e.target.value) || 1);
                                  setBillLines(updated);
                                }}
                                className="w-full px-2 py-1.5 text-center border border-slate-200 rounded-lg text-xs"
                              />
                            </td>
                            <td className="py-2 px-3 text-end w-32">
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                value={line.unitCostSar}
                                onChange={(e) => {
                                  const updated = [...billLines];
                                  updated[idx].unitCostSar = Math.max(0, Number(e.target.value) || 0);
                                  setBillLines(updated);
                                }}
                                className="w-full px-2 py-1.5 text-end border border-slate-200 rounded-lg text-xs font-mono"
                              />
                            </td>
                            <td className="py-2 px-3 text-end w-20">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={line.discountPercent}
                                onChange={(e) => {
                                  const updated = [...billLines];
                                  updated[idx].discountPercent = Number(e.target.value) || 0;
                                  setBillLines(updated);
                                }}
                                className="w-full px-2 py-1.5 text-end border border-slate-200 rounded-lg text-xs"
                              />
                            </td>
                            <td className="py-2 px-3 text-end text-emerald-600 font-semibold font-mono">
                              {formatCurrency(calc.taxAmountSar)}
                            </td>
                            <td className="py-2 px-3 text-end font-bold text-slate-900 font-mono">
                              {formatCurrency(calc.totalAmountSar)}
                            </td>
                            <td className="py-2 px-3 text-center w-10">
                              <button
                                type="button"
                                onClick={() => setBillLines(billLines.filter((_, i) => i !== idx))}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              {billLines.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-xl flex justify-end">
                  <div className="w-72 space-y-1.5 text-sm">
                    {(() => {
                      const linesCalc = billLines.map((l) =>
                        calculatePurchasingLine({
                          quantity: l.quantity,
                          unitCostSar: l.unitCostSar,
                          discountPercent: l.discountPercent,
                          taxRate: 15,
                          conversionFactor: 1,
                        })
                      );
                      const totals = calculatePurchasingTotals(linesCalc);

                      return (
                        <>
                          <div className="flex justify-between text-slate-600">
                            <span>{isAr ? 'المجموع قبل الضريبة:' : 'Subtotal:'}</span>
                            <span className="font-semibold text-slate-900">{formatCurrency(totals.subtotalSar)}</span>
                          </div>
                          {totals.discountTotalSar > 0 && (
                            <div className="flex justify-between text-amber-600">
                              <span>{isAr ? 'إجمالي الخصم:' : 'Discount Total:'}</span>
                              <span>-{formatCurrency(totals.discountTotalSar)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-emerald-600 font-medium">
                            <span>{isAr ? 'ضريبة القيمة المضافة (15%):' : 'VAT 15%:'}</span>
                            <span>{formatCurrency(totals.taxTotalSar)}</span>
                          </div>
                          <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                            <span>{isAr ? 'الإجمالي النهائي:' : 'Final Total:'}</span>
                            <span className="text-indigo-700">{formatCurrency(totals.totalAmountSar)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Post Immediately Option */}
              <div className="flex items-center gap-3 p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
                <input
                  type="checkbox"
                  id="postImmediatelyCheck"
                  checked={billPostImmediately}
                  onChange={(e) => setBillPostImmediately(e.target.checked)}
                  className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <label htmlFor="postImmediatelyCheck" className="text-xs text-slate-800 font-medium cursor-pointer">
                  {isAr
                    ? 'ترحيل الفاتورة فوراً وتوليد القيد المحاسبي في دفتر الأستاذ العام وتحديث رصيد وتكلفة المخزون (Rule G1 & I2)'
                    : 'Post immediately to General Ledger, update stock on hand, and recalculate WAC cost'}
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateBillOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors flex items-center gap-2"
                >
                  {actionLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{isAr ? 'حفظ فاتورة المشتريات' : 'Save Purchase Bill'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Purchase Order */}
      {isCreateOrderOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {isAr ? 'إنشاء أمر شراء جديد' : 'Create New Purchase Order'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr ? 'إصدار أمر توريد بضاعة للمورد' : 'Issue procurement purchase order'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateOrderOpen(false)}
                className="p-2 hover:bg-slate-200/60 rounded-xl text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="p-6 space-y-6 flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'المورد *' : 'Supplier *'}
                  </label>
                  <select
                    value={orderSupplierId}
                    onChange={(e) => setOrderSupplierId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {isAr ? s.nameAr : s.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'تاريخ التسليم المتوقع' : 'Expected Delivery Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={orderExpectedDate}
                    onChange={(e) => setOrderExpectedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Order Lines */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">{isAr ? 'الأصناف المطلوبة' : 'Ordered Items'}</h4>
                  <button
                    type="button"
                    onClick={addOrderLine}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إضافة صنف' : 'Add Item'}</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-start text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                        <th className="py-2.5 px-3 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                        <th className="py-2.5 px-3 text-end">{isAr ? 'السعر المتفق عليه' : 'Agreed Cost'}</th>
                        <th className="py-2.5 px-3 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orderLines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3">
                            <select
                              value={line.itemId}
                              onChange={(e) => {
                                const sel = items.find((i) => i.id === e.target.value);
                                const updated = [...orderLines];
                                updated[idx].itemId = e.target.value;
                                if (sel) updated[idx].unitCostSar = sel.cost || 10;
                                setOrderLines(updated);
                              }}
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                            >
                              {items.map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.sku} - {isAr ? it.nameAr : it.nameEn}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3 text-center w-28">
                            <input
                              type="number"
                              min={1}
                              value={line.quantity}
                              onChange={(e) => {
                                const updated = [...orderLines];
                                updated[idx].quantity = Math.max(1, Number(e.target.value) || 1);
                                setOrderLines(updated);
                              }}
                              className="w-full px-2 py-1.5 text-center border border-slate-200 rounded-lg text-xs"
                            />
                          </td>
                          <td className="py-2 px-3 text-end w-36">
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              value={line.unitCostSar}
                              onChange={(e) => {
                                const updated = [...orderLines];
                                updated[idx].unitCostSar = Math.max(0, Number(e.target.value) || 0);
                                setOrderLines(updated);
                              }}
                              className="w-full px-2 py-1.5 text-end border border-slate-200 rounded-lg text-xs font-mono"
                            />
                          </td>
                          <td className="py-2 px-3 text-center w-10">
                            <button
                              type="button"
                              onClick={() => setOrderLines(orderLines.filter((_, i) => i !== idx))}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{isAr ? 'ملاحظات' : 'Notes'}</label>
                <textarea
                  rows={2}
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateOrderOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors flex items-center gap-2"
                >
                  {actionLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{isAr ? 'تأكيد وحفظ أمر الشراء' : 'Save Purchase Order'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Supplier Payment */}
      {isCreatePaymentOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {isAr ? 'سند صرف مورد (Payment Voucher)' : 'New Supplier Payment Voucher'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr ? 'تسديد مستحقات الموردين وتوليد القيد المحاسبي' : 'Pay supplier bills & credit cash/bank'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreatePaymentOpen(false)}
                className="p-2 hover:bg-slate-200/60 rounded-xl text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePayment} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isAr ? 'المورد *' : 'Supplier *'}
                </label>
                <select
                  value={paymentSupplierId}
                  onChange={(e) => setPaymentSupplierId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {isAr ? s.nameAr : s.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {isAr ? 'مبلغ الصرف (﷼) *' : 'Amount (SAR) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  required
                  value={paymentAmountSar || ''}
                  onChange={(e) => setPaymentAmountSar(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'طريقة الصرف' : 'Payment Method'}
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-hidden"
                  >
                    <option value="BANK_TRANSFER">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                    <option value="CASH">{isAr ? 'نقداً من الصندوق' : 'Cash'}</option>
                    <option value="CHEQUE">{isAr ? 'شيك' : 'Cheque'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {isAr ? 'المرجع / رقم الحوالة' : 'Reference #'}
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. TR-99824"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{isAr ? 'البيان / ملاحظات' : 'Notes'}</label>
                <textarea
                  rows={2}
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreatePaymentOpen(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-xs transition-colors flex items-center gap-2"
                >
                  {actionLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{isAr ? 'اعتماد سند الصرف' : 'Confirm Payment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Bill Details & GL Journal */}
      {viewingBill && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {isAr ? 'تفاصيل فاتورة المشتريات ومطابقة 3-Way' : 'Bill Details & 3-Way Match'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {viewingBill.billNumber} | {isAr ? 'فاتورة المورد:' : 'Supplier Inv:'} {viewingBill.supplierInvoiceNumber || '—'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingBill(null)}
                className="p-2 hover:bg-slate-200/60 rounded-xl text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
              {/* Header Details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="block text-xs text-slate-500">{isAr ? 'المورد' : 'Supplier'}</span>
                  <span className="font-semibold text-slate-900 text-sm">
                    {isAr ? viewingBill.supplierNameAr : viewingBill.supplierNameEn}
                  </span>
                  {viewingBill.supplierVatNumber && (
                    <span className="block text-[11px] text-slate-500 font-mono">
                      VAT: {viewingBill.supplierVatNumber}
                    </span>
                  )}
                </div>

                <div>
                  <span className="block text-xs text-slate-500">{isAr ? 'تاريخ الإصدار' : 'Issue Date'}</span>
                  <span className="font-semibold text-slate-900 text-sm">{formatDate(viewingBill.issueDate)}</span>
                </div>

                <div>
                  <span className="block text-xs text-slate-500">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</span>
                  <span className="font-semibold text-slate-900 text-sm">{formatDate(viewingBill.dueDate)}</span>
                </div>

                <div>
                  <span className="block text-xs text-slate-500">{isAr ? 'المطابقة الثلاثية' : '3-Way Match'}</span>
                  <span
                    className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      viewingBill.threeWayMatchStatus === 'MATCHED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {viewingBill.threeWayMatchStatus}
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h4 className="text-sm font-bold text-slate-900 mb-2">
                  {isAr ? 'الأصناف الواردة وتكلفة الشراء' : 'Line Items & Unit Valuation'}
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-start text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'كود الصنف' : 'SKU'}</th>
                        <th className="py-2.5 px-3 text-start">{isAr ? 'اسم الصنف' : 'Item Name'}</th>
                        <th className="py-2.5 px-3 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                        <th className="py-2.5 px-3 text-end">{isAr ? 'سعر الوحدة' : 'Unit Cost'}</th>
                        <th className="py-2.5 px-3 text-end">{isAr ? 'الضريبة 15%' : 'VAT 15%'}</th>
                        <th className="py-2.5 px-3 text-end">{isAr ? 'الإجمالي' : 'Total'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingBill.lines.map((ln) => (
                        <tr key={ln.id}>
                          <td className="py-2 px-3 font-mono text-indigo-700 font-medium">{ln.sku}</td>
                          <td className="py-2 px-3 font-medium text-slate-900">{isAr ? ln.nameAr : ln.nameEn}</td>
                          <td className="py-2 px-3 text-center font-bold">{ln.quantity}</td>
                          <td className="py-2 px-3 text-end font-mono">{formatCurrency(ln.unitCostSar)}</td>
                          <td className="py-2 px-3 text-end font-mono text-emerald-600">{formatCurrency(ln.taxAmountSar)}</td>
                          <td className="py-2 px-3 text-end font-mono font-bold text-slate-900">
                            {formatCurrency(ln.totalAmountSar)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Accounting Entry Preview (Rule G1 Balanced Journal) */}
              <div className="bg-slate-900 text-slate-100 p-4 rounded-xl space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-amber-400">
                    {isAr ? 'قيد اليومية المحاسبي الثنائي المولد (Rule G1 / G7):' : 'Double-Entry Balanced GL Journal (G1):'}
                  </span>
                  <span className="text-emerald-400">{isAr ? 'متوازن دائن = مدين' : 'Debits = Credits'}</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between">
                    <span>10301 - {isAr ? 'المخزون السلعي (أصول متداولة)' : 'Inventory Asset'}</span>
                    <span className="text-emerald-400 font-bold">
                      {isAr ? 'مدين:' : 'Debit:'} {formatCurrency(viewingBill.subtotalSar)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>10401 - {isAr ? 'ضريبة القيمة المضافة على المدخلات (مستردة)' : 'Input VAT Recoverable (15%)'}</span>
                    <span className="text-emerald-400 font-bold">
                      {isAr ? 'مدين:' : 'Debit:'} {formatCurrency(viewingBill.taxTotalSar)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800 pt-1.5 text-amber-300">
                    <span>20101 - {isAr ? 'الذمم الدائنة / حساب الموردين' : 'Accounts Payable / Supplier Subaccount'}</span>
                    <span className="text-amber-400 font-bold">
                      {isAr ? 'دائن:' : 'Credit:'} {formatCurrency(viewingBill.totalAmountSar)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setSelectedBillForDocumentAction(viewingBill);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>{isAr ? 'طباعة ومشاركة الفاتورة' : 'Print & Share Document'}</span>
              </button>
              <button
                onClick={() => setViewingBill(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Payment Reallocation */}
      {selectedPaymentForReallocation && (
        <PaymentReallocationModal
          payment={selectedPaymentForReallocation}
          bills={bills}
          onClose={() => setSelectedPaymentForReallocation(null)}
          onSuccess={() => {
            setSelectedPaymentForReallocation(null);
            fetchAllData();
          }}
        />
      )}

      {/* Modal: Document Generation & Printing / Sharing for Purchase Bill */}
      {selectedBillForDocumentAction && (
        <DocumentActionModal
          isOpen={true}
          onClose={() => setSelectedBillForDocumentAction(null)}
          document={{
            documentId: selectedBillForDocumentAction.id,
            documentType: 'PURCHASE_BILL',
            documentNumber: selectedBillForDocumentAction.billNumber,
            issueDate: selectedBillForDocumentAction.issueDate,
            currency: 'SAR',
            company: {
              nameAr: 'شركة قمة النماء للتجارة والتقنية',
              nameEn: 'Qimmat Al-Namaa Trading & Tech Co.',
              vatNumber: '310123456700003',
              crNumber: '1010987654',
              nationalAddress: 'الرياض 12211، طريق الملك فهد، المملكة العربية السعودية',
              phone: '+966 11 456 7890',
              email: 'billing@alnamaa.sa',
              bankAccounts: [
                { bankName: 'مصرف الراجحي (Al Rajhi Bank)', iban: 'SA0380000000608010167890', accountName: 'شركة قمة النماء للتجارة والتقنية' },
              ],
            },
            party: {
              partyType: 'SUPPLIER',
              nameAr: selectedBillForDocumentAction.supplierNameAr,
              nameEn: selectedBillForDocumentAction.supplierNameEn,
              vatNumber: selectedBillForDocumentAction.supplierVatNumber,
            },
            lines: (selectedBillForDocumentAction.lines || []).map((l, i) => ({
              lineNumber: i + 1,
              itemCode: l.sku || l.itemId,
              nameAr: l.nameAr || (isAr ? 'صنف مشتريات' : 'Purchased Item'),
              nameEn: l.nameEn,
              quantity: l.quantity,
              unitName: l.uomName || (isAr ? 'وحدة' : 'Unit'),
              unitPriceSar: l.unitCostSar,
              discountSar: l.discountAmountSar || 0,
              subtotalSar: l.taxableAmountSar,
              vatRatePct: l.taxRate || 15,
              vatAmountSar: l.taxAmountSar || 0,
              totalSar: l.totalAmountSar,
            })),
            totals: {
              subtotalExclVatSar: selectedBillForDocumentAction.subtotalSar,
              discountTotalSar: selectedBillForDocumentAction.discountTotalSar || 0,
              taxableAmountSar: selectedBillForDocumentAction.subtotalSar - (selectedBillForDocumentAction.discountTotalSar || 0),
              vatAmountSar: selectedBillForDocumentAction.taxTotalSar,
              totalAmountSar: selectedBillForDocumentAction.totalAmountSar,
              paidAmountSar: selectedBillForDocumentAction.paidAmountSar || 0,
              balanceDueSar: selectedBillForDocumentAction.remainingAmountSar,
            },
            notes: selectedBillForDocumentAction.notes,
          }}
        />
      )}
    </div>
  );
}
