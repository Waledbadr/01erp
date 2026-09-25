import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n/context.js';
import { PageHeader } from '../ui/PageHeader.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Badge } from '../ui/Badge.js';
import { Modal } from '../ui/Modal.js';
import { useToast } from '../ui/Toast.js';
import {
  Landmark,
  Wallet,
  Receipt,
  CreditCard,
  ArrowLeftRight,
  Calculator,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Search,
  Plus,
  RefreshCw,
  Eye,
  Building2,
  DollarSign,
  TrendingUp,
  FileText,
  ShieldCheck,
  Ban,
  Clock,
  Printer,
  ChevronDown,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import {
  TreasuryAccount,
  TreasuryReceipt,
  TreasuryPayment,
  TreasuryTransfer,
  PettyCashSettlement,
  BankStatement,
  BankReconciliation,
  ChequeRecord,
  TreasuryOverviewMetrics,
  validateSaudiIban,
  generateValidSaudiIban,
  calculateExpenseVat,
  computeBankReconciliationSummary,
  TreasuryAccountType,
  ReceiptCategory,
  PaymentCategory,
  TreasuryPaymentMethod,
  VoucherStatus,
} from '../../lib/treasury.js';
import { formatCurrency } from '../../lib/accounting.js';

type ActiveTab =
  | 'OVERVIEW'
  | 'ACCOUNTS'
  | 'RECEIPTS'
  | 'PAYMENTS'
  | 'TRANSFERS'
  | 'SETTLEMENTS'
  | 'RECONCILIATION'
  | 'CHEQUES';

const SAUDI_BANKS = [
  { code: '80', nameAr: 'مصرف الراجحي', nameEn: 'Al Rajhi Bank', swift: 'RJHISARI' },
  { code: '10', nameAr: 'البنك الأهلي السعودي (SNB)', nameEn: 'Saudi National Bank', swift: 'NCBKSARI' },
  { code: '20', nameAr: 'بنك الرياض', nameEn: 'Riyad Bank', swift: 'RIBLSARI' },
  { code: '05', nameAr: 'مصرف الإنماء', nameEn: 'Alinma Bank', swift: 'INMASARI' },
  { code: '50', nameAr: 'البنك السعودي الأول (SAB)', nameEn: 'Saudi Awwal Bank', swift: 'SABBSARI' },
  { code: '45', nameAr: 'بنك البلاد', nameEn: 'Bank Albilad', swift: 'ALBISARI' },
  { code: '65', nameAr: 'البنك السعودي للاستثمار', nameEn: 'The Saudi Investment Bank', swift: 'SIBCSARI' },
  { code: '15', nameAr: 'بنك الجزيرة', nameEn: 'Bank AlJazira', swift: 'BJAZSARI' },
];

export function TreasuryMasterView({ onNavigate }: { onNavigate?: (route: string) => void }) {
  const { isAr, language } = useI18n();
  const lang = language;
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ActiveTab>('OVERVIEW');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [metrics, setMetrics] = useState<TreasuryOverviewMetrics | null>(null);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [receipts, setReceipts] = useState<TreasuryReceipt[]>([]);
  const [payments, setPayments] = useState<TreasuryPayment[]>([]);
  const [transfers, setTransfers] = useState<TreasuryTransfer[]>([]);
  const [settlements, setSettlements] = useState<PettyCashSettlement[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [reconciliations, setReconciliations] = useState<BankReconciliation[]>([]);
  const [cheques, setCheques] = useState<ChequeRecord[]>([]);

  // Modals state
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [selectedReceiptForView, setSelectedReceiptForView] = useState<TreasuryReceipt | null>(null);
  const [selectedPaymentForView, setSelectedPaymentForView] = useState<TreasuryPayment | null>(null);
  const [selectedChequeForAction, setSelectedChequeForAction] = useState<ChequeRecord | null>(null);
  const [bounceReasonInput, setBounceReasonInput] = useState('');

  // Form states - New Account
  const [newAccountType, setNewAccountType] = useState<TreasuryAccountType>('BANK_ACCOUNT');
  const [newAccountCode, setNewAccountCode] = useState('');
  const [newAccountNameAr, setNewAccountNameAr] = useState('');
  const [newAccountNameEn, setNewAccountNameEn] = useState('');
  const [newAccountBankName, setNewAccountBankName] = useState(SAUDI_BANKS[0].nameAr);
  const [newAccountNum, setNewAccountNum] = useState('');
  const [newAccountIban, setNewAccountIban] = useState('');
  const [newAccountSwift, setNewAccountSwift] = useState(SAUDI_BANKS[0].swift);
  const [newAccountCustodian, setNewAccountCustodian] = useState('');
  const [newAccountOpeningBal, setNewAccountOpeningBal] = useState('0.00');

  // Form states - New Receipt
  const [rcAccountId, setRcAccountId] = useState('');
  const [rcDate, setRcDate] = useState(new Date().toISOString().split('T')[0]);
  const [rcCategory, setRcCategory] = useState<ReceiptCategory>('CUSTOMER_PAYMENT');
  const [rcMethod, setRcMethod] = useState<TreasuryPaymentMethod>('BANK_TRANSFER');
  const [rcAmount, setRcAmount] = useState('');
  const [rcPayerName, setRcPayerName] = useState('');
  const [rcRefNum, setRcRefNum] = useState('');
  const [rcChequeNum, setRcChequeNum] = useState('');
  const [rcChequeDueDate, setRcChequeDueDate] = useState('');
  const [rcChequeBank, setRcChequeBank] = useState('');
  const [rcNotes, setRcNotes] = useState('');

  // Form states - New Payment
  const [pvAccountId, setPvAccountId] = useState('');
  const [pvDate, setPvDate] = useState(new Date().toISOString().split('T')[0]);
  const [pvCategory, setPvCategory] = useState<PaymentCategory>('OPERATING_EXPENSE');
  const [pvMethod, setPvMethod] = useState<TreasuryPaymentMethod>('BANK_TRANSFER');
  const [pvAmount, setPvAmount] = useState('');
  const [pvBeneficiary, setPvBeneficiary] = useState('');
  const [pvExpenseDesc, setPvExpenseDesc] = useState('');
  const [pvExpenseTaxable, setPvExpenseTaxable] = useState('');
  const [pvExpenseVatNum, setPvExpenseVatNum] = useState('');
  const [pvSupplierInvRef, setPvSupplierInvRef] = useState('');
  const [pvChequeNum, setPvChequeNum] = useState('');
  const [pvChequeDueDate, setPvChequeDueDate] = useState('');
  const [pvNotes, setPvNotes] = useState('');

  // Form states - Inter-Account Transfer
  const [trFromId, setTrFromId] = useState('');
  const [trToId, setTrToId] = useState('');
  const [trAmount, setTrAmount] = useState('');
  const [trFee, setTrFee] = useState('0.00');
  const [trDate, setTrDate] = useState(new Date().toISOString().split('T')[0]);
  const [trNotes, setTrNotes] = useState('');

  // Form states - Petty Cash Settlement
  const [stCustodyId, setStCustodyId] = useState('');
  const [stRefundAccountId, setStRefundAccountId] = useState('');
  const [stDate, setStDate] = useState(new Date().toISOString().split('T')[0]);
  const [stExpDesc, setStExpDesc] = useState('مصاريف تشغيلية ونثرية وضيافة');
  const [stExpTaxable, setStExpTaxable] = useState('');
  const [stNotes, setStNotes] = useState('');

  // Form states - Bank Reconciliation
  const [recAccountId, setRecAccountId] = useState('');
  const [recStatementBalance, setRecStatementBalance] = useState('');
  const [recStartDate, setRecStartDate] = useState('2026-03-01');
  const [recEndDate, setRecEndDate] = useState('2026-03-31');

  // Load all treasury records
  const loadTreasuryData = async () => {
    setLoading(true);
    try {
      const [
        accRes,
        rcRes,
        pvRes,
        trRes,
        stRes,
        recRes,
        chqRes,
        metRes,
      ] = await Promise.all([
        fetch('/api/v1/treasury/accounts'),
        fetch('/api/v1/treasury/receipts'),
        fetch('/api/v1/treasury/payments'),
        fetch('/api/v1/treasury/transfers'),
        fetch('/api/v1/treasury/petty-cash'),
        fetch('/api/v1/treasury/bank-reconciliations'),
        fetch('/api/v1/treasury/cheques'),
        fetch('/api/v1/treasury/overview'),
      ]);

      if (accRes.ok) {
        const data = await accRes.json();
        const list = data.data || data.accounts || [];
        setAccounts(list);
        if (list.length > 0 && !rcAccountId) {
          setRcAccountId(list[0].id);
          setPvAccountId(list[0].id);
          setRecAccountId(list[0].id);
        }
      }
      if (rcRes.ok) {
        const data = await rcRes.json();
        setReceipts(data.data || data.receipts || []);
      }
      if (pvRes.ok) {
        const data = await pvRes.json();
        setPayments(data.data || data.payments || []);
      }
      if (trRes.ok) {
        const data = await trRes.json();
        setTransfers(data.data || data.transfers || []);
      }
      if (stRes.ok) {
        const data = await stRes.json();
        setSettlements(data.data || data.settlements || []);
      }
      if (recRes.ok) {
        const data = await recRes.json();
        setReconciliations(data.data || data.reconciliations || []);
      }
      if (chqRes.ok) {
        const data = await chqRes.json();
        setCheques(data.data || data.cheques || []);
      }
      if (metRes.ok) {
        const data = await metRes.json();
        setMetrics(data.data || data.metrics || null);
      }
    } catch (err: any) {
      console.error('Failed to load treasury data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTreasuryData();
  }, []);

  // Handle Create Treasury Account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountCode || !newAccountNameAr) {
      showToast({
        title: isAr ? 'خطأ في الإدخال' : 'Validation Error',
        message: isAr ? 'يرجى إدخال رمز واسم الحساب' : 'Please provide code and account name',
        type: 'error',
      });
      return;
    }

    try {
      const res = await fetch('/api/v1/treasury/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newAccountCode,
          nameAr: newAccountNameAr,
          nameEn: newAccountNameEn || newAccountNameAr,
          type: newAccountType,
          bankName: newAccountType === 'BANK_ACCOUNT' ? newAccountBankName : undefined,
          accountNumber: newAccountType === 'BANK_ACCOUNT' ? newAccountNum : undefined,
          iban: newAccountType === 'BANK_ACCOUNT' ? newAccountIban : undefined,
          swiftBic: newAccountType === 'BANK_ACCOUNT' ? newAccountSwift : undefined,
          custodianName: newAccountType === 'PETTY_CASH' ? newAccountCustodian : undefined,
          openingBalanceSar: parseFloat(newAccountOpeningBal) || 0,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to create treasury account');
      }

      const acc = json.data || json.account;
      showToast({
        title: isAr ? 'تم الإنشاء بنجاح' : 'Created Successfully',
        message: isAr
          ? `تم إنشاء الحساب ${acc?.code || ''} (${acc?.nameAr || ''}) بنجاح`
          : `Account ${acc?.code || ''} created successfully`,
        type: 'success',
      });

      setIsAccountModalOpen(false);
      setNewAccountCode('');
      setNewAccountNameAr('');
      setNewAccountNameEn('');
      setNewAccountNum('');
      setNewAccountIban('');
      loadTreasuryData();
    } catch (err: any) {
      showToast({
        title: isAr ? 'فشل الحفظ' : 'Operation Failed',
        message: err.message,
        type: 'error',
      });
    }
  };

  // Generate Sample Valid IBAN for Bank selection
  const handleBankSelect = (bankName: string) => {
    setNewAccountBankName(bankName);
    const selectedBank = SAUDI_BANKS.find((b) => b.nameAr === bankName);
    if (selectedBank) {
      setNewAccountSwift(selectedBank.swift);
      const randomAcc = Math.floor(1000000000 + Math.random() * 9000000000).toString();
      setNewAccountNum(randomAcc);
      const validIban = generateValidSaudiIban(selectedBank.code, randomAcc);
      setNewAccountIban(validIban);
    }
  };

  // Handle Create Receipt Voucher
  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmt = parseFloat(rcAmount);
    if (!rcAccountId || !parsedAmt || parsedAmt <= 0) {
      showToast({
        title: isAr ? 'بيانات غير مكتملة' : 'Missing Information',
        message: isAr ? 'يرجى تحديد حساب الخزينة والمبلغ' : 'Please select account and valid amount',
        type: 'error',
      });
      return;
    }

    try {
      const res = await fetch('/api/v1/treasury/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptDate: rcDate,
          treasuryAccountId: rcAccountId,
          category: rcCategory,
          paymentMethod: rcMethod,
          amountSar: parsedAmt,
          payerName: rcPayerName || 'عميل نقدي',
          referenceNumber: rcRefNum,
          chequeNumber: rcMethod === 'CHEQUE' ? rcChequeNum : undefined,
          chequeDueDate: rcMethod === 'CHEQUE' ? rcChequeDueDate : undefined,
          chequeBankName: rcMethod === 'CHEQUE' ? rcChequeBank : undefined,
          descriptionAr: rcNotes,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create receipt');

      const rc = json.data || json.receipt;
      showToast({
        title: isAr ? 'تم ترحيل سند القبض' : 'Receipt Posted',
        message: isAr
          ? `تم إنشاء وترحيل السند ${rc?.receiptNumber || ''} بقيد يومية ${rc?.journalNumber || ''}`
          : `Receipt ${rc?.receiptNumber || ''} posted with journal ${rc?.journalNumber || ''}`,
        type: 'success',
      });

      setIsReceiptModalOpen(false);
      setRcAmount('');
      setRcPayerName('');
      setRcNotes('');
      loadTreasuryData();
    } catch (err: any) {
      showToast({
        title: isAr ? 'فشل ترحيل السند' : 'Receipt Error',
        message: err.message,
        type: 'error',
      });
    }
  };

  // Handle Create Payment Voucher
  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmt = parseFloat(pvAmount);
    if (!pvAccountId || !parsedAmt || parsedAmt <= 0) {
      showToast({
        title: isAr ? 'بيانات غير مكتملة' : 'Missing Information',
        message: isAr ? 'يرجى تحديد حساب الخزينة والمبلغ' : 'Please select account and valid amount',
        type: 'error',
      });
      return;
    }

    let expenseLines: any[] | undefined = undefined;
    if (pvCategory === 'OPERATING_EXPENSE') {
      const taxableNum = parseFloat(pvExpenseTaxable) || parsedAmt / 1.15;
      const vatMath = calculateExpenseVat(taxableNum, 15);
      expenseLines = [
        {
          expenseAccountCode: '50101',
          descriptionAr: pvExpenseDesc || 'مصروف تشغيلي عام',
          taxableAmountSar: vatMath.taxableSar,
          taxRatePercent: 15,
          taxAmountSar: vatMath.vatSar,
          totalAmountSar: vatMath.totalSar,
          supplierVatNumber: pvExpenseVatNum,
          supplierInvoiceRef: pvSupplierInvRef,
        },
      ];
    }

    try {
      const res = await fetch('/api/v1/treasury/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentDate: pvDate,
          treasuryAccountId: pvAccountId,
          category: pvCategory,
          paymentMethod: pvMethod,
          amountSar: parsedAmt,
          recipientName: pvBeneficiary || 'الجهة المستفيدة',
          descriptionAr: pvNotes,
          chequeNumber: pvMethod === 'CHEQUE' ? pvChequeNum : undefined,
          chequeDueDate: pvMethod === 'CHEQUE' ? pvChequeDueDate : undefined,
          expenseBreakdownLines: expenseLines,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create payment');

      const pv = json.data || json.payment;
      showToast({
        title: isAr ? 'تم ترحيل سند الصرف' : 'Payment Posted',
        message: isAr
          ? `تم إنشاء وترحيل السند ${pv?.paymentNumber || ''} بقيد يومية ${pv?.journalNumber || ''}`
          : `Payment ${pv?.paymentNumber || ''} posted with journal ${pv?.journalNumber || ''}`,
        type: 'success',
      });

      setIsPaymentModalOpen(false);
      setPvAmount('');
      setPvBeneficiary('');
      setPvExpenseDesc('');
      setPvExpenseTaxable('');
      loadTreasuryData();
    } catch (err: any) {
      showToast({
        title: isAr ? 'فشل ترحيل السند' : 'Payment Error',
        message: err.message,
        type: 'error',
      });
    }
  };

  // Handle Create Transfer
  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(trAmount);
    if (!trFromId || !trToId || !amt || amt <= 0) {
      showToast({
        title: isAr ? 'خطأ في التحويل' : 'Transfer Error',
        message: isAr ? 'يرجى تحديد حساب المصدر والوجهة ومبلغ التحويل' : 'Select source, destination, and amount',
        type: 'error',
      });
      return;
    }

    try {
      const res = await fetch('/api/v1/treasury/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferDate: trDate,
          fromAccountId: trFromId,
          toAccountId: trToId,
          amountSar: amt,
          transferFeeSar: parseFloat(trFee) || 0,
          descriptionAr: trNotes,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Transfer failed');

      const tr = json.data || json.transfer;
      showToast({
        title: isAr ? 'تم التحويل بنجاح' : 'Transfer Successful',
        message: isAr
          ? `تم تحويل ${amt} ﷼ برقم القيد ${tr?.journalNumber || ''}`
          : `Transferred ${amt} SAR under journal ${tr?.journalNumber || ''}`,
        type: 'success',
      });

      setIsTransferModalOpen(false);
      setTrAmount('');
      setTrFee('0.00');
      setTrNotes('');
      loadTreasuryData();
    } catch (err: any) {
      showToast({
        title: isAr ? 'فشل التحويل' : 'Transfer Failed',
        message: err.message,
        type: 'error',
      });
    }
  };

  // Handle Create Petty Cash Settlement
  const handleCreateSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    const taxableAmt = parseFloat(stExpTaxable);
    if (!stCustodyId || !taxableAmt || taxableAmt <= 0) {
      showToast({
        title: isAr ? 'خطأ في التسوية' : 'Settlement Error',
        message: isAr ? 'يرجى تحديد حساب العهدة والمبلغ الخاضع للضريبة' : 'Select custody account and taxable amount',
        type: 'error',
      });
      return;
    }

    const vatMath = calculateExpenseVat(taxableAmt, 15);
    const expenseLines = [
      {
        expenseAccountCode: '50102',
        descriptionAr: stExpDesc,
        taxableAmountSar: vatMath.taxableSar,
        taxRatePercent: 15,
        taxAmountSar: vatMath.vatSar,
        totalAmountSar: vatMath.totalSar,
        supplierVatNumber: '300123456789003',
        supplierInvoiceRef: 'INV-PETTY-' + Math.floor(1000 + Math.random() * 9000),
      },
    ];

    try {
      const res = await fetch('/api/v1/treasury/petty-cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settlementDate: stDate,
          custodyAccountId: stCustodyId,
          refundTreasuryAccountId: stRefundAccountId || undefined,
          expenseLines,
          descriptionAr: stNotes,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Settlement failed');

      const st = json.data || json.settlement;
      showToast({
        title: isAr ? 'تمت تسوية العهدة بنجاح' : 'Custody Settled',
        message: isAr
          ? `تم إقفال العهدة برقم ${st?.settlementNumber || ''} وقيد يومية ${st?.journalNumber || ''}`
          : `Settled ${st?.settlementNumber || ''} under journal ${st?.journalNumber || ''}`,
        type: 'success',
      });

      setIsSettlementModalOpen(false);
      setStExpTaxable('');
      loadTreasuryData();
    } catch (err: any) {
      showToast({
        title: isAr ? 'فشل تسوية العهدة' : 'Settlement Error',
        message: err.message,
        type: 'error',
      });
    }
  };

  // Handle Bank Reconciliation
  const handleCreateReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    const stBal = parseFloat(recStatementBalance);
    if (!recAccountId || isNaN(stBal)) {
      showToast({
        title: isAr ? 'خطأ في المطابقة' : 'Reconciliation Error',
        message: isAr ? 'يرجى تحديد الحساب البنكي ورصيد كشف الحساب' : 'Provide bank account and statement balance',
        type: 'error',
      });
      return;
    }

    try {
      const res = await fetch('/api/v1/treasury/bank-reconciliations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: recAccountId,
          statementBalanceSar: stBal,
          startDate: recStartDate,
          endDate: recEndDate,
          reconciledStatementLineIds: [],
          clearedJournalLineIds: [],
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Reconciliation failed');

      const rec = json.data || json.reconciliation;
      showToast({
        title: isAr ? 'تمت المطابقة البنكية' : 'Reconciliation Completed',
        message: isAr
          ? `رقم المطابقة: ${rec?.reconciliationNumber || ''} (الفارق: ${rec?.discrepancySar || 0} ﷼)`
          : `Reconciliation ${rec?.reconciliationNumber || ''} completed (Discrepancy: ${rec?.discrepancySar || 0} SAR)`,
        type: rec?.discrepancySar === 0 ? 'success' : 'warning',
      });

      setIsReconcileModalOpen(false);
      loadTreasuryData();
    } catch (err: any) {
      showToast({
        title: isAr ? 'فشل المطابقة' : 'Reconciliation Failed',
        message: err.message,
        type: 'error',
      });
    }
  };

  // Handle Cheque Clearance
  const handleClearCheque = async (cheque: ChequeRecord) => {
    const defaultBank = accounts.find((a) => a.type === 'BANK_ACCOUNT');
    if (!defaultBank) {
      showToast({
        title: isAr ? 'تنبيه' : 'Alert',
        message: isAr ? 'لا يوجد حساب بنكي متاح لإيداع الشيك' : 'No bank account available for deposit',
        type: 'error',
      });
      return;
    }

    try {
      const res = await fetch(`/api/v1/treasury/cheques/${cheque.id}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clearanceDate: new Date().toISOString().split('T')[0],
          depositBankAccountId: defaultBank.id,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to clear cheque');

      const chq = json.data || json.cheque;
      showToast({
        title: isAr ? 'تم تحصيل الشيك' : 'Cheque Cleared',
        message: isAr
          ? `تم تحصيل الشيك رقم ${cheque.chequeNumber} وترحيل الإيداع بقيد يومية ${chq?.clearanceJournalNumber || ''}`
          : `Cheque ${cheque.chequeNumber} cleared under journal ${chq?.clearanceJournalNumber || ''}`,
        type: 'success',
      });

      loadTreasuryData();
    } catch (err: any) {
      showToast({
        title: isAr ? 'فشل التحصيل' : 'Clearance Error',
        message: err.message,
        type: 'error',
      });
    }
  };

  // Handle Cheque Bouncing
  const handleBounceCheque = async () => {
    if (!selectedChequeForAction || !bounceReasonInput) return;

    try {
      const res = await fetch(`/api/v1/treasury/cheques/${selectedChequeForAction.id}/bounce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bounceDate: new Date().toISOString().split('T')[0],
          reason: bounceReasonInput,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to record bounce');

      showToast({
        title: isAr ? 'تم تسجيل ارتداد الشيك' : 'Cheque Bounced',
        message: isAr
          ? `تم تسجيل ارتداد الشيك ${selectedChequeForAction.chequeNumber} وتحديث الحالة`
          : `Cheque ${selectedChequeForAction.chequeNumber} marked as bounced`,
        type: 'warning',
      });

      setSelectedChequeForAction(null);
      setBounceReasonInput('');
      loadTreasuryData();
    } catch (err: any) {
      showToast({
        title: isAr ? 'خطأ' : 'Error',
        message: err.message,
        type: 'error',
      });
    }
  };

  // Filter accounts by search
  const filteredAccounts = accounts.filter(
    (a) =>
      a.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.nameAr.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.iban && a.iban.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 pb-12" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Top Header */}
      <PageHeader
        title={isAr ? 'الصندوق والبنوك' : 'Cash & Banks'}
        subtitle={
          isAr
            ? 'منظومة الخزينة المتقدمة: حسابات الصناديق والبنوك، سندات القبض والصرف، تسوية العهد النقدية، ومطابقة الحسابات البنكية بدقة الهللات.'
            : 'Advanced treasury module: Cash vaults, bank accounts, receipts, payments, petty cash settlements, and bank reconciliation with exact Halalas precision.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadTreasuryData}
              isLoading={loading}
              startIcon={<RefreshCw className="w-4 h-4" />}
            >
              {isAr ? 'تحديث البيانات' : 'Refresh'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsReceiptModalOpen(true)}
              startIcon={<ArrowDownLeft className="w-4 h-4" />}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isAr ? 'سند قبض جديد' : 'New Receipt'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsPaymentModalOpen(true)}
              startIcon={<ArrowUpRight className="w-4 h-4" />}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isAr ? 'سند صرف جديد' : 'New Payment'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTransferModalOpen(true)}
              startIcon={<ArrowLeftRight className="w-4 h-4" />}
            >
              {isAr ? 'تحويل بين الخزائن' : 'Transfer'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAccountModalOpen(true)}
              startIcon={<Plus className="w-4 h-4" />}
            >
              {isAr ? 'إضافة حساب/خزينة' : 'Add Account'}
            </Button>
          </div>
        }
      />

      {/* Primary KPI Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Liquid Funds */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isAr ? 'إجمالي السيولة النقدية' : 'Total Liquid Funds'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {formatCurrency(metrics?.totalLiquidFundsSar ?? 0, lang)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isAr ? 'أرصدة فورية مدققة محاسبياً' : 'Audited real-time balances'}</span>
          </div>
        </div>

        {/* Bank Accounts Balance */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isAr ? 'أرصدة الحسابات البنكية' : 'Bank Accounts Balance'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {formatCurrency(metrics?.bankBalancesSar ?? 0, lang)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <span>{accounts.filter((a) => a.type === 'BANK_ACCOUNT').length} {isAr ? 'حسابات بنكية نشطة' : 'Active Bank Accounts'}</span>
          </div>
        </div>

        {/* Cash Drawers & POS */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isAr ? 'الصناديق ونقاط البيع' : 'Vaults & POS Terminals'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {formatCurrency(
              (metrics?.vaultBalancesSar ?? 0) + (metrics?.posBalancesSar ?? 0),
              lang
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <span>{accounts.filter((a) => a.type === 'CASH_DRAWER' || a.type === 'POS_TERMINAL').length} {isAr ? 'صناديق ونقاط بيع' : 'Drawers & POS'}</span>
          </div>
        </div>

        {/* Custodies & In-hand Cheques */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              {isAr ? 'العهد النقدية والشيكات برسم التحصيل' : 'Custodies & Cheques'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {formatCurrency(
              (metrics?.custodyBalancesSar ?? 0) + (metrics?.chequesInHandSar ?? 0),
              lang
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <span>{cheques.filter((c) => c.status === 'UNDER_COLLECTION').length} {isAr ? 'شيكات قيد التحصيل' : 'Cheques Under Collection'}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto" aria-label="Tabs">
          {[
            { id: 'OVERVIEW', labelAr: 'لوحة التحكم والسيولة', labelEn: 'Overview & Liquidity', icon: TrendingUp },
            { id: 'ACCOUNTS', labelAr: 'الحسابات والخزائن', labelEn: 'Treasury Accounts', icon: Landmark, count: accounts.length },
            { id: 'RECEIPTS', labelAr: 'سندات القبض', labelEn: 'Receipt Vouchers', icon: ArrowDownLeft, count: receipts.length },
            { id: 'PAYMENTS', labelAr: 'سندات الصرف', labelEn: 'Payment Vouchers', icon: ArrowUpRight, count: payments.length },
            { id: 'TRANSFERS', labelAr: 'التحويل بين الخزائن', labelEn: 'Inter-Account Transfers', icon: ArrowLeftRight, count: transfers.length },
            { id: 'SETTLEMENTS', labelAr: 'تسوية العهد النقدية', labelEn: 'Custody Settlements', icon: Calculator, count: settlements.length },
            { id: 'RECONCILIATION', labelAr: 'المطابقة البنكية', labelEn: 'Bank Reconciliation', icon: FileSpreadsheet, count: reconciliations.length },
            { id: 'CHEQUES', labelAr: 'حافظة الشيكات', labelEn: 'Cheques Portfolio', icon: CreditCard, count: cheques.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ActiveTab)}
                className={`py-3 px-3.5 border-b-2 font-medium text-sm inline-flex items-center gap-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{isAr ? tab.labelAr : tab.labelEn}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & LIQUIDITY */}
      {/* ========================================================================= */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Account breakdown cards */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900">
                  {isAr ? 'خزائن وحسابات المنشأة النشطة' : 'Active Treasury Accounts & Vaults'}
                </h3>
                <span className="text-xs text-slate-500">
                  {isAr ? 'مطابقة ومحدثة مع دليل الحسابات' : 'Synchronized with General Ledger'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 transition-all shadow-xs"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                            {acc.code}
                          </span>
                          <Badge variant={acc.status === 'ACTIVE' ? 'success' : 'warning'} size="sm">
                            {acc.status}
                          </Badge>
                        </div>
                        <h4 className="font-bold text-slate-900 mt-2">{acc.nameAr}</h4>
                        <p className="text-xs text-slate-500">{acc.nameEn}</p>
                      </div>
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          acc.type === 'BANK_ACCOUNT'
                            ? 'bg-blue-50 text-blue-600'
                            : acc.type === 'CASH_DRAWER'
                            ? 'bg-emerald-50 text-emerald-600'
                            : acc.type === 'PETTY_CASH'
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-purple-50 text-purple-600'
                        }`}
                      >
                        {acc.type === 'BANK_ACCOUNT' && <Landmark className="w-5 h-5" />}
                        {acc.type === 'CASH_DRAWER' && <Wallet className="w-5 h-5" />}
                        {acc.type === 'PETTY_CASH' && <CreditCard className="w-5 h-5" />}
                        {acc.type === 'POS_TERMINAL' && <ArrowLeftRight className="w-5 h-5" />}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-500">{isAr ? 'الرصيد الدفتري الحالي' : 'Current Balance'}</span>
                      <span className="font-bold text-slate-900 text-base">
                        {formatCurrency(acc.currentBalanceSar, lang)}
                      </span>
                    </div>

                    {acc.iban && (
                      <div className="mt-2 text-xs font-mono text-slate-500 bg-slate-50 p-1.5 rounded truncate">
                        {acc.iban}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions & Recent Summary */}
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-400" />
                    <h4 className="font-bold text-white text-base">
                      {isAr ? 'العمليات السريعة للخزينة' : 'Quick Treasury Actions'}
                    </h4>
                  </div>
                  <span className="text-xs text-indigo-200 bg-indigo-800/60 px-2 py-0.5 rounded">
                    ZATCA Phase 2
                  </span>
                </div>

                <p className="text-xs text-indigo-100 leading-relaxed">
                  {isAr
                    ? 'تسجيل وقبض الدفعات النقدية والبنكية، تخصيص مبالغ السداد على الفواتير المفتوحة، وترحيل قيود اليومية آلياً.'
                    : 'Process inflows, issue disbursements, allocate customer receipts against unpaid tax invoices, and auto-post journals.'}
                </p>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={() => setIsReceiptModalOpen(true)}
                    className="flex flex-col items-center justify-center p-3 rounded-lg bg-white/10 hover:bg-white/20 transition-all text-xs font-semibold"
                  >
                    <ArrowDownLeft className="w-5 h-5 text-emerald-400 mb-1" />
                    <span>{isAr ? 'سند قبض' : 'Receipt'}</span>
                  </button>
                  <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    className="flex flex-col items-center justify-center p-3 rounded-lg bg-white/10 hover:bg-white/20 transition-all text-xs font-semibold"
                  >
                    <ArrowUpRight className="w-4 h-4 text-amber-400 mb-1" />
                    <span>{isAr ? 'سند صرف' : 'Payment'}</span>
                  </button>
                  <button
                    onClick={() => setIsTransferModalOpen(true)}
                    className="flex flex-col items-center justify-center p-3 rounded-lg bg-white/10 hover:bg-white/20 transition-all text-xs font-semibold"
                  >
                    <ArrowLeftRight className="w-4 h-4 text-blue-400 mb-1" />
                    <span>{isAr ? 'تحويل بنكي' : 'Transfer'}</span>
                  </button>
                  <button
                    onClick={() => setIsSettlementModalOpen(true)}
                    className="flex flex-col items-center justify-center p-3 rounded-lg bg-white/10 hover:bg-white/20 transition-all text-xs font-semibold"
                  >
                    <Calculator className="w-4 h-4 text-purple-400 mb-1" />
                    <span>{isAr ? 'تسوية عهدة' : 'Custody'}</span>
                  </button>
                </div>
              </div>

              {/* Bank Reconciliation Summary Box */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm">
                    {isAr ? 'حالة المطابقة البنكية' : 'Bank Reconciliation Status'}
                  </h4>
                  <Badge variant="success" size="sm">
                    {isAr ? 'متطابق' : 'Balanced'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500">
                  {isAr
                    ? 'تمت مطابقة القيود مع كشوف الحسابات البنكية ومصادقة الشيكات المصروفة والشيكات برسم التحصيل.'
                    : 'Ledger entries are reconciled against imported bank statements with zero unadjusted discrepancies.'}
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <span>{isAr ? 'عمليات المطابقة المنفذة' : 'Completed Reconciliations'}:</span>
                  <span className="font-bold text-slate-900">{reconciliations.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TREASURY ACCOUNTS */}
      {/* ========================================================================= */}
      {activeTab === 'ACCOUNTS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder={isAr ? 'البحث بالرمز، الاسم، أو رقم الآيبان...' : 'Search by code, name, or IBAN...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ps-9"
                />
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsAccountModalOpen(true)}
              startIcon={<Plus className="w-4 h-4" />}
            >
              {isAr ? 'إضافة حساب خزينة جديد' : 'New Treasury Account'}
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase">
                  <tr>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'الرمز' : 'Code'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'اسم الحساب / الخزينة' : 'Account Name'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'النوع' : 'Type'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'البنك / الآيبان / العهدة' : 'Details'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'الرصيد الدفتري (﷼)' : 'Balance (SAR)'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAccounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-xs text-slate-900">
                        {acc.code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{acc.nameAr}</div>
                        <div className="text-xs text-slate-500">{acc.nameEn}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-medium">
                          {acc.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 font-mono">
                        {acc.type === 'BANK_ACCOUNT' && (
                          <div>
                            <div className="font-sans font-semibold text-slate-900">{acc.bankName}</div>
                            <div className="text-slate-500">{acc.iban}</div>
                          </div>
                        )}
                        {acc.type === 'PETTY_CASH' && (
                          <div>
                            <span className="font-sans font-medium">{isAr ? 'أمين العهدة:' : 'Custodian:'} </span>
                            <span className="font-sans font-semibold text-slate-900">{acc.custodianName}</span>
                          </div>
                        )}
                        {acc.type === 'CASH_DRAWER' && <span>{isAr ? 'صندوق نقدي رئيسي' : 'Cash Vault'}</span>}
                        {acc.type === 'POS_TERMINAL' && <span>{isAr ? 'جهاز نقاط بيع شبكة' : 'POS Terminal'}</span>}
                      </td>
                      <td className="py-3 px-4 text-end font-bold text-slate-900">
                        {formatCurrency(acc.currentBalanceSar, lang)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={acc.status === 'ACTIVE' ? 'success' : 'warning'} size="sm">
                          {acc.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {filteredAccounts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-sm">
                        {isAr ? 'لم يتم العثور على حسابات تطابق البحث' : 'No treasury accounts found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: RECEIPT VOUCHERS (سندات القبض) */}
      {/* ========================================================================= */}
      {activeTab === 'RECEIPTS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">
                {isAr ? 'سندات القبض والتحصيل المسجلة' : 'Receipt Vouchers'}
              </span>
              <Badge variant="default" size="sm">
                {receipts.length} {isAr ? 'سند' : 'Vouchers'}
              </Badge>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsReceiptModalOpen(true)}
              startIcon={<Plus className="w-4 h-4" />}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isAr ? 'إنشاء سند قبض جديد' : 'New Receipt Voucher'}
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase">
                  <tr>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'رقم السند' : 'Receipt No.'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'المودع / الدافع' : 'Payer'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'طريقة الدفع' : 'Payment Method'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'قيد اليومية' : 'GL Journal'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'المبلغ (﷼)' : 'Amount (SAR)'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receipts.map((rc) => (
                    <tr key={rc.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-xs text-indigo-700">
                        {rc.receiptNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-xs">{rc.receiptDate}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{rc.payerName}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {rc.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">
                        {rc.journalNumber || '—'}
                      </td>
                      <td className="py-3 px-4 text-end font-bold text-emerald-700">
                        {formatCurrency(rc.amountSar, lang)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={rc.status === 'POSTED' ? 'success' : 'default'} size="sm">
                          {rc.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedReceiptForView(rc)}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                          title={isAr ? 'عرض السند' : 'View Voucher'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {receipts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-sm">
                        {isAr ? 'لا توجد سندات قبض مسجلة حتى الآن' : 'No receipt vouchers recorded yet'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PAYMENT VOUCHERS (سندات الصرف) */}
      {/* ========================================================================= */}
      {activeTab === 'PAYMENTS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">
                {isAr ? 'سندات الصرف والمدفوعات التشغيلية' : 'Payment Vouchers'}
              </span>
              <Badge variant="default" size="sm">
                {payments.length} {isAr ? 'سند' : 'Vouchers'}
              </Badge>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsPaymentModalOpen(true)}
              startIcon={<Plus className="w-4 h-4" />}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isAr ? 'إنشاء سند صرف جديد' : 'New Payment Voucher'}
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase">
                  <tr>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'رقم السند' : 'Payment No.'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'المستفيد / المصروف' : 'Beneficiary'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'التصنيف' : 'Category'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'طريقة الصرف' : 'Method'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'قيد اليومية' : 'GL Journal'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'المبلغ (﷼)' : 'Amount (SAR)'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((pv) => (
                    <tr key={pv.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-xs text-amber-700">
                        {pv.paymentNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-xs">{pv.paymentDate}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{pv.recipientName}</td>
                      <td className="py-3 px-4">
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {pv.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">{pv.paymentMethod}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">
                        {pv.journalNumber || '—'}
                      </td>
                      <td className="py-3 px-4 text-end font-bold text-amber-700">
                        {formatCurrency(pv.amountSar, lang)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={pv.status === 'POSTED' ? 'success' : 'default'} size="sm">
                          {pv.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedPaymentForView(pv)}
                          className="p-1 text-slate-400 hover:text-amber-600 rounded transition-colors"
                          title={isAr ? 'عرض السند' : 'View Voucher'}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 text-sm">
                        {isAr ? 'لا توجد سندات صرف مسجلة حتى الآن' : 'No payment vouchers recorded yet'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: INTER-ACCOUNT TRANSFERS */}
      {/* ========================================================================= */}
      {activeTab === 'TRANSFERS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">
                {isAr ? 'حوالات وتحويلات السيولة بين الخزائن والبنوك' : 'Inter-Account Vault Transfers'}
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsTransferModalOpen(true)}
              startIcon={<ArrowLeftRight className="w-4 h-4" />}
            >
              {isAr ? 'تحويل سيولة جديد' : 'New Transfer'}
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase">
                  <tr>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'رقم الحوالة' : 'Transfer No.'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'من حساب (المصدر)' : 'From Account'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'إلى حساب (الوجهة)' : 'To Account'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'المبلغ المحول' : 'Amount'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'رسوم البنك' : 'Bank Fee'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'قيد اليومية' : 'Journal'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transfers.map((tr) => (
                    <tr key={tr.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-xs text-blue-700">
                        {tr.transferNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-xs">{tr.transferDate}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{tr.fromAccountNameAr}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{tr.toAccountNameAr}</td>
                      <td className="py-3 px-4 text-end font-bold text-slate-900">
                        {formatCurrency(tr.amountSar, lang)}
                      </td>
                      <td className="py-3 px-4 text-end text-slate-500 font-mono text-xs">
                        {formatCurrency(tr.transferFeeSar || 0, lang)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{tr.journalNumber}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="success" size="sm">
                          {tr.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {transfers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-sm">
                        {isAr ? 'لا توجد تحويلات بين الخزائن مسجلة' : 'No transfers recorded yet'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: CUSTODY SETTLEMENTS */}
      {/* ========================================================================= */}
      {activeTab === 'SETTLEMENTS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">
                {isAr ? 'تسويات وإقفال العهد النقدية للموظفين' : 'Petty Cash Custody Settlements'}
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsSettlementModalOpen(true)}
              startIcon={<Calculator className="w-4 h-4" />}
            >
              {isAr ? 'تسوية عهدة جديدة' : 'New Custody Settlement'}
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase">
                  <tr>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'رقم التسوية' : 'Settlement No.'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'حساب العهدة' : 'Custody Account'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'أمين العهدة' : 'Custodian'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'المصروفات الفعلية' : 'Expenses'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'ضريبة 15%' : 'VAT 15%'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'الإجمالي' : 'Total'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'قيد اليومية' : 'Journal'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {settlements.map((st) => (
                    <tr key={st.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-xs text-purple-700">
                        {st.settlementNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-xs">{st.settlementDate}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{st.custodyAccountNameAr}</td>
                      <td className="py-3 px-4 text-slate-600">{st.custodianName}</td>
                      <td className="py-3 px-4 text-end font-medium text-slate-900">
                        {formatCurrency(st.totalExpensesSar, lang)}
                      </td>
                      <td className="py-3 px-4 text-end text-slate-500 font-mono text-xs">
                        {formatCurrency(st.totalVatSar, lang)}
                      </td>
                      <td className="py-3 px-4 text-end font-bold text-slate-900">
                        {formatCurrency(st.grossExpensesSar, lang)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{st.journalNumber}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="success" size="sm">
                          {st.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {settlements.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 text-sm">
                        {isAr ? 'لا توجد تسويات عهد مسجلة' : 'No custody settlements recorded yet'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: BANK RECONCILIATION */}
      {/* ========================================================================= */}
      {activeTab === 'RECONCILIATION' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">
                {isAr ? 'مطابقة كشوف الحسابات البنكية ومصادقة الفروقات' : 'Bank Reconciliation Engine'}
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsReconcileModalOpen(true)}
              startIcon={<FileSpreadsheet className="w-4 h-4" />}
            >
              {isAr ? 'مطابقة بنكية جديدة' : 'New Bank Reconciliation'}
            </Button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase">
                  <tr>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'رقم المطابقة' : 'Reconciliation No.'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'الحساب البنكي' : 'Bank Account'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'الفترة' : 'Period'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'رصيد كشف البنك' : 'Statement Bal'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'الرصيد الدفتري' : 'Ledger Bal'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'الفارق' : 'Discrepancy'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'النتيجة' : 'Result'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reconciliations.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-xs text-indigo-700">
                        {rec.reconciliationNumber}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{rec.treasuryAccountNameAr}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">
                        {rec.asOfDate}
                      </td>
                      <td className="py-3 px-4 text-end font-bold text-slate-900">
                        {formatCurrency(rec.bankStatementEndingBalanceSar, lang)}
                      </td>
                      <td className="py-3 px-4 text-end font-bold text-slate-900">
                        {formatCurrency(rec.glBookBalanceSar, lang)}
                      </td>
                      <td
                        className={`py-3 px-4 text-end font-mono font-bold text-xs ${
                          rec.discrepancySar === 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {formatCurrency(rec.discrepancySar, lang)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={rec.discrepancySar === 0 ? 'success' : 'danger'} size="sm">
                          {rec.discrepancySar === 0 ? (isAr ? 'متطابق (0 فارق)' : 'Balanced') : (isAr ? 'غير متطابق' : 'Unbalanced')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {reconciliations.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 text-sm">
                        {isAr ? 'لا توجد سجلات مطابقة بنكية مسجلة' : 'No bank reconciliations recorded yet'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 8: CHEQUES PORTFOLIO */}
      {/* ========================================================================= */}
      {activeTab === 'CHEQUES' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-700">
                {isAr ? 'حافظة الشيكات الواردة والصادرة وحالات التحصيل' : 'Cheques Portfolio & Collection Tracking'}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase">
                  <tr>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'الاتجاه' : 'Direction'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'رقم الشيك' : 'Cheque No.'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'البنك المسحوب عليه' : 'Bank'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                    <th className="py-3.5 px-4 text-start">{isAr ? 'الطرف / المستفيد' : 'Party'}</th>
                    <th className="py-3.5 px-4 text-end">{isAr ? 'المبلغ (﷼)' : 'Amount (SAR)'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3.5 px-4 text-center">{isAr ? 'الإجراء' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cheques.map((chq) => (
                    <tr key={chq.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-bold ${
                            chq.type === 'RECEIVED_IN_HAND'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {chq.type === 'RECEIVED_IN_HAND' ? (isAr ? 'وارد (قبض)' : 'Received') : (isAr ? 'صادر (صرف)' : 'Issued')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-xs text-slate-900">
                        {chq.chequeNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{chq.bankName}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{chq.dueDate}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{chq.drawerOrPayeeName}</td>
                      <td className="py-3 px-4 text-end font-bold text-slate-900">
                        {formatCurrency(chq.amountSar, lang)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge
                          variant={
                            chq.status === 'CLEARED'
                              ? 'success'
                              : chq.status === 'BOUNCED'
                              ? 'danger'
                              : 'warning'
                          }
                          size="sm"
                        >
                          {chq.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {chq.status === 'UNDER_COLLECTION' && chq.type === 'RECEIVED_IN_HAND' && (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleClearCheque(chq)}
                              className="text-emerald-700 hover:bg-emerald-50 text-xs py-1 px-2"
                            >
                              {isAr ? 'تحصيل' : 'Clear'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedChequeForAction(chq);
                                setBounceReasonInput('عدم كفاية الرصيد لدى البنك المسحوب عليه');
                              }}
                              className="text-rose-700 hover:bg-rose-50 text-xs py-1 px-2"
                            >
                              {isAr ? 'ارتداد' : 'Bounce'}
                            </Button>
                          </div>
                        )}
                        {chq.status === 'BOUNCED' && (
                          <span className="text-xs text-rose-600 font-medium truncate max-w-[120px] inline-block">
                            {chq.bounceReason || (isAr ? 'شيك مرتجع' : 'Bounced')}
                          </span>
                        )}
                        {chq.status === 'CLEARED' && (
                          <span className="text-xs text-emerald-600 font-medium">
                            {isAr ? 'تم الإيداع' : 'Deposited'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {cheques.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-sm">
                        {isAr ? 'لا توجد شيكات مسجلة في الحافظة' : 'No cheques recorded in portfolio'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD NEW TREASURY ACCOUNT */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        title={isAr ? 'إضافة حساب خزينة أو بنك جديد' : 'Create New Treasury Account'}
      >
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'نوع الحساب' : 'Account Type'}
              </label>
              <select
                value={newAccountType}
                onChange={(e) => {
                  const t = e.target.value as TreasuryAccountType;
                  setNewAccountType(t);
                  if (t === 'BANK_ACCOUNT') handleBankSelect(SAUDI_BANKS[0].nameAr);
                }}
                className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="BANK_ACCOUNT">{isAr ? 'حساب بنكي جاري' : 'Bank Account'}</option>
                <option value="CASH_DRAWER">{isAr ? 'صندوق نقدي (خزينة)' : 'Cash Drawer'}</option>
                <option value="PETTY_CASH">{isAr ? 'عهدة نقدية لموظف' : 'Petty Cash Custody'}</option>
                <option value="POS_TERMINAL">{isAr ? 'نقطة بيع (POS)' : 'POS Terminal'}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'رمز الحساب' : 'Account Code'}
              </label>
              <Input
                placeholder="e.g. BNK-RAJHI-02"
                value={newAccountCode}
                onChange={(e) => setNewAccountCode(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'الاسم بالعربية' : 'Name (Arabic)'}
              </label>
              <Input
                placeholder={isAr ? 'مثال: حساب مصرف الراجحي' : 'Arabic Name'}
                value={newAccountNameAr}
                onChange={(e) => setNewAccountNameAr(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'الاسم بالإنجليزية' : 'Name (English)'}
              </label>
              <Input
                placeholder="e.g. Al Rajhi Corporate Account"
                value={newAccountNameEn}
                onChange={(e) => setNewAccountNameEn(e.target.value)}
              />
            </div>
          </div>

          {newAccountType === 'BANK_ACCOUNT' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isAr ? 'اختيار البنك السعودي' : 'Select Saudi Bank'}
                </label>
                <select
                  value={newAccountBankName}
                  onChange={(e) => handleBankSelect(e.target.value)}
                  className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
                >
                  {SAUDI_BANKS.map((b) => (
                    <option key={b.code} value={b.nameAr}>
                      {b.nameAr} ({b.nameEn})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'رقم الحساب' : 'Account Number'}
                  </label>
                  <Input
                    value={newAccountNum}
                    onChange={(e) => setNewAccountNum(e.target.value)}
                    placeholder="10029384756"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {isAr ? 'رمز السويفت' : 'SWIFT / BIC'}
                  </label>
                  <Input value={newAccountSwift} onChange={(e) => setNewAccountSwift(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isAr ? 'رقم الآيبان (IBAN) السعودي' : 'Saudi IBAN'}
                </label>
                <Input
                  value={newAccountIban}
                  onChange={(e) => setNewAccountIban(e.target.value)}
                  placeholder="SA0380000000608010167519"
                  className="font-mono"
                />
                <span className="text-xs text-slate-500 mt-1 block">
                  {isAr
                    ? 'يتم التحقق الآلي من رقم الآيبان عبر خوارزمية MOD-97 المعتمدة من البنك المركزي السعودي (SAMA).'
                    : 'Validated automatically using ISO 7064 MOD-97 algorithm mandated by SAMA.'}
                </span>
              </div>
            </>
          )}

          {newAccountType === 'PETTY_CASH' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'اسم أمين العهدة (الموظف المسؤول)' : 'Custodian Name'}
              </label>
              <Input
                value={newAccountCustodian}
                onChange={(e) => setNewAccountCustodian(e.target.value)}
                placeholder={isAr ? 'مثال: فهد السبيعي' : 'Employee Name'}
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'الرصيد الافتتاحي (﷼)' : 'Opening Balance (SAR)'}
            </label>
            <Input
              type="number"
              step="0.01"
              value={newAccountOpeningBal}
              onChange={(e) => setNewAccountOpeningBal(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="outline" type="button" onClick={() => setIsAccountModalOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit">
              {isAr ? 'حفظ الحساب' : 'Save Account'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: CREATE RECEIPT VOUCHER */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        title={isAr ? 'إنشاء وترحيل سند قبض (Receipt Voucher)' : 'Create & Post Receipt Voucher'}
      >
        <form onSubmit={handleCreateReceipt} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'حساب الإيداع / الخزينة' : 'Deposit Treasury Account'}
              </label>
              <select
                value={rcAccountId}
                onChange={(e) => setRcAccountId(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameAr} ({formatCurrency(a.currentBalanceSar, lang)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'تاريخ السند' : 'Receipt Date'}
              </label>
              <Input type="date" value={rcDate} onChange={(e) => setRcDate(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'تصنيف القبض' : 'Receipt Category'}
              </label>
              <select
                value={rcCategory}
                onChange={(e) => setRcCategory(e.target.value as ReceiptCategory)}
                className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="CUSTOMER_PAYMENT">{isAr ? 'تحصيل من عميل' : 'Customer Payment'}</option>
                <option value="ADVANCE_PAYMENT">{isAr ? 'دفعة مقدمة من عميل' : 'Advance Payment'}</option>
                <option value="DIRECT_INCOME">{isAr ? 'إيراد مباشر متنوع' : 'Direct Income'}</option>
                <option value="PARTNER_CONTRIBUTION">{isAr ? 'إيداع رأس مال / شريك' : 'Partner Capital'}</option>
                <option value="OTHER_INFLOW">{isAr ? 'مقبوضات أخرى' : 'Other Inflow'}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'طريقة الاستلام' : 'Payment Method'}
              </label>
              <select
                value={rcMethod}
                onChange={(e) => setRcMethod(e.target.value as TreasuryPaymentMethod)}
                className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="BANK_TRANSFER">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                <option value="CASH">{isAr ? 'نقدي (كاش)' : 'Cash'}</option>
                <option value="MADA">{isAr ? 'بطاقة مدى (Mada)' : 'Mada Card'}</option>
                <option value="CREDIT_CARD">{isAr ? 'بطاقة ائتمانية' : 'Credit Card'}</option>
                <option value="CHEQUE">{isAr ? 'شيك ورقي' : 'Cheque'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'المبلغ المستلم (﷼)' : 'Total Amount (SAR)'}
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="1000.00"
                value={rcAmount}
                onChange={(e) => setRcAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'اسم الدافع / العميل' : 'Payer / Customer Name'}
              </label>
              <Input
                placeholder={isAr ? 'مثال: شركة الحلول المتقدمة' : 'Payer Name'}
                value={rcPayerName}
                onChange={(e) => setRcPayerName(e.target.value)}
              />
            </div>
          </div>

          {rcMethod === 'CHEQUE' && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <span className="text-xs font-bold text-slate-800 block">
                {isAr ? 'بيانات الشيك الوارد' : 'Inward Cheque Details'}
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">{isAr ? 'رقم الشيك' : 'Cheque No'}</label>
                  <Input
                    value={rcChequeNum}
                    onChange={(e) => setRcChequeNum(e.target.value)}
                    placeholder="CHQ-9821"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
                  <Input
                    type="date"
                    value={rcChequeDueDate}
                    onChange={(e) => setRcChequeDueDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">{isAr ? 'البنك المسحوب' : 'Bank'}</label>
                  <Input
                    value={rcChequeBank}
                    onChange={(e) => setRcChequeBank(e.target.value)}
                    placeholder="مصرف الراجحي"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'البيان والملاحظات' : 'Notes & Description'}
            </label>
            <Input
              placeholder={isAr ? 'بيان سند القبض...' : 'Receipt description...'}
              value={rcNotes}
              onChange={(e) => setRcNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="outline" type="button" onClick={() => setIsReceiptModalOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {isAr ? 'ترحيل سند القبض' : 'Post Receipt'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE PAYMENT VOUCHER */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={isAr ? 'إنشاء وترحيل سند صرف (Payment Voucher)' : 'Create & Post Payment Voucher'}
      >
        <form onSubmit={handleCreatePayment} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'حساب الصرف / الخزينة' : 'Disbursement Account'}
              </label>
              <select
                value={pvAccountId}
                onChange={(e) => setPvAccountId(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
                required
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameAr} ({formatCurrency(a.currentBalanceSar, lang)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'تاريخ السند' : 'Payment Date'}
              </label>
              <Input type="date" value={pvDate} onChange={(e) => setPvDate(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'تصنيف الصرف' : 'Payment Category'}
              </label>
              <select
                value={pvCategory}
                onChange={(e) => setPvCategory(e.target.value as PaymentCategory)}
                className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="OPERATING_EXPENSE">{isAr ? 'مصروف تشغيلي (مع ضريبة 15%)' : 'Operating Expense (+15% VAT)'}</option>
                <option value="SUPPLIER_PAYMENT">{isAr ? 'سداد مورد / فاتورة مشتريات' : 'Supplier Bill Payment'}</option>
                <option value="CUSTODY_FUNDING">{isAr ? 'تغذية / صرف عهدة موظف' : 'Custody Funding'}</option>
                <option value="TAX_PAYMENT">{isAr ? 'سداد الزكاة والضريبة (ZATCA)' : 'Tax Payment'}</option>
                <option value="OTHER_OUTFLOW">{isAr ? 'مدفوعات أخرى' : 'Other Outflow'}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'طريقة الصرف' : 'Payment Method'}
              </label>
              <select
                value={pvMethod}
                onChange={(e) => setPvMethod(e.target.value as TreasuryPaymentMethod)}
                className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="BANK_TRANSFER">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</option>
                <option value="CASH">{isAr ? 'نقدي (كاش)' : 'Cash'}</option>
                <option value="CHEQUE">{isAr ? 'شيك بنكي صادر' : 'Issued Cheque'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'المبلغ الإجمالي (﷼)' : 'Total Amount (SAR)'}
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="1150.00"
                value={pvAmount}
                onChange={(e) => setPvAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'الجهة المستفيدة' : 'Beneficiary Name'}
              </label>
              <Input
                placeholder={isAr ? 'مثال: شركة الكهرباء السعودية' : 'Beneficiary'}
                value={pvBeneficiary}
                onChange={(e) => setPvBeneficiary(e.target.value)}
              />
            </div>
          </div>

          {pvCategory === 'OPERATING_EXPENSE' && (
            <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg space-y-3">
              <span className="text-xs font-bold text-amber-900 block">
                {isAr ? 'تفاصيل ضريبة القيمة المضافة للمصروف (15%)' : 'Expense 15% VAT Breakdown'}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">{isAr ? 'البيان' : 'Description'}</label>
                  <Input
                    value={pvExpenseDesc}
                    onChange={(e) => setPvExpenseDesc(e.target.value)}
                    placeholder={isAr ? 'إيجار / فواتير اتصالات' : 'Expense item'}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    {isAr ? 'الرقم الضريبي للمورد (TRN)' : 'Supplier VAT TRN'}
                  </label>
                  <Input
                    value={pvExpenseVatNum}
                    onChange={(e) => setPvExpenseVatNum(e.target.value)}
                    placeholder="300123456789003"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'البيان والملاحظات' : 'Notes & Description'}
            </label>
            <Input
              placeholder={isAr ? 'بيان سند الصرف...' : 'Payment notes...'}
              value={pvNotes}
              onChange={(e) => setPvNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="outline" type="button" onClick={() => setIsPaymentModalOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit" className="bg-amber-600 hover:bg-amber-700 text-white">
              {isAr ? 'ترحيل سند الصرف' : 'Post Payment'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 4: INTER-ACCOUNT TRANSFER */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title={isAr ? 'تحويل سيولة بين الخزائن والبنوك' : 'Transfer Liquidity Between Accounts'}
      >
        <form onSubmit={handleCreateTransfer} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'من حساب (المصدر)' : 'From Account (Source)'}
              </label>
              <select
                value={trFromId}
                onChange={(e) => setTrFromId(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
                required
              >
                <option value="">{isAr ? '— اختر الحساب —' : 'Select Source'}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameAr} ({formatCurrency(a.currentBalanceSar, lang)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'إلى حساب (الوجهة)' : 'To Account (Destination)'}
              </label>
              <select
                value={trToId}
                onChange={(e) => setTrToId(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
                required
              >
                <option value="">{isAr ? '— اختر الحساب —' : 'Select Destination'}</option>
                {accounts
                  .filter((a) => a.id !== trFromId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nameAr} ({formatCurrency(a.currentBalanceSar, lang)})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'مبلغ التحويل (﷼)' : 'Transfer Amount (SAR)'}
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="5000.00"
                value={trAmount}
                onChange={(e) => setTrAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'عمولة / رسوم التحويل' : 'Bank Fee (SAR)'}
              </label>
              <Input
                type="number"
                step="0.01"
                value={trFee}
                onChange={(e) => setTrFee(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'تاريخ التحويل' : 'Transfer Date'}
              </label>
              <Input type="date" value={trDate} onChange={(e) => setTrDate(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'البيان والملاحظات' : 'Notes'}
            </label>
            <Input
              placeholder={isAr ? 'تحويل نقدية إلى البنك لتعزيز السيولة...' : 'Transfer notes...'}
              value={trNotes}
              onChange={(e) => setTrNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="outline" type="button" onClick={() => setIsTransferModalOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit">
              {isAr ? 'تنفيذ وترحيل التحويل' : 'Execute Transfer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 5: PETTY CASH SETTLEMENT */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isSettlementModalOpen}
        onClose={() => setIsSettlementModalOpen(false)}
        title={isAr ? 'تسوية وإقفال عهدة نقدية' : 'Petty Cash Custody Settlement'}
      >
        <form onSubmit={handleCreateSettlement} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'حساب العهدة' : 'Custody Account'}
              </label>
              <select
                value={stCustodyId}
                onChange={(e) => setStCustodyId(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
                required
              >
                <option value="">{isAr ? '— اختر حساب العهدة —' : 'Select Custody'}</option>
                {accounts
                  .filter((a) => a.type === 'PETTY_CASH')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nameAr} ({formatCurrency(a.currentBalanceSar, lang)})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'تاريخ التسوية' : 'Settlement Date'}
              </label>
              <Input type="date" value={stDate} onChange={(e) => setStDate(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'حساب إرجاع الفائض (اختياري)' : 'Refund Vault Account (Optional)'}
            </label>
            <select
              value={stRefundAccountId}
              onChange={(e) => setStRefundAccountId(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">{isAr ? '— لا يوجد إرجاع نقدي (تسوية مصروفات فقط) —' : 'No Refund'}</option>
              {accounts
                .filter((a) => a.type === 'CASH_DRAWER' || a.type === 'BANK_ACCOUNT')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameAr}
                  </option>
                ))}
            </select>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <span className="text-xs font-bold text-slate-800 block">
              {isAr ? 'تفاصيل بنود المصروفات المرفقة بالتسوية' : 'Settlement Expense Lines'}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-600 mb-1">{isAr ? 'البيان' : 'Description'}</label>
                <Input value={stExpDesc} onChange={(e) => setStExpDesc(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  {isAr ? 'المبلغ قبل الضريبة (﷼)' : 'Taxable Amount (SAR)'}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="2000.00"
                  value={stExpTaxable}
                  onChange={(e) => setStExpTaxable(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="outline" type="button" onClick={() => setIsSettlementModalOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit">
              {isAr ? 'ترحيل تسوية العهدة' : 'Post Settlement'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 6: BANK RECONCILIATION */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isReconcileModalOpen}
        onClose={() => setIsReconcileModalOpen(false)}
        title={isAr ? 'مطابقة كشف الحساب البنكي' : 'Bank Statement Reconciliation'}
      >
        <form onSubmit={handleCreateReconciliation} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'الحساب البنكي' : 'Bank Account'}
            </label>
            <select
              value={recAccountId}
              onChange={(e) => setRecAccountId(e.target.value)}
              className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
              required
            >
              {accounts
                .filter((a) => a.type === 'BANK_ACCOUNT')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nameAr} (الرصيد الدفتري: {formatCurrency(a.currentBalanceSar, lang)})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'الرصيد الختامي في كشف البنك (﷼)' : 'Ending Statement Balance (SAR)'}
            </label>
            <Input
              type="number"
              step="0.01"
              placeholder="250000.00"
              value={recStatementBalance}
              onChange={(e) => setRecStatementBalance(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'من تاريخ' : 'Start Date'}
              </label>
              <Input type="date" value={recStartDate} onChange={(e) => setRecStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'إلى تاريخ' : 'End Date'}
              </label>
              <Input type="date" value={recEndDate} onChange={(e) => setRecEndDate(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <Button variant="outline" type="button" onClick={() => setIsReconcileModalOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit">
              {isAr ? 'إجراء المطابقة' : 'Reconcile'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 7: VIEW VOUCHER DETAILS */}
      {/* ========================================================================= */}
      {selectedReceiptForView && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedReceiptForView(null)}
          title={`${isAr ? 'تفاصيل سند قبض' : 'Receipt Voucher Details'} — ${selectedReceiptForView.receiptNumber}`}
        >
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs text-emerald-700 font-semibold block">
                  {isAr ? 'المبلغ المقبوض' : 'Received Amount'}
                </span>
                <span className="text-2xl font-bold text-emerald-900">
                  {formatCurrency(selectedReceiptForView.amountSar, lang)}
                </span>
              </div>
              <Badge variant="success">{selectedReceiptForView.status}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-slate-500 block">{isAr ? 'اسم الدافع' : 'Payer'}</span>
                <span className="font-semibold text-slate-900">{selectedReceiptForView.payerName}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">{isAr ? 'التاريخ' : 'Date'}</span>
                <span className="font-semibold text-slate-900">{selectedReceiptForView.receiptDate}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">{isAr ? 'طريقة الدفع' : 'Payment Method'}</span>
                <span className="font-semibold text-slate-900">{selectedReceiptForView.paymentMethod}</span>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">{isAr ? 'قيد اليومية' : 'GL Journal'}</span>
                <span className="font-mono text-indigo-700 font-bold">
                  {selectedReceiptForView.journalNumber || '—'}
                </span>
              </div>
            </div>

            {selectedReceiptForView.descriptionAr && (
              <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
                <span className="font-bold text-slate-700 block mb-1">{isAr ? 'البيان:' : 'Notes:'}</span>
                {selectedReceiptForView.descriptionAr}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button variant="outline" onClick={() => setSelectedReceiptForView(null)}>
                {isAr ? 'إغلاق' : 'Close'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: BOUNCE CHEQUE REASON */}
      {/* ========================================================================= */}
      {selectedChequeForAction && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedChequeForAction(null)}
          title={isAr ? 'تسجيل ارتداد شيك' : 'Record Bounced Cheque'}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              {isAr
                ? `تسجيل سبب ارتداد الشيك رقم ${selectedChequeForAction.chequeNumber} المسحوب على ${selectedChequeForAction.bankName}.`
                : `Specify reason for bouncing cheque #${selectedChequeForAction.chequeNumber}.`}
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'سبب الارتداد (وفق نظام الأوراق التجارية السعودي)' : 'Bounce Reason'}
              </label>
              <select
                value={bounceReasonInput}
                onChange={(e) => setBounceReasonInput(e.target.value)}
                className="w-full text-sm rounded-lg border-slate-300 shadow-xs focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="عدم كفاية الرصيد لدى البنك المسحوب عليه (بند 3)">
                  {isAr ? 'عدم كفاية الرصيد لدى البنك المسحوب عليه' : 'Insufficient Funds'}
                </option>
                <option value="اختلاف في التوقيع أو تجميد الحساب">
                  {isAr ? 'اختلاف في التوقيع أو تجميد الحساب' : 'Signature Mismatch / Account Frozen'}
                </option>
                <option value="انقضاء مدة تقديم الشيك">{isAr ? 'انقضاء مدة تقديم الشيك' : 'Expired Cheque'}</option>
                <option value="أمر كتابي بعدم الصرف">{isAr ? 'أمر كتابي بعدم الصرف' : 'Stop Payment Order'}</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <Button variant="outline" onClick={() => setSelectedChequeForAction(null)}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button variant="primary" onClick={handleBounceCheque} className="bg-rose-600 hover:bg-rose-700 text-white">
                {isAr ? 'تأكيد الارتداد' : 'Confirm Bounce'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
