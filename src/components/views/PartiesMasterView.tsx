import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n/context.js';
import { PageHeader } from '../ui/PageHeader.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Badge } from '../ui/Badge.js';
import { Modal } from '../ui/Modal.js';
import { useToast } from '../ui/Toast.js';
import {
  Users,
  Building2,
  FileSpreadsheet,
  Download,
  Upload,
  Search,
  Plus,
  RefreshCw,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Ban,
  ShieldCheck,
  CreditCard,
  Phone,
  Mail,
  MapPin,
  Clock,
  RotateCcw,
  SlidersHorizontal,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText,
  FileCheck,
  DollarSign,
  TrendingUp,
  Building,
  Briefcase,
} from 'lucide-react';
import {
  Customer,
  Supplier,
  PartyType,
  PartyStatus,
  PaymentTerms,
  CustomerGroup,
  SupplierGroup,
  SupplierClassification,
  CreditEvaluationResult,
  BatchImportReport,
  PartyLedgerStatementLine,
  validateSaudiMobile,
} from '../../lib/parties.js';
import {
  validateSaudiVatNumber,
  validateSaudiCrNumber,
  validateSaudiUnifiedNumber,
  validateSaudiIban,
} from '../../utils/saudiValidators.js';

export const PartiesMasterView: React.FC<{ onNavigate?: (route: string) => void }> = ({ onNavigate }) => {
  const { language, isAr } = useI18n();
  const { showToast } = useToast();

  // Active Main Tab
  const [activeTab, setActiveTab] = useState<'CUSTOMERS' | 'SUPPLIERS' | 'IMPORT_EXPORT'>('CUSTOMERS');

  // Data States
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Selected Detail / Statement Modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [ledgerStatement, setLedgerStatement] = useState<PartyLedgerStatementLine[]>([]);
  const [isStatementLoading, setIsStatementLoading] = useState<boolean>(false);

  // Modals
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState<boolean>(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState<boolean>(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState<boolean>(false);
  const [partyToStatusUpdate, setPartyToStatusUpdate] = useState<{ entity: 'CUSTOMER' | 'SUPPLIER'; id: string; currentStatus: PartyStatus; name: string } | null>(null);
  const [newStatus, setNewStatus] = useState<PartyStatus>('ACTIVE');
  const [statusReason, setStatusReason] = useState<string>('');

  // Credit Simulator
  const [isCreditCheckModalOpen, setIsCreditCheckModalOpen] = useState<boolean>(false);
  const [creditTestCustomer, setCreditTestCustomer] = useState<Customer | null>(null);
  const [proposedSaleAmount, setProposedSaleAmount] = useState<string>('5000');
  const [creditCheckResult, setCreditCheckResult] = useState<CreditEvaluationResult | null>(null);
  const [isCreditChecking, setIsCreditChecking] = useState<boolean>(false);

  // Purchase Check Modal (for suppliers)
  const [isPurchaseCheckModalOpen, setIsPurchaseCheckModalOpen] = useState<boolean>(false);
  const [purchaseTestSupplier, setPurchaseTestSupplier] = useState<Supplier | null>(null);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [purchaseCheckResult, setPurchaseCheckResult] = useState<{ allowed: boolean; status: string; reason?: string; requiresOverride?: boolean } | null>(null);

  // Import / Export State
  const [importEntity, setImportEntity] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [importMode, setImportMode] = useState<'CREATE_ONLY' | 'UPDATE_ONLY' | 'CREATE_OR_UPDATE'>('CREATE_OR_UPDATE');
  const [rawCsvInput, setRawCsvInput] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importReport, setImportReport] = useState<BatchImportReport | null>(null);
  const [rollbackBatchId, setRollbackBatchId] = useState<string>('');
  const [isRollingBack, setIsRollingBack] = useState<boolean>(false);

  // Forms
  const initialCustomerForm = {
    code: '',
    nameAr: '',
    nameEn: '',
    type: 'ESTABLISHMENT' as PartyType,
    customerGroup: 'WHOLESALE' as CustomerGroup,
    crNumber: '',
    vatNumber: '',
    unifiedNumber: '',
    nationalId: '',
    mobile: '',
    phone: '',
    email: '',
    contactPersonName: '',
    paymentTerms: 'NET_30' as PaymentTerms,
    creditLimit: '50000',
    creditHold: false,
    cashOnly: false,
    buildingNumber: '',
    street: '',
    district: '',
    city: 'الرياض',
    postalCode: '',
    additionalNumber: '',
  };
  const [customerForm, setCustomerForm] = useState(initialCustomerForm);
  const [customerFormErrors, setCustomerFormErrors] = useState<Record<string, string>>({});

  const initialSupplierForm = {
    code: '',
    nameAr: '',
    nameEn: '',
    type: 'COMPANY' as PartyType,
    supplierClassification: 'LOCAL' as SupplierClassification,
    supplierGroup: 'RAW_MATERIALS' as SupplierGroup,
    crNumber: '',
    vatNumber: '',
    unifiedNumber: '',
    mobile: '',
    phone: '',
    email: '',
    contactPersonName: '',
    paymentTerms: 'NET_30' as PaymentTerms,
    bankName: 'مصرف الراجحي',
    bankIban: '',
    swiftCode: '',
    buildingNumber: '',
    street: '',
    district: '',
    city: 'الرياض',
    postalCode: '',
    additionalNumber: '',
  };
  const [supplierForm, setSupplierForm] = useState(initialSupplierForm);
  const [supplierFormErrors, setSupplierFormErrors] = useState<Record<string, string>>({});

  const getAuthHeaders = () => {
    const token = localStorage.getItem('saudi_erp_session_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  // Load Data
  const loadParties = async () => {
    setIsLoading(true);
    try {
      const [custRes, suppRes] = await Promise.all([
        fetch('/api/v1/sales/customers', { headers: getAuthHeaders() }),
        fetch('/api/v1/purchasing/suppliers', { headers: getAuthHeaders() }),
      ]);

      if (custRes.ok) {
        const custData = await custRes.json();
        setCustomers(Array.isArray(custData) ? custData : custData.customers || []);
      }
      if (suppRes.ok) {
        const suppData = await suppRes.json();
        setSuppliers(Array.isArray(suppData) ? suppData : suppData.suppliers || []);
      }
    } catch (err: any) {
      showToast({
        title: isAr ? 'خطأ في جلب البيانات' : 'Failed to fetch parties',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadParties();
  }, []);

  // Fetch individual party ledger statement
  const viewCustomerLedger = async (cust: Customer) => {
    setSelectedCustomer(cust);
    setIsStatementLoading(true);
    try {
      const res = await fetch(`/api/v1/sales/customers/${cust.id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLedgerStatement(data.statement || []);
      }
    } catch (err: any) {
      showToast({
        title: isAr ? 'خطأ في جلب كشف الحساب' : 'Failed to load statement',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setIsStatementLoading(false);
    }
  };

  const viewSupplierLedger = async (supp: Supplier) => {
    setSelectedSupplier(supp);
    setIsStatementLoading(true);
    try {
      const res = await fetch(`/api/v1/purchasing/suppliers/${supp.id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setLedgerStatement(data.statement || []);
      }
    } catch (err: any) {
      showToast({
        title: isAr ? 'خطأ في جلب كشف الحساب' : 'Failed to load statement',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setIsStatementLoading(false);
    }
  };

  // Run Credit Check
  const runCreditCheck = async () => {
    if (!creditTestCustomer) return;
    setIsCreditChecking(true);
    try {
      const res = await fetch(`/api/v1/sales/customers/${creditTestCustomer.id}/credit-check`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ proposedAmountSar: parseFloat(proposedSaleAmount || '0') }),
      });
      if (res.ok) {
        const result = await res.json();
        setCreditCheckResult(result);
      }
    } catch (err: any) {
      showToast({
        title: isAr ? 'فحص الائتمان فشل' : 'Credit check failed',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setIsCreditChecking(false);
    }
  };

  // Run Supplier Purchase Check
  const runPurchaseCheck = async () => {
    if (!purchaseTestSupplier) return;
    try {
      const res = await fetch(`/api/v1/purchasing/suppliers/${purchaseTestSupplier.id}/check-purchase`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ overrideReason: overrideReason.trim() }),
      });
      const result = await res.json();
      setPurchaseCheckResult(result);
      if (result.allowed) {
        showToast({
          title: isAr ? 'إذن الشراء متاح' : 'Purchase Authorized',
          description: isAr ? 'المورد مؤهل لإصدار أوامر الشراء' : 'Supplier is eligible for purchase orders',
          variant: 'success',
        });
      } else {
        showToast({
          title: isAr ? 'المورد محظور من الشراء' : 'Purchase Blocked',
          description: result.reason || (isAr ? 'حساب المورد موقوف' : 'Supplier is suspended'),
          variant: 'error',
        });
      }
    } catch (err: any) {
      showToast({
        title: isAr ? 'فشل فحص الشراء' : 'Purchase check failed',
        description: err.message,
        variant: 'error',
      });
    }
  };

  // Submit Customer Creation
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!customerForm.nameAr.trim()) {
      errors.nameAr = isAr ? 'الاسم باللغة العربية مطلوب' : 'Arabic name is required';
    }
    if (!customerForm.mobile || !validateSaudiMobile(customerForm.mobile)) {
      errors.mobile = isAr ? 'رقم جوال سعودي صحيح مطلوب (05XXXXXXXX)' : 'Valid Saudi mobile required (05XXXXXXXX)';
    }
    if (customerForm.vatNumber && !validateSaudiVatNumber(customerForm.vatNumber).valid) {
      errors.vatNumber = isAr ? 'الرقم الضريبي يجب أن يكون 15 رقماً ويبدأ وينتهي بالرقم 3' : 'VAT must be 15 digits starting/ending with 3';
    }
    if (customerForm.crNumber && !validateSaudiCrNumber(customerForm.crNumber).valid) {
      errors.crNumber = isAr ? 'السجل التجاري يجب أن يتكون من 10 أرقام' : 'CR must be 10 digits';
    }
    if (customerForm.unifiedNumber && !validateSaudiUnifiedNumber(customerForm.unifiedNumber).valid) {
      errors.unifiedNumber = isAr ? 'الرقم الموحد يجب أن يبدأ بـ 7 ويتكون من 10 أرقام' : 'Unified number must start with 7 and have 10 digits';
    }

    if (Object.keys(errors).length > 0) {
      setCustomerFormErrors(errors);
      return;
    }

    try {
      const payload = {
        code: customerForm.code.trim() || undefined,
        nameAr: customerForm.nameAr.trim(),
        nameEn: customerForm.nameEn.trim() || undefined,
        type: customerForm.type,
        customerGroup: customerForm.customerGroup,
        crNumber: customerForm.crNumber.trim() || undefined,
        vatNumber: customerForm.vatNumber.trim() || undefined,
        unifiedNumber: customerForm.unifiedNumber.trim() || undefined,
        nationalId: customerForm.nationalId.trim() || undefined,
        mobile: customerForm.mobile.trim(),
        phone: customerForm.phone.trim() || undefined,
        email: customerForm.email.trim() || undefined,
        contactPersonName: customerForm.contactPersonName.trim() || undefined,
        paymentTerms: customerForm.paymentTerms,
        creditLimit: parseFloat(customerForm.creditLimit || '0'),
        creditHold: customerForm.creditHold,
        cashOnly: customerForm.cashOnly,
        address: {
          buildingNumber: customerForm.buildingNumber.trim(),
          street: customerForm.street.trim(),
          district: customerForm.district.trim(),
          city: customerForm.city.trim(),
          postalCode: customerForm.postalCode.trim(),
          additionalNumber: customerForm.additionalNumber.trim(),
          country: 'SA',
        },
      };

      const res = await fetch('/api/v1/sales/customers', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || errorData.message || 'Failed to create customer');
      }

      showToast({
        title: isAr ? 'تم إضافة العميل بنجاح' : 'Customer Created',
        description: isAr ? 'تم إنشاء الحساب الفرعي بدفتر الأستاذ تلقائياً (10201)' : 'GL subaccount auto-created under 10201',
        variant: 'success',
      });

      setIsCustomerModalOpen(false);
      setCustomerForm(initialCustomerForm);
      setCustomerFormErrors({});
      loadParties();
    } catch (err: any) {
      showToast({
        title: isAr ? 'خطأ في إنشاء العميل' : 'Creation Error',
        description: err.message,
        variant: 'error',
      });
    }
  };

  // Submit Supplier Creation
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!supplierForm.nameAr.trim()) {
      errors.nameAr = isAr ? 'الاسم باللغة العربية مطلوب' : 'Arabic name is required';
    }
    if (!supplierForm.mobile || !validateSaudiMobile(supplierForm.mobile)) {
      errors.mobile = isAr ? 'رقم جوال سعودي صحيح مطلوب (05XXXXXXXX)' : 'Valid Saudi mobile required (05XXXXXXXX)';
    }
    if (supplierForm.vatNumber && !validateSaudiVatNumber(supplierForm.vatNumber).valid) {
      errors.vatNumber = isAr ? 'الرقم الضريبي يجب أن يكون 15 رقماً ويبدأ وينتهي بالرقم 3' : 'VAT must be 15 digits starting/ending with 3';
    }
    if (supplierForm.crNumber && !validateSaudiCrNumber(supplierForm.crNumber).valid) {
      errors.crNumber = isAr ? 'السجل التجاري يجب أن يتكون من 10 أرقام' : 'CR must be 10 digits';
    }
    if (supplierForm.bankIban && !validateSaudiIban(supplierForm.bankIban).valid) {
      errors.bankIban = isAr ? 'الآيبان السعودي يجب أن يبدأ بـ SA ويتكون من 24 حرفاً ورقماً' : 'Saudi IBAN must start with SA (24 characters)';
    }

    if (Object.keys(errors).length > 0) {
      setSupplierFormErrors(errors);
      return;
    }

    try {
      const payload = {
        code: supplierForm.code.trim() || undefined,
        nameAr: supplierForm.nameAr.trim(),
        nameEn: supplierForm.nameEn.trim() || undefined,
        type: supplierForm.type,
        supplierClassification: supplierForm.supplierClassification,
        supplierGroup: supplierForm.supplierGroup,
        crNumber: supplierForm.crNumber.trim() || undefined,
        vatNumber: supplierForm.vatNumber.trim() || undefined,
        unifiedNumber: supplierForm.unifiedNumber.trim() || undefined,
        mobile: supplierForm.mobile.trim(),
        phone: supplierForm.phone.trim() || undefined,
        email: supplierForm.email.trim() || undefined,
        contactPersonName: supplierForm.contactPersonName.trim() || undefined,
        paymentTerms: supplierForm.paymentTerms,
        bankName: supplierForm.bankName.trim() || undefined,
        bankIban: supplierForm.bankIban.trim() || undefined,
        swiftCode: supplierForm.swiftCode.trim() || undefined,
        address: {
          buildingNumber: supplierForm.buildingNumber.trim(),
          street: supplierForm.street.trim(),
          district: supplierForm.district.trim(),
          city: supplierForm.city.trim(),
          postalCode: supplierForm.postalCode.trim(),
          additionalNumber: supplierForm.additionalNumber.trim(),
          country: 'SA',
        },
      };

      const res = await fetch('/api/v1/purchasing/suppliers', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || errorData.message || 'Failed to create supplier');
      }

      showToast({
        title: isAr ? 'تم إضافة المورد بنجاح' : 'Supplier Created',
        description: isAr ? 'تم إنشاء الحساب الفرعي بدفتر الأستاذ تلقائياً (20101)' : 'GL subaccount auto-created under 20101',
        variant: 'success',
      });

      setIsSupplierModalOpen(false);
      setSupplierForm(initialSupplierForm);
      setSupplierFormErrors({});
      loadParties();
    } catch (err: any) {
      showToast({
        title: isAr ? 'خطأ في إنشاء المورد' : 'Creation Error',
        description: err.message,
        variant: 'error',
      });
    }
  };

  // Submit Status Change
  const handleUpdateStatus = async () => {
    if (!partyToStatusUpdate) return;
    try {
      const endpoint =
        partyToStatusUpdate.entity === 'CUSTOMER'
          ? `/api/v1/sales/customers/${partyToStatusUpdate.id}/status`
          : `/api/v1/purchasing/suppliers/${partyToStatusUpdate.id}/status`;

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status: newStatus,
          reason: statusReason.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to update status');
      }

      showToast({
        title: isAr ? 'تم تحديث الحالة بنجاح' : 'Status Updated',
        description: isAr ? `الحالة الجديدة: ${newStatus}` : `New status: ${newStatus}`,
        variant: 'success',
      });

      setIsStatusModalOpen(false);
      setPartyToStatusUpdate(null);
      setStatusReason('');
      loadParties();
    } catch (err: any) {
      showToast({
        title: isAr ? 'فشل تحديث الحالة' : 'Status update failed',
        description: err.message,
        variant: 'error',
      });
    }
  };

  // Handle Export CSV
  const handleExport = (entity: 'CUSTOMER' | 'SUPPLIER') => {
    const url = entity === 'CUSTOMER' ? '/api/v1/sales/customers/export' : '/api/v1/purchasing/suppliers/export';
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${entity.toLowerCase()}s_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast({
      title: isAr ? 'جاري تصدير الملف' : 'Exporting file',
      description: isAr ? 'تصدير بصيغة CSV مشفرة بـ UTF-8 BOM' : 'Exported with UTF-8 BOM encoding',
      variant: 'success',
    });
  };

  // Handle Import CSV
  const handleExecuteImport = async () => {
    if (!rawCsvInput.trim()) {
      showToast({
        title: isAr ? 'البيانات مطلوبة' : 'Data required',
        description: isAr ? 'يرجى لصق بيانات CSV أو اختيار ملف' : 'Please paste CSV data or select a file',
        variant: 'error',
      });
      return;
    }

    setIsImporting(true);
    setImportReport(null);

    try {
      // Parse CSV rows into objects
      const lines = rawCsvInput.trim().split('\n');
      if (lines.length < 2) {
        throw new Error(isAr ? 'يجب أن يحتوي الملف على رأس الأعمدة وصف واحد على الأقل' : 'CSV must contain a header and at least one data row');
      }

      const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
      const rows = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
        const obj: Record<string, any> = {};
        headers.forEach((h, idx) => {
          obj[h] = vals[idx] !== undefined ? vals[idx] : '';
        });
        rows.push(obj);
      }

      const endpoint = importEntity === 'CUSTOMER' ? '/api/v1/sales/customers/import' : '/api/v1/purchasing/suppliers/import';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          mode: importMode,
          rows,
        }),
      });

      const report = await res.json();
      setImportReport(report);

      if (report.success) {
        showToast({
          title: isAr ? 'اكتمل الاستيراد بنجاح' : 'Import Completed',
          description: isAr
            ? `تم بنجاح استيراد ${report.successfulRows} صف (معرف الحزمة: ${report.batchId.slice(0, 8)})`
            : `Successfully processed ${report.successfulRows} rows (Batch: ${report.batchId.slice(0, 8)})`,
          variant: 'success',
        });
        loadParties();
      } else {
        showToast({
          title: isAr ? 'فشل الاستيراد لوجود أخطاء' : 'Import failed with errors',
          description: isAr ? `تم رفض الاستيراد بالكامل للحفاظ على سلامة البيانات` : `Entire batch rejected to maintain integrity`,
          variant: 'error',
        });
      }
    } catch (err: any) {
      showToast({
        title: isAr ? 'خطأ في معالجة الاستيراد' : 'Import Processing Error',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Handle Rollback
  const handleRollbackBatch = async () => {
    if (!rollbackBatchId.trim()) return;
    setIsRollingBack(true);
    try {
      const endpoint = importEntity === 'CUSTOMER' ? '/api/v1/sales/customers/rollback-import' : '/api/v1/purchasing/suppliers/rollback-import';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ batchId: rollbackBatchId.trim() }),
      });

      const result = await res.json();
      if (result.success) {
        showToast({
          title: isAr ? 'تم التراجع عن الحزمة بنجاح' : 'Batch Rolled Back',
          description: isAr ? `تمت استعادة السجلات بنجاح (${result.restoredCount})` : `Restored ${result.restoredCount} records`,
          variant: 'success',
        });
        setRollbackBatchId('');
        loadParties();
      } else {
        throw new Error(result.error || 'Rollback failed');
      }
    } catch (err: any) {
      showToast({
        title: isAr ? 'فشل التراجع عن الحزمة' : 'Rollback Failed',
        description: err.message,
        variant: 'error',
      });
    } finally {
      setIsRollingBack(false);
    }
  };

  // Sample CSV generators
  const loadCustomerSampleCsv = () => {
    const sample = `code,nameAr,nameEn,type,customerGroup,crNumber,vatNumber,unifiedNumber,mobile,email,paymentTerms,creditLimit,city,street
CUST-1001,شركة الفنار للتجارة والمقاولات,Al Fanar Trading Co,COMPANY,WHOLESALE,1010889922,310288992200003,7001889922,0501234567,contact@alfanar.sa,NET_30,100000,الرياض,طريق الملك فهد
CUST-1002,مؤسسة نجد الحديثة,Najd Modern Est,ESTABLISHMENT,RETAIL,1010776655,310177665500003,,0559876543,sales@najd.sa,NET_15,25000,الدمام,شارع الأمير محمد`;
    setRawCsvInput(sample);
  };

  const loadSupplierSampleCsv = () => {
    const sample = `code,nameAr,nameEn,type,supplierClassification,supplierGroup,crNumber,vatNumber,mobile,email,paymentTerms,bankName,bankIban,city
SUPP-2001,شركة الأسمنت السعودية,Saudi Cement Company,COMPANY,LOCAL,RAW_MATERIALS,1010334455,300133445500003,0561122334,orders@saudicement.sa,NET_60,مصرف الراجحي,SA0380000000608010167519,الهفوف
SUPP-2002,مؤسسة البحر الأحمر للخدمات اللوجستية,Red Sea Logistics,ESTABLISHMENT,LOCAL,LOGISTICS,1010445566,300244556600003,0543344556,info@redsealog.sa,NET_30,البنك الأهلي السعودي,SA4410000001234567890123,جدة`;
    setRawCsvInput(sample);
  };

  // Filtered Lists
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      searchTerm === '' ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.nameAr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.nameEn && c.nameEn.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.vatNumber && c.vatNumber.includes(searchTerm)) ||
      (c.crNumber && c.crNumber.includes(searchTerm)) ||
      c.mobile.includes(searchTerm);

    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchesGroup = groupFilter === 'ALL' || c.customerGroup === groupFilter;
    const matchesType = typeFilter === 'ALL' || c.type === typeFilter;

    return matchesSearch && matchesStatus && matchesGroup && matchesType;
  });

  const filteredSuppliers = suppliers.filter((s) => {
    const matchesSearch =
      searchTerm === '' ||
      s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.nameAr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.nameEn && s.nameEn.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.vatNumber && s.vatNumber.includes(searchTerm)) ||
      (s.crNumber && s.crNumber.includes(searchTerm)) ||
      s.mobile.includes(searchTerm);

    const matchesStatus = statusFilter === 'ALL' || s.status === statusFilter;
    const matchesGroup = groupFilter === 'ALL' || s.supplierGroup === groupFilter;
    const matchesType = typeFilter === 'ALL' || s.type === typeFilter;

    return matchesSearch && matchesStatus && matchesGroup && matchesType;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title={isAr ? 'العملاء والموردون' : 'Customers & Suppliers'}
        subtitle={
          isAr
            ? 'إدارة متكاملة للأطراف، الحسابات الفرعية التلقائية (10201/20101)، أرصدة دفتر الأستاذ الفورية، وفحص الائتمان الصارم'
            : 'Enterprise Party Directory with automatic GL subaccounts (10201/20101), real-time ledger balances, and strict credit enforcement'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadParties} startIcon={<RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />}>
              {isAr ? 'تحديث' : 'Refresh'}
            </Button>
            {activeTab === 'CUSTOMERS' && (
              <Button variant="primary" size="sm" onClick={() => setIsCustomerModalOpen(true)} startIcon={<Plus className="w-4 h-4" />}>
                {isAr ? 'إضافة عميل جديد' : 'New Customer'}
              </Button>
            )}
            {activeTab === 'SUPPLIERS' && (
              <Button variant="primary" size="sm" onClick={() => setIsSupplierModalOpen(true)} startIcon={<Plus className="w-4 h-4" />}>
                {isAr ? 'إضافة مورد جديد' : 'New Supplier'}
              </Button>
            )}
            {activeTab !== 'IMPORT_EXPORT' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport(activeTab === 'CUSTOMERS' ? 'CUSTOMER' : 'SUPPLIER')}
                startIcon={<Download className="w-4 h-4" />}
              >
                {isAr ? 'تصدير CSV' : 'Export CSV'}
              </Button>
            )}
          </div>
        }
      />

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('CUSTOMERS')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium text-sm transition-colors ${
            activeTab === 'CUSTOMERS'
              ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{isAr ? 'سجل العملاء' : 'Customers Directory'}</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900">{customers.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('SUPPLIERS')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium text-sm transition-colors ${
            activeTab === 'SUPPLIERS'
              ? 'border-blue-600 text-blue-800 bg-blue-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>{isAr ? 'سجل الموردين' : 'Suppliers Directory'}</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-900">{suppliers.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('IMPORT_EXPORT')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-medium text-sm transition-colors ${
            activeTab === 'IMPORT_EXPORT'
              ? 'border-purple-600 text-purple-800 bg-purple-50/50'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>{isAr ? 'الاستيراد والتصدير الجماعي' : 'Bulk Import & Rollback'}</span>
        </button>
      </div>

      {/* TAB 1: CUSTOMERS */}
      {activeTab === 'CUSTOMERS' && (
        <div className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{isAr ? 'إجمالي العملاء' : 'Total Customers'}</span>
                <Users className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{customers.length}</div>
              <div className="text-xs text-slate-400 mt-0.5">{isAr ? 'حسابات فرعية تحت 10201' : 'Subaccounts under 10201'}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{isAr ? 'رصيد الذمم المدينة (دفتر الأستاذ)' : 'Total Receivables (Ledger)'}</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">
                {customers.reduce((acc, c) => acc + (c.ledgerBalanceSar || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                <span className="text-xs font-normal">SAR</span>
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-0.5">{isAr ? 'مشتقة من القيود المرحلة' : 'Strict posted journals'}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{isAr ? 'حسابات تحت إيقاف الائتمان' : 'Credit Holds / Cash Only'}</span>
                <Ban className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold text-amber-700 mt-1">
                {customers.filter((c) => c.creditHold || c.cashOnly).length}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{isAr ? 'محمية بضوابط المنع الفوري' : 'Enforced at transaction time'}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{isAr ? 'تغطية الأرقام الضريبية' : 'VAT Number Coverage'}</span>
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-700 mt-1">
                {customers.filter((c) => c.vatNumber && c.vatNumber.length === 15).length} / {customers.length}
              </div>
              <div className="text-xs text-blue-600 font-medium mt-0.5">{isAr ? 'مطابق لقواعد ZATCA' : '15-digit ZATCA compliant'}</div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-3" />
              <input
                type="text"
                placeholder={isAr ? 'بحث بالاسم، الكود، الرقم الضريبي، السجل، الجوال...' : 'Search by name, code, VAT, CR, mobile...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full ps-9 pe-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500"
            >
              <option value="ALL">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
              <option value="ACTIVE">{isAr ? 'نشط (ACTIVE)' : 'Active'}</option>
              <option value="SUSPENDED">{isAr ? 'موقوف (SUSPENDED)' : 'Suspended'}</option>
              <option value="ARCHIVED">{isAr ? 'مؤرشف (ARCHIVED)' : 'Archived'}</option>
            </select>

            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500"
            >
              <option value="ALL">{isAr ? 'كل التصنيفات' : 'All Groups'}</option>
              <option value="WHOLESALE">{isAr ? 'جملة (WHOLESALE)' : 'Wholesale'}</option>
              <option value="RETAIL">{isAr ? 'تجزئة (RETAIL)' : 'Retail'}</option>
              <option value="KEY_ACCOUNT">{isAr ? 'كبار العملاء (KEY_ACCOUNT)' : 'Key Account'}</option>
              <option value="VIP">{isAr ? 'VIP' : 'VIP'}</option>
              <option value="GOVERNMENT">{isAr ? 'جهات حكومية (GOVERNMENT)' : 'Government'}</option>
            </select>
          </div>

          {/* Customers Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                    <th className="py-3 px-4 text-start">{isAr ? 'الكود' : 'Code'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'اسم العميل القانوني' : 'Legal Customer Name'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'الرقم الضريبي / السجل' : 'VAT / CR Number'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'التصنيف والشروط' : 'Group & Terms'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'الحد الائتماني' : 'Credit Limit'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'رصيد دفتر الأستاذ' : 'Ledger Balance'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        {isAr ? 'لا توجد بيانات مطابقة لمعايير البحث' : 'No customers matching current filters'}
                      </td>
                    </tr>
                  ) : (
                    filteredCustomers.map((cust) => {
                      const balance = cust.ledgerBalanceSar || 0;
                      const limit = cust.creditLimit || 0;
                      const isOverLimit = limit > 0 && balance > limit;

                      return (
                        <tr key={cust.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-700">{cust.code}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{cust.nameAr}</div>
                            {cust.nameEn && <div className="text-xs text-slate-500">{cust.nameEn}</div>}
                            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                              <span>{cust.mobile}</span>
                              {cust.email && <span>• {cust.email}</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs font-mono text-slate-600">
                            {cust.vatNumber ? (
                              <div className="text-emerald-700 font-medium">VAT: {cust.vatNumber}</div>
                            ) : (
                              <span className="text-slate-400">{isAr ? 'بدون رقم ضريبي' : 'No VAT'}</span>
                            )}
                            {cust.crNumber && <div className="text-slate-500">CR: {cust.crNumber}</div>}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-xs font-medium text-slate-700">{cust.customerGroup}</div>
                            <div className="text-xs text-slate-500">{cust.paymentTerms}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs">
                            {limit > 0 ? (
                              <div>
                                <span className="font-semibold text-slate-800">{limit.toLocaleString()} SAR</span>
                                {cust.cashOnly && <div className="text-amber-600 font-medium">{isAr ? 'نقدي فقط' : 'Cash Only'}</div>}
                                {cust.creditHold && <div className="text-red-600 font-medium">{isAr ? 'إيقاف ائتماني' : 'Credit Hold'}</div>}
                              </div>
                            ) : (
                              <span className="text-slate-400">{isAr ? 'غير محدد' : 'No Limit'}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono">
                            <span className={`font-bold text-sm ${isOverLimit ? 'text-red-600' : 'text-emerald-700'}`}>
                              {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                            </span>
                            {isOverLimit && (
                              <div className="text-[11px] text-red-600 font-medium flex items-center gap-0.5">
                                <AlertTriangle className="w-3 h-3" />
                                {isAr ? 'تجاوز الحد' : 'Limit Exceeded'}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                cust.status === 'ACTIVE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : cust.status === 'SUSPENDED'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {cust.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-end">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Ledger Statement Button */}
                              <button
                                onClick={() => viewCustomerLedger(cust)}
                                title={isAr ? 'كشف حساب دفتر الأستاذ' : 'View Ledger Statement'}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Credit Simulator Button */}
                              <button
                                onClick={() => {
                                  setCreditTestCustomer(cust);
                                  setCreditCheckResult(null);
                                  setIsCreditCheckModalOpen(true);
                                }}
                                title={isAr ? 'فحص الائتمان ومحاكاة المبيعات' : 'Credit Simulator'}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                              >
                                <CreditCard className="w-4 h-4" />
                              </button>

                              {/* Status Update Button */}
                              <button
                                onClick={() => {
                                  setPartyToStatusUpdate({
                                    entity: 'CUSTOMER',
                                    id: cust.id,
                                    currentStatus: cust.status,
                                    name: cust.nameAr,
                                  });
                                  setNewStatus(cust.status);
                                  setIsStatusModalOpen(true);
                                }}
                                title={isAr ? 'تغيير الحالة' : 'Change Status'}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                              >
                                <SlidersHorizontal className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SUPPLIERS */}
      {activeTab === 'SUPPLIERS' && (
        <div className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{isAr ? 'إجمالي الموردين' : 'Total Suppliers'}</span>
                <Building2 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{suppliers.length}</div>
              <div className="text-xs text-slate-400 mt-0.5">{isAr ? 'حسابات فرعية تحت 20101' : 'Subaccounts under 20101'}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{isAr ? 'رصيد الذمم الدائنة (دفتر الأستاذ)' : 'Total Payables (Ledger)'}</span>
                <DollarSign className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-blue-700 mt-1">
                {suppliers.reduce((acc, s) => acc + (s.ledgerBalanceSar || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                <span className="text-xs font-normal">SAR</span>
              </div>
              <div className="text-xs text-blue-600 font-medium mt-0.5">{isAr ? 'مشتقة من فواتير المشتريات' : 'Strict posted vendor bills'}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{isAr ? 'موردين موقوفين' : 'Suspended Suppliers'}</span>
                <Ban className="w-4 h-4 text-red-600" />
              </div>
              <div className="text-2xl font-bold text-red-700 mt-1">
                {suppliers.filter((s) => s.status === 'SUSPENDED').length}
              </div>
              <div className="text-xs text-red-600 font-medium mt-0.5">{isAr ? 'محظورون من أوامر الشراء' : 'Blocked from purchase orders'}</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">{isAr ? 'الآيبانات البنكية الموثقة' : 'Verified Saudi IBANs'}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">
                {suppliers.filter((s) => s.bankIban && s.bankIban.startsWith('SA')).length} / {suppliers.length}
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-0.5">{isAr ? 'جاهزة للتحويل السريع' : 'Ready for electronic payout'}</div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-3" />
              <input
                type="text"
                placeholder={isAr ? 'بحث بالمورد، الكود، الرقم الضريبي، الآيبان، الجوال...' : 'Search supplier, code, VAT, IBAN, mobile...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full ps-9 pe-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
            >
              <option value="ALL">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
              <option value="ACTIVE">{isAr ? 'نشط (ACTIVE)' : 'Active'}</option>
              <option value="SUSPENDED">{isAr ? 'موقوف (SUSPENDED)' : 'Suspended'}</option>
              <option value="ARCHIVED">{isAr ? 'مؤرشف (ARCHIVED)' : 'Archived'}</option>
            </select>

            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
            >
              <option value="ALL">{isAr ? 'كل المجموعات' : 'All Groups'}</option>
              <option value="RAW_MATERIALS">{isAr ? 'مواد أولية (RAW_MATERIALS)' : 'Raw Materials'}</option>
              <option value="COMMODITIES">{isAr ? 'بضائع جاهزة (COMMODITIES)' : 'Commodities'}</option>
              <option value="SERVICES">{isAr ? 'خدمات واستشارات (SERVICES)' : 'Services'}</option>
              <option value="LOGISTICS">{isAr ? 'شحن ولوجستيات (LOGISTICS)' : 'Logistics'}</option>
            </select>
          </div>

          {/* Suppliers Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                    <th className="py-3 px-4 text-start">{isAr ? 'الكود' : 'Code'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'اسم المورد القانوني' : 'Legal Supplier Name'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'الرقم الضريبي / السجل' : 'VAT / CR Number'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'التصنيف والبنك' : 'Classification & Bank'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'شروط السداد' : 'Payment Terms'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'المستحقات (دفتر الأستاذ)' : 'Payable Balance'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        {isAr ? 'لا توجد بيانات موردين مطابقة للبحث' : 'No suppliers matching current filters'}
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((supp) => {
                      const balance = supp.ledgerBalanceSar || 0;

                      return (
                        <tr key={supp.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-700">{supp.code}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{supp.nameAr}</div>
                            {supp.nameEn && <div className="text-xs text-slate-500">{supp.nameEn}</div>}
                            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                              <span>{supp.mobile}</span>
                              {supp.email && <span>• {supp.email}</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs font-mono text-slate-600">
                            {supp.vatNumber ? (
                              <div className="text-blue-700 font-medium">VAT: {supp.vatNumber}</div>
                            ) : (
                              <span className="text-slate-400">{isAr ? 'غير مسجل ضريبياً' : 'Non-VAT'}</span>
                            )}
                            {supp.crNumber && <div className="text-slate-500">CR: {supp.crNumber}</div>}
                          </td>
                          <td className="py-3 px-4">
                            <div className="text-xs font-medium text-slate-700">{supp.supplierClassification}</div>
                            {supp.bankIban ? (
                              <div className="text-xs font-mono text-slate-500 truncate max-w-[140px]" title={supp.bankIban}>
                                {supp.bankIban}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-400">{isAr ? 'بدون آيبان' : 'No IBAN'}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium text-slate-700">{supp.paymentTerms}</td>
                          <td className="py-3 px-4 font-mono font-bold text-sm text-blue-700">
                            {balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                supp.status === 'ACTIVE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : supp.status === 'SUSPENDED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {supp.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-end">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Ledger Statement Button */}
                              <button
                                onClick={() => viewSupplierLedger(supp)}
                                title={isAr ? 'كشف حساب دفتر الأستاذ' : 'View Ledger Statement'}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Purchase Order Eligibility Test Button */}
                              <button
                                onClick={() => {
                                  setPurchaseTestSupplier(supp);
                                  setOverrideReason('');
                                  setPurchaseCheckResult(null);
                                  setIsPurchaseCheckModalOpen(true);
                                }}
                                title={isAr ? 'فحص أهلية الشراء ومنع المورد الموقوف' : 'Purchase Order Eligibility Check'}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                              >
                                <FileCheck className="w-4 h-4" />
                              </button>

                              {/* Status Update Button */}
                              <button
                                onClick={() => {
                                  setPartyToStatusUpdate({
                                    entity: 'SUPPLIER',
                                    id: supp.id,
                                    currentStatus: supp.status,
                                    name: supp.nameAr,
                                  });
                                  setNewStatus(supp.status);
                                  setIsStatusModalOpen(true);
                                }}
                                title={isAr ? 'تغيير الحالة' : 'Change Status'}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                              >
                                <SlidersHorizontal className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BULK IMPORT & ROLLBACK */}
      {activeTab === 'IMPORT_EXPORT' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900">
                {isAr ? 'محرك الاستيراد الجماعي للأطراف مع ميزة التراجع الفوري' : 'Party Bulk Import Engine with Atomic Rollback'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {isAr
                  ? 'استيراد العملاء أو الموردين دفعة واحدة مع التحقق الشامل من مطابقة الرقم الضريبي والسجل التجاري وأرقام الجوال، وحفظ لقطة الحزمة (Snapshot) لإمكانية التراجع بنقرة واحدة.'
                  : 'Import bulk customers or suppliers with comprehensive VAT/CR/Mobile validation, generating rollback snapshots for instant 1-click recovery.'}
              </p>
            </div>

            {/* Target Entity & Mode Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isAr ? 'الكيان المستهدف' : 'Target Entity'}
                </label>
                <select
                  value={importEntity}
                  onChange={(e) => setImportEntity(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-purple-500"
                >
                  <option value="CUSTOMER">{isAr ? 'العملاء (Customers)' : 'Customers'}</option>
                  <option value="SUPPLIER">{isAr ? 'الموردين (Suppliers)' : 'Suppliers'}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isAr ? 'وضع الاستيراد' : 'Import Mode'}
                </label>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-purple-500"
                >
                  <option value="CREATE_OR_UPDATE">{isAr ? 'إنشاء جديد أو تحديث القائم (Upsert)' : 'Create or Update (Upsert)'}</option>
                  <option value="CREATE_ONLY">{isAr ? 'إنشاء جديد فقط (Create Only)' : 'Create Only'}</option>
                  <option value="UPDATE_ONLY">{isAr ? 'تحديث السجلات القائمة فقط (Update Only)' : 'Update Only'}</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={importEntity === 'CUSTOMER' ? loadCustomerSampleCsv : loadSupplierSampleCsv}
                  startIcon={<FileText className="w-4 h-4" />}
                >
                  {isAr ? 'تحميل نموذج CSV تجريبي' : 'Load Sample CSV Template'}
                </Button>
              </div>
            </div>

            {/* Direct CSV Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">
                  {isAr ? 'بيانات CSV (قم بلصق الأسطر أو عدّلها هنا)' : 'CSV Data (Paste or edit lines here)'}
                </label>
                <span className="text-xs text-slate-400">
                  {isAr ? 'الترميز الموصى به: UTF-8' : 'Recommended encoding: UTF-8'}
                </span>
              </div>
              <textarea
                rows={8}
                value={rawCsvInput}
                onChange={(e) => setRawCsvInput(e.target.value)}
                placeholder={
                  importEntity === 'CUSTOMER'
                    ? 'code,nameAr,nameEn,type,customerGroup,crNumber,vatNumber,mobile,paymentTerms,creditLimit,city\nCUST-01,شركة التميز,Tamayuz Co,COMPANY,WHOLESALE,1010998877,310199887700003,0501112233,NET_30,50000,الرياض'
                    : 'code,nameAr,nameEn,type,supplierClassification,supplierGroup,crNumber,vatNumber,mobile,paymentTerms,city\nSUPP-01,مصنع القمة,Qimmah Factory,COMPANY,LOCAL,RAW_MATERIALS,1010665544,300166554400003,0569998877,NET_60,الدمام'
                }
                className="w-full p-3 font-mono text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:border-purple-500 bg-slate-50/50"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="primary"
                onClick={handleExecuteImport}
                disabled={isImporting || !rawCsvInput.trim()}
                startIcon={<Upload className={`w-4 h-4 ${isImporting ? 'animate-spin' : ''}`} />}
              >
                {isImporting ? (isAr ? 'جاري المعالجة والفحص...' : 'Processing & Validating...') : isAr ? 'تنفيذ الاستيراد الآن' : 'Execute Import Now'}
              </Button>
            </div>

            {/* Import Execution Report */}
            {importReport && (
              <div className={`p-4 rounded-xl border ${importReport.success ? 'bg-emerald-50/70 border-emerald-200' : 'bg-red-50/70 border-red-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {importReport.success ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    )}
                    <span className="font-bold text-sm text-slate-900">
                      {importReport.success
                        ? isAr
                          ? `اكتملت العملية بنجاح (${importReport.successfulRows} من أصل ${importReport.totalRows} صف)`
                          : `Successfully processed (${importReport.successfulRows} / ${importReport.totalRows} rows)`
                        : isAr
                        ? `تم إلغاء الاستيراد لوجود أخطاء (${importReport.failedRows} صف غير صالح)`
                        : `Import aborted due to validation errors (${importReport.failedRows} invalid rows)`}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-slate-600">
                    Batch ID: <span className="font-semibold">{importReport.batchId}</span>
                  </div>
                </div>

                {importReport.errors.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="text-xs font-bold text-red-700">{isAr ? 'قائمة الأخطاء المرصودة:' : 'Validation Errors:'}</div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {importReport.errors.map((err, idx) => (
                        <div key={idx} className="text-xs text-red-800 bg-red-100/60 px-2.5 py-1 rounded">
                          {isAr ? `الصف ${err.row}: ${err.messageAr}` : `Row ${err.row}: ${err.messageEn}`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rollback Batch Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-slate-900">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-bold">{isAr ? 'التراجع عن دفعة استيراد سابقة (Rollback)' : 'Rollback Previous Import Batch'}</h3>
            </div>
            <p className="text-xs text-slate-500">
              {isAr
                ? 'إذا تبيّن وجود خطأ في البيانات بعد استيرادها، يمكنك إدخال معرف الحزمة (Batch ID) لإلغاء جميع التعديلات والإضافات التي تمت خلالها فورياً.'
                : 'If an import batch contained faulty data, enter its Batch ID below to cleanly restore the pre-import snapshot.'}
            </p>

            <div className="flex items-center gap-3 max-w-xl">
              <input
                type="text"
                placeholder="e.g. imp-d7a8f9c1-..."
                value={rollbackBatchId}
                onChange={(e) => setRollbackBatchId(e.target.value)}
                className="flex-1 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-hidden focus:border-amber-500"
              />
              <Button
                variant="outline"
                onClick={handleRollbackBatch}
                disabled={isRollingBack || !rollbackBatchId.trim()}
                startIcon={<RotateCcw className={`w-4 h-4 ${isRollingBack ? 'animate-spin' : ''}`} />}
              >
                {isRollingBack ? (isAr ? 'جاري التراجع...' : 'Rolling back...') : isAr ? 'تنفيذ التراجع' : 'Rollback Batch'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD CUSTOMER */}
      {/* ========================================================= */}
      <Modal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        title={isAr ? 'إضافة عميل جديد وإنشاء الحساب الفرعي' : 'New Customer & Auto Subaccount'}
        size="lg"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center justify-between">
            <span>
              {isAr
                ? 'سيتم توليد الحساب الفرعي بدفتر الأستاذ العام تلقائياً تحت الحساب الرئيسي 10201 (المدينون التجاريون).'
                : 'GL subaccount will be created automatically under 10201 (Accounts Receivable).'}
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'كود العميل (اختياري)' : 'Customer Code'}</label>
              <input
                type="text"
                placeholder="Auto (e.g. CUST-0004)"
                value={customerForm.code}
                onChange={(e) => setCustomerForm({ ...customerForm, code: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'نوع المنشأة' : 'Legal Type'}</label>
              <select
                value={customerForm.type}
                onChange={(e) => setCustomerForm({ ...customerForm, type: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500"
              >
                <option value="ESTABLISHMENT">{isAr ? 'مؤسسة فردية (ESTABLISHMENT)' : 'Establishment'}</option>
                <option value="COMPANY">{isAr ? 'شركة تجارية (COMPANY)' : 'Company'}</option>
                <option value="INDIVIDUAL">{isAr ? 'فرد (INDIVIDUAL)' : 'Individual'}</option>
                <option value="GOVERNMENT">{isAr ? 'جهة حكومية (GOVERNMENT)' : 'Government'}</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'الاسم القانوني بالعربية *' : 'Legal Name (Arabic) *'}
              </label>
              <input
                type="text"
                required
                placeholder="مثال: شركة التوريدات السعودية المحدودة"
                value={customerForm.nameAr}
                onChange={(e) => setCustomerForm({ ...customerForm, nameAr: e.target.value })}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-hidden ${
                  customerFormErrors.nameAr ? 'border-red-500' : 'border-slate-200 focus:border-emerald-500'
                }`}
              />
              {customerFormErrors.nameAr && <p className="text-xs text-red-600 mt-1">{customerFormErrors.nameAr}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'الاسم بالإنجليزية' : 'Legal Name (English)'}</label>
              <input
                type="text"
                placeholder="e.g. Saudi Supply Co. Ltd."
                value={customerForm.nameEn}
                onChange={(e) => setCustomerForm({ ...customerForm, nameEn: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'رقم الجوال *' : 'Mobile Number *'}</label>
              <input
                type="text"
                required
                placeholder="05XXXXXXXX"
                value={customerForm.mobile}
                onChange={(e) => setCustomerForm({ ...customerForm, mobile: e.target.value })}
                className={`w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-hidden ${
                  customerFormErrors.mobile ? 'border-red-500' : 'border-slate-200 focus:border-emerald-500'
                }`}
              />
              {customerFormErrors.mobile && <p className="text-xs text-red-600 mt-1">{customerFormErrors.mobile}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
              <input
                type="email"
                placeholder="billing@company.sa"
                value={customerForm.email}
                onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'الرقم الضريبي (15 خانة)' : 'VAT Number (15 digits)'}</label>
              <input
                type="text"
                maxLength={15}
                placeholder="3XXXXXXXXXXXXX3"
                value={customerForm.vatNumber}
                onChange={(e) => setCustomerForm({ ...customerForm, vatNumber: e.target.value })}
                className={`w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-hidden ${
                  customerFormErrors.vatNumber ? 'border-red-500' : 'border-slate-200 focus:border-emerald-500'
                }`}
              />
              {customerFormErrors.vatNumber && <p className="text-xs text-red-600 mt-1">{customerFormErrors.vatNumber}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'السجل التجاري (10 أرقام)' : 'CR Number (10 digits)'}</label>
              <input
                type="text"
                maxLength={10}
                placeholder="1010XXXXXX"
                value={customerForm.crNumber}
                onChange={(e) => setCustomerForm({ ...customerForm, crNumber: e.target.value })}
                className={`w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-hidden ${
                  customerFormErrors.crNumber ? 'border-red-500' : 'border-slate-200 focus:border-emerald-500'
                }`}
              />
              {customerFormErrors.crNumber && <p className="text-xs text-red-600 mt-1">{customerFormErrors.crNumber}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'الرقم الموحد (700)' : 'Unified 700 Number'}</label>
              <input
                type="text"
                maxLength={10}
                placeholder="700XXXXXXX"
                value={customerForm.unifiedNumber}
                onChange={(e) => setCustomerForm({ ...customerForm, unifiedNumber: e.target.value })}
                className={`w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-hidden ${
                  customerFormErrors.unifiedNumber ? 'border-red-500' : 'border-slate-200 focus:border-emerald-500'
                }`}
              />
              {customerFormErrors.unifiedNumber && <p className="text-xs text-red-600 mt-1">{customerFormErrors.unifiedNumber}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'شروط السداد الائتماني' : 'Payment Terms'}</label>
              <select
                value={customerForm.paymentTerms}
                onChange={(e) => setCustomerForm({ ...customerForm, paymentTerms: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500"
              >
                <option value="IMMEDIATE">{isAr ? 'سداد فوري (نقدي)' : 'Immediate / Cash'}</option>
                <option value="NET_15">{isAr ? 'آجل 15 يوماً' : 'Net 15 Days'}</option>
                <option value="NET_30">{isAr ? 'آجل 30 يوماً' : 'Net 30 Days'}</option>
                <option value="NET_60">{isAr ? 'آجل 60 يوماً' : 'Net 60 Days'}</option>
                <option value="NET_90">{isAr ? 'آجل 90 يوماً' : 'Net 90 Days'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'سقف الائتمان (SAR)' : 'Credit Limit (SAR)'}</label>
              <input
                type="number"
                step="1000"
                value={customerForm.creditLimit}
                onChange={(e) => setCustomerForm({ ...customerForm, creditLimit: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'المدينة (العنوان الوطني)' : 'City'}</label>
              <input
                type="text"
                value={customerForm.city}
                onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customerForm.cashOnly}
                  onChange={(e) => setCustomerForm({ ...customerForm, cashOnly: e.target.checked })}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>{isAr ? 'تقييد بالمبيعات النقدية فقط (ممنوع الآجل)' : 'Cash Only (Block Credit Sales)'}</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customerForm.creditHold}
                  onChange={(e) => setCustomerForm({ ...customerForm, creditHold: e.target.checked })}
                  className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span>{isAr ? 'حظر ائتماني فوري (Credit Hold)' : 'Activate Credit Hold'}</span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" type="button" onClick={() => setIsCustomerModalOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit">
              {isAr ? 'حفظ العميل وإنشاء الحساب' : 'Save Customer & Subaccount'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: ADD SUPPLIER */}
      {/* ========================================================= */}
      <Modal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        title={isAr ? 'إضافة مورد جديد وإنشاء الحساب الفرعي' : 'New Supplier & Auto Subaccount'}
        size="lg"
      >
        <form onSubmit={handleCreateSupplier} className="space-y-4">
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-center justify-between">
            <span>
              {isAr
                ? 'سيتم توليد الحساب الفرعي بدفتر الأستاذ العام تلقائياً تحت الحساب الرئيسي 20101 (الدائنون التجاريون).'
                : 'GL subaccount will be created automatically under 20101 (Accounts Payable).'}
            </span>
            <Building2 className="w-4 h-4 text-blue-700" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'كود المورد (اختياري)' : 'Supplier Code'}</label>
              <input
                type="text"
                placeholder="Auto (e.g. SUPP-0004)"
                value={supplierForm.code}
                onChange={(e) => setSupplierForm({ ...supplierForm, code: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'تصنيف المورد' : 'Supplier Classification'}</label>
              <select
                value={supplierForm.supplierClassification}
                onChange={(e) => setSupplierForm({ ...supplierForm, supplierClassification: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
              >
                <option value="LOCAL">{isAr ? 'مورد محلي (LOCAL)' : 'Local'}</option>
                <option value="INTERNATIONAL">{isAr ? 'مورد دولي / استيراد (INTERNATIONAL)' : 'International'}</option>
                <option value="NON_VAT">{isAr ? 'مورد غير مسجل بالضريبة (NON_VAT)' : 'Non-VAT'}</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'الاسم القانوني بالعربية *' : 'Legal Name (Arabic) *'}
              </label>
              <input
                type="text"
                required
                placeholder="مثال: شركة الصناعات البتروكيماوية المتحدة"
                value={supplierForm.nameAr}
                onChange={(e) => setSupplierForm({ ...supplierForm, nameAr: e.target.value })}
                className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-hidden ${
                  supplierFormErrors.nameAr ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'
                }`}
              />
              {supplierFormErrors.nameAr && <p className="text-xs text-red-600 mt-1">{supplierFormErrors.nameAr}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'الاسم بالإنجليزية' : 'Legal Name (English)'}</label>
              <input
                type="text"
                placeholder="e.g. United Petrochemical Industries Co."
                value={supplierForm.nameEn}
                onChange={(e) => setSupplierForm({ ...supplierForm, nameEn: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'رقم الجوال *' : 'Mobile Number *'}</label>
              <input
                type="text"
                required
                placeholder="05XXXXXXXX"
                value={supplierForm.mobile}
                onChange={(e) => setSupplierForm({ ...supplierForm, mobile: e.target.value })}
                className={`w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-hidden ${
                  supplierFormErrors.mobile ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'
                }`}
              />
              {supplierFormErrors.mobile && <p className="text-xs text-red-600 mt-1">{supplierFormErrors.mobile}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
              <input
                type="email"
                placeholder="orders@vendor.sa"
                value={supplierForm.email}
                onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'الرقم الضريبي (15 خانة)' : 'VAT Number (15 digits)'}</label>
              <input
                type="text"
                maxLength={15}
                placeholder="3XXXXXXXXXXXXX3"
                value={supplierForm.vatNumber}
                onChange={(e) => setSupplierForm({ ...supplierForm, vatNumber: e.target.value })}
                className={`w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-hidden ${
                  supplierFormErrors.vatNumber ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'
                }`}
              />
              {supplierFormErrors.vatNumber && <p className="text-xs text-red-600 mt-1">{supplierFormErrors.vatNumber}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'السجل التجاري (10 أرقام)' : 'CR Number (10 digits)'}</label>
              <input
                type="text"
                maxLength={10}
                placeholder="1010XXXXXX"
                value={supplierForm.crNumber}
                onChange={(e) => setSupplierForm({ ...supplierForm, crNumber: e.target.value })}
                className={`w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-hidden ${
                  supplierFormErrors.crNumber ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'
                }`}
              />
              {supplierFormErrors.crNumber && <p className="text-xs text-red-600 mt-1">{supplierFormErrors.crNumber}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'اسم البنك' : 'Bank Name'}</label>
              <input
                type="text"
                placeholder="مصرف الراجحي / البنك الأهلي..."
                value={supplierForm.bankName}
                onChange={(e) => setSupplierForm({ ...supplierForm, bankName: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'الآيبان البنكي (SA + 22 رقم)' : 'Saudi IBAN (SA + 22 digits)'}</label>
              <input
                type="text"
                maxLength={24}
                placeholder="SA0000000000000000000000"
                value={supplierForm.bankIban}
                onChange={(e) => setSupplierForm({ ...supplierForm, bankIban: e.target.value.toUpperCase() })}
                className={`w-full px-3 py-2 text-sm font-mono border rounded-lg focus:outline-hidden ${
                  supplierFormErrors.bankIban ? 'border-red-500' : 'border-slate-200 focus:border-blue-500'
                }`}
              />
              {supplierFormErrors.bankIban && <p className="text-xs text-red-600 mt-1">{supplierFormErrors.bankIban}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'شروط السداد المعتمدة' : 'Payment Terms'}</label>
              <select
                value={supplierForm.paymentTerms}
                onChange={(e) => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
              >
                <option value="NET_30">{isAr ? 'آجل 30 يوماً' : 'Net 30 Days'}</option>
                <option value="NET_60">{isAr ? 'آجل 60 يوماً' : 'Net 60 Days'}</option>
                <option value="NET_90">{isAr ? 'آجل 90 يوماً' : 'Net 90 Days'}</option>
                <option value="IMMEDIATE">{isAr ? 'سداد فوري عند الاستلام' : 'Immediate upon delivery'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'مجموعة المورد' : 'Supplier Group'}</label>
              <select
                value={supplierForm.supplierGroup}
                onChange={(e) => setSupplierForm({ ...supplierForm, supplierGroup: e.target.value as any })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
              >
                <option value="RAW_MATERIALS">{isAr ? 'مواد أولية' : 'Raw Materials'}</option>
                <option value="COMMODITIES">{isAr ? 'بضائع جاهزة' : 'Commodities'}</option>
                <option value="SERVICES">{isAr ? 'خدمات' : 'Services'}</option>
                <option value="LOGISTICS">{isAr ? 'لوجستيات وشحن' : 'Logistics'}</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" type="button" onClick={() => setIsSupplierModalOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button variant="primary" type="submit">
              {isAr ? 'حفظ المورد وإنشاء الحساب' : 'Save Supplier & Subaccount'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: CHANGE STATUS */}
      {/* ========================================================= */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title={isAr ? 'تحديث حالة الطرف في النظام' : 'Update Party Status'}
        size="sm"
      >
        {partyToStatusUpdate && (
          <div className="space-y-4">
            <div className="text-sm text-slate-700">
              <span className="font-semibold">{partyToStatusUpdate.name}</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">{isAr ? 'الحالة الجديدة' : 'New Status'}</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as PartyStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500"
              >
                <option value="ACTIVE">{isAr ? 'نشط (ACTIVE)' : 'Active'}</option>
                <option value="SUSPENDED">{isAr ? 'موقوف (SUSPENDED)' : 'Suspended'}</option>
                <option value="ARCHIVED">{isAr ? 'مؤرشف (ARCHIVED)' : 'Archived'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'سبب التغيير (يدرج بسجل التدقيق غير القابل للتعديل)' : 'Reason (Recorded in immutable audit trail)'}
              </label>
              <textarea
                rows={3}
                placeholder={isAr ? 'أدخل مبرر التغيير أو مذكرة المراجعة...' : 'Enter change justification or review note...'}
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setIsStatusModalOpen(false)}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button variant="primary" size="sm" onClick={handleUpdateStatus}>
                {isAr ? 'تأكيد التحديث والتسجيل بالتدقيق' : 'Confirm & Audit Log'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: CREDIT SIMULATOR / CHECK (For Customer) */}
      {/* ========================================================= */}
      <Modal
        isOpen={isCreditCheckModalOpen}
        onClose={() => setIsCreditCheckModalOpen(false)}
        title={isAr ? 'محاكي فحص الائتمان الصارم للعميل' : 'Strict Credit Limit Simulator'}
        size="md"
      >
        {creditTestCustomer && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'العميل:' : 'Customer:'}</span>
                <span className="font-bold text-slate-800">{creditTestCustomer.nameAr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'الرصيد الحالي بدفتر الأستاذ:' : 'Current Ledger Balance:'}</span>
                <span className="font-mono font-bold text-slate-800">{creditTestCustomer.ledgerBalanceSar.toLocaleString()} SAR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'سقف الائتمان المحدد:' : 'Assigned Credit Limit:'}</span>
                <span className="font-mono font-bold text-slate-800">
                  {creditTestCustomer.creditLimit ? `${creditTestCustomer.creditLimit.toLocaleString()} SAR` : isAr ? 'غير محدد' : 'Unlimited'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'قيمة الفاتورة المقترحة للبيع (SAR)' : 'Proposed Invoice Amount (SAR)'}
              </label>
              <input
                type="number"
                value={proposedSaleAmount}
                onChange={(e) => setProposedSaleAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={runCreditCheck}
              disabled={isCreditChecking}
              startIcon={<CreditCard className="w-4 h-4" />}
            >
              {isCreditChecking ? (isAr ? 'جاري الفحص...' : 'Evaluating...') : isAr ? 'فحص ومطابقة الائتمان' : 'Evaluate Credit'}
            </Button>

            {creditCheckResult && (
              <div
                className={`p-4 rounded-xl border ${
                  creditCheckResult.allowed ? 'bg-emerald-50/80 border-emerald-200' : 'bg-red-50/80 border-red-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {creditCheckResult.allowed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  )}
                  <span className="font-bold text-sm text-slate-900">
                    {creditCheckResult.allowed
                      ? isAr
                        ? 'الائتمان متاح ومسموح بالبيع الآجل'
                        : 'Credit Approved for Sale'
                      : isAr
                      ? 'البيع الآجل مرفوض ومحظور'
                      : 'Credit Sale Rejected'}
                  </span>
                </div>

                <div className="text-xs space-y-1 font-mono text-slate-700">
                  <div>
                    {isAr ? 'الحالة الائتمانية:' : 'Credit Status:'} <span className="font-bold">{creditCheckResult.status}</span>
                  </div>
                  <div>
                    {isAr ? 'الرصيد الجديد المتوقع:' : 'Projected New Balance:'}{' '}
                    <span className="font-bold">{creditCheckResult.newBalanceSar.toLocaleString()} SAR</span>
                  </div>
                  {creditCheckResult.exceededBySar && (
                    <div className="text-red-700 font-bold">
                      {isAr ? 'قيمة التجاوز عن السقف:' : 'Exceeded Amount:'} {creditCheckResult.exceededBySar.toLocaleString()} SAR
                    </div>
                  )}
                  {creditCheckResult.reasonAr && <div className="text-red-700 mt-1 font-sans">{creditCheckResult.reasonAr}</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: PURCHASE CHECK (For Supplier) */}
      {/* ========================================================= */}
      <Modal
        isOpen={isPurchaseCheckModalOpen}
        onClose={() => setIsPurchaseCheckModalOpen(false)}
        title={isAr ? 'فحص أهلية الشراء من المورد' : 'Supplier Purchase Eligibility Check'}
        size="md"
      >
        {purchaseTestSupplier && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'المورد:' : 'Supplier:'}</span>
                <span className="font-bold text-slate-800">{purchaseTestSupplier.nameAr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'الحالة الحالية:' : 'Current Status:'}</span>
                <span className="font-bold text-slate-800">{purchaseTestSupplier.status}</span>
              </div>
            </div>

            {purchaseTestSupplier.status === 'SUSPENDED' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>{isAr ? 'المورد موقوف! يتطلب إذن استثناء مصرح' : 'Supplier is Suspended! Requires Override'}</span>
                </div>
                <p>
                  {isAr
                    ? 'وفق قواعد النظام، يُمنع إصدار أوامر شراء لمورد موقوف إلا بتصريح من المدير المالي أو المالك، مع تدوين مبرر الاستثناء بسجل التدقيق.'
                    : 'Purchases from suspended suppliers are blocked unless an authorized managerial override is provided.'}
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-1">
                    {isAr ? 'مبرر الاستثناء الإداري (للتسجيل بالتدقيق)' : 'Managerial Override Reason'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? 'مثال: موافقة استثنائية لتوريد شحنة مواد خام عاجلة' : 'e.g. Urgent raw materials authorized shipment'}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded bg-white"
                  />
                </div>
              </div>
            )}

            <Button variant="primary" size="sm" onClick={runPurchaseCheck} startIcon={<FileCheck className="w-4 h-4" />}>
              {isAr ? 'فحص إمكانية إصدار أمر الشراء' : 'Verify Purchase Eligibility'}
            </Button>

            {purchaseCheckResult && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  purchaseCheckResult.allowed ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <div className="font-bold">{purchaseCheckResult.allowed ? (isAr ? 'مسموح بالشراء' : 'Purchase Allowed') : isAr ? 'محظور من الشراء' : 'Purchase Blocked'}</div>
                {purchaseCheckResult.reason && <div className="mt-1">{purchaseCheckResult.reason}</div>}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ========================================================= */}
      {/* MODAL: LEDGER STATEMENT (For Customer or Supplier) */}
      {/* ========================================================= */}
      <Modal
        isOpen={!!selectedCustomer || !!selectedSupplier}
        onClose={() => {
          setSelectedCustomer(null);
          setSelectedSupplier(null);
          setLedgerStatement([]);
        }}
        title={
          selectedCustomer
            ? isAr
              ? `كشف حساب دفتر الأستاذ للعميل: ${selectedCustomer.nameAr}`
              : `Ledger Statement: ${selectedCustomer.nameAr}`
            : selectedSupplier
            ? isAr
              ? `كشف حساب دفتر الأستاذ للمورد: ${selectedSupplier.nameAr}`
              : `Ledger Statement: ${selectedSupplier.nameAr}`
            : ''
        }
        size="xl"
      >
        <div className="space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg text-xs flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-slate-500">{isAr ? 'الحساب الفرعي:' : 'Subaccount:'} </span>
                <span className="font-mono font-bold text-slate-800">
                  {selectedCustomer ? selectedCustomer.subaccountCode : selectedSupplier?.subaccountCode}
                </span>
              </div>
              <div>
                <span className="text-slate-500">{isAr ? 'الحساب الرئيسي:' : 'Control Account:'} </span>
                <span className="font-mono font-bold text-slate-800">{selectedCustomer ? '10201' : '20101'}</span>
              </div>
            </div>
            <div>
              <span className="text-slate-500">{isAr ? 'الرصيد الدفتري الحالي:' : 'Current Balance:'} </span>
              <span className="font-mono font-bold text-emerald-700 text-sm">
                {(selectedCustomer ? selectedCustomer.ledgerBalanceSar : selectedSupplier?.ledgerBalanceSar || 0).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                SAR
              </span>
            </div>
          </div>

          {isStatementLoading ? (
            <div className="py-8 text-center text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
              <span>{isAr ? 'جاري استخراج القيود المرحلة من دفتر الأستاذ...' : 'Extracting posted journal entries...'}</span>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-start text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'المرجع / القيد' : 'Ref / Entry'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'نوع المستند' : 'Doc Type'}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? 'البيان' : 'Description'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'مدين (SAR)' : 'Debit'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'دائن (SAR)' : 'Credit'}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? 'الرصيد التراكمي' : 'Running Balance'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {ledgerStatement.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400 font-sans">
                          {isAr ? 'لا توجد حركات مرحلة سابقة على هذا الحساب' : 'No posted transactions on this subaccount yet'}
                        </td>
                      </tr>
                    ) : (
                      ledgerStatement.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-600">{line.date}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800">{line.entryNumber}</td>
                          <td className="py-2 px-3 font-sans text-slate-600">{line.documentType}</td>
                          <td className="py-2 px-3 font-sans text-slate-700">{line.description}</td>
                          <td className="py-2 px-3 text-end text-emerald-700 font-semibold">
                            {line.debitSar > 0 ? line.debitSar.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                          <td className="py-2 px-3 text-end text-blue-700 font-semibold">
                            {line.creditSar > 0 ? line.creditSar.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                          <td className="py-2 px-3 text-end font-bold text-slate-900">
                            {line.runningBalanceSar.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCustomer(null);
                setSelectedSupplier(null);
              }}
            >
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
