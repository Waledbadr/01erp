import React, { useState } from 'react';
import { useI18n } from '../../i18n/context.js';
import { PageHeader } from '../ui/PageHeader.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Select } from '../ui/Select.js';
import { DatePicker } from '../ui/DatePicker.js';
import { Badge } from '../ui/Badge.js';
import { Tabs } from '../ui/Tabs.js';
import { Table, Column } from '../ui/Table.js';
import { Modal } from '../ui/Modal.js';
import { Drawer } from '../ui/Drawer.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { useToast } from '../ui/Toast.js';
import { FilterBar } from '../ui/FilterBar.js';
import { EmptyState } from '../ui/EmptyState.js';
import { TableSkeleton } from '../ui/LoadingSkeleton.js';
import {
  FileText,
  Mail,
  Lock,
  Search,
  CheckCircle,
  AlertOctagon,
  Shield,
  Layers,
} from 'lucide-react';

interface SampleAccountRow {
  code: string;
  name: string;
  type: string;
  balance: number;
  status: 'POSTED' | 'DRAFT' | 'REVERSED';
}

export const DesignSystemView: React.FC = () => {
  const { t, formatCurrency } = useI18n();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('components');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedRole, setSelectedRole] = useState('ACCOUNTANT');

  const sampleAccounts: SampleAccountRow[] = [
    { code: '10101', name: 'الصندوق الرئيسي (Main Vault)', type: 'ASSET', balance: 145200.5, status: 'POSTED' },
    { code: '10102', name: 'الحساب الجاري البنكي (Bank Account)', type: 'ASSET', balance: 890450.0, status: 'POSTED' },
    { code: '10201', name: 'العملاء التجاريين (Accounts Receivable)', type: 'ASSET', balance: 64200.0, status: 'DRAFT' },
    { code: '20301', name: 'ضريبة المخرجات المستحقة (VAT 15%)', type: 'LIABILITY', balance: 35120.75, status: 'POSTED' },
    { code: '40101', name: 'إيرادات المبيعات (Sales Revenue)', type: 'REVENUE', balance: 520000.0, status: 'POSTED' },
    { code: '50101', name: 'تكلفة البضاعة المباعة (COGS)', type: 'EXPENSE', balance: 310000.0, status: 'REVERSED' },
  ];

  const columns: Column<SampleAccountRow>[] = [
    { key: 'code', header: 'رمز الحساب', align: 'start' },
    { key: 'name', header: 'اسم الحساب المعتمد', align: 'start' },
    {
      key: 'type',
      header: 'النوع',
      render: (item) => <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100">{item.type}</span>,
    },
    {
      key: 'balance',
      header: 'الرصيد المالي',
      align: 'end',
      render: (item) => <span className="font-mono font-bold text-slate-900">{formatCurrency(item.balance)}</span>,
    },
    {
      key: 'status',
      header: 'الحالة',
      align: 'center',
      render: (item) => (
        <Badge
          variant={item.status === 'POSTED' ? 'success' : item.status === 'DRAFT' ? 'warning' : 'danger'}
        >
          {item.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t.designSystemShowcase.title}
        subtitle={t.designSystemShowcase.subtitle}
        badge={<Badge variant="brand">WCAG AA Certified</Badge>}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => toast.success('نظام التصميم نشط ومطابق لكافة الشروط!')}
            startIcon={<CheckCircle className="w-4 h-4" />}
          >
            فحص توافق النظام
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'components', label: 'المكونات الأساسية (Core UI)', badge: '14' },
          { id: 'table', label: 'الجدول التفاعلي والبطاقات الذكية', badge: 'Active' },
          { id: 'dialogs', label: 'النوافذ المنبثقة والإشعارات', badge: 'Interactive' },
        ]}
      />

      {/* TAB 1: Core Components */}
      {activeTab === 'components' && (
        <div className="space-y-8">
          {/* Buttons Section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-4">{t.designSystemShowcase.buttonsSection}</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary (الأساسي)</Button>
              <Button variant="secondary">Secondary (الثانوي)</Button>
              <Button variant="outline">Outline (محدد)</Button>
              <Button variant="danger">Danger (تحذيري/حذف)</Button>
              <Button variant="ghost">Ghost (شفاف)</Button>
              <Button variant="primary" isLoading>Loading...</Button>
              <Button variant="primary" size="sm">Small</Button>
              <Button variant="primary" size="lg">Large</Button>
            </div>
          </div>

          {/* Inputs Section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-4">{t.designSystemShowcase.inputsSection}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="البريد الإلكتروني المهني"
                placeholder="name@company.com.sa"
                startIcon={<Mail className="w-4 h-4" />}
                helperText="يستخدم لتسجيل الدخول وإشعارات زاتكا"
              />
              <Input
                label="كلمة المرور المشفرة"
                type="password"
                placeholder="••••••••"
                startIcon={<Lock className="w-4 h-4" />}
                error="كلمة المرور يجب ألا تقل عن 8 خانات"
              />
              <Select
                label="الصلاحية المخصصة (RBAC)"
                options={[
                  { value: 'OWNER', label: 'مالك المنشأة (Owner)' },
                  { value: 'CHIEF_ACCOUNTANT', label: 'رئيس الحسابات (Chief Accountant)' },
                  { value: 'ACCOUNTANT', label: 'محاسب عام (Accountant)' },
                  { value: 'SALES_MGR', label: 'مدير المبيعات (Sales Manager)' },
                  { value: 'CASHIER', label: 'أمين الصندوق (Cashier)' },
                  { value: 'WAREHOUSE_MGR', label: 'مدير المستودع (Warehouse Manager)' },
                  { value: 'AUDITOR', label: 'مراجع خارجي (Auditor)' },
                ]}
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              />
              <DatePicker
                label="تاريخ القيد المالي"
                defaultValue="2026-09-17"
                helperText="تاريخ تطبيق المعاملة على دفتر الأستاذ"
              />
            </div>
          </div>

          {/* Badges Section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-4">{t.designSystemShowcase.badgesSection}</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="success">POSTED (مرحل)</Badge>
              <Badge variant="warning">DRAFT (مسودة)</Badge>
              <Badge variant="danger">REVERSED (معكوس)</Badge>
              <Badge variant="info">CLEARED (معتمد من زاتكا)</Badge>
              <Badge variant="default">PENDING (قيد المعالجة)</Badge>
              <Badge variant="brand">ZATCA PHASE 2</Badge>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Table & Mobile Cards */}
      {activeTab === 'table' && (
        <div className="space-y-6">
          <FilterBar
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder="بحث في شجرة الحسابات..."
            showClear={searchValue.length > 0}
            onClear={() => setSearchValue('')}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">{t.designSystemShowcase.tableSection}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  على الشاشات الكبيرة يظهر جدول منتظم، وعلى شاشات الجوال يتحول تلقائياً لبطاقات متناسقة بدون أي تشوه أفقي
                </p>
              </div>
              <Badge variant="brand">Responsive Cards</Badge>
            </div>

            <Table
              columns={columns}
              data={sampleAccounts.filter((a) => a.name.includes(searchValue) || a.code.includes(searchValue))}
              keyExtractor={(item) => item.code}
              actions={(item) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info(`تم اختيار الحساب: ${item.code} - ${item.name}`)}
                >
                  كشف الحساب
                </Button>
              )}
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <h4 className="text-sm font-bold text-slate-800">هيكل التحميل الافتراضي (Skeleton Loading State)</h4>
            <TableSkeleton rows={3} />
          </div>
        </div>
      )}

      {/* TAB 3: Modals, Drawers & Notifications */}
      {activeTab === 'dialogs' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <h3 className="text-base font-bold text-slate-900">{t.designSystemShowcase.dialogsSection}</h3>
          <p className="text-xs text-slate-500">
            مكونات التفاعل المدعمة بمعايير إمكانية الوصول والتنقل بلوحة المفاتيح
          </p>

          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              {t.designSystemShowcase.openModal}
            </Button>
            <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
              {t.designSystemShowcase.openDrawer}
            </Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              {t.designSystemShowcase.openConfirm}
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.success('تم ترحيل القيد بنجاح إلى دفتر الأستاذ العام.')}
            >
              {t.designSystemShowcase.showSuccessToast}
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.error('خطأ: مجموع المدين لا يساوي مجموع الدائن.')}
            >
              {t.designSystemShowcase.showErrorToast}
            </Button>
          </div>

          {/* Interactive Modal */}
          <Modal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            title="نافذة إدخال قيد محاسبي تجريبي"
            subtitle="نموذج تحقق مالي متقدم"
            footer={
              <>
                <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
                  إغلاق
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setModalOpen(false);
                    toast.success('تمت المعالجة بنجاح!');
                  }}
                >
                  حفظ وتأكيد
                </Button>
              </>
            }
          >
            <div className="space-y-4">
              <Input label="رقم السند" defaultValue="JV-2026-0001" disabled />
              <Input label="شرح القيد بالعربية" defaultValue="إثبات مبيعات نقدية يومية" />
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900">
                قيد متزن: إجمالي المدين (1,150.00 ر.س) = إجمالي الدائن (1,150.00 ر.س).
              </div>
            </div>
          </Modal>

          {/* Interactive Drawer */}
          <Drawer
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            title="مرشحات التدقيق والتصفية المتقدمة"
            subtitle="الدرج الجانبي للتقارير والبحث المتخصص"
            footer={
              <Button variant="primary" size="sm" onClick={() => setDrawerOpen(false)}>
                تطبيق التصفية
              </Button>
            }
          >
            <div className="space-y-4">
              <Input label="من تاريخ" type="date" defaultValue="2026-09-01" />
              <Input label="إلى تاريخ" type="date" defaultValue="2026-09-30" />
              <Select
                label="نوع المستند"
                options={[
                  { value: 'ALL', label: 'جميع المستندات' },
                  { value: 'STD_INV', label: 'فاتورة ضريبية قياسية (B2B)' },
                  { value: 'SMP_INV', label: 'فاتورة ضريبية مبسطة (B2C)' },
                  { value: 'CR_NOTE', label: 'إشعار دائن (مرتجع)' },
                ]}
              />
            </div>
          </Drawer>

          {/* Interactive Confirm Dialog */}
          <ConfirmDialog
            isOpen={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => {
              setConfirmOpen(false);
              toast.error('تم عكس القيد المحاسبي وإنشاء سند التسوية المعاكس بنجاح.');
            }}
            title="تأكيد عكس القيد المحاسبي (Reversal Entry)"
            message="وفقاً للقاعدة G2: القيود المحاسبية غير قابلة للحذف أو التعديل المباشر. تأكيدك لهذه العملية سينشئ قيداً عكسياً مساوياً في القيمة ومعاكساً في الاتجاه ومربوطاً بالقيد الأصلي."
            confirmLabel="تأكيد العكس المحاسبي"
            cancelLabel="تراجع"
            variant="danger"
          />
        </div>
      )}
    </div>
  );
};
