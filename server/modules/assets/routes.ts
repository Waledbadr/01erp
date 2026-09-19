import { Router, Request, Response } from 'express';
import { requireAuth } from '../../core/authMiddleware.js';
import {
  getAssetCategoriesService,
  createAssetCategoryService,
  getFixedAssetsService,
  getFixedAssetByIdService,
  registerFixedAssetService,
  previewMonthlyDepreciationService,
  executeMonthlyDepreciationService,
  getDepreciationHistoryService,
  disposeFixedAssetService,
  getCostCentersService,
  createCostCenterService,
  updateCostCenterService,
  deleteCostCenterService,
  getCostCenterProfitLossReportService,
} from './assetService.js';

export const assetsRouter = Router();

// Module status & engine specs
assetsRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    module: 'fixed_assets_and_cost_centers',
    version: '1.0.0',
    phase: 'PHASE-10',
    depreciationMethod: 'STRAIGHT_LINE',
    fixedPointMath: 'EXACT_HALALAS',
    idempotentMonthlyRuns: true,
    supportedDisposals: ['SALE', 'SCRAP'],
    costCenterAnalytics: true,
  });
});

// ==========================================
// 1. ASSET CATEGORIES
// ==========================================
assetsRouter.get('/categories', requireAuth, (req: Request, res: Response) => {
  try {
    const categories = getAssetCategoriesService(req.tenantRepo!.tenantId, req.tenantContext!.userId);
    return res.json({ categories });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل جلب تصنيفات الأصول';
    return res.status(500).json({ error: message });
  }
});

assetsRouter.post('/categories', requireAuth, (req: Request, res: Response) => {
  try {
    const category = createAssetCategoryService(req.tenantRepo!.tenantId, req.body, req.tenantContext!.userId);
    return res.status(201).json({ category });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل إنشاء تصنيف الأصل';
    return res.status(400).json({ error: message });
  }
});

// ==========================================
// 2. FIXED ASSETS REGISTER
// ==========================================
assetsRouter.get('/register', requireAuth, (req: Request, res: Response) => {
  try {
    const { status, categoryId, costCenterId, branchId, search } = req.query;
    const assets = getFixedAssetsService(req.tenantRepo!.tenantId, req.tenantContext!.userId, {
      status: status as string,
      categoryId: categoryId as string,
      costCenterId: costCenterId as string,
      branchId: branchId as string,
      search: search as string,
    });
    return res.json({ assets });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل جلب سجل الأصول الثابتة';
    return res.status(500).json({ error: message });
  }
});

assetsRouter.get('/register/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const details = getFixedAssetByIdService(req.tenantRepo!.tenantId, req.params.id, req.tenantContext!.userId);
    if (!details) {
      return res.status(404).json({ error: 'الأصل الثابت غير موجود' });
    }
    return res.json(details);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل جلب تفاصيل الأصل الثابت';
    return res.status(500).json({ error: message });
  }
});

assetsRouter.post('/register', requireAuth, async (req: Request, res: Response) => {
  try {
    const asset = await registerFixedAssetService(
      req.tenantRepo!,
      req.body,
      req.tenantContext!.userId,
      req.tenantContext!.userEmail
    );
    return res.status(201).json({ asset });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل تسجيل وحيازة الأصل الثابت';
    return res.status(400).json({ error: message });
  }
});

// ==========================================
// 3. ASSET DISPOSAL (SALE / SCRAP)
// ==========================================
assetsRouter.post('/register/:id/dispose', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await disposeFixedAssetService(
      req.tenantRepo!,
      req.params.id,
      req.body,
      req.tenantContext!.userId,
      req.tenantContext!.userEmail
    );
    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل استبعاد وتصفية الأصل الثابت';
    return res.status(400).json({ error: message });
  }
});

// ==========================================
// 4. MONTHLY DEPRECIATION RUNS
// ==========================================
assetsRouter.get('/depreciation/preview', requireAuth, (req: Request, res: Response) => {
  try {
    const periodKey = (req.query.periodKey as string) || new Date().toISOString().slice(0, 7);
    const preview = previewMonthlyDepreciationService(req.tenantRepo!.tenantId, periodKey, req.tenantContext!.userId);
    return res.json(preview);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل إعداد معاينة الإهلاك الشهري';
    return res.status(500).json({ error: message });
  }
});

assetsRouter.post('/depreciation/run', requireAuth, async (req: Request, res: Response) => {
  try {
    const { periodKey } = req.body;
    if (!periodKey || !/^\d{4}-\d{2}$/.test(periodKey)) {
      return res.status(400).json({ error: 'صيغة الفترة المحاسبية غير صحيحة، يجب أن تكون YYYY-MM' });
    }

    const result = await executeMonthlyDepreciationService(
      req.tenantRepo!,
      periodKey,
      req.tenantContext!.userId,
      req.tenantContext!.userEmail
    );
    return res.status(201).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل تشغيل الإهلاك الشهري';
    return res.status(400).json({ error: message });
  }
});

assetsRouter.get('/depreciation/history', requireAuth, (req: Request, res: Response) => {
  try {
    const history = getDepreciationHistoryService(req.tenantRepo!.tenantId, req.tenantContext!.userId);
    return res.json({ history });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل جلب سجل عمليات الإهلاك';
    return res.status(500).json({ error: message });
  }
});

// ==========================================
// 5. COST CENTERS CRUD
// ==========================================
assetsRouter.get('/cost-centers', requireAuth, (req: Request, res: Response) => {
  try {
    const costCenters = getCostCentersService(req.tenantRepo!.tenantId, req.tenantContext!.userId);
    return res.json({ costCenters });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل جلب مراكز التكلفة';
    return res.status(500).json({ error: message });
  }
});

assetsRouter.post('/cost-centers', requireAuth, (req: Request, res: Response) => {
  try {
    const costCenter = createCostCenterService(
      req.tenantRepo!.tenantId,
      req.body,
      req.tenantContext!.userId,
      req.tenantContext!.userEmail
    );
    return res.status(201).json({ costCenter });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل إنشاء مركز التكلفة';
    return res.status(400).json({ error: message });
  }
});

assetsRouter.put('/cost-centers/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const costCenter = updateCostCenterService(req.tenantRepo!.tenantId, req.params.id, req.body);
    return res.json({ costCenter });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل تعديل مركز التكلفة';
    return res.status(400).json({ error: message });
  }
});

assetsRouter.delete('/cost-centers/:id', requireAuth, (req: Request, res: Response) => {
  try {
    deleteCostCenterService(req.tenantRepo!.tenantId, req.params.id);
    return res.json({ success: true, message: 'تم حذف مركز التكلفة بنجاح' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل حذف مركز التكلفة';
    return res.status(400).json({ error: message });
  }
});

// ==========================================
// 6. COST CENTER P&L REPORT
// ==========================================
assetsRouter.get('/reports/cost-center-pl', requireAuth, (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const report = getCostCenterProfitLossReportService(req.tenantRepo!.tenantId, {
      startDate: startDate as string,
      endDate: endDate as string,
    });
    return res.json({ report });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'فشل استخراج تقرير الأرباح والخسائر لمراكز التكلفة';
    return res.status(500).json({ error: message });
  }
});
