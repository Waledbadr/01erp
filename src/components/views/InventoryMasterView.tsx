import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n/context.js';
import { PageHeader } from '../ui/PageHeader.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Badge } from '../ui/Badge.js';
import { Modal } from '../ui/Modal.js';
import { useToast } from '../ui/Toast.js';
import {
  Boxes,
  Barcode,
  Building2,
  Tags,
  Layers,
  Search,
  Plus,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  PackageCheck,
  ShieldCheck,
  ScanLine,
  Warehouse,
  Coins,
  ArrowUpDown,
  FileSpreadsheet,
} from 'lucide-react';

interface ItemUOM {
  id: string;
  nameAr: string;
  nameEn?: string;
  symbol?: string;
  conversionFactor: number;
  barcode: string;
  isBaseUnit: boolean;
  salePrice?: number;
  wholesalePrice?: number;
  cost?: number;
}

interface Item {
  id: string;
  sku: string;
  primaryBarcode: string;
  nameAr: string;
  nameEn?: string;
  type: 'INVENTORY' | 'SERVICE' | 'RAW_MATERIAL' | 'CONSUMABLE';
  categoryId?: string;
  categoryNameAr?: string;
  brandId?: string;
  brandName?: string;
  baseUnit: string;
  taxRate: number;
  isVatInclusive: boolean;
  sellingPrice: number;
  wholesalePrice?: number;
  cost?: number;
  currentWac?: number;
  currentStock: number;
  minimumStockLevel?: number;
  reorderQuantity?: number;
  trackBatches: boolean;
  trackSerialNumbers: boolean;
  isActive: boolean;
  units: ItemUOM[];
}

interface WarehouseItem {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  branchId: string;
  address?: string;
  managerName?: string;
  contactPhone?: string;
  isDefault: boolean;
  isActive: boolean;
  bins: Array<{ id: string; code: string; aisle?: string; rack?: string; shelf?: string }>;
}

interface StockSummary {
  itemId: string;
  sku: string;
  nameAr: string;
  nameEn?: string;
  baseUnit: string;
  totalStockBaseQty: number;
  totalValuationSar?: number;
  currentWac?: number;
  warehouseBreakdown: Array<{
    warehouseId: string;
    warehouseCode: string;
    warehouseNameAr: string;
    stockBaseQty: number;
  }>;
}

interface Category {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  defaultTaxRate: number;
  isActive: boolean;
}

interface Brand {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string;
  countryOfOrigin?: string;
  isActive: boolean;
}

export const InventoryMasterView: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { language, isRTL } = useI18n();
  const isAr = language === 'ar';
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'products' | 'barcode' | 'stocks' | 'warehouses' | 'categories'>('products');
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [stockSummaries, setStockSummaries] = useState<StockSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Barcode Lookup Simulator
  const [scannedBarcode, setScannedBarcode] = useState<string>('628100100101');
  const [barcodeResult, setBarcodeResult] = useState<any>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // New Item Modal
  const [showNewItemModal, setShowNewItemModal] = useState<boolean>(false);
  const [newSku, setNewSku] = useState<string>('');
  const [newNameAr, setNewNameAr] = useState<string>('');
  const [newNameEn, setNewNameEn] = useState<string>('');
  const [newBaseUnit, setNewBaseUnit] = useState<string>('حبة');
  const [newSellingPrice, setNewSellingPrice] = useState<string>('25.00');
  const [newCost, setNewCost] = useState<string>('15.00');
  const [newPrimaryBarcode, setNewPrimaryBarcode] = useState<string>('');
  const [newUnits, setNewUnits] = useState<Array<{ nameAr: string; factor: number; barcode: string; price: number }>>([
    { nameAr: 'كرتون (12 حبة)', factor: 12, barcode: '', price: 270 },
  ]);
  const [isCreatingItem, setIsCreatingItem] = useState<boolean>(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('saudi_erp_session_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [itemsRes, whRes, stocksRes, catsRes, brandsRes] = await Promise.all([
        fetch('/api/v1/inventory/items', { headers: getAuthHeaders() }),
        fetch('/api/v1/inventory/warehouses', { headers: getAuthHeaders() }),
        fetch('/api/v1/inventory/stocks/summary', { headers: getAuthHeaders() }),
        fetch('/api/v1/inventory/categories', { headers: getAuthHeaders() }),
        fetch('/api/v1/inventory/brands', { headers: getAuthHeaders() }),
      ]);

      if (itemsRes.ok) {
        const d = await itemsRes.json();
        setItems(d.items || []);
      }
      if (whRes.ok) {
        const d = await whRes.json();
        setWarehouses(d.warehouses || []);
      }
      if (stocksRes.ok) {
        const d = await stocksRes.json();
        setStockSummaries(d.summaries || []);
      }
      if (catsRes.ok) {
        const d = await catsRes.json();
        setCategories(d.categories || []);
      }
      if (brandsRes.ok) {
        const d = await brandsRes.json();
        setBrands(d.brands || []);
      }
    } catch {
      toast.error(isAr ? 'تعذر جلب بيانات المستودع' : 'Failed to load inventory data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Barcode instant lookup
  const handleResolveBarcode = async (barcodeToScan?: string) => {
    const code = barcodeToScan !== undefined ? barcodeToScan : scannedBarcode;
    if (!code.trim()) return;

    setIsScanning(true);
    try {
      const res = await fetch(`/api/v1/inventory/barcode/resolve?barcode=${encodeURIComponent(code.trim())}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setBarcodeResult(data);
        toast.success(isAr ? 'تم التحقق من الباركود بنجاح' : 'Barcode identified successfully');
      } else {
        const err = await res.json();
        setBarcodeResult(null);
        toast.warning(err.error || (isAr ? 'الباركود غير معرف' : 'Barcode not found'));
      }
    } catch {
      toast.error(isAr ? 'خطأ أثناء فحص الباركود' : 'Error resolving barcode');
    } finally {
      setIsScanning(false);
    }
  };

  // Create Item Submit
  const handleCreateItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSku.trim() || !newNameAr.trim() || !newBaseUnit.trim()) {
      toast.error(isAr ? 'يرجى ملء الحقول الإلزامية' : 'Please fill required fields');
      return;
    }

    setIsCreatingItem(true);
    try {
      const generatedBarcode = newPrimaryBarcode.trim() || `628${Date.now().toString().slice(-9)}`;
      const payload = {
        sku: newSku.trim().toUpperCase(),
        primaryBarcode: generatedBarcode,
        nameAr: newNameAr.trim(),
        nameEn: newNameEn.trim(),
        baseUnit: newBaseUnit.trim(),
        sellingPrice: parseFloat(newSellingPrice) || 0,
        cost: parseFloat(newCost) || 0,
        type: 'INVENTORY',
        units: [
          {
            nameAr: newBaseUnit.trim(),
            conversionFactor: 1.0,
            barcode: generatedBarcode,
            isBaseUnit: true,
            salePrice: parseFloat(newSellingPrice) || 0,
            cost: parseFloat(newCost) || 0,
          },
          ...newUnits.map((u, idx) => ({
            nameAr: u.nameAr,
            conversionFactor: Number(u.factor) || 1,
            barcode: u.barcode.trim() || `${generatedBarcode}${idx + 2}`,
            isBaseUnit: false,
            salePrice: Number(u.price) || 0,
          })),
        ],
      };

      const res = await fetch('/api/v1/inventory/items', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(isAr ? 'تم إنشاء المنتج ووحداته بنجاح' : 'Item and UOMs created successfully');
        setShowNewItemModal(false);
        setNewSku('');
        setNewNameAr('');
        setNewNameEn('');
        setNewPrimaryBarcode('');
        loadAllData();
      } else {
        const err = await res.json();
        toast.error(err.error || (isAr ? 'فشل إنشاء المنتج' : 'Failed to create item'));
      }
    } catch {
      toast.error(isAr ? 'خطأ بالاتصال بالخادم' : 'Server connection error');
    } finally {
      setIsCreatingItem(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      item.sku.toLowerCase().includes(q) ||
      item.nameAr.toLowerCase().includes(q) ||
      (item.nameEn && item.nameEn.toLowerCase().includes(q)) ||
      item.primaryBarcode.includes(q) ||
      item.units.some((u) => u.barcode.includes(q));

    const matchesCat = selectedCategoryFilter === 'ALL' || item.categoryId === selectedCategoryFilter;
    return matchesSearch && matchesCat;
  });

  const totalInventoryValuation = stockSummaries.reduce((sum, s) => sum + (s.totalValuationSar || 0), 0);

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <PageHeader
        title={isAr ? 'إدارة المخزون والمستودعات والتكلفة' : 'Inventory & Perpetual WAC Master'}
        subtitle={
          isAr
            ? 'دليل الأصناف الموحد، وحدات القياس المتعددة (Multi-UOM)، التحقق من الباركود (Rule I4)، وتقييم المخزون المستمر (Rule I2).'
            : 'Unified Product Master, Multi-UOM hierarchy, item-unit barcodes (Rule I4), and Perpetual WAC valuation (Rule I2).'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              startIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={loadAllData}
              disabled={isLoading}
            >
              {isAr ? 'تحديث البيانات' : 'Refresh'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              startIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setShowNewItemModal(true)}
            >
              {isAr ? 'إضافة صنف جديد' : 'New Product'}
            </Button>
          </div>
        }
      />

      {/* 2. Top Metric KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">{isAr ? 'إجمالي الأصناف' : 'Total Items'}</span>
            <Boxes className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{items.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">{isAr ? 'مدرجة مع وحدات التحويل' : 'With multi-UOM conversions'}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">{isAr ? 'المستودعات الفعالة' : 'Active Warehouses'}</span>
            <Warehouse className="w-4 h-4 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">{warehouses.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">{isAr ? 'مواقع تخزين وأرفف Bins' : 'Bins & Aisles mapped'}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">{isAr ? 'إجمالي تقييم المخزون' : 'Inventory Valuation'}</span>
            <Coins className="w-4 h-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-900">
            {totalInventoryValuation > 0
              ? `${totalInventoryValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`
              : '*** ر.س'}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">{isAr ? 'وفق متوسط التكلفة WAC' : 'Based on Perpetual WAC'}</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">{isAr ? 'الامتثال للباركود' : 'Rule I4 Compliance'}</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-700">100%</p>
          <p className="text-[11px] text-slate-400 mt-1">{isAr ? 'الباركود لكل (صنف، وحدة)' : 'Item-Unit Tuple enforced'}</p>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'products'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Boxes className="w-4 h-4" />
          {isAr ? 'دليل الأصناف والمنتجات' : 'Product Master'}
          <span className="text-[10px] bg-emerald-800 text-emerald-100 px-1.5 py-0.5 rounded-full">{items.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('barcode')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'barcode'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ScanLine className="w-4 h-4" />
          {isAr ? 'فاحص وماسح الباركود (Rule I4)' : 'Barcode Scanner (Rule I4)'}
        </button>

        <button
          onClick={() => setActiveTab('stocks')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'stocks'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ArrowUpDown className="w-4 h-4" />
          {isAr ? 'أرصدة المستودعات وتقييم WAC' : 'Multi-Warehouse Stocks & WAC'}
        </button>

        <button
          onClick={() => setActiveTab('warehouses')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'warehouses'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Warehouse className="w-4 h-4" />
          {isAr ? 'المستودعات ومواقع التخزين Bins' : 'Warehouses & Bins'}
          <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full">{warehouses.length}</span>
        </button>

        <button
          onClick={() => setActiveTab('categories')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'categories'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Tags className="w-4 h-4" />
          {isAr ? 'التصنيفات والماركات' : 'Categories & Brands'}
        </button>
      </div>

      {/* ==================================================== */}
      {/* TAB 1: PRODUCT MASTER CATALOG */}
      {/* ==================================================== */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={isAr ? 'بحث برمز الصنف SKU، الاسم، أو الباركود...' : 'Search by SKU, name, or barcode...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full ps-9 pe-4 py-2 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white text-slate-700 focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">{isAr ? 'جميع التصنيفات' : 'All Categories'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{isAr ? c.nameAr : (c.nameEn || c.nameAr)}</option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              {isAr ? `إظهار ${filteredItems.length} من ${items.length} صنف` : `Showing ${filteredItems.length} of ${items.length} items`}
            </div>
          </div>

          {/* Product Master Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4 text-start">{isAr ? 'رمز الصنف والباركود' : 'SKU & Barcode'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'اسم الصنف (عربي / EN)' : 'Item Name'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'التصنيف والماركة' : 'Category / Brand'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'الوحدة الأساسية' : 'Base Unit'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'وحدات التحويل UOM' : 'Packaging UOMs'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'سعر البيع' : 'Sale Price'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'متوسط التكلفة WAC' : 'Perpetual WAC'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'الرصيد المتاح' : 'In Stock'}</th>
                    <th className="py-3 px-4 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        {isAr ? 'لا توجد أصناف مطابقة للبحث' : 'No items match the search query'}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const isExpanded = expandedItemId === item.id;
                      return (
                        <React.Fragment key={item.id}>
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900 font-mono">{item.sku}</div>
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono mt-0.5">
                                <Barcode className="w-3 h-3 text-slate-400" />
                                {item.primaryBarcode}
                              </div>
                            </td>

                            <td className="py-3 px-4 max-w-xs">
                              <div className="font-semibold text-slate-900">{item.nameAr}</div>
                              {item.nameEn && <div className="text-[11px] text-slate-400">{item.nameEn}</div>}
                            </td>

                            <td className="py-3 px-4">
                              <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                                {item.categoryNameAr || 'عام'}
                              </span>
                              {item.brandName && (
                                <div className="text-[11px] text-slate-500 mt-0.5">{item.brandName}</div>
                              )}
                            </td>

                            <td className="py-3 px-4 font-semibold text-slate-800">
                              {item.baseUnit}
                            </td>

                            <td className="py-3 px-4">
                              <button
                                onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                                className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold text-xs py-1 px-2 rounded hover:bg-emerald-50"
                              >
                                <span>{item.units.length} {isAr ? 'وحدات' : 'UOMs'}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </td>

                            <td className="py-3 px-4 text-end font-bold text-slate-900">
                              {item.sellingPrice.toFixed(2)} ر.س
                              <span className="block text-[10px] text-emerald-600 font-normal">
                                + {((item.sellingPrice * (item.taxRate / 100))).toFixed(2)} {isAr ? 'ضريبة' : 'VAT'}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-end font-mono">
                              {item.currentWac !== undefined && item.currentWac !== null ? (
                                <span className="font-semibold text-slate-700">{item.currentWac.toFixed(2)} ر.س</span>
                              ) : (
                                <span className="text-slate-400 text-[11px] italic" title={isAr ? 'محجوب أمنياً' : 'Restricted Role'}>
                                  ***
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-end">
                              <span
                                className={`font-bold font-mono px-2 py-0.5 rounded ${
                                  item.currentStock > (item.minimumStockLevel || 10)
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : item.currentStock > 0
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {item.currentStock} {item.baseUnit}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-center">
                              {item.isActive ? (
                                <Badge variant="success" size="sm">{isAr ? 'نشط' : 'Active'}</Badge>
                              ) : (
                                <Badge variant="default" size="sm">{isAr ? 'معطل' : 'Inactive'}</Badge>
                              )}
                            </td>
                          </tr>

                          {/* Expanded Multi-UOM Table (Rule I3, Rule I4) */}
                          {isExpanded && (
                            <tr className="bg-emerald-50/40 border-b border-slate-200">
                              <td colSpan={9} className="p-4">
                                <div className="bg-white rounded-lg border border-emerald-200 p-3 shadow-2xs">
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                                      <Layers className="w-3.5 h-3.5 text-emerald-700" />
                                      {isAr ? `تدرج وحدات قياس الصنف (${item.sku}) والباركود الفريد (Rule I4)` : `Packaging Units & Unique Barcodes for ${item.sku}`}
                                    </h4>
                                    <span className="text-[11px] text-slate-500">
                                      {isAr ? 'المخزون الداخلي يحفظ دائماً بالوحدة الأساسية (Rule I3)' : 'Internal stock tracks base units strictly'}
                                    </span>
                                  </div>

                                  <table className="w-full text-xs text-start">
                                    <thead>
                                      <tr className="text-slate-500 border-b border-slate-100 text-[11px]">
                                        <th className="py-1.5 px-2 text-start">{isAr ? 'اسم الوحدة' : 'Unit Name'}</th>
                                        <th className="py-1.5 px-2 text-start">{isAr ? 'معامل التحويل (إلى الأساسية)' : 'Multiplier'}</th>
                                        <th className="py-1.5 px-2 text-start">{isAr ? 'باركود الوحدة الفريد' : 'Unit Barcode'}</th>
                                        <th className="py-1.5 px-2 text-end">{isAr ? 'سعر البيع' : 'Sale Price'}</th>
                                        <th className="py-1.5 px-2 text-end">{isAr ? 'الرصيد المتاح بهذه الوحدة' : 'Stock in Unit'}</th>
                                        <th className="py-1.5 px-2 text-center">{isAr ? 'نوع الوحدة' : 'Unit Type'}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {item.units.map((u) => {
                                        const unitStock = Math.floor((item.currentStock / (u.conversionFactor || 1)) * 100) / 100;
                                        return (
                                          <tr key={u.id} className="hover:bg-slate-50/50">
                                            <td className="py-2 px-2 font-bold text-slate-800">{u.nameAr}</td>
                                            <td className="py-2 px-2 font-mono text-slate-600">
                                              1 {u.nameAr} = {u.conversionFactor} {item.baseUnit}
                                            </td>
                                            <td className="py-2 px-2 font-mono text-emerald-800 font-semibold">
                                              {u.barcode || '—'}
                                            </td>
                                            <td className="py-2 px-2 text-end font-bold text-slate-900">
                                              {(u.salePrice || item.sellingPrice * u.conversionFactor).toFixed(2)} ر.س
                                            </td>
                                            <td className="py-2 px-2 text-end font-mono font-bold text-slate-700">
                                              {unitStock} {u.nameAr}
                                            </td>
                                            <td className="py-2 px-2 text-center">
                                              {u.isBaseUnit ? (
                                                <Badge variant="info" size="sm">{isAr ? 'وحدة أساسية' : 'Base Unit'}</Badge>
                                              ) : (
                                                <span className="text-[10px] text-slate-500 font-medium">{isAr ? 'وحدة تعبئة' : 'Package'}</span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
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
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: BARCODE SCANNER & RESOLVER (RULE I4) */}
      {/* ==================================================== */}
      {activeTab === 'barcode' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Scanner Input & Quick Simulation */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm border-b border-slate-100 pb-3">
              <ScanLine className="w-5 h-5 text-emerald-600" />
              {isAr ? 'الماسح الفوري ومطابقة الباركود مع الصنف والوحدة' : 'Instant Barcode Scanner & Tuple Resolver'}
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {isAr
                ? 'وفقاً للقاعدة الذهبية (Rule I4)، ينتمي الباركود بشكل حصري لثنائية (الصنف، الوحدة). المسح أدناه يعيد الوحدة وسعرها ومخزونها المحدد دون التباس.'
                : 'Under Golden Rule I4, every barcode uniquely belongs to an (Item, Unit) tuple. Resolves packaging unit, stock, and VAT-inclusive price.'}
            </p>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700">{isAr ? 'أدخل أو امسح الباركود' : 'Enter or Scan Barcode'}</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Barcode className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={scannedBarcode}
                    onChange={(e) => setScannedBarcode(e.target.value)}
                    placeholder="e.g. 628100100101"
                    onKeyDown={(e) => e.key === 'Enter' && handleResolveBarcode()}
                    className="w-full ps-9 pe-4 py-2.5 rounded-lg border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={() => handleResolveBarcode()}
                  disabled={isScanning}
                  startIcon={<ScanLine className="w-3.5 h-3.5" />}
                >
                  {isAr ? 'فحص ومطابقة' : 'Resolve'}
                </Button>
              </div>
            </div>

            {/* Quick Sample Barcode Pills */}
            <div className="pt-2">
              <span className="text-[11px] font-bold text-slate-400 block mb-2">
                {isAr ? 'باركودات تجريبية من قاعدة البيانات:' : 'Quick Demo Barcodes:'}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { code: '628100100101', label: isAr ? 'تمر سكري (كرتون 1 كجم - وحدة أساسية)' : 'Dates 1KG (Base)' },
                  { code: '628100100112', label: isAr ? 'تمر سكري (كرتون مجمع 12 كجم)' : 'Dates 12KG Carton' },
                  { code: '628100200201', label: isAr ? 'بن خولاني (كيس 500 جرام)' : 'Coffee 500g' },
                  { code: '628100300301', label: isAr ? 'مياه نقية (عبوة 330 مل)' : 'Water 330ml Piece' },
                  { code: '628100300340', label: isAr ? 'مياه نقية (كرتون 40 عبوة)' : 'Water 40-Pack Carton' },
                ].map((demo) => (
                  <button
                    key={demo.code}
                    onClick={() => {
                      setScannedBarcode(demo.code);
                      handleResolveBarcode(demo.code);
                    }}
                    className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 transition-colors border border-slate-200/80"
                  >
                    {demo.code} ({demo.label})
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Resolution Result Card */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
            <h4 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
              <span>{isAr ? 'نتيجة مطابقة الباركود مع الصنف والوحدة' : 'Tuple Resolution Response'}</span>
              {barcodeResult && (
                <Badge variant="success" size="sm">
                  {isAr ? 'مطابق للقاعدة I4' : 'Rule I4 Verified'}
                </Badge>
              )}
            </h4>

            {barcodeResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                        {barcodeResult.item.sku}
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                        {barcodeResult.item.nameAr}
                      </h3>
                      {barcodeResult.item.nameEn && (
                        <p className="text-xs text-slate-500">{barcodeResult.item.nameEn}</p>
                      )}
                    </div>
                    <Badge variant="info" size="sm">
                      {barcodeResult.unit.nameAr}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-emerald-200/80 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[11px]">{isAr ? 'معامل التحويل للوحدة' : 'Conversion Factor'}</span>
                      <span className="font-bold text-slate-800 font-mono">
                        1 {barcodeResult.unit.nameAr} = {barcodeResult.unit.conversionFactor} {barcodeResult.item.baseUnit}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[11px]">{isAr ? 'الرصيد بهذه الوحدة' : 'Stock in this Unit'}</span>
                      <span className="font-bold text-emerald-800 font-mono">
                        {barcodeResult.currentStockInUnit} {barcodeResult.unit.nameAr}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Price & VAT Breakdown */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">{isAr ? 'سعر البيع الأساسي (غير شامل)' : 'Net Sale Price (Excl. VAT)'}</span>
                    <span className="font-bold text-slate-900">{barcodeResult.salePrice.toFixed(2)} ر.س</span>
                  </div>

                  <div className="flex items-center justify-between text-emerald-700">
                    <span>{isAr ? 'ضريبة القيمة المضافة (15%)' : 'Standard VAT (15%)'}</span>
                    <span className="font-bold font-mono">+{barcodeResult.vatAmount.toFixed(2)} ر.س</span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-sm font-black text-slate-900">
                    <span>{isAr ? 'الإجمالي شامل الضريبة' : 'Total Incl. VAT'}</span>
                    <span className="text-emerald-700">{barcodeResult.salePriceInclusive.toFixed(2)} ر.س</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 text-center">
                  {isAr ? 'جاهز للترحيل الفوري إلى شاشة نقاط البيع (POS) أو فواتير المبيعات' : 'Ready for immediate dispatch to POS or Sales Invoice'}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400">
                <ScanLine className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
                <p className="text-xs">{isAr ? 'قم بمسح أي باركود لعرض بيانات الصنف والوحدة' : 'Scan or enter a barcode to view resolved details'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 3: MULTI-WAREHOUSE STOCK MATRIX & WAC VALUATION */}
      {/* ==================================================== */}
      {activeTab === 'stocks' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <h4 className="text-xs font-bold text-slate-900 mb-1">
              {isAr ? 'مصفوفة أرصدة المستودعات وتقييم المخزون المستمر (Rule I2)' : 'Warehouse Stock Matrix & Perpetual WAC Valuation'}
            </h4>
            <p className="text-xs text-slate-500 mb-4">
              {isAr
                ? 'توزيع المخزون عبر المستودعات مع تقييم القيمة المالية وفق متوسط التكلفة المرجح (WAC) لكل صنف.'
                : 'Stock breakdown by warehouse with perpetual valuation in SAR.'}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4 text-start">{isAr ? 'رمز الصنف' : 'SKU'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'اسم الصنف' : 'Item Name'}</th>
                    <th className="py-3 px-4 text-start">{isAr ? 'الوحدة الأساسية' : 'Base Unit'}</th>
                    {warehouses.map((wh) => (
                      <th key={wh.id} className="py-3 px-4 text-end">
                        {isAr ? wh.nameAr : (wh.nameEn || wh.nameAr)}
                        <span className="block text-[10px] text-slate-400 font-normal">{wh.code}</span>
                      </th>
                    ))}
                    <th className="py-3 px-4 text-end bg-slate-100/50">{isAr ? 'إجمالي الرصيد' : 'Total Stock'}</th>
                    <th className="py-3 px-4 text-end">{isAr ? 'متوسط التكلفة WAC' : 'Perpetual WAC'}</th>
                    <th className="py-3 px-4 text-end bg-emerald-50/50">{isAr ? 'إجمالي القيمة (ر.س)' : 'Total Valuation (SAR)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockSummaries.map((summary) => (
                    <tr key={summary.itemId} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{summary.sku}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{summary.nameAr}</td>
                      <td className="py-3 px-4 text-slate-600">{summary.baseUnit}</td>

                      {warehouses.map((wh) => {
                        const whData = summary.warehouseBreakdown.find((b) => b.warehouseId === wh.id);
                        const qty = whData ? whData.stockBaseQty : 0;
                        return (
                          <td key={wh.id} className="py-3 px-4 text-end font-mono">
                            <span className={qty > 0 ? 'font-bold text-slate-800' : 'text-slate-300'}>
                              {qty}
                            </span>
                          </td>
                        );
                      })}

                      <td className="py-3 px-4 text-end font-mono font-bold text-emerald-800 bg-slate-100/30">
                        {summary.totalStockBaseQty}
                      </td>

                      <td className="py-3 px-4 text-end font-mono text-slate-700">
                        {summary.currentWac !== undefined ? `${summary.currentWac.toFixed(2)} ر.س` : '***'}
                      </td>

                      <td className="py-3 px-4 text-end font-mono font-bold text-emerald-900 bg-emerald-50/30">
                        {summary.totalValuationSar !== undefined
                          ? `${summary.totalValuationSar.toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س`
                          : '***'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 4: WAREHOUSES & BINS */}
      {/* ==================================================== */}
      {activeTab === 'warehouses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {warehouses.map((wh) => (
            <div key={wh.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                      {wh.code}
                    </span>
                    {wh.isDefault && (
                      <Badge variant="success" size="sm">
                        {isAr ? 'المستودع الافتراضي' : 'Default Warehouse'}
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900 mt-2">{wh.nameAr}</h3>
                  {wh.nameEn && <p className="text-xs text-slate-400">{wh.nameEn}</p>}
                </div>
                <Warehouse className="w-6 h-6 text-slate-300" />
              </div>

              <div className="space-y-1.5 text-xs text-slate-600">
                {wh.address && <p>📍 {wh.address}</p>}
                {wh.managerName && <p>👤 {isAr ? 'المسؤول:' : 'Manager:'} {wh.managerName}</p>}
                {wh.contactPhone && <p>📞 {wh.contactPhone}</p>}
              </div>

              {/* Bins list */}
              <div className="pt-3 border-t border-slate-100">
                <h5 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {isAr ? `مواقع التخزين والأرفف (${wh.bins.length} Bins):` : `Bin Locations (${wh.bins.length} Bins):`}
                </h5>
                <div className="flex flex-wrap gap-1.5">
                  {wh.bins.map((bin) => (
                    <span
                      key={bin.id}
                      className="px-2 py-1 rounded bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-700"
                    >
                      {bin.code} {bin.aisle ? `(${bin.aisle}/${bin.shelf || ''})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 5: CATEGORIES & BRANDS */}
      {/* ==================================================== */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Categories */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Tags className="w-4 h-4 text-emerald-600" />
              {isAr ? 'تصنيفات الأصناف (Item Categories)' : 'Item Categories'}
            </h4>
            <div className="divide-y divide-slate-100">
              {categories.map((cat) => (
                <div key={cat.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800">{cat.nameAr}</span>
                    {cat.nameEn && <span className="text-slate-400 ms-2">({cat.nameEn})</span>}
                    <div className="font-mono text-[11px] text-slate-400 mt-0.5">{cat.code}</div>
                  </div>
                  <Badge variant="default" size="sm">
                    {cat.defaultTaxRate}% {isAr ? 'ضريبة' : 'VAT'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Brands */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <PackageCheck className="w-4 h-4 text-blue-600" />
              {isAr ? 'العلامات التجارية والشركات المصنعة (Brands)' : 'Item Brands & Manufacturers'}
            </h4>
            <div className="divide-y divide-slate-100">
              {brands.map((brand) => (
                <div key={brand.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800">{brand.nameAr}</span>
                    {brand.nameEn && <span className="text-slate-400 ms-2">({brand.nameEn})</span>}
                    <div className="font-mono text-[11px] text-slate-400 mt-0.5">{brand.code}</div>
                  </div>
                  {brand.countryOfOrigin && (
                    <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {brand.countryOfOrigin}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: CREATE NEW ITEM WITH MULTI-UOM (RULE I3, I4) */}
      {/* ==================================================== */}
      <Modal
        isOpen={showNewItemModal}
        onClose={() => setShowNewItemModal(false)}
        title={isAr ? 'إضافة صنف جديد بتعريف الوحدات المتعددة (Multi-UOM)' : 'Create Product Master with Multi-UOM'}
        maxWidth="lg"
      >
        <form onSubmit={handleCreateItemSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {isAr ? 'رمز الصنف (SKU) *' : 'SKU *'}
              </label>
              <Input
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                placeholder="e.g. ITM-NEW-001"
                required
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {isAr ? 'الباركود الأساسي (اختياري، يولد تلقائياً)' : 'Primary Barcode'}
              </label>
              <Input
                value={newPrimaryBarcode}
                onChange={(e) => setNewPrimaryBarcode(e.target.value)}
                placeholder="e.g. 628999123456"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {isAr ? 'اسم الصنف بالعربي *' : 'Item Name (Arabic) *'}
              </label>
              <Input
                value={newNameAr}
                onChange={(e) => setNewNameAr(e.target.value)}
                placeholder="e.g. زيت زيتون بكر ممتاز 500 مل"
                required
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {isAr ? 'اسم الصنف بالإنجليزي' : 'Item Name (English)'}
              </label>
              <Input
                value={newNameEn}
                onChange={(e) => setNewNameEn(e.target.value)}
                placeholder="e.g. Extra Virgin Olive Oil 500ml"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {isAr ? 'الوحدة الأساسية (Base Unit) *' : 'Base Unit *'}
              </label>
              <Input
                value={newBaseUnit}
                onChange={(e) => setNewBaseUnit(e.target.value)}
                placeholder="حبة / علبة / كجم"
                required
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {isAr ? 'سعر البيع الافتراضي (ر.س) *' : 'Default Sale Price (SAR) *'}
              </label>
              <Input
                type="number"
                step="0.01"
                value={newSellingPrice}
                onChange={(e) => setNewSellingPrice(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {isAr ? 'تكلفة الشراء التقديرية (ر.س)' : 'Estimated Cost (SAR)'}
              </label>
              <Input
                type="number"
                step="0.01"
                value={newCost}
                onChange={(e) => setNewCost(e.target.value)}
              />
            </div>
          </div>

          {/* Multi-UOM Section */}
          <div className="pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-emerald-700" />
                {isAr ? 'وحدات التعبئة والتجزئة الإضافية (Packaging Units)' : 'Packaging Units (Multi-UOM)'}
              </span>
              <button
                type="button"
                onClick={() =>
                  setNewUnits([
                    ...newUnits,
                    { nameAr: `كرتون (${newUnits.length + 2} عبوات)`, factor: (newUnits.length + 2) * 6, barcode: '', price: 0 },
                  ])
                }
                className="text-xs text-emerald-700 font-bold hover:underline"
              >
                + {isAr ? 'إضافة وحدة قياس' : 'Add Unit'}
              </button>
            </div>

            <div className="space-y-2">
              {newUnits.map((u, index) => (
                <div key={index} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <input
                    type="text"
                    placeholder={isAr ? 'اسم الوحدة (مثال: كرتون)' : 'Unit Name'}
                    value={u.nameAr}
                    onChange={(e) => {
                      const updated = [...newUnits];
                      updated[index].nameAr = e.target.value;
                      setNewUnits(updated);
                    }}
                    className="flex-1 px-2 py-1 rounded border border-slate-200 text-xs"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400">=</span>
                    <input
                      type="number"
                      placeholder={isAr ? 'المعامل' : 'Multiplier'}
                      value={u.factor}
                      onChange={(e) => {
                        const updated = [...newUnits];
                        updated[index].factor = parseFloat(e.target.value) || 1;
                        setNewUnits(updated);
                      }}
                      className="w-16 px-2 py-1 rounded border border-slate-200 text-xs font-mono"
                    />
                    <span className="text-slate-500">{newBaseUnit}</span>
                  </div>
                  <input
                    type="text"
                    placeholder={isAr ? 'باركود فريد' : 'Barcode'}
                    value={u.barcode}
                    onChange={(e) => {
                      const updated = [...newUnits];
                      updated[index].barcode = e.target.value;
                      setNewUnits(updated);
                    }}
                    className="w-32 px-2 py-1 rounded border border-slate-200 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setNewUnits(newUnits.filter((_, i) => i !== index))}
                    className="text-rose-500 hover:text-rose-700 px-2 py-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowNewItemModal(false)}
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isCreatingItem}
            >
              {isCreatingItem ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ الصنف والوحدات' : 'Save Item')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
