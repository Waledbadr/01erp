/**
 * Point of Sale (POS) View — Saudi ERP Platform (Phase 15)
 * Ultra-Fast Touch Grid, Hardware Barcode Wedge Buffer, Split Payments, Cashier Shift Lifecycle, X/Z Reports, Offline IndexedDB Sync, and ZATCA Phase 2 Thermal Receipts.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ShoppingCart,
  Barcode,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  DollarSign,
  Clock,
  User,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  FileText,
  Printer,
  Wifi,
  WifiOff,
  RefreshCw,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  RotateCcw,
  Sparkles,
  Zap,
  Volume2,
  VolumeX,
  X,
  Store,
  Tag,
} from 'lucide-react';
import { useI18n } from '../../i18n/context.js';
import { useToast } from '../ui/Toast.js';
import {
  PosProduct,
  OfflinePosOrder,
  posAudio,
  PosOfflineStore,
  apiFetchPosCatalog,
  apiFetchRegisters,
  apiFetchActiveShift,
  apiOpenShift,
  apiRecordCashMovement,
  apiGenerateXReport,
  apiCloseShift,
  apiProcessPosOrder,
  apiSyncOfflineOrders,
  apiFetchHeldCarts,
  apiHoldCart,
  apiResumeHeldCart,
  apiDeleteHeldCart,
} from '../../lib/pos.js';
import {
  PosRegister,
  PosShift,
  PosCartItem,
  PosPaymentSplit,
  PosOrder,
  HeldCart,
  XReportData,
  ZReportData,
  PosTenderType,
} from '../../../server/modules/pos/types.js';

export const PointOfSaleView: React.FC = () => {
  const { isAr, language } = useI18n();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  // 1. Data States
  const [catalog, setCatalog] = useState<PosProduct[]>([]);
  const [registers, setRegisters] = useState<PosRegister[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string>('');
  const [activeShift, setActiveShift] = useState<PosShift | null>(null);
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<OfflinePosOrder[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 2. Search & Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // 3. Cart State
  const [cartItems, setCartItems] = useState<PosCartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id?: string; name: string; vatNumber?: string }>({
    name: isAr ? 'عميل نقدي' : 'Walk-in Customer',
  });

  // 4. Modals
  const [checkoutModalOpen, setCheckoutModalOpen] = useState<boolean>(false);
  const [openShiftModalOpen, setOpenShiftModalOpen] = useState<boolean>(false);
  const [cashMovementModalOpen, setCashMovementModalOpen] = useState<boolean>(false);
  const [xReportModalOpen, setXReportModalOpen] = useState<boolean>(false);
  const [closeShiftModalOpen, setCloseShiftModalOpen] = useState<boolean>(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState<boolean>(false);
  const [heldCartsDrawerOpen, setHeldCartsDrawerOpen] = useState<boolean>(false);

  // 5. Checkout & Split Payment States
  const [paymentSplits, setPaymentSplits] = useState<PosPaymentSplit[]>([
    { tenderType: 'MADA', amountSar: 0 },
  ]);
  const [activeTenderType, setActiveTenderType] = useState<PosTenderType>('MADA');
  const [tenderAmountInput, setTenderAmountInput] = useState<string>('');
  const [lastCompletedOrder, setLastCompletedOrder] = useState<PosOrder | null>(null);

  // 6. Shift Management Form States
  const [openFloatInput, setOpenFloatInput] = useState<string>('500');
  const [cashierNameInput, setCashierNameInput] = useState<string>(isAr ? 'أحمد المحمدي' : 'Ahmed Al-Mohamadi');
  const [cashMovementType, setCashMovementType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [cashMovementAmount, setCashMovementAmount] = useState<string>('100');
  const [cashMovementReason, setCashMovementReason] = useState<string>('');
  const [actualCashCountedInput, setActualCashCountedInput] = useState<string>('');
  const [discrepancyReasonInput, setDiscrepancyReasonInput] = useState<string>('');

  // 7. Report Data States
  const [xReportData, setXReportData] = useState<XReportData | null>(null);
  const [zReportData, setZReportData] = useState<ZReportData | null>(null);

  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initialize Data
  useEffect(() => {
    loadInitialData();

    // Online / Offline Listeners
    const handleOnline = () => {
      setIsOnline(true);
      toastInfo(isAr ? 'تم استعادة الاتصال بالإنترنت' : 'Internet connection restored');
    };
    const handleOffline = () => {
      setIsOnline(false);
      toastInfo(isAr ? 'تم فقد الاتصال — نقطة البيع تعمل في وضع عدم الاتصال (Offline)' : 'Offline mode active');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial Offline Queue Check
    setOfflineQueue(PosOfflineStore.getQueue());

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [cat, regs] = await Promise.all([apiFetchPosCatalog(), apiFetchRegisters()]);
      setCatalog(cat);
      setRegisters(regs);

      const savedRegId = PosOfflineStore.getSavedRegisterId();
      const initialRegId = savedRegId && regs.some((r) => r.id === savedRegId) ? savedRegId : regs[0]?.id || '';
      setSelectedRegisterId(initialRegId);

      if (initialRegId) {
        await checkShiftForRegister(initialRegId);
      }
    } catch (err: any) {
      toastError(err.message || 'Failed to initialize POS');
    } finally {
      setIsLoading(false);
    }
  };

  const checkShiftForRegister = async (regId: string) => {
    try {
      const data = await apiFetchActiveShift(regId);
      setActiveShift(data.shift);
      const held = await apiFetchHeldCarts(regId);
      setHeldCarts(held);
    } catch (err: any) {
      console.error('Failed to fetch active shift:', err);
    }
  };

  const handleRegisterChange = async (regId: string) => {
    setSelectedRegisterId(regId);
    PosOfflineStore.saveRegisterId(regId);
    await checkShiftForRegister(regId);
  };

  // Hardware Barcode Scanner Buffer Engine
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when inside input fields
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target !== searchInputRef.current) {
        return;
      }

      // Hotkey: F3 or / to focus search
      if (e.key === '/' || e.key === 'F3') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Hotkey: F12 or Space (when not in search) to pay
      if (e.key === 'F12' && cartItems.length > 0 && activeShift) {
        e.preventDefault();
        handleOpenCheckout();
        return;
      }

      // Rapid keystroke scanner buffer
      const now = Date.now();
      if (now - lastKeyTimeRef.current > 100) {
        barcodeBufferRef.current = '';
      }
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length >= 3) {
          handleBarcodeScanned(barcodeBufferRef.current);
          barcodeBufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [catalog, cartItems, activeShift]);

  const handleBarcodeScanned = (code: string) => {
    const cleanCode = code.trim();
    const product = catalog.find(
      (p) => p.barcode.toLowerCase() === cleanCode.toLowerCase() || p.itemCode.toLowerCase() === cleanCode.toLowerCase()
    );

    if (product) {
      if (soundEnabled) posAudio.playScanBeep();
      addItemToCart(product);
      toastSuccess(isAr ? `تم إضافة: ${product.nameAr}` : `Added: ${product.nameEn}`);
    } else {
      if (soundEnabled) posAudio.playErrorBuzzer();
      toastError(isAr ? `الباركود غير معرف: ${cleanCode}` : `Unknown barcode: ${cleanCode}`);
    }
  };

  // Cart Calculations (Exact line-level math Rule G7 / G8)
  const cartSummary = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let vatTotal = 0;

    for (const item of cartItems) {
      const lineSubtotal = Number((item.unitPriceSar * item.quantity - (item.discountAmountSar || 0)).toFixed(2));
      const lineVat = Number((lineSubtotal * (item.vatRate ?? 0.15)).toFixed(2));
      subtotal += item.unitPriceSar * item.quantity;
      discountTotal += item.discountAmountSar || 0;
      vatTotal += lineVat;
    }

    subtotal = Number(subtotal.toFixed(2));
    discountTotal = Number(discountTotal.toFixed(2));
    vatTotal = Number(vatTotal.toFixed(2));
    const grandTotal = Number((subtotal - discountTotal + vatTotal).toFixed(2));

    return {
      itemCount: cartItems.reduce((acc, i) => acc + i.quantity, 0),
      subtotal,
      discountTotal,
      vatTotal,
      grandTotal,
    };
  }, [cartItems]);

  // Cart Management
  const addItemToCart = (product: PosProduct) => {
    if (!activeShift) {
      toastError(isAr ? 'يرجى فتح وردية جديدة للبدء بعمليات البيع' : 'Please open a shift first');
      setOpenShiftModalOpen(true);
      return;
    }

    setCartItems((prev) => {
      const idx = prev.findIndex((i) => i.itemId === product.itemId);
      if (idx >= 0) {
        const updated = [...prev];
        const item = updated[idx];
        const newQty = item.quantity + 1;
        const lineSubtotal = Number((item.unitPriceSar * newQty - item.discountAmountSar).toFixed(2));
        const lineVat = Number((lineSubtotal * item.vatRate).toFixed(2));
        updated[idx] = {
          ...item,
          quantity: newQty,
          subtotalSar: lineSubtotal,
          vatAmountSar: lineVat,
          totalSar: Number((lineSubtotal + lineVat).toFixed(2)),
        };
        return updated;
      } else {
        const lineSubtotal = product.unitPriceSar;
        const lineVat = Number((lineSubtotal * product.vatRate).toFixed(2));
        const newItem: PosCartItem = {
          itemId: product.itemId,
          itemCode: product.itemCode,
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          barcode: product.barcode,
          uom: product.uom,
          unitPriceSar: product.unitPriceSar,
          quantity: 1,
          vatRate: product.vatRate,
          discountAmountSar: 0,
          discountPercentage: 0,
          subtotalSar: lineSubtotal,
          vatAmountSar: lineVat,
          totalSar: Number((lineSubtotal + lineVat).toFixed(2)),
          costPriceSar: product.costPriceSar,
          category: product.categoryAr,
        };
        return [newItem, ...prev];
      }
    });

    if (soundEnabled) posAudio.playScanBeep();
  };

  const updateItemQty = (itemId: string, delta: number) => {
    setCartItems((prev) => {
      return prev
        .map((item) => {
          if (item.itemId !== itemId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          const lineSubtotal = Number((item.unitPriceSar * newQty - item.discountAmountSar).toFixed(2));
          const lineVat = Number((lineSubtotal * item.vatRate).toFixed(2));
          return {
            ...item,
            quantity: newQty,
            subtotalSar: lineSubtotal,
            vatAmountSar: lineVat,
            totalSar: Number((lineSubtotal + lineVat).toFixed(2)),
          };
        })
        .filter(Boolean) as PosCartItem[];
    });
  };

  const removeItem = (itemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.itemId !== itemId));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  // Categories extraction
  const categories = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((p) => set.add(isAr ? p.categoryAr : p.categoryEn));
    return ['ALL', ...Array.from(set)];
  }, [catalog, isAr]);

  // Filtered Catalog
  const filteredCatalog = useMemo(() => {
    return catalog.filter((p) => {
      const matchCat =
        selectedCategory === 'ALL' ||
        (isAr ? p.categoryAr === selectedCategory : p.categoryEn === selectedCategory);
      const query = searchQuery.trim().toLowerCase();
      const matchQuery =
        !query ||
        p.nameAr.toLowerCase().includes(query) ||
        p.nameEn.toLowerCase().includes(query) ||
        p.itemCode.toLowerCase().includes(query) ||
        p.barcode.toLowerCase().includes(query);
      return matchCat && matchQuery;
    });
  }, [catalog, selectedCategory, searchQuery, isAr]);

  // Open Shift
  const handleOpenShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const shift = await apiOpenShift({
        registerId: selectedRegisterId,
        cashierName: cashierNameInput,
        openingFloatSar: Number(openFloatInput) || 0,
      });
      setActiveShift(shift);
      setOpenShiftModalOpen(false);
      toastSuccess(isAr ? 'تم فتح الوردية بنجاح — جاهز للبيع' : 'Shift opened successfully');
    } catch (err: any) {
      toastError(err.message || 'Failed to open shift');
    }
  };

  // Cash Movement (Deposit / Drop)
  const handleCashMovementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    try {
      const mov = await apiRecordCashMovement({
        shiftId: activeShift.id,
        type: cashMovementType,
        amountSar: Number(cashMovementAmount),
        reason: cashMovementReason,
        performedBy: activeShift.cashierName,
      });
      toastSuccess(
        isAr
          ? `تم تسجيل ${cashMovementType === 'CASH_IN' ? 'الإيداع' : 'السحب'} بقيمة ${mov.amountSar} ﷼`
          : `Cash movement recorded: ${mov.amountSar} SAR`
      );
      setCashMovementModalOpen(false);
      await checkShiftForRegister(selectedRegisterId);
    } catch (err: any) {
      toastError(err.message || 'Failed to record cash movement');
    }
  };

  // X-Report
  const handleGenerateXReport = async () => {
    if (!activeShift) return;
    try {
      const data = await apiGenerateXReport(activeShift.id);
      setXReportData(data);
      setXReportModalOpen(true);
    } catch (err: any) {
      toastError(err.message || 'Failed to generate X-Report');
    }
  };

  // Close Shift & Z-Report
  const handleCloseShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    try {
      const data = await apiCloseShift(activeShift.id, {
        actualCashCountedSar: Number(actualCashCountedInput),
        discrepancyReason: discrepancyReasonInput,
      });
      setZReportData(data);
      setActiveShift(null);
      setCloseShiftModalOpen(false);
      toastSuccess(isAr ? `تم إغلاق الوردية وإصدار التقرير Z-#${data.reportNumber}` : `Shift closed. Z-Report #${data.reportNumber} issued.`);
    } catch (err: any) {
      toastError(err.message || 'Failed to close shift');
    }
  };

  // Park / Hold Cart
  const handleHoldCart = async () => {
    if (cartItems.length === 0 || !activeShift) return;
    try {
      const held = await apiHoldCart({
        registerId: selectedRegisterId,
        cashierId: activeShift.cashierId,
        items: cartItems,
        customerName: selectedCustomer.name,
      });
      setHeldCarts((prev) => [held, ...prev]);
      setCartItems([]);
      toastSuccess(isAr ? 'تم تعليق السلة بنجاح' : 'Cart parked successfully');
    } catch (err: any) {
      toastError(err.message || 'Failed to hold cart');
    }
  };

  // Resume Held Cart
  const handleResumeHeldCart = async (heldId: string) => {
    try {
      const resumed = await apiResumeHeldCart(heldId);
      setCartItems(resumed.items);
      setHeldCarts((prev) => prev.filter((h) => h.id !== heldId));
      setHeldCartsDrawerOpen(false);
      toastSuccess(isAr ? 'تم استرجاع السلة المعلقة' : 'Held cart recalled');
    } catch (err: any) {
      toastError(err.message || 'Failed to resume cart');
    }
  };

  // Delete Held Cart
  const handleDeleteHeldCart = async (heldId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiDeleteHeldCart(heldId);
      setHeldCarts((prev) => prev.filter((h) => h.id !== heldId));
      toastInfo(isAr ? 'تم حذف السلة المعلقة' : 'Held cart removed');
    } catch (err: any) {
      toastError(err.message || 'Failed to delete held cart');
    }
  };

  // Open Checkout
  const handleOpenCheckout = () => {
    if (cartItems.length === 0) return;
    setPaymentSplits([{ tenderType: 'MADA', amountSar: cartSummary.grandTotal }]);
    setActiveTenderType('MADA');
    setTenderAmountInput(cartSummary.grandTotal.toString());
    setCheckoutModalOpen(true);
  };

  // Add Tender Split
  const handleAddOrUpdateTender = (tender: PosTenderType, amount: number) => {
    setPaymentSplits((prev) => {
      const filtered = prev.filter((p) => p.tenderType !== tender);
      if (amount > 0) {
        filtered.push({ tenderType: tender, amountSar: Number(amount.toFixed(2)) });
      }
      return filtered;
    });
  };

  const totalPaidInModal = useMemo(() => {
    return Number(paymentSplits.reduce((acc, p) => acc + p.amountSar, 0).toFixed(2));
  }, [paymentSplits]);

  const changeDueInModal = useMemo(() => {
    return Number(Math.max(0, totalPaidInModal - cartSummary.grandTotal).toFixed(2));
  }, [totalPaidInModal, cartSummary.grandTotal]);

  const remainingBalanceInModal = useMemo(() => {
    return Number(Math.max(0, cartSummary.grandTotal - totalPaidInModal).toFixed(2));
  }, [totalPaidInModal, cartSummary.grandTotal]);

  // Finalize Order (Online or Offline Queue)
  const handleCompletePayment = async () => {
    if (totalPaidInModal < cartSummary.grandTotal - 0.01) {
      toastError(isAr ? 'المبلغ المدفوع أقل من الإجمالي' : 'Paid amount is less than total');
      return;
    }

    if (!activeShift) return;

    if (!isOnline) {
      // Offline Processing
      const offlineId = `off-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const offlineOrder: OfflinePosOrder = {
        offlineId,
        shiftId: activeShift.id,
        registerId: selectedRegisterId,
        items: cartItems,
        payments: paymentSplits,
        customerName: selectedCustomer.name,
        createdAt: new Date().toISOString(),
        totalSar: cartSummary.grandTotal,
      };

      PosOfflineStore.enqueue(offlineOrder);
      setOfflineQueue(PosOfflineStore.getQueue());

      if (soundEnabled) posAudio.playSuccessChime();
      toastSuccess(isAr ? 'تم حفظ الفاتورة محلياً في وضع عدم الاتصال (Offline Queue)' : 'Order stored offline in local queue');

      setCheckoutModalOpen(false);
      setCartItems([]);
      return;
    }

    try {
      const order = await apiProcessPosOrder({
        shiftId: activeShift.id,
        registerId: selectedRegisterId,
        items: cartItems,
        payments: paymentSplits,
        customerName: selectedCustomer.name,
      });

      if (soundEnabled) posAudio.playSuccessChime();
      setLastCompletedOrder(order);
      setCheckoutModalOpen(false);
      setReceiptModalOpen(true);
      setCartItems([]);
      toastSuccess(isAr ? `تم إصدار الفاتورة: ${order.invoiceNumber}` : `Invoice created: ${order.invoiceNumber}`);

      // Refresh Shift Totals
      await checkShiftForRegister(selectedRegisterId);
    } catch (err: any) {
      toastError(err.message || 'Failed to process checkout');
    }
  };

  // Sync Offline Queue to Server
  const handleSyncOfflineQueue = async () => {
    const queue = PosOfflineStore.getQueue();
    if (queue.length === 0) {
      toastInfo(isAr ? 'لا توجد فواتير معلقة للمزامنة' : 'No offline orders to sync');
      return;
    }

    setIsSyncing(true);
    try {
      const res = await apiSyncOfflineOrders(queue);
      if (res.syncedCount > 0) {
        const syncedIds = res.syncedOrders.map((o) => o.offlineId).filter(Boolean) as string[];
        PosOfflineStore.removeItems(syncedIds);
        setOfflineQueue(PosOfflineStore.getQueue());
        toastSuccess(
          isAr
            ? `تمت مزامنة ${res.syncedCount} فاتورة مع الخادم العام بنجاح!`
            : `Synced ${res.syncedCount} offline orders successfully!`
        );
        await checkShiftForRegister(selectedRegisterId);
      }
      if (res.errors.length > 0) {
        toastError(
          isAr
            ? `فشل مزامنة ${res.errors.length} فاتورة، يرجى مراجعة البيانات`
            : `${res.errors.length} orders failed sync`
        );
      }
    } catch (err: any) {
      toastError(err.message || 'Failed to sync offline queue');
    } finally {
      setIsSyncing(false);
    }
  };

  // Thermal Print Trigger
  const handlePrintThermal = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. TOP HEADER & POS STATUS BAR */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-wide">
                {isAr ? 'نقطة البيع السحابية (POS)' : 'Cloud Point of Sale (POS)'}
              </h1>
              {/* Online / Offline Status Badge */}
              {isOnline ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  {isAr ? 'متصل' : 'Online'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-950/80 text-amber-400 border border-amber-800 animate-pulse">
                  <WifiOff className="w-3 h-3 text-amber-400" />
                  {isAr ? 'وضع عدم الاتصال (Offline)' : 'Offline Mode'}
                </span>
              )}

              {/* Pending Offline Sync Badge */}
              {offlineQueue.length > 0 && (
                <button
                  onClick={handleSyncOfflineQueue}
                  disabled={!isOnline || isSyncing}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-950 text-indigo-300 border border-indigo-700 hover:bg-indigo-900 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>
                    {isAr ? `${offlineQueue.length} في الانتظار - مزامنة` : `${offlineQueue.length} Pending - Sync`}
                  </span>
                </button>
              )}
            </div>

            {/* Selected Register Selector */}
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span>{isAr ? 'جهاز الكاشير:' : 'Register:'}</span>
              <select
                value={selectedRegisterId}
                onChange={(e) => handleRegisterChange(e.target.value)}
                className="bg-slate-800 text-slate-200 text-xs rounded border border-slate-700 px-2 py-0.5 focus:outline-none focus:border-emerald-500"
              >
                {registers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} - {isAr ? r.nameAr : r.nameEn}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Shift Summary & Quick Actions */}
        <div className="flex items-center gap-2">
          {activeShift ? (
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-semibold">{isAr ? 'وردية مفتوحة' : 'Open Shift'}</span>
              </div>
              <div className="hidden sm:flex items-center gap-1 text-slate-300 border-s border-slate-700 ps-2">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>{activeShift.cashierName}</span>
              </div>
              <div className="hidden md:flex items-center gap-1 text-slate-300 border-s border-slate-700 ps-2">
                <Banknote className="w-3.5 h-3.5 text-slate-400" />
                <span>{isAr ? 'العهدة:' : 'Float:'}</span>
                <span className="font-mono font-bold text-white">{activeShift.openingFloatSar} ﷼</span>
              </div>
              <div className="flex items-center gap-1 text-slate-300 border-s border-slate-700 ps-2">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                <span>{isAr ? 'المبيعات:' : 'Sales:'}</span>
                <span className="font-mono font-bold text-emerald-400">{activeShift.netSalesSar} ﷼</span>
              </div>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{isAr ? 'لا توجد وردية مفتوحة' : 'No Open Shift'}</span>
            </div>
          )}

          {/* Action Buttons */}
          {activeShift ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCashMovementModalOpen(true)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                title={isAr ? 'إيداع أو سحب نقدي' : 'Cash In / Out'}
              >
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">{isAr ? 'حركة نقدية' : 'Cash In/Out'}</span>
              </button>

              <button
                onClick={handleGenerateXReport}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                title={isAr ? 'تقرير X الأوسط' : 'X-Report'}
              >
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">{isAr ? 'تقرير X' : 'X-Report'}</span>
              </button>

              <button
                onClick={() => {
                  setActualCashCountedInput(activeShift.expectedCashSar.toString());
                  setCloseShiftModalOpen(true);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                title={isAr ? 'إغلاق الوردية وإصدار تقرير Z' : 'Close Shift & Z-Report'}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">{isAr ? 'إغلاق الوردية (Z)' : 'Close (Z)'}</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setOpenShiftModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-900/40 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'فتح وردية كاشير' : 'Open Shift'}</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white border border-slate-700 cursor-pointer"
            title={soundEnabled ? 'Disable Sound' : 'Enable Sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </header>

      {/* 2. MAIN SPLIT INTERFACE (LEFT: CATALOG GRID | RIGHT: CART & TENDER) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* LEFT PANE: SEARCH, CATEGORIES & PRODUCT GRID */}
        <div className="flex-1 flex flex-col min-w-0 border-b lg:border-b-0 lg:border-e border-slate-800 bg-slate-950 overflow-hidden">
          {/* Top Search & Barcode Buffer Input */}
          <div className="p-3 bg-slate-900/60 border-b border-slate-800/80 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'ابحث بالاسم، الرمز، أو امسح الباركود (F3 أو /)...' : 'Search by item, SKU, or scan barcode (F3 / /)...'}
                className="w-full bg-slate-900 text-white placeholder-slate-500 text-sm rounded-xl ps-9 pe-4 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-400 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
              <Barcode className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline font-mono">{isAr ? 'قارئ الباركود نشط' : 'Wedge Scanner Active'}</span>
            </div>
          </div>

          {/* Category Filter Horizontal Pills */}
          <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-900/30 border-b border-slate-800/50 overflow-x-auto no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/30 font-semibold'
                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-700/60'
                }`}
              >
                {cat === 'ALL' ? (isAr ? 'جميع الأصناف' : 'All Items') : cat}
              </button>
            ))}
          </div>

          {/* Product Touch Cards Grid */}
          <div className="flex-1 p-3 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 content-start">
            {filteredCatalog.map((product) => {
              const inCartCount = cartItems.find((i) => i.itemId === product.itemId)?.quantity || 0;
              return (
                <div
                  key={product.itemId}
                  onClick={() => addItemToCart(product)}
                  className={`group relative flex flex-col justify-between p-3 rounded-xl bg-slate-900 hover:bg-slate-850 border transition-all cursor-pointer select-none active:scale-[0.98] ${
                    inCartCount > 0 ? 'border-emerald-500/80 shadow-md shadow-emerald-950/40 bg-emerald-950/10' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Quick Key Tag & In-Cart Badge */}
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    {product.quickKey ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
                        {product.quickKey}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500">
                        {product.itemCode}
                      </span>
                    )}

                    {inCartCount > 0 && (
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-slate-950 text-xs font-extrabold animate-bounce">
                        {inCartCount}
                      </span>
                    )}
                  </div>

                  {/* Title & Category */}
                  <div className="mb-2">
                    <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-2 group-hover:text-emerald-300 transition-colors">
                      {isAr ? product.nameAr : product.nameEn}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-0.5">
                      <Tag className="w-3 h-3 text-slate-500" />
                      <span>{isAr ? product.categoryAr : product.categoryEn}</span>
                      <span className="text-slate-600">•</span>
                      <span>{product.uom}</span>
                    </div>
                  </div>

                  {/* Bottom: Price + Stock */}
                  <div className="flex items-end justify-between pt-2 border-t border-slate-800/80">
                    <div>
                      <div className="text-sm sm:text-base font-extrabold font-mono text-emerald-400">
                        {product.unitPriceSar.toFixed(2)}{' '}
                        <span className="text-[10px] font-normal text-slate-400">﷼</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {isAr ? 'شامل الضريبة 15%' : 'Incl. 15% VAT'}
                      </div>
                    </div>

                    <div className="text-end">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          product.stockQuantity > 10
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {product.stockQuantity} {product.uom}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredCatalog.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-500">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{isAr ? 'لا توجد أصناف مطابقة للبحث' : 'No matching products found'}</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE: DYNAMIC POS CART & TENDER BAR */}
        <div className="w-full lg:w-[420px] xl:w-[460px] flex flex-col bg-slate-900/95 shrink-0 select-none">
          {/* Cart Header (Customer & Held Tickets) */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-900">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300">
                <User className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{selectedCustomer.name}</div>
                <div className="text-[10px] text-slate-400">
                  {isAr ? 'فاتورة ضريبية مبسطة' : 'Simplified Tax Invoice'}
                </div>
              </div>
            </div>

            {/* Suspended Carts / Clear Actions */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setHeldCartsDrawerOpen(true)}
                className="relative px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 text-xs font-medium flex items-center gap-1 cursor-pointer"
                title={isAr ? 'السلات المعلقة' : 'Parked Carts'}
              >
                <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">{isAr ? 'المعلق' : 'Held'}</span>
                {heldCarts.length > 0 && (
                  <span className="ms-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px]">
                    {heldCarts.length}
                  </span>
                )}
              </button>

              {cartItems.length > 0 && (
                <>
                  <button
                    onClick={handleHoldCart}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-amber-400 border border-slate-700 cursor-pointer"
                    title={isAr ? 'تعليق السلة الحالية' : 'Park current cart'}
                  >
                    <PauseCircle className="w-4 h-4" />
                  </button>

                  <button
                    onClick={clearCart}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 cursor-pointer"
                    title={isAr ? 'إفراغ السلة' : 'Clear cart'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 p-2.5 overflow-y-auto space-y-1.5">
            {cartItems.map((item) => (
              <div
                key={item.itemId}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-850/80 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                <div className="flex-1 min-w-0 me-3">
                  <h4 className="text-xs font-bold text-white truncate">
                    {isAr ? item.nameAr : item.nameEn}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                    <span className="font-mono">{item.unitPriceSar.toFixed(2)} ﷼</span>
                    <span>×</span>
                    <span className="font-bold text-white">{item.quantity}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-[10px] text-emerald-400">ضريبة: {item.vatAmountSar.toFixed(2)}</span>
                  </div>
                </div>

                {/* Quantity Controls & Line Total */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center rounded-lg bg-slate-900 border border-slate-750 overflow-hidden">
                    <button
                      onClick={() => updateItemQty(item.itemId, -1)}
                      className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-6 text-center font-mono font-bold text-xs text-white">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateItemQty(item.itemId, 1)}
                      className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="w-20 text-end">
                    <div className="text-xs sm:text-sm font-mono font-bold text-emerald-400">
                      {item.totalSar.toFixed(2)}
                    </div>
                    <button
                      onClick={() => removeItem(item.itemId)}
                      className="text-[10px] text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      {isAr ? 'حذف' : 'Remove'}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {cartItems.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center py-12 text-slate-500 text-center">
                <ShoppingCart className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">{isAr ? 'السلة فارغة' : 'Cart is empty'}</p>
                <p className="text-xs text-slate-600 mt-1 max-w-[200px]">
                  {isAr ? 'انقر على الأصناف أو امسح الباركود للبدء' : 'Click items or scan barcode to add'}
                </p>
              </div>
            )}
          </div>

          {/* Cart Financial Breakdown & Payment Action Bar */}
          <div className="p-3 bg-slate-900 border-t border-slate-800 space-y-2">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>{isAr ? 'المجموع قبل الضريبة:' : 'Subtotal Excl. VAT:'}</span>
                <span className="font-mono text-slate-200">{cartSummary.subtotal.toFixed(2)} ﷼</span>
              </div>
              {cartSummary.discountTotal > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span>{isAr ? 'إجمالي الخصم:' : 'Discount Total:'}</span>
                  <span className="font-mono">-{cartSummary.discountTotal.toFixed(2)} ﷼</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>{isAr ? 'ضريبة القيمة المضافة (15%):' : 'VAT (15%):'}</span>
                <span className="font-mono text-slate-200">{cartSummary.vatTotal.toFixed(2)} ﷼</span>
              </div>
            </div>

            {/* Grand Total SAR Prominent Box */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  {isAr ? 'المبلغ المستحق (شامل الضريبة)' : 'Total Amount Due (Incl. VAT)'}
                </span>
                <span className="text-[10px] text-slate-500">
                  {cartSummary.itemCount} {isAr ? 'قطعة' : 'Items'}
                </span>
              </div>
              <div className="text-2xl font-black font-mono text-emerald-400">
                {cartSummary.grandTotal.toFixed(2)}{' '}
                <span className="text-xs font-semibold text-slate-400">﷼</span>
              </div>
            </div>

            {/* Quick Tender Buttons & Primary Checkout Action */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              <button
                disabled={cartItems.length === 0 || !activeShift}
                onClick={() => {
                  setPaymentSplits([{ tenderType: 'MADA', amountSar: cartSummary.grandTotal }]);
                  handleOpenCheckout();
                }}
                className="col-span-2 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-950/40 cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                <span>{isAr ? 'دفع مدى (Mada)' : 'Mada Fast Pay'}</span>
              </button>

              <button
                disabled={cartItems.length === 0 || !activeShift}
                onClick={() => {
                  setPaymentSplits([{ tenderType: 'CASH', amountSar: cartSummary.grandTotal }]);
                  handleOpenCheckout();
                }}
                className="col-span-2 py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 cursor-pointer"
              >
                <Banknote className="w-4 h-4" />
                <span>{isAr ? 'دفع نقدي (Cash)' : 'Cash Fast Pay'}</span>
              </button>

              <button
                disabled={cartItems.length === 0 || !activeShift}
                onClick={handleOpenCheckout}
                className="col-span-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>{isAr ? 'الدفع والمحاسبة (F12 / Split)' : 'Checkout & Split Pay (F12)'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. MODAL: SPLIT PAYMENTS & CHANGE DUE CALCULATOR */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  {isAr ? 'نافذة الدفع وتوزيع طرق السداد' : 'Payment & Split Tender Checkout'}
                </h3>
              </div>
              <button
                onClick={() => setCheckoutModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Required Banner */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400">{isAr ? 'المبلغ المطلوب سداده:' : 'Total Due:'}</span>
                <div className="text-2xl font-black font-mono text-white">
                  {cartSummary.grandTotal.toFixed(2)} <span className="text-xs text-slate-400">﷼</span>
                </div>
              </div>
              <div className="text-end">
                <span className="text-xs text-slate-400">{isAr ? 'المدفوع حالياً:' : 'Total Entered:'}</span>
                <div className="text-xl font-bold font-mono text-emerald-400">
                  {totalPaidInModal.toFixed(2)} <span className="text-xs text-slate-400">﷼</span>
                </div>
              </div>
            </div>

            {/* Change Due / Remaining Warning */}
            {changeDueInModal > 0 && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 flex items-center justify-between text-emerald-300">
                <span className="text-xs font-semibold">{isAr ? 'المتبقي للعميل (فكة):' : 'Change Due:'}</span>
                <span className="text-lg font-mono font-extrabold">{changeDueInModal.toFixed(2)} ﷼</span>
              </div>
            )}
            {remainingBalanceInModal > 0 && (
              <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-800 flex items-center justify-between text-amber-300">
                <span className="text-xs font-semibold">{isAr ? 'المتبقي لإتمام الفاتورة:' : 'Remaining Balance:'}</span>
                <span className="text-lg font-mono font-extrabold">{remainingBalanceInModal.toFixed(2)} ﷼</span>
              </div>
            )}

            {/* Tender Type Selection Pills */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-medium">{isAr ? 'طريقة السداد:' : 'Tender Method:'}</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[
                  { id: 'MADA', labelAr: 'مدى', labelEn: 'Mada', icon: CreditCard },
                  { id: 'CASH', labelAr: 'نقدي', labelEn: 'Cash', icon: Banknote },
                  { id: 'CREDIT_CARD', labelAr: 'فيزا/ماستر', labelEn: 'Visa/MC', icon: CreditCard },
                  { id: 'CUSTOMER_CREDIT', labelAr: 'آجل / حساب', labelEn: 'Credit Account', icon: User },
                  { id: 'GIFT_CARD', labelAr: 'قسيمة شراء', labelEn: 'Gift Card', icon: Tag },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveTenderType(t.id as PosTenderType);
                      setTenderAmountInput(remainingBalanceInModal > 0 ? remainingBalanceInModal.toString() : cartSummary.grandTotal.toString());
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                      activeTenderType === t.id
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                    }`}
                  >
                    <t.icon className="w-4 h-4" />
                    <span>{isAr ? t.labelAr : t.labelEn}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tender Amount Input & Quick Cash Chips */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={tenderAmountInput}
                  onChange={(e) => setTenderAmountInput(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-slate-950 text-white font-mono text-lg font-bold rounded-xl px-4 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => {
                    const amt = Number(tenderAmountInput);
                    if (amt > 0) {
                      handleAddOrUpdateTender(activeTenderType, amt);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 cursor-pointer"
                >
                  {isAr ? 'تأكيد المبلغ' : 'Apply Amount'}
                </button>
              </div>

              {/* Quick Cash Presets (50, 100, 200, 500 SAR) */}
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <span className="text-[11px] text-slate-500">{isAr ? 'أوراق نقدية:' : 'Bills:'}</span>
                {[50, 100, 200, 500].map((bill) => (
                  <button
                    key={bill}
                    onClick={() => {
                      setTenderAmountInput(bill.toString());
                      handleAddOrUpdateTender('CASH', bill);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-mono text-xs font-bold cursor-pointer"
                  >
                    {bill} ﷼
                  </button>
                ))}
                <button
                  onClick={() => {
                    setTenderAmountInput(cartSummary.grandTotal.toString());
                    handleAddOrUpdateTender(activeTenderType, cartSummary.grandTotal);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-bold cursor-pointer"
                >
                  {isAr ? 'المبلغ بالضبط' : 'Exact Amount'}
                </button>
              </div>
            </div>

            {/* Active Payment Splits List */}
            {paymentSplits.length > 0 && (
              <div className="space-y-1 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 font-medium">{isAr ? 'المدفوعات الموزعة:' : 'Applied Tenders:'}</span>
                {paymentSplits.map((split, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
                    <span className="text-slate-300 font-medium">
                      {split.tenderType}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white">{split.amountSar.toFixed(2)} ﷼</span>
                      <button
                        onClick={() => setPaymentSplits((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Checkout Confirmation Button */}
            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setCheckoutModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleCompletePayment}
                disabled={totalPaidInModal < cartSummary.grandTotal - 0.01}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold shadow-lg shadow-emerald-950/50 cursor-pointer flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>{isAr ? 'إتمام وطباعة الفاتورة' : 'Complete & Print Receipt'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL: THERMAL RECEIPT PREVIEW & PRINT (80mm ZATCA Compliant) */}
      {receiptModalOpen && lastCompletedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">{isAr ? 'إيصال فاتورة نقطة بيع' : 'POS Thermal Receipt'}</h3>
              </div>
              <button onClick={() => setReceiptModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Thermal Receipt (80mm Sized) */}
            <div
              id="pos-thermal-receipt"
              className="p-5 bg-white text-slate-900 rounded-xl font-mono text-xs shadow-inner space-y-3 print:p-0 print:m-0 print:w-[80mm]"
            >
              {/* Receipt Header */}
              <div className="text-center space-y-1 border-b border-dashed border-slate-300 pb-3">
                <h2 className="text-sm font-black text-slate-900">شركة تجربة السحابية للحلول البرمجية</h2>
                <p className="text-[11px] text-slate-600">Saudi Cloud ERP Platform</p>
                <p className="text-[10px] text-slate-500">الرقم الضريبي: 300000000000003</p>
                <div className="inline-block px-2 py-0.5 rounded bg-slate-100 font-bold text-[10px] text-slate-800 mt-1">
                  فاتورة ضريبية مبسطة (Simplified Tax Invoice)
                </div>
              </div>

              {/* Order Info */}
              <div className="space-y-1 text-[11px] text-slate-700 border-b border-dashed border-slate-300 pb-2">
                <div className="flex justify-between">
                  <span>رقم الفاتورة:</span>
                  <span className="font-bold">{lastCompletedOrder.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>التاريخ:</span>
                  <span>{new Date(lastCompletedOrder.createdAt).toLocaleString('ar-SA-u-nu-latn')}</span>
                </div>
                <div className="flex justify-between">
                  <span>الكاشير:</span>
                  <span>{lastCompletedOrder.cashierName}</span>
                </div>
                <div className="flex justify-between">
                  <span>العميل:</span>
                  <span>{lastCompletedOrder.customerName}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-1 border-b border-dashed border-slate-300 pb-2 text-[11px]">
                <div className="flex justify-between font-bold text-slate-900 border-b border-slate-200 pb-1">
                  <span>الصنف (Qty × Price)</span>
                  <span>الإجمالي</span>
                </div>
                {lastCompletedOrder.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-slate-800">
                    <div>
                      <div className="font-semibold">{item.nameAr}</div>
                      <div className="text-[10px] text-slate-500">
                        {item.quantity} {item.uom} × {item.unitPriceSar.toFixed(2)}
                      </div>
                    </div>
                    <div className="font-bold">{item.totalSar.toFixed(2)} ﷼</div>
                  </div>
                ))}
              </div>

              {/* Totals Breakdown */}
              <div className="space-y-1 text-[11px] border-b border-dashed border-slate-300 pb-2">
                <div className="flex justify-between text-slate-700">
                  <span>المجموع قبل الضريبة:</span>
                  <span>{lastCompletedOrder.subtotalSar.toFixed(2)} ﷼</span>
                </div>
                {lastCompletedOrder.discountTotalSar > 0 && (
                  <div className="flex justify-between text-slate-700">
                    <span>الخصم:</span>
                    <span>-{lastCompletedOrder.discountTotalSar.toFixed(2)} ﷼</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-700">
                  <span>ضريبة القيمة المضافة (15%):</span>
                  <span>{lastCompletedOrder.vatTotalSar.toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between font-black text-sm text-slate-950 pt-1 border-t border-slate-200">
                  <span>المجموع الكلي:</span>
                  <span>{lastCompletedOrder.grandTotalSar.toFixed(2)} ﷼</span>
                </div>
              </div>

              {/* Tender Breakdown */}
              <div className="space-y-1 text-[10px] text-slate-600 border-b border-dashed border-slate-300 pb-2">
                {lastCompletedOrder.payments.map((p, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>طريقة الدفع ({p.tenderType}):</span>
                    <span>{p.amountSar.toFixed(2)} ﷼</span>
                  </div>
                ))}
                {lastCompletedOrder.changeDueSar > 0 && (
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>المتبقي للعميل (فكة):</span>
                    <span>{lastCompletedOrder.changeDueSar.toFixed(2)} ﷼</span>
                  </div>
                )}
              </div>

              {/* ZATCA Phase 2 TLV QR Code */}
              <div className="pt-2 text-center flex flex-col items-center justify-center space-y-1.5">
                {lastCompletedOrder.zatcaQrCodeBase64 ? (
                  <img
                    src={lastCompletedOrder.zatcaQrCodeBase64}
                    alt="ZATCA TLV QR Code"
                    className="w-32 h-32 border border-slate-200 p-1 rounded"
                  />
                ) : (
                  <div className="w-32 h-32 bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">
                    ZATCA QR
                  </div>
                )}
                <p className="text-[9px] text-slate-500">متوافق مع متطلبات هيئة الزكاة والضريبة والجمارك (ZATCA)</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setReceiptModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
              <button
                onClick={handlePrintThermal}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                <Printer className="w-4 h-4" />
                <span>{isAr ? 'طباعة الإيصال (Print)' : 'Print Receipt'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: OPEN SHIFT */}
      {openShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleOpenShiftSubmit} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">{isAr ? 'فتح وردية كاشير جديدة' : 'Open Cashier Shift'}</h3>
              </div>
              <button type="button" onClick={() => setOpenShiftModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">{isAr ? 'اسم الكاشير:' : 'Cashier Name:'}</label>
                <input
                  type="text"
                  value={cashierNameInput}
                  onChange={(e) => setCashierNameInput(e.target.value)}
                  className="w-full bg-slate-950 text-white rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">{isAr ? 'العهدة النقدية الافتتاحية (Float SAR):' : 'Opening Float (SAR):'}</label>
                <input
                  type="number"
                  step="0.01"
                  value={openFloatInput}
                  onChange={(e) => setOpenFloatInput(e.target.value)}
                  className="w-full bg-slate-950 text-white font-mono font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  {isAr ? 'المبلغ النقدي المودع في درج الكاشير قبل بدء المبيعات' : 'Initial cash in drawer before sales'}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOpenShiftModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/40 cursor-pointer"
              >
                {isAr ? 'تأكيد وفتح الوردية' : 'Confirm & Open'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 6. MODAL: CASH MOVEMENT (IN / OUT) */}
      {cashMovementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleCashMovementSubmit} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">{isAr ? 'حركة نقدية (إيداع / سحب)' : 'Cash Movement (In / Out)'}</h3>
              </div>
              <button type="button" onClick={() => setCashMovementModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCashMovementType('CASH_IN')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    cashMovementType === 'CASH_IN'
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <ArrowDownRight className="w-4 h-4" />
                  <span>{isAr ? 'إيداع نقدي (Cash In)' : 'Cash In'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCashMovementType('CASH_OUT')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                    cashMovementType === 'CASH_OUT'
                      ? 'bg-rose-600 text-white border-rose-500'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>{isAr ? 'سحب نقدي (Cash Out)' : 'Cash Out'}</span>
                </button>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">{isAr ? 'المبلغ (SAR):' : 'Amount (SAR):'}</label>
                <input
                  type="number"
                  step="0.01"
                  value={cashMovementAmount}
                  onChange={(e) => setCashMovementAmount(e.target.value)}
                  className="w-full bg-slate-950 text-white font-mono font-bold rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">{isAr ? 'السبب / الملاحظات:' : 'Reason / Notes:'}</label>
                <input
                  type="text"
                  value={cashMovementReason}
                  onChange={(e) => setCashMovementReason(e.target.value)}
                  placeholder={cashMovementType === 'CASH_IN' ? 'إيداع فكة إضافية' : 'سحب نقدي للخزينة الرئيسية'}
                  className="w-full bg-slate-950 text-white rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCashMovementModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-950/40 cursor-pointer"
              >
                {isAr ? 'تسجيل الحركة' : 'Save Movement'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 7. MODAL: X-REPORT (Mid-Shift Reading) */}
      {xReportModalOpen && xReportData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">{isAr ? 'تقرير X الأوسط (قراءة الوردية الحالية)' : 'X-Report (Mid-Shift Reading)'}</h3>
              </div>
              <button onClick={() => setXReportModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl font-mono text-xs space-y-2 border border-slate-800">
              <div className="flex justify-between text-slate-400">
                <span>الجهاز / الوردية:</span>
                <span className="font-bold text-white">{xReportData.register.code} / {xReportData.shift.id.slice(0, 12)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>الكاشير:</span>
                <span className="text-slate-200">{xReportData.shift.cashierName}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>تاريخ الفتح:</span>
                <span className="text-slate-200">{new Date(xReportData.shift.openedAt).toLocaleTimeString('ar-SA-u-nu-latn')}</span>
              </div>
              <div className="h-px bg-slate-800 my-1" />

              <div className="flex justify-between text-slate-300">
                <span>العهدة الافتتاحية:</span>
                <span className="font-bold text-white">{xReportData.shift.openingFloatSar.toFixed(2)} ﷼</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-bold">
                <span>إجمالي المبيعات الصافية:</span>
                <span>{xReportData.shift.netSalesSar.toFixed(2)} ﷼</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>ضريبة القيمة المضافة 15%:</span>
                <span>{xReportData.shift.totalVatSar.toFixed(2)} ﷼</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>عدد العمليات المنجزة:</span>
                <span>{xReportData.shift.transactionCount} عملية</span>
              </div>

              <div className="h-px bg-slate-800 my-1" />
              <div className="text-[11px] font-bold text-slate-400">توزيع طرق السداد:</div>
              <div className="space-y-1 text-slate-300 text-[11px] ps-2">
                <div className="flex justify-between">
                  <span>- مبيعات نقدية (Cash):</span>
                  <span>{xReportData.shift.cashSalesSar.toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between">
                  <span>- شبكة مدى (Mada):</span>
                  <span>{xReportData.shift.madaSalesSar.toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between">
                  <span>- بطاقات ائتمان (Credit):</span>
                  <span>{xReportData.shift.creditCardSalesSar.toFixed(2)} ﷼</span>
                </div>
              </div>

              <div className="h-px bg-slate-800 my-1" />
              <div className="flex justify-between text-amber-400 font-extrabold text-sm">
                <span>النقد المتوقع بالدرج:</span>
                <span>{xReportData.shift.expectedCashSar.toFixed(2)} ﷼</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setXReportModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
              <button
                onClick={handlePrintThermal}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{isAr ? 'طباعة تقرير X' : 'Print X-Report'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: CLOSE SHIFT & Z-REPORT (Reconciliation) */}
      {closeShiftModalOpen && activeShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <form onSubmit={handleCloseShiftSubmit} className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-bold text-white">{isAr ? 'إغلاق الوردية وإصدار تقرير Z' : 'Close Shift & Z-Report'}</h3>
              </div>
              <button type="button" onClick={() => setCloseShiftModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>العهدة الافتتاحية:</span>
                  <span>{activeShift.openingFloatSar.toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>المبيعات النقدية:</span>
                  <span>+{activeShift.cashSalesSar.toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>إيداعات نقدية:</span>
                  <span>+{activeShift.totalCashInSar.toFixed(2)} ﷼</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>سحوبات نقدية:</span>
                  <span>-{activeShift.totalCashOutSar.toFixed(2)} ﷼</span>
                </div>
                <div className="h-px bg-slate-800 my-1" />
                <div className="flex justify-between text-amber-400 font-extrabold text-sm">
                  <span>النقد المحسوب والمتوقع:</span>
                  <span>{activeShift.expectedCashSar.toFixed(2)} ﷼</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isAr ? 'النقد الفعلي المعدود بالدرج (Actual Cash SAR):' : 'Actual Counted Cash in Drawer (SAR):'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={actualCashCountedInput}
                  onChange={(e) => setActualCashCountedInput(e.target.value)}
                  className="w-full bg-slate-950 text-white font-mono font-bold text-lg rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-rose-500"
                  required
                />
              </div>

              {/* Difference live indicator */}
              {actualCashCountedInput && (
                <div
                  className={`p-2.5 rounded-xl border flex items-center justify-between font-mono font-bold text-xs ${
                    Number(actualCashCountedInput) === activeShift.expectedCashSar
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                      : Number(actualCashCountedInput) < activeShift.expectedCashSar
                      ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                      : 'bg-amber-950/60 text-amber-300 border-amber-800'
                  }`}
                >
                  <span>{isAr ? 'فرق الصندوق (عجز / فائض):' : 'Cash Difference:'}</span>
                  <span>
                    {(Number(actualCashCountedInput) - activeShift.expectedCashSar).toFixed(2)} ﷼ (
                    {Number(actualCashCountedInput) === activeShift.expectedCashSar
                      ? isAr
                        ? 'متطابق'
                        : 'Balanced'
                      : Number(actualCashCountedInput) < activeShift.expectedCashSar
                      ? isAr
                        ? 'عجز'
                        : 'Shortage'
                      : isAr
                      ? 'فائض'
                      : 'Overage'}
                    )
                  </span>
                </div>
              )}

              {actualCashCountedInput && Number(actualCashCountedInput) !== activeShift.expectedCashSar && (
                <div>
                  <label className="block text-slate-400 mb-1">{isAr ? 'سبب الفرق / تبرير العجز أو الفائض:' : 'Discrepancy Justification:'}</label>
                  <input
                    type="text"
                    value={discrepancyReasonInput}
                    onChange={(e) => setDiscrepancyReasonInput(e.target.value)}
                    placeholder={isAr ? 'يرجى توضيح سبب الفرق في الصندوق' : 'Explain cash difference reason'}
                    className="w-full bg-slate-950 text-white rounded-xl px-3 py-2 border border-slate-700 focus:outline-none focus:border-rose-500"
                    required
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCloseShiftModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-950/40 cursor-pointer"
              >
                {isAr ? 'إغلاق وترحيل قيود الوردية' : 'Close Shift & Post Entries'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 9. DRAWER: HELD / SUSPENDED CARTS */}
      {heldCartsDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border-s border-slate-800 h-full flex flex-col p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <PauseCircle className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">{isAr ? 'السلات المعلقة (Parked Carts)' : 'Held / Suspended Carts'}</h3>
              </div>
              <button onClick={() => setHeldCartsDrawerOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5">
              {heldCarts.map((held) => (
                <div
                  key={held.id}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{held.customerName}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(held.heldAt).toLocaleTimeString('ar-SA-u-nu-latn')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {held.items.length} {isAr ? 'أصناف' : 'Items'}
                    </span>
                    <span className="font-mono font-bold text-emerald-400">{held.grandTotalSar.toFixed(2)} ﷼</span>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-850">
                    <button
                      onClick={(e) => handleDeleteHeldCart(held.id, e)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 text-xs cursor-pointer"
                    >
                      {isAr ? 'حذف' : 'Delete'}
                    </button>
                    <button
                      onClick={() => handleResumeHeldCart(held.id)}
                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>{isAr ? 'استرجاع السلة' : 'Resume'}</span>
                    </button>
                  </div>
                </div>
              ))}

              {heldCarts.length === 0 && (
                <div className="text-center py-16 text-slate-500">
                  <PauseCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{isAr ? 'لا توجد سلات معلقة حالياً' : 'No held carts currently'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
