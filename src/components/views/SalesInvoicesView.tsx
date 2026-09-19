import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Eye,
  Printer,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Receipt,
  FileCheck,
  ShieldCheck,
  Building2,
  Trash2,
  ArrowDownLeft,
  RefreshCw,
  Sparkles,
  QrCode,
  DollarSign,
  Layers,
  Calendar,
  X,
  User,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import {
  SalesInvoice,
  SalesQuotation,
  SalesCreditNote,
  InvoiceType,
  PaymentMethod,
  CreditNoteReason,
  calculateInvoiceLine,
  calculateInvoiceTotals,
  roundHalalas,
} from '../../lib/sales.js';
import { InvoicePrintTemplate } from '../sales/InvoicePrintTemplate.js';
import { ZatcaQRCode } from '../ui/ZatcaQRCode.js';
import { DocumentActionModal } from '../documents/DocumentActionModal.js';
import { DocumentDataPayload } from '../../lib/documents.js';

interface SalesInvoicesViewProps {
  onNavigate?: (route: string) => void;
}

interface CustomerOption {
  id: string;
  nameAr: string;
  nameEn: string;
  type: string;
  vatNumber?: string;
  crNumber?: string;
  creditLimitSar: number;
  creditHold: boolean;
}

interface ItemOption {
  id: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  type: string;
  sellingPrice: number;
  wholesalePrice: number;
  taxRate: number;
  currentStock: number;
  units: Array<{
    id: string;
    nameAr: string;
    conversionFactor: number;
  }>;
}

export const SalesInvoicesView: React.FC<SalesInvoicesViewProps> = ({ onNavigate }) => {
  const { language } = useI18n();
  const isAr = language === 'ar';

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'invoices' | 'quotations' | 'creditNotes'>('invoices');

  // Data states
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [quotations, setQuotations] = useState<SalesQuotation[]>([]);
  const [creditNotes, setCreditNotes] = useState<SalesCreditNote[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; nameAr: string }>>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Modals
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState<boolean>(false);
  const [isCreateQuotationOpen, setIsCreateQuotationOpen] = useState<boolean>(false);
  const [isCreateCreditNoteOpen, setIsCreateCreditNoteOpen] = useState<boolean>(false);
  const [viewingInvoice, setViewingInvoice] = useState<SalesInvoice | null>(null);
  const [selectedInvoiceForCredit, setSelectedInvoiceForCredit] = useState<SalesInvoice | null>(null);

  // Form states: New Invoice
  const [newInvoiceType, setNewInvoiceType] = useState<InvoiceType>('STANDARD_B2B');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CREDIT_ACCOUNT');
  const [notes, setNotes] = useState<string>('');
  const [postImmediately, setPostImmediately] = useState<boolean>(true);
  const [invoiceLines, setInvoiceLines] = useState<
    Array<{
      itemId: string;
      uomId: string;
      quantity: number;
      unitPriceSar: number;
      discountPercent: number;
      taxRate: number;
    }>
  >([]);

  // Form states: New Quotation
  const [quoteCustomerId, setQuoteCustomerId] = useState<string>('');
  const [quoteNotes, setQuoteNotes] = useState<string>('');
  const [quoteLines, setQuoteLines] = useState<
    Array<{
      itemId: string;
      uomId: string;
      quantity: number;
      unitPriceSar: number;
      discountPercent: number;
    }>
  >([]);

  // Form states: New Credit Note
  const [creditReasonCode, setCreditReasonCode] = useState<CreditNoteReason>('RETURN_OF_GOODS');
  const [creditReasonDesc, setCreditReasonDesc] = useState<string>('إرجاع بضاعة تالفة أو غير مطابقة للمواصفات');
  const [creditLinesInput, setCreditLinesInput] = useState<
    Array<{
      itemId: string;
      quantity: number;
      unitPriceSar: number;
      nameAr: string;
      maxQty: number;
    }>
  >([]);

  // Fetch all initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [invRes, quoteRes, cnRes, custRes, itemRes, whRes] = await Promise.all([
        fetch('/api/v1/sales/invoices'),
        fetch('/api/v1/sales/quotations'),
        fetch('/api/v1/sales/credit-notes'),
        fetch('/api/v1/parties/customers'),
        fetch('/api/v1/inventory/items'),
        fetch('/api/v1/inventory/warehouses'),
      ]);

      if (invRes.ok) setInvoices(await invRes.json());
      if (quoteRes.ok) setQuotations(await quoteRes.json());
      if (cnRes.ok) setCreditNotes(await cnRes.json());
      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(custData);
        if (custData.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(custData[0].id);
          setQuoteCustomerId(custData[0].id);
        }
      }
      if (itemRes.ok) {
        const itemData = await itemRes.json();
        setItems(itemData);
      }
      if (whRes.ok) {
        const whData = await whRes.json();
        setWarehouses(whData);
        if (whData.length > 0 && !selectedWarehouseId) {
          setSelectedWarehouseId(whData[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch sales data', err);
      setFeedback({
        type: 'error',
        message: isAr ? 'فشل تحميل بيانات المبيعات' : 'Failed to load sales data',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Set default initial invoice line when items arrive
  useEffect(() => {
    if (items.length > 0 && invoiceLines.length === 0) {
      const first = items[0];
      setInvoiceLines([
        {
          itemId: first.id,
          uomId: first.units[0]?.id || 'unit-base',
          quantity: 1,
          unitPriceSar: newInvoiceType === 'STANDARD_B2B' ? (first.wholesalePrice || first.sellingPrice) : first.sellingPrice,
          discountPercent: 0,
          taxRate: first.taxRate || 15,
        },
      ]);
    }
    if (items.length > 0 && quoteLines.length === 0) {
      const first = items[0];
      setQuoteLines([
        {
          itemId: first.id,
          uomId: first.units[0]?.id || 'unit-base',
          quantity: 5,
          unitPriceSar: first.wholesalePrice || first.sellingPrice,
          discountPercent: 5,
        },
      ]);
    }
  }, [items]);

  // Statistics KPI calculations
  const stats = useMemo(() => {
    let totalSalesPosted = 0;
    let totalVatPosted = 0;
    let countB2B = 0;
    let countB2C = 0;
    let countDraft = 0;
    let countPosted = 0;

    for (const inv of invoices) {
      if (inv.status === 'POSTED') {
        totalSalesPosted += inv.totalAmountSar;
        totalVatPosted += inv.taxTotalSar;
        countPosted++;
      } else if (inv.status === 'DRAFT') {
        countDraft++;
      }

      if (inv.invoiceType === 'STANDARD_B2B') countB2B++;
      else countB2C++;
    }

    return {
      totalSalesPosted: roundHalalas(totalSalesPosted),
      totalVatPosted: roundHalalas(totalVatPosted),
      countB2B,
      countB2C,
      countDraft,
      countPosted,
    };
  }, [invoices]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        !searchQuery ||
        inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.customerNameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.customerNameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (inv.customerVatNumber && inv.customerVatNumber.includes(searchQuery));

      const matchesType = filterType === 'ALL' || inv.invoiceType === filterType;
      const matchesStatus = filterStatus === 'ALL' || inv.status === filterStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [invoices, searchQuery, filterType, filterStatus]);

  // Handle invoice line calculation
  const calculatedNewInvoiceTotals = useMemo(() => {
    const linesCalc = invoiceLines.map((l) => {
      const it = items.find((i) => i.id === l.itemId);
      const uom = it?.units.find((u) => u.id === l.uomId) || it?.units[0];
      return calculateInvoiceLine({
        quantity: l.quantity,
        unitPriceSar: l.unitPriceSar,
        discountPercent: l.discountPercent,
        taxRate: l.taxRate,
        conversionFactor: uom?.conversionFactor || 1,
      });
    });
    return calculateInvoiceTotals(linesCalc);
  }, [invoiceLines, items]);

  // Add line to invoice
  const handleAddInvoiceLine = () => {
    if (items.length === 0) return;
    const it = items[0];
    setInvoiceLines((prev) => [
      ...prev,
      {
        itemId: it.id,
        uomId: it.units[0]?.id || 'unit-base',
        quantity: 1,
        unitPriceSar: newInvoiceType === 'STANDARD_B2B' ? (it.wholesalePrice || it.sellingPrice) : it.sellingPrice,
        discountPercent: 0,
        taxRate: it.taxRate || 15,
      },
    ]);
  };

  // Remove line from invoice
  const handleRemoveInvoiceLine = (idx: number) => {
    if (invoiceLines.length <= 1) return;
    setInvoiceLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Update line field
  const handleUpdateInvoiceLine = (idx: number, field: string, val: any) => {
    setInvoiceLines((prev) => {
      const copy = [...prev];
      const target = { ...copy[idx], [field]: val };

      // If item changed, refresh prices & units
      if (field === 'itemId') {
        const found = items.find((i) => i.id === val);
        if (found) {
          target.uomId = found.units[0]?.id || 'unit-base';
          target.unitPriceSar = newInvoiceType === 'STANDARD_B2B' ? (found.wholesalePrice || found.sellingPrice) : found.sellingPrice;
          target.taxRate = found.taxRate || 15;
        }
      }
      copy[idx] = target;
      return copy;
    });
  };

  // Submit create invoice
  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      setFeedback({ type: 'error', message: isAr ? 'يرجى اختيار العميل' : 'Please select a customer' });
      return;
    }

    try {
      setActionLoading(true);
      setFeedback(null);

      const payload = {
        branchId: 'branch-default',
        warehouseId: selectedWarehouseId,
        invoiceType: newInvoiceType,
        customerId: selectedCustomerId,
        paymentMethod,
        notes,
        postImmediately,
        lines: invoiceLines.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: Number(l.quantity),
          unitPriceSar: Number(l.unitPriceSar),
          discountPercent: Number(l.discountPercent) || 0,
          taxRate: Number(l.taxRate) || 15,
        })),
      };

      const res = await fetch('/api/v1/sales/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to create invoice');
      }

      const created: SalesInvoice = await res.json();
      setInvoices((prev) => [created, ...prev]);
      setIsCreateInvoiceOpen(false);
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم إنشاء الفاتورة ${created.invoiceNumber} بنجاح ${created.status === 'POSTED' ? 'وترحيلها للأستاذ العام' : 'كمسودة'}`
          : `Invoice ${created.invoiceNumber} created successfully.`,
      });
      // Optionally preview newly created invoice
      setViewingInvoice(created);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error creating invoice' });
    } finally {
      setActionLoading(false);
    }
  };

  // Post invoice
  const handlePostInvoice = async (inv: SalesInvoice) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/sales/invoices/${inv.id}/post`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to post invoice');
      }
      const updated: SalesInvoice = await res.json();
      setInvoices((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (viewingInvoice?.id === updated.id) {
        setViewingInvoice(updated);
      }
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم ترحيل الفاتورة ${updated.invoiceNumber} برقم قيد ${updated.postedJournalNumber} وتخفيض رصيد المخزون`
          : `Invoice ${updated.invoiceNumber} posted with journal #${updated.postedJournalNumber}`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error posting invoice' });
    } finally {
      setActionLoading(false);
    }
  };

  // Open credit note modal for an invoice
  const handleOpenCreditModal = (inv: SalesInvoice) => {
    setSelectedInvoiceForCredit(inv);
    setCreditReasonCode('RETURN_OF_GOODS');
    setCreditReasonDesc('إرجاع بضاعة تالفة أو غير مطابقة للمواصفات');
    setCreditLinesInput(
      inv.lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        unitPriceSar: l.unitPriceSar,
        nameAr: l.nameAr,
        maxQty: l.quantity,
      }))
    );
    setIsCreateCreditNoteOpen(true);
  };

  // Submit credit note
  const handleCreateCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForCredit) return;

    try {
      setActionLoading(true);
      const payload = {
        originalInvoiceId: selectedInvoiceForCredit.id,
        reasonCode: creditReasonCode,
        reasonDescription: creditReasonDesc,
        lines: creditLinesInput
          .filter((l) => l.quantity > 0)
          .map((l) => ({
            itemId: l.itemId,
            quantity: Number(l.quantity),
            unitPriceSar: Number(l.unitPriceSar),
          })),
      };

      const res = await fetch('/api/v1/sales/credit-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create credit note');
      }

      const created: SalesCreditNote = await res.json();
      setCreditNotes((prev) => [created, ...prev]);
      setIsCreateCreditNoteOpen(false);
      setActiveTab('creditNotes');
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم إنشاء الإشعار الدائن ${created.creditNoteNumber} وترحيل قيد العكس ${created.postedJournalNumber}`
          : `Credit note ${created.creditNoteNumber} posted successfully.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error creating credit note' });
    } finally {
      setActionLoading(false);
    }
  };

  // Create Quotation
  const handleCreateQuotation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const payload = {
        customerId: quoteCustomerId,
        notes: quoteNotes,
        lines: quoteLines.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: Number(l.quantity),
          unitPriceSar: Number(l.unitPriceSar),
          discountPercent: Number(l.discountPercent) || 0,
        })),
      };

      const res = await fetch('/api/v1/sales/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create quotation');
      }

      const created: SalesQuotation = await res.json();
      setQuotations((prev) => [created, ...prev]);
      setIsCreateQuotationOpen(false);
      setActiveTab('quotations');
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم إنشاء عرض السعر رقم ${created.quotationNumber} بنجاح`
          : `Quotation ${created.quotationNumber} created successfully.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Error creating quotation' });
    } finally {
      setActionLoading(false);
    }
  };

  // Convert Quotation to Invoice
  const handleConvertQuotation = async (quote: SalesQuotation) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/v1/sales/quotations/${quote.id}/convert`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to convert quotation');
      }
      const inv: SalesInvoice = await res.json();
      setInvoices((prev) => [inv, ...prev]);
      setQuotations((prev) =>
        prev.map((q) => (q.id === quote.id ? { ...q, status: 'CONVERTED', convertedInvoiceId: inv.id, convertedInvoiceNumber: inv.invoiceNumber } : q))
      );
      setActiveTab('invoices');
      setViewingInvoice(inv);
      setFeedback({
        type: 'success',
        message: isAr
          ? `تم تحويل عرض السعر ${quote.quotationNumber} إلى فاتورة مبيعات ${inv.invoiceNumber}`
          : `Quotation ${quote.quotationNumber} converted to Invoice ${inv.invoiceNumber}`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to convert' });
    } finally {
      setActionLoading(false);
    }
  };

  // Full Screen Printable Invoice Template
  if (viewingInvoice) {
    return (
      <InvoicePrintTemplate
        invoice={viewingInvoice}
        onBack={() => setViewingInvoice(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Context Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">
                  {isAr ? 'إدارة المبيعات والفوترة الإلكترونية (ZATCA)' : 'Sales & ZATCA E-Invoicing'}
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isAr ? 'المرحلة 2 معتمدة' : 'ZATCA Phase 2 Certified'}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isAr
                  ? 'فواتير ضريبية قياسية (B2B) ومبسطة (B2C)، عروض أسعار، وإشعارات دائنة مربوطة آلياً بالأستاذ العام والمخزون'
                  : 'Standard & Simplified Tax Invoices, Quotations, and Credit Notes integrated with GL and Inventory'}
              </p>
            </div>
          </div>
        </div>

        {/* Top actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
            title={isAr ? 'تحديث البيانات' : 'Refresh'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsCreateQuotationOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <FileText className="w-4 h-4 text-slate-500" />
            <span>{isAr ? 'عرض سعر جديد' : 'New Quotation'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewInvoiceType('STANDARD_B2B');
              setIsCreateInvoiceOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إنشاء فاتورة ضريبية' : 'New Tax Invoice'}</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'إجمالي المبيعات المرحلة' : 'Posted Sales'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2 font-mono">
            {stats.totalSalesPosted.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
            <span className="text-xs font-normal text-slate-500">ر.س</span>
          </p>
          <span className="text-[11px] text-emerald-700 font-medium mt-1 inline-block">
            {stats.countPosted} {isAr ? 'فاتورة مرحلة للأستاذ العام' : 'posted invoices'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'ضريبة القيمة المضافة 15%' : 'VAT 15% Collected'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2 font-mono">
            {stats.totalVatPosted.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
            <span className="text-xs font-normal text-slate-500">ر.س</span>
          </p>
          <span className="text-[11px] text-slate-500 font-medium mt-1 inline-block">
            {isAr ? 'مستحقة للإقرار الضريبي' : 'output tax liability'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'الفواتير القياسية (B2B)' : 'Standard (B2B)'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2 font-mono">{stats.countB2B}</p>
          <span className="text-[11px] text-blue-700 font-medium mt-1 inline-block">
            {isAr ? 'ببيانات ضريبية كاملة للمشتري' : 'With full buyer tax details'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              {isAr ? 'الفواتير المبسطة (B2C)' : 'Simplified (B2C)'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2 font-mono">{stats.countB2C}</p>
          <span className="text-[11px] text-amber-700 font-medium mt-1 inline-block">
            {isAr ? 'نقاط بيع ومبيعات أفراد' : 'Retail & POS cash sales'}
          </span>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={`pb-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'invoices'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>{isAr ? 'الفواتير الضريبية' : 'Tax Invoices'}</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {invoices.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('quotations')}
          className={`pb-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'quotations'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{isAr ? 'عروض الأسعار' : 'Quotations'}</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {quotations.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('creditNotes')}
          className={`pb-3 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'creditNotes'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          <span>{isAr ? 'الإشعارات الدائنة (المردودات)' : 'Credit Notes & Returns'}</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700">
            {creditNotes.length}
          </span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: SALES INVOICES LIST */}
      {/* ========================================================= */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث برقم الفاتورة، العميل، الرقم الضريبي...' : 'Search by invoice #, customer, VAT...'}
                className="w-full ps-9 pe-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-600 focus:bg-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-600 text-slate-700"
              >
                <option value="ALL">{isAr ? 'جميع أنواع الفواتير' : 'All Invoice Types'}</option>
                <option value="STANDARD_B2B">{isAr ? 'قياسية (B2B)' : 'Standard (B2B)'}</option>
                <option value="SIMPLIFIED_B2C">{isAr ? 'مبسطة (B2C)' : 'Simplified (B2C)'}</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-600 text-slate-700"
              >
                <option value="ALL">{isAr ? 'جميع الحالات' : 'All Statuses'}</option>
                <option value="POSTED">{isAr ? 'مرحلة (POSTED)' : 'Posted'}</option>
                <option value="DRAFT">{isAr ? 'مسودة (DRAFT)' : 'Draft'}</option>
              </select>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="p-3 text-start">{isAr ? 'رقم الفاتورة' : 'Invoice #'}</th>
                    <th className="p-3 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="p-3 text-start">{isAr ? 'النوع' : 'Type'}</th>
                    <th className="p-3 text-start">{isAr ? 'العميل' : 'Customer'}</th>
                    <th className="p-3 text-start">{isAr ? 'طريقة السداد' : 'Payment'}</th>
                    <th className="p-3 text-end">{isAr ? 'الخاضع للضريبة' : 'Taxable'}</th>
                    <th className="p-3 text-end">{isAr ? 'الضريبة 15%' : 'VAT 15%'}</th>
                    <th className="p-3 text-end">{isAr ? 'الإجمالي (ر.س)' : 'Total (SAR)'}</th>
                    <th className="p-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="p-3 text-center">{isAr ? 'ZATCA' : 'ZATCA'}</th>
                    <th className="p-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                        <span>{isAr ? 'جارِ تحميل الفواتير...' : 'Loading invoices...'}</span>
                      </td>
                    </tr>
                  ) : filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-500">
                        <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold">{isAr ? 'لا توجد فواتير تطابق الفلتر' : 'No invoices match filter'}</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {isAr ? 'اضغط على إنشاء فاتورة ضريبية للبدء' : 'Click New Tax Invoice to start'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {inv.invoiceNumber}
                        </td>
                        <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                          {inv.issueDate}
                          <span className="block text-[10px] text-slate-400">{inv.issueTime}</span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {inv.invoiceType === 'STANDARD_B2B' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              <span>{isAr ? 'قياسية B2B' : 'Standard B2B'}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                              <ShoppingBag className="w-3 h-3" />
                              <span>{isAr ? 'مبسطة B2C' : 'Simplified B2C'}</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <p className="font-semibold text-slate-800">{inv.customerNameAr}</p>
                          {inv.customerVatNumber && (
                            <p className="text-[10px] text-slate-400 font-mono">
                              VAT: {inv.customerVatNumber}
                            </p>
                          )}
                        </td>
                        <td className="p-3 text-slate-600 text-[11px] whitespace-nowrap">
                          {inv.paymentMethod === 'CREDIT_ACCOUNT' && (isAr ? 'آجل / حساب ائتماني' : 'Credit Account')}
                          {inv.paymentMethod === 'CASH' && (isAr ? 'نقدي' : 'Cash')}
                          {inv.paymentMethod === 'MADA' && 'مدى / Mada'}
                          {inv.paymentMethod === 'BANK_TRANSFER' && (isAr ? 'تحويل بنكي' : 'Bank Transfer')}
                        </td>
                        <td className="p-3 text-end font-mono text-slate-700">
                          {inv.subtotalSar.toFixed(2)}
                        </td>
                        <td className="p-3 text-end font-mono text-emerald-800 font-medium">
                          {inv.taxTotalSar.toFixed(2)}
                        </td>
                        <td className="p-3 text-end font-mono font-bold text-slate-900 whitespace-nowrap">
                          {inv.totalAmountSar.toFixed(2)}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {inv.status === 'POSTED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              <span>{isAr ? 'مرحلة' : 'Posted'}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>{isAr ? 'مسودة' : 'Draft'}</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              inv.zatcaStatus === 'CLEARED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : inv.zatcaStatus === 'REPORTED'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {inv.zatcaStatus}
                          </span>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            {/* View / Print */}
                            <button
                              type="button"
                              onClick={() => setViewingInvoice(inv)}
                              className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-md transition-colors"
                              title={isAr ? 'عرض / طباعة الفاتورة والباركود' : 'View / Print'}
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* ZATCA Phase 2 Inspector */}
                            {inv.status === 'POSTED' && onNavigate && (
                              <button
                                type="button"
                                onClick={() => onNavigate('/zatca')}
                                className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-slate-100 rounded-md transition-colors"
                                title={isAr ? 'فحص الامتثال وشهادات هيئة الزكاة (ZATCA)' : 'ZATCA Phase 2 Inspector'}
                              >
                                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                              </button>
                            )}

                            {/* Post to GL if Draft */}
                            {inv.status === 'DRAFT' && (
                              <button
                                type="button"
                                onClick={() => handlePostInvoice(inv)}
                                disabled={actionLoading}
                                className="px-2 py-1 text-[11px] font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors"
                              >
                                {isAr ? 'ترحيل' : 'Post'}
                              </button>
                            )}

                            {/* Credit Note if Posted */}
                            {inv.status === 'POSTED' && (
                              <button
                                type="button"
                                onClick={() => handleOpenCreditModal(inv)}
                                className="p-1.5 text-slate-600 hover:text-rose-700 hover:bg-slate-100 rounded-md transition-colors"
                                title={isAr ? 'إصدار إشعار دائن (مردودات مبيعات)' : 'Create Credit Note'}
                              >
                                <ArrowDownLeft className="w-4 h-4" />
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
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: SALES QUOTATIONS */}
      {/* ========================================================= */}
      {activeTab === 'quotations' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
            <h3 className="text-xs font-bold text-slate-800">
              {isAr ? 'سجل عروض الأسعار الصادرة للعملاء' : 'Customer Quotations Register'}
            </h3>
            <button
              type="button"
              onClick={() => setIsCreateQuotationOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'عرض سعر جديد' : 'New Quotation'}</span>
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3 text-start">{isAr ? 'رقم العرض' : 'Quotation #'}</th>
                  <th className="p-3 text-start">{isAr ? 'العميل' : 'Customer'}</th>
                  <th className="p-3 text-start">{isAr ? 'تاريخ الإصدار' : 'Issue Date'}</th>
                  <th className="p-3 text-start">{isAr ? 'تاريخ الانتهاء' : 'Expiry Date'}</th>
                  <th className="p-3 text-end">{isAr ? 'الإجمالي قبل الضريبة' : 'Subtotal'}</th>
                  <th className="p-3 text-end">{isAr ? 'الإجمالي شامل الضريبة' : 'Total with VAT'}</th>
                  <th className="p-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="p-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {quotations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-500">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p>{isAr ? 'لا توجد عروض أسعار مسجلة حالياً' : 'No quotations found'}</p>
                    </td>
                  </tr>
                ) : (
                  quotations.map((quote) => (
                    <tr key={quote.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-900">{quote.quotationNumber}</td>
                      <td className="p-3 font-semibold text-slate-800">{quote.customerNameAr}</td>
                      <td className="p-3 font-mono text-slate-600">{quote.issueDate}</td>
                      <td className="p-3 font-mono text-slate-600">{quote.expiryDate}</td>
                      <td className="p-3 text-end font-mono text-slate-700">{quote.subtotalSar.toFixed(2)}</td>
                      <td className="p-3 text-end font-mono font-bold text-slate-900">{quote.totalAmountSar.toFixed(2)} ر.س</td>
                      <td className="p-3 text-center">
                        {quote.status === 'CONVERTED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 inline-flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            <span>{isAr ? 'تم التحويل لفاتورة' : 'Converted'}</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            {quote.status}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {quote.status !== 'CONVERTED' ? (
                          <button
                            type="button"
                            onClick={() => handleConvertQuotation(quote)}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md transition-colors"
                          >
                            <Sparkles className="w-3 h-3 text-emerald-700" />
                            <span>{isAr ? 'تحويل لفاتورة' : 'Convert to Invoice'}</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {quote.convertedInvoiceNumber}
                          </span>
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

      {/* ========================================================= */}
      {/* TAB 3: CREDIT NOTES */}
      {/* ========================================================= */}
      {activeTab === 'creditNotes' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex justify-between items-center">
            <div>
              <h3 className="text-xs font-bold text-slate-800">
                {isAr ? 'سجل الإشعارات الدائنة ومردودات المبيعات' : 'Sales Credit Notes & Returns Register'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isAr
                  ? 'يتم ربط كل إشعار دائن بالفاتورة الأصلية تلقائياً وعكس الإيراد وقيد ضريبة القيمة المضافة واسترجاع المخزون'
                  : 'Every credit note links to original invoice, reverses VAT and revenue, and returns stock.'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="p-3 text-start">{isAr ? 'رقم الإشعار الدائن' : 'Credit Note #'}</th>
                  <th className="p-3 text-start">{isAr ? 'الفاتورة الأصلية' : 'Original Invoice'}</th>
                  <th className="p-3 text-start">{isAr ? 'العميل' : 'Customer'}</th>
                  <th className="p-3 text-start">{isAr ? 'السبب' : 'Reason'}</th>
                  <th className="p-3 text-end">{isAr ? 'مبلغ العكس' : 'Credited Subtotal'}</th>
                  <th className="p-3 text-end">{isAr ? 'الضريبة المعكوسة' : 'Reversed VAT'}</th>
                  <th className="p-3 text-end">{isAr ? 'الإجمالي مع الضريبة' : 'Total Credited'}</th>
                  <th className="p-3 text-center">{isAr ? 'قيد اليومية' : 'GL Journal'}</th>
                  <th className="p-3 text-center">{isAr ? 'رمز ZATCA' : 'ZATCA QR'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {creditNotes.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500">
                      <ArrowDownLeft className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p>{isAr ? 'لا توجد إشعارات دائنة مسجلة' : 'No credit notes issued'}</p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {isAr
                          ? 'يمكنك إصدار إشعار دائن من قائمة الفواتير بالضغط على أيقونة الإرجاع'
                          : 'You can issue credit notes from posted invoices table.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  creditNotes.map((cn) => (
                    <tr key={cn.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3 font-mono font-bold text-rose-700">{cn.creditNoteNumber}</td>
                      <td className="p-3 font-mono text-slate-700">{cn.originalInvoiceNumber}</td>
                      <td className="p-3 font-semibold text-slate-800">{cn.customerNameAr}</td>
                      <td className="p-3 text-slate-600 max-w-xs truncate">{cn.reasonDescription}</td>
                      <td className="p-3 text-end font-mono text-slate-700">{cn.subtotalSar.toFixed(2)}</td>
                      <td className="p-3 text-end font-mono text-rose-700 font-medium">-{cn.taxTotalSar.toFixed(2)}</td>
                      <td className="p-3 text-end font-mono font-bold text-rose-700">-{cn.totalAmountSar.toFixed(2)} ر.س</td>
                      <td className="p-3 text-center font-mono font-bold text-indigo-700">{cn.postedJournalNumber || 'N/A'}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {isAr ? 'معتمد TLV' : 'TLV Valid'}
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

      {/* ========================================================= */}
      {/* MODAL: CREATE SALES INVOICE */}
      {/* ========================================================= */}
      {isCreateInvoiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {isAr ? 'إصدار فاتورة ضريبية جديدة' : 'Create New Tax Invoice'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr ? 'متوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك (ZATCA)' : 'Fully compliant with ZATCA rules'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateInvoiceOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleCreateInvoice} className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              {/* Type and Customer Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Invoice Type */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'نوع الفاتورة الضريبية' : 'Invoice Type'} *
                  </label>
                  <select
                    value={newInvoiceType}
                    onChange={(e) => {
                      const type = e.target.value as InvoiceType;
                      setNewInvoiceType(type);
                      // Adjust unit prices for wholesale vs retail
                      setInvoiceLines((prev) =>
                        prev.map((line) => {
                          const it = items.find((i) => i.id === line.itemId);
                          return {
                            ...line,
                            unitPriceSar: type === 'STANDARD_B2B' ? (it?.wholesalePrice || it?.sellingPrice || 15) : (it?.sellingPrice || 18),
                          };
                        })
                      );
                    }}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800"
                  >
                    <option value="STANDARD_B2B">{isAr ? 'فاتورة ضريبية قياسية (منشآت B2B)' : 'Standard B2B Tax Invoice'}</option>
                    <option value="SIMPLIFIED_B2C">{isAr ? 'فاتورة ضريبية مبسطة (أفراد B2C)' : 'Simplified B2C Tax Invoice'}</option>
                  </select>
                </div>

                {/* Customer */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'العميل المشتري' : 'Buyer / Customer'} *
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800"
                    required
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameAr} {c.vatNumber ? `(ضريبي: ${c.vatNumber})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'طريقة السداد' : 'Payment Method'} *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800"
                  >
                    <option value="CREDIT_ACCOUNT">{isAr ? 'آجل / حساب ائتماني' : 'Credit Account'}</option>
                    <option value="CASH">{isAr ? 'نقدي (صندوق الكاشير)' : 'Cash'}</option>
                    <option value="MADA">{isAr ? 'شبكة مدى (نقاط البيع)' : 'Mada POS'}</option>
                    <option value="BANK_TRANSFER">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                  </select>
                </div>
              </div>

              {/* Warehouse & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'مستودع الصرف (خصم المخزون)' : 'Issuing Warehouse'} *
                  </label>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-medium text-slate-800"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'ملاحظات الفاتورة' : 'Invoice Notes'}
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={isAr ? 'أي شروط أو مراجع إضافية...' : 'Optional notes or reference...'}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              {/* Line Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <h4 className="font-bold text-slate-800">
                    {isAr ? 'بنود الفاتورة والمنتجات' : 'Invoice Line Items'}
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddInvoiceLine}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-md transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAr ? 'إضافة بند' : 'Add Item'}</span>
                  </button>
                </div>

                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2 text-start w-48">{isAr ? 'الصنف' : 'Item'}</th>
                      <th className="p-2 text-start w-28">{isAr ? 'الوحدة' : 'Unit'}</th>
                      <th className="p-2 text-center w-20">{isAr ? 'الكمية' : 'Qty'}</th>
                      <th className="p-2 text-end w-24">{isAr ? 'السعر (ر.س)' : 'Price'}</th>
                      <th className="p-2 text-center w-20">{isAr ? 'خصم %' : 'Disc %'}</th>
                      <th className="p-2 text-end w-24">{isAr ? 'الخاضع' : 'Taxable'}</th>
                      <th className="p-2 text-end w-24">{isAr ? 'الضريبة 15%' : 'VAT'}</th>
                      <th className="p-2 text-end w-28">{isAr ? 'الإجمالي' : 'Total'}</th>
                      <th className="p-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoiceLines.map((line, idx) => {
                      const it = items.find((i) => i.id === line.itemId);
                      const uom = it?.units.find((u) => u.id === line.uomId) || it?.units[0];
                      const calc = calculateInvoiceLine({
                        quantity: line.quantity,
                        unitPriceSar: line.unitPriceSar,
                        discountPercent: line.discountPercent,
                        taxRate: line.taxRate,
                        conversionFactor: uom?.conversionFactor || 1,
                      });

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          {/* Item Picker */}
                          <td className="p-2">
                            <select
                              value={line.itemId}
                              onChange={(e) => handleUpdateInvoiceLine(idx, 'itemId', e.target.value)}
                              className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs"
                            >
                              {items.map((itOption) => (
                                <option key={itOption.id} value={itOption.id}>
                                  {itOption.nameAr} ({itOption.sku}) - مخزون: {itOption.currentStock}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Unit (UOM) */}
                          <td className="p-2">
                            <select
                              value={line.uomId}
                              onChange={(e) => handleUpdateInvoiceLine(idx, 'uomId', e.target.value)}
                              className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs"
                            >
                              {it?.units.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.nameAr} ({u.conversionFactor}x)
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Quantity */}
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={line.quantity}
                              onChange={(e) => handleUpdateInvoiceLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-16 p-1.5 text-center font-mono font-bold bg-white border border-slate-300 rounded text-xs"
                              required
                            />
                          </td>

                          {/* Unit Price */}
                          <td className="p-2 text-end">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unitPriceSar}
                              onChange={(e) => handleUpdateInvoiceLine(idx, 'unitPriceSar', parseFloat(e.target.value) || 0)}
                              className="w-20 p-1.5 text-end font-mono bg-white border border-slate-300 rounded text-xs"
                              required
                            />
                          </td>

                          {/* Discount % */}
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={line.discountPercent}
                              onChange={(e) => handleUpdateInvoiceLine(idx, 'discountPercent', parseFloat(e.target.value) || 0)}
                              className="w-14 p-1.5 text-center font-mono bg-white border border-slate-300 rounded text-xs"
                            />
                          </td>

                          {/* Taxable */}
                          <td className="p-2 text-end font-mono text-slate-700">
                            {calc.taxableAmountSar.toFixed(2)}
                          </td>

                          {/* Tax Amount */}
                          <td className="p-2 text-end font-mono text-emerald-800">
                            {calc.taxAmountSar.toFixed(2)}
                          </td>

                          {/* Line Total */}
                          <td className="p-2 text-end font-mono font-bold text-slate-900">
                            {calc.totalAmountSar.toFixed(2)}
                          </td>

                          {/* Delete Action */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveInvoiceLine(idx)}
                              disabled={invoiceLines.length <= 1}
                              className="text-slate-400 hover:text-rose-600 disabled:opacity-30"
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

              {/* Totals Summary Box & Post Option */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={postImmediately}
                      onChange={(e) => setPostImmediately(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span className="font-semibold text-slate-800">
                      {isAr
                        ? 'ترحيل فوري إلى الأستاذ العام وتخفيض المخزون'
                        : 'Post immediately to GL and deduct stock'}
                    </span>
                  </label>
                </div>

                <div className="text-end space-y-1 w-full sm:w-64">
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? 'الإجمالي قبل الضريبة:' : 'Subtotal:'}</span>
                    <span className="font-mono">{calculatedNewInvoiceTotals.subtotalSar.toFixed(2)} ر.س</span>
                  </div>
                  {calculatedNewInvoiceTotals.discountTotalSar > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>{isAr ? 'إجمالي الخصم:' : 'Discount:'}</span>
                      <span className="font-mono">-{calculatedNewInvoiceTotals.discountTotalSar.toFixed(2)} ر.س</span>
                    </div>
                  )}
                  <div className="flex justify-between text-emerald-800 font-semibold">
                    <span>{isAr ? 'ضريبة القيمة المضافة 15%:' : 'VAT 15%:'}</span>
                    <span className="font-mono">{calculatedNewInvoiceTotals.taxTotalSar.toFixed(2)} ر.س</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-300 pt-1">
                    <span>{isAr ? 'المجموع النهائي:' : 'Grand Total:'}</span>
                    <span className="font-mono text-emerald-950 font-extrabold text-base">
                      {calculatedNewInvoiceTotals.totalAmountSar.toFixed(2)} ر.س
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateInvoiceOpen(false)}
                  className="px-4 py-2 font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-6 py-2 font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors shadow-xs"
                >
                  {actionLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileCheck className="w-4 h-4" />
                  )}
                  <span>
                    {postImmediately
                      ? isAr
                        ? 'إصدار وترحيل الفاتورة'
                        : 'Issue & Post Invoice'
                      : isAr
                      ? 'حفظ كمسودة'
                      : 'Save as Draft'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CREATE CREDIT NOTE */}
      {/* ========================================================= */}
      {isCreateCreditNoteOpen && selectedInvoiceForCredit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-rose-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-700 text-white flex items-center justify-center">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-rose-950">
                    {isAr ? 'إصدار إشعار دائن (مردودات مبيعات)' : 'Issue Credit Note (Sales Return)'}
                  </h3>
                  <p className="text-xs text-rose-700">
                    {isAr
                      ? `للفاتورة الأصلية: ${selectedInvoiceForCredit.invoiceNumber} - العميل: ${selectedInvoiceForCredit.customerNameAr}`
                      : `For Invoice #${selectedInvoiceForCredit.invoiceNumber}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateCreditNoteOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCreditNote} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'سبب إصدار الإشعار الدائن' : 'Reason Code'} *
                  </label>
                  <select
                    value={creditReasonCode}
                    onChange={(e) => setCreditReasonCode(e.target.value as CreditNoteReason)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                  >
                    <option value="RETURN_OF_GOODS">{isAr ? 'إرجاع بضاعة (استرداد للمخزون)' : 'Return of Goods'}</option>
                    <option value="PRICE_DISCOUNT_CORRECTION">{isAr ? 'تصحيح سعر أو منح خصم إضافي' : 'Price / Discount Correction'}</option>
                    <option value="ORDER_CANCELLATION">{isAr ? 'إلغاء أمر البيع' : 'Order Cancellation'}</option>
                    <option value="BILLING_ERROR">{isAr ? 'خطأ بالفوترة أو الكميات' : 'Billing Error'}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'وصف السبب التفصيلي' : 'Reason Description'} *
                  </label>
                  <input
                    type="text"
                    value={creditReasonDesc}
                    onChange={(e) => setCreditReasonDesc(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                    required
                  />
                </div>
              </div>

              {/* Items to return */}
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                <span className="font-bold text-slate-700 block">
                  {isAr ? 'الكميات المطلوب إرجاعها وعكس قيمتها:' : 'Quantities to return / credit:'}
                </span>

                <div className="space-y-2">
                  {creditLinesInput.map((line, idx) => (
                    <div
                      key={line.itemId}
                      className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{line.nameAr}</p>
                        <span className="text-[10px] text-slate-500 font-mono">
                          السعر: {line.unitPriceSar} ر.س | الكمية بالفاتورة: {line.maxQty}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600">{isAr ? 'الكمية المسترجعة:' : 'Return Qty:'}</span>
                        <input
                          type="number"
                          min="0"
                          max={line.maxQty}
                          step="1"
                          value={line.quantity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setCreditLinesInput((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, quantity: Math.min(line.maxQty, val) } : item))
                            );
                          }}
                          className="w-20 p-1 text-center font-mono font-bold bg-slate-50 border border-slate-300 rounded"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 leading-relaxed">
                {isAr
                  ? 'سيؤدي اعتماد الإشعار الدائن إلى: (1) عكس إيراد المبيعات، (2) عكس ضريبة القيمة المضافة 15%، (3) إعادة الكميات للمستودع وإعادة تقييم المخزون بالتكلفة التاريخية WAC، (4) توليد رمز ZATCA Phase 2 رسمي للإشعار.'
                  : 'Posting will reverse revenue, reverse 15% VAT, restore stock to warehouse, and create ZATCA Phase 2 QR code.'}
              </div>

              <div className="flex justify-end items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateCreditNoteOpen(false)}
                  className="px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg transition-colors shadow-xs"
                >
                  {actionLoading ? isAr ? 'جارِ الترحيل...' : 'Posting...' : isAr ? 'اعتماد وترحيل الإشعار الدائن' : 'Post Credit Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CREATE QUOTATION */}
      {/* ========================================================= */}
      {isCreateQuotationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {isAr ? 'إنشاء عرض سعر جديد للعميل' : 'Create Customer Quotation'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAr ? 'عرض سعر رسمي صالح لمدة 30 يوماً وقابل للتحويل المباشر إلى فاتورة مبيعات' : 'Official sales quotation convertible to tax invoice'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateQuotationOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuotation} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'العميل' : 'Customer'} *
                  </label>
                  <select
                    value={quoteCustomerId}
                    onChange={(e) => setQuoteCustomerId(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                    required
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {isAr ? 'ملاحظات العرض والشروط' : 'Terms / Notes'}
                  </label>
                  <input
                    type="text"
                    value={quoteNotes}
                    onChange={(e) => setQuoteNotes(e.target.value)}
                    placeholder={isAr ? 'ساري لمدة 30 يوماً من تاريخه...' : 'Valid for 30 days...'}
                    className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>
              </div>

              {/* Lines preview */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold">
                    <tr>
                      <th className="p-2 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                      <th className="p-2 text-center w-24">{isAr ? 'الكمية' : 'Qty'}</th>
                      <th className="p-2 text-end w-28">{isAr ? 'السعر (ر.س)' : 'Price'}</th>
                      <th className="p-2 text-center w-20">{isAr ? 'خصم %' : 'Disc %'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {quoteLines.map((line, idx) => (
                      <tr key={idx}>
                        <td className="p-2">
                          <select
                            value={line.itemId}
                            onChange={(e) => {
                              const it = items.find((i) => i.id === e.target.value);
                              setQuoteLines((prev) =>
                                prev.map((l, i) =>
                                  i === idx
                                    ? {
                                        ...l,
                                        itemId: e.target.value,
                                        unitPriceSar: it?.wholesalePrice || it?.sellingPrice || 15,
                                      }
                                    : l
                                )
                              );
                            }}
                            className="w-full p-1.5 bg-white border border-slate-300 rounded"
                          >
                            {items.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.nameAr}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 1;
                              setQuoteLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: v } : l)));
                            }}
                            className="w-20 p-1 text-center font-mono bg-white border border-slate-300 rounded"
                          />
                        </td>
                        <td className="p-2 text-end">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitPriceSar}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setQuoteLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unitPriceSar: v } : l)));
                            }}
                            className="w-24 p-1 text-end font-mono bg-white border border-slate-300 rounded"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={line.discountPercent}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setQuoteLines((prev) => prev.map((l, i) => (i === idx ? { ...l, discountPercent: v } : l)));
                            }}
                            className="w-16 p-1 text-center font-mono bg-white border border-slate-300 rounded"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateQuotationOpen(false)}
                  className="px-4 py-2 text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
                >
                  {actionLoading ? isAr ? 'جارِ الحفظ...' : 'Saving...' : isAr ? 'حفظ عرض السعر' : 'Save Quotation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PHASE 13: UNIFIED DOCUMENT ACTION & PRINTING MODAL */}
      {/* ========================================================= */}
      {viewingInvoice && (
        <DocumentActionModal
          isOpen={true}
          onClose={() => setViewingInvoice(null)}
          document={{
            documentId: viewingInvoice.id,
            documentType: 'SALES_INVOICE',
            documentNumber: viewingInvoice.invoiceNumber,
            issueDate: viewingInvoice.issueDate,
            dueDate: viewingInvoice.dueDate,
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
              partyType: 'CUSTOMER',
              nameAr: viewingInvoice.customerNameAr,
              nameEn: viewingInvoice.customerNameEn,
              vatNumber: viewingInvoice.customerVatNumber,
              crNumber: viewingInvoice.customerCrNumber,
              address: viewingInvoice.customerAddress,
            },
            lines: (viewingInvoice.lines || []).map((l, i) => ({
              lineNumber: i + 1,
              itemCode: l.itemCode || l.itemId,
              nameAr: l.nameAr || 'صنف مبيعات',
              nameEn: l.nameEn,
              quantity: l.quantity,
              unitName: l.uomName || 'حبه',
              unitPriceSar: l.unitPriceSar,
              discountSar: l.discountAmountSar || 0,
              subtotalSar: l.taxableAmountSar,
              vatRatePct: l.taxRate || 15,
              vatAmountSar: l.taxAmountSar || 0,
              totalSar: l.totalAmountSar,
            })),
            totals: {
              subtotalExclVatSar: viewingInvoice.subtotalSar,
              discountTotalSar: viewingInvoice.discountTotalSar || 0,
              taxableAmountSar: viewingInvoice.subtotalSar - (viewingInvoice.discountTotalSar || 0),
              vatAmountSar: viewingInvoice.taxTotalSar,
              totalAmountSar: viewingInvoice.totalAmountSar,
              paidAmountSar: viewingInvoice.paidAmountSar || 0,
              balanceDueSar: viewingInvoice.remainingAmountSar,
            },
            zatca: {
              qrCodeBase64: viewingInvoice.qrCodeBase64,
              invoiceHash: viewingInvoice.invoiceHash,
              cryptographicStamp: viewingInvoice.cryptographicStamp,
              invoiceTypeCode: viewingInvoice.invoiceType === 'SIMPLIFIED_B2C' ? '0200000' : '0100000',
              isSimplified: viewingInvoice.invoiceType === 'SIMPLIFIED_B2C',
            },
            notes: viewingInvoice.notes,
          }}
        />
      )}
    </div>
  );
};
