import { Router, Request, Response } from 'express';
import { requireAuth } from '../../core/authMiddleware.js';

export const inventoryRouter = Router();

// Module status & engine specs
inventoryRouter.get('/status', (req: Request, res: Response) => {
  res.json({
    module: 'inventory',
    version: '2.0.0',
    phase: 'PHASE-03',
    valuationMethod: 'PERPETUAL_WAC', // Rule I2
    baseUnitStorage: true, // Rule I3
    barcodeLevel: 'ITEM_UNIT_PAIR', // Rule I4
    negativeStockAllowed: false, // Rule I6
    multiWarehouse: true,
    features: [
      'product_master',
      'multi_uom',
      'barcode_identity',
      'warehouse_management',
      'bin_locations',
      'perpetual_wac_valuation',
      'stock_summary',
    ],
  });
});

// Financial preview endpoint demonstrating server-side cost/margin scrubbing (Rule C)
inventoryRouter.get('/items/financial-preview', requireAuth, (req: Request, res: Response) => {
  const rawItem = {
    id: 'item-preview-101',
    sku: 'SKU-SAMPLE-101',
    nameAr: 'حاسوب محمول مكتبي عالي الأداء',
    nameEn: 'Enterprise Laptop Workstation',
    sellingPrice: 4500.0,
    cost: 3200.0,
    unitCost: 3200.0,
    margin: 1300.0,
    profit: 1300.0,
    marginPercentage: 28.89,
    currency: 'SAR',
    inStock: 15,
  };

  const scrubbed = req.tenantRepo!.scrub(rawItem);
  return res.json({ item: scrubbed });
});

// ==========================================
// 1. WAREHOUSE MANAGEMENT
// ==========================================
inventoryRouter.get('/warehouses', requireAuth, (req: Request, res: Response) => {
  try {
    const warehouses = req.tenantRepo!.getWarehouses();
    return res.json({ warehouses });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch warehouses';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.get('/warehouses/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const warehouse = req.tenantRepo!.getWarehouseById(req.params.id);
    if (!warehouse) {
      return res.status(404).json({ error: 'Warehouse not found' });
    }
    return res.json({ warehouse });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch warehouse';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/warehouses', requireAuth, (req: Request, res: Response) => {
  try {
    const { branchId, code, nameAr, nameEn, address, managerName, contactPhone, isDefault, bins } = req.body;
    if (!branchId || !code || !nameAr) {
      return res.status(400).json({ error: 'branchId, code, and nameAr are required' });
    }
    const warehouse = req.tenantRepo!.createWarehouse({
      branchId,
      code,
      nameAr,
      nameEn,
      address,
      managerName,
      contactPhone,
      isDefault,
      bins,
    });
    return res.status(201).json({ warehouse });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create warehouse';
    const status = message.includes('already exists') ? 409 : 400;
    return res.status(status).json({ error: message });
  }
});

inventoryRouter.put('/warehouses/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const warehouse = req.tenantRepo!.updateWarehouse(req.params.id, req.body);
    return res.json({ warehouse });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update warehouse';
    const status = message.includes('not found') ? 404 : message.includes('already exists') ? 409 : 400;
    return res.status(status).json({ error: message });
  }
});

// ==========================================
// 2. ITEM CATEGORIES
// ==========================================
inventoryRouter.get('/categories', requireAuth, (req: Request, res: Response) => {
  try {
    const categories = req.tenantRepo!.getItemCategories();
    return res.json({ categories });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch categories';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/categories', requireAuth, (req: Request, res: Response) => {
  try {
    const { code, nameAr, nameEn, parentId, defaultTaxRate, defaultSalesAccountId, defaultCogsAccountId, defaultInventoryAccountId } = req.body;
    if (!code || !nameAr) {
      return res.status(400).json({ error: 'code and nameAr are required' });
    }
    const category = req.tenantRepo!.createItemCategory({
      code,
      nameAr,
      nameEn,
      parentId,
      defaultTaxRate,
      defaultSalesAccountId,
      defaultCogsAccountId,
      defaultInventoryAccountId,
    });
    return res.status(201).json({ category });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create category';
    const status = message.includes('already exists') ? 409 : 400;
    return res.status(status).json({ error: message });
  }
});

inventoryRouter.put('/categories/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const category = req.tenantRepo!.updateItemCategory(req.params.id, req.body);
    return res.json({ category });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update category';
    const status = message.includes('not found') ? 404 : message.includes('already exists') ? 409 : 400;
    return res.status(status).json({ error: message });
  }
});

// ==========================================
// 3. ITEM BRANDS
// ==========================================
inventoryRouter.get('/brands', requireAuth, (req: Request, res: Response) => {
  try {
    const brands = req.tenantRepo!.getItemBrands();
    return res.json({ brands });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch brands';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/brands', requireAuth, (req: Request, res: Response) => {
  try {
    const { code, nameAr, nameEn, countryOfOrigin } = req.body;
    if (!nameAr) {
      return res.status(400).json({ error: 'nameAr is required' });
    }
    const brand = req.tenantRepo!.createItemBrand({
      code,
      nameAr,
      nameEn,
      countryOfOrigin,
    });
    return res.status(201).json({ brand });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create brand';
    return res.status(400).json({ error: message });
  }
});

// ==========================================
// 4. PRODUCT MASTER (ITEMS)
// ==========================================
inventoryRouter.get('/items', requireAuth, (req: Request, res: Response) => {
  try {
    const { categoryId, type, search, inStockOnly, isActive } = req.query;
    const items = req.tenantRepo!.getItems({
      categoryId: categoryId as string,
      type: type as string,
      search: search as string,
      inStockOnly: inStockOnly === 'true',
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
    return res.json({ items, count: items.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch items';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.get('/items/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const item = req.tenantRepo!.getItemById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    return res.json({ item });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch item';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/items', requireAuth, (req: Request, res: Response) => {
  try {
    const {
      sku,
      primaryBarcode,
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      type,
      categoryId,
      brandId,
      baseUnit,
      units,
      taxRate,
      taxExemptionReasonCode,
      isVatInclusive,
      sellingPrice,
      wholesalePrice,
      cost,
      trackBatches,
      trackSerialNumbers,
      trackExpiry,
      minStockLevel,
      maxStockLevel,
      reorderPoint,
      reorderQuantity,
      salesAccountId,
      cogsAccountId,
      inventoryAccountId,
      initialStockPerWarehouse,
    } = req.body;

    if (!nameAr || !baseUnit || sellingPrice === undefined) {
      return res.status(400).json({ error: 'nameAr, baseUnit, and sellingPrice are required' });
    }

    const item = req.tenantRepo!.createItem({
      sku,
      primaryBarcode,
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      type,
      categoryId,
      brandId,
      baseUnit,
      units: units || [
        {
          nameAr: baseUnit,
          conversionFactor: 1.0,
          barcode: primaryBarcode || `${sku || 'ITEM'}-1`,
          isBaseUnit: true,
          salePrice: sellingPrice,
          cost: cost || 0,
        },
      ],
      taxRate,
      taxExemptionReasonCode,
      isVatInclusive,
      sellingPrice,
      wholesalePrice,
      cost,
      trackBatches,
      trackSerialNumbers,
      trackExpiry,
      minStockLevel,
      maxStockLevel,
      reorderPoint,
      reorderQuantity,
      salesAccountId,
      cogsAccountId,
      inventoryAccountId,
      initialStockPerWarehouse,
    });

    return res.status(201).json({ item });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create item';
    const status = message.includes('already exists') || message.includes('violation') || message.includes('taken')
      ? 409
      : 400;
    return res.status(status).json({ error: message });
  }
});

inventoryRouter.put('/items/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const item = req.tenantRepo!.updateItem(req.params.id, req.body);
    return res.json({ item });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update item';
    const status = message.includes('not found') ? 404 : message.includes('already exists') || message.includes('taken') ? 409 : 400;
    return res.status(status).json({ error: message });
  }
});

// ==========================================
// 5. BARCODE RESOLUTION (Rule I4)
// ==========================================
inventoryRouter.get('/barcode/:barcode', requireAuth, (req: Request, res: Response) => {
  try {
    const result = req.tenantRepo!.resolveBarcode(req.params.barcode);
    if (!result) {
      return res.status(404).json({ error: `Barcode "${req.params.barcode}" not found in inventory catalog` });
    }
    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Barcode resolution failed';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/barcode/lookup', requireAuth, (req: Request, res: Response) => {
  try {
    const { barcode } = req.body;
    if (!barcode) {
      return res.status(400).json({ error: 'barcode is required in request body' });
    }
    const result = req.tenantRepo!.resolveBarcode(barcode);
    if (!result) {
      return res.status(404).json({ error: `Barcode "${barcode}" not found in inventory catalog` });
    }
    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Barcode lookup failed';
    return res.status(500).json({ error: message });
  }
});

// ==========================================
// 6. MULTI-WAREHOUSE STOCKS & SUMMARY
// ==========================================
inventoryRouter.get('/stocks', requireAuth, (req: Request, res: Response) => {
  try {
    const { warehouseId, itemId } = req.query;
    const stocks = req.tenantRepo!.getWarehouseStocks(warehouseId as string, itemId as string);
    return res.json({ stocks, count: stocks.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch warehouse stocks';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.get('/stock-summary', requireAuth, (req: Request, res: Response) => {
  try {
    const summary = req.tenantRepo!.getWarehouseStockSummary();
    return res.json({ summary, count: summary.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate stock summary';
    return res.status(500).json({ error: message });
  }
});

