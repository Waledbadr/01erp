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

// Fast Item Search (Barcode, SKU, Name) with sub-300ms SLA
inventoryRouter.get('/items/search', requireAuth, (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const categoryId = req.query.categoryId as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const items = req.tenantRepo!.searchItems(query, { categoryId, limit });
    return res.json({ items, count: items.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to search items';
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
inventoryRouter.get('/barcode/resolve', requireAuth, (req: Request, res: Response) => {
  try {
    const barcode = (req.query.barcode as string) || '';
    if (!barcode) {
      return res.status(400).json({ error: 'barcode query parameter is required' });
    }
    const result = req.tenantRepo!.resolveBarcode(barcode);
    if (!result) {
      return res.status(404).json({ error: `Barcode "${barcode}" not found in inventory catalog` });
    }
    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Barcode resolution failed';
    return res.status(500).json({ error: message });
  }
});

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
    return res.json({ summary, summaries: summary, count: summary.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate stock summary';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.get('/stocks/summary', requireAuth, (req: Request, res: Response) => {
  try {
    const summary = req.tenantRepo!.getWarehouseStockSummary();
    return res.json({ summary, summaries: summary, count: summary.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate stock summary';
    return res.status(500).json({ error: message });
  }
});

// ==========================================
// 7. PRICE AUDIT HISTORY
// ==========================================
inventoryRouter.get('/items/:id/price-history', requireAuth, (req: Request, res: Response) => {
  try {
    const history = req.tenantRepo!.getItemPriceHistory(req.params.id);
    return res.json({ history, count: history.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch price history';
    return res.status(500).json({ error: message });
  }
});

// ==========================================
// 8. GLOBAL UNITS CATALOG (PCE, BOX, CTN...)
// ==========================================
inventoryRouter.get('/units/catalog', requireAuth, (req: Request, res: Response) => {
  try {
    const units = req.tenantRepo!.getUnitsCatalog();
    return res.json({ units, count: units.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch units catalog';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/units/catalog', requireAuth, (req: Request, res: Response) => {
  try {
    const { code, nameAr, nameEn, symbolAr, symbolEn, category } = req.body;
    if (!code || !nameAr) {
      return res.status(400).json({ error: 'code and nameAr are required' });
    }
    const unit = req.tenantRepo!.createGlobalUnit({
      code,
      nameAr,
      nameEn,
      symbolAr,
      symbolEn,
      category,
    });
    return res.status(201).json({ unit });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create unit';
    const status = message.includes('already exists') ? 409 : 400;
    return res.status(status).json({ error: message });
  }
});

inventoryRouter.patch('/units/catalog/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const unit = req.tenantRepo!.updateGlobalUnit(req.params.id, req.body);
    return res.json({ unit });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update unit';
    const status = message.includes('not found') ? 404 : message.includes('already exists') ? 409 : 400;
    return res.status(status).json({ error: message });
  }
});

// ==========================================
// 9. CUSTOMER PRICING RULES & PROMOTIONS
// ==========================================
inventoryRouter.get('/pricing-rules', requireAuth, (req: Request, res: Response) => {
  try {
    const { customerId, itemId } = req.query;
    const rules = req.tenantRepo!.getCustomerPriceRules(customerId as string, itemId as string);
    return res.json({ rules, count: rules.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch pricing rules';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/pricing-rules', requireAuth, (req: Request, res: Response) => {
  try {
    const { customerId, itemId, unitId, unitPrice, discountPercentage, minQuantity, startDate, endDate } = req.body;
    if (!customerId || !itemId || unitPrice === undefined) {
      return res.status(400).json({ error: 'customerId, itemId, and unitPrice are required' });
    }
    const rule = req.tenantRepo!.createCustomerPriceRule({
      customerId,
      itemId,
      unitId,
      unitPrice: Number(unitPrice),
      discountPercentage,
      minQuantity,
      startDate,
      endDate,
    });
    return res.status(201).json({ rule });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create pricing rule';
    const status = message.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});

inventoryRouter.patch('/pricing-rules/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const rule = req.tenantRepo!.updateCustomerPriceRule(req.params.id, req.body);
    return res.json({ rule });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update pricing rule';
    const status = message.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});

inventoryRouter.delete('/pricing-rules/:id', requireAuth, (req: Request, res: Response) => {
  try {
    req.tenantRepo!.deleteCustomerPriceRule(req.params.id);
    return res.json({ success: true, message: 'Pricing rule deleted successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete pricing rule';
    const status = message.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});

// ==========================================
// 10. MULTI-TIER PRICING RESOLUTION ENGINE
// ==========================================
inventoryRouter.post('/pricing/resolve', requireAuth, (req: Request, res: Response) => {
  try {
    const { customerId, customerGroup, priceList, itemId, unitId, quantity, manualOverridePrice } = req.body;
    if (!itemId) {
      return res.status(400).json({ error: 'itemId is required' });
    }

    const resolution = req.tenantRepo!.resolveItemPrice({
      customerId,
      customerGroup,
      priceList,
      itemId,
      unitId,
      quantity: quantity ? Number(quantity) : 1,
      manualOverridePrice: manualOverridePrice !== undefined ? Number(manualOverridePrice) : undefined,
    });

    return res.json(resolution);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to resolve price';
    const status = message.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});

inventoryRouter.get('/pricing/resolve', requireAuth, (req: Request, res: Response) => {
  try {
    const { customerId, customerGroup, priceList, itemId, unitId, quantity, manualOverridePrice } = req.query;
    if (!itemId) {
      return res.status(400).json({ error: 'itemId query param is required' });
    }

    const resolution = req.tenantRepo!.resolveItemPrice({
      customerId: customerId as string,
      customerGroup: customerGroup as string,
      priceList: priceList as string,
      itemId: itemId as string,
      unitId: unitId as string,
      quantity: quantity ? Number(quantity) : 1,
      manualOverridePrice: manualOverridePrice !== undefined ? Number(manualOverridePrice) : undefined,
    });

    return res.json(resolution);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to resolve price';
    const status = message.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});

// =========================================================================
// PHASE 05: STOCK LEDGER, MOVEMENTS, TRANSFERS, ADJUSTMENTS & LANDED COST
// =========================================================================

// 1. Stock Movements Ledger (Append-Only)
inventoryRouter.get('/movements', requireAuth, (req: Request, res: Response) => {
  try {
    const { itemId, warehouseId, movementType, sourceType, sourceId, startDate, endDate, limit } = req.query;
    const movements = req.tenantRepo!.getStockMovements({
      itemId: itemId as string,
      warehouseId: warehouseId as string,
      movementType: movementType as string,
      sourceType: sourceType as string,
      sourceId: sourceId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      limit: limit ? Number(limit) : undefined,
    });
    return res.json({ movements });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch movements';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/movements', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      warehouseId,
      itemId,
      movementType,
      quantityDelta,
      unitCost,
      sourceType,
      sourceId,
      sourceDocumentNumber,
      journalId,
      reason,
      notes,
      batchNumber,
      serialNumber,
      allowNegativeOverride,
      movementDate,
    } = req.body;

    const movement = await req.tenantRepo!.recordStockMovement({
      warehouseId,
      itemId,
      movementType,
      quantityDelta: Number(quantityDelta),
      unitCost: Number(unitCost),
      sourceType,
      sourceId,
      sourceDocumentNumber,
      journalId,
      reason,
      notes,
      batchNumber,
      serialNumber,
      allowNegativeOverride: Boolean(allowNegativeOverride),
      movementDate,
    });

    return res.status(201).json({ movement });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record movement';
    const status = message.includes('Forbidden') ? 403 : message.includes('not found') ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});

// As-of Date Point-in-time Snapshot
inventoryRouter.get('/movements/as-of', requireAuth, (req: Request, res: Response) => {
  try {
    const { asOfDate, itemId, warehouseId } = req.query;
    if (!asOfDate) {
      return res.status(400).json({ error: 'asOfDate query param is required' });
    }

    const snapshot = req.tenantRepo!.getStockAsOfDate(
      asOfDate as string,
      itemId as string | undefined,
      warehouseId as string | undefined
    );
    return res.json({ snapshot });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to calculate snapshot';
    return res.status(500).json({ error: message });
  }
});

// 2. Opening Stock Wizard
inventoryRouter.post('/opening-stock', requireAuth, async (req: Request, res: Response) => {
  try {
    const { entryDate, descriptionAr, items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const result = await req.tenantRepo!.createOpeningStockBatch({
      entryDate,
      descriptionAr,
      items,
    });
    return res.status(201).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to post opening stock';
    return res.status(400).json({ error: message });
  }
});

// 3. Stock Transfers
inventoryRouter.get('/transfers', requireAuth, (req: Request, res: Response) => {
  try {
    const transfers = req.tenantRepo!.getStockTransfers();
    return res.json({ transfers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch transfers';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/transfers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { fromWarehouseId, toWarehouseId, transferDate, notes, lines } = req.body;
    const transfer = await req.tenantRepo!.createStockTransfer({
      fromWarehouseId,
      toWarehouseId,
      transferDate,
      notes,
      lines,
    });
    return res.status(201).json({ transfer });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create transfer';
    return res.status(400).json({ error: message });
  }
});

// 4. Stock Adjustments
inventoryRouter.get('/adjustments', requireAuth, (req: Request, res: Response) => {
  try {
    const adjustments = req.tenantRepo!.getStockAdjustments();
    return res.json({ adjustments });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch adjustments';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/adjustments', requireAuth, async (req: Request, res: Response) => {
  try {
    const { warehouseId, adjustmentDate, reasonCode, description, lines } = req.body;
    const adjustment = await req.tenantRepo!.createStockAdjustment({
      warehouseId,
      adjustmentDate,
      reasonCode,
      description,
      lines,
    });
    return res.status(201).json({ adjustment });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create adjustment';
    return res.status(400).json({ error: message });
  }
});

// 5. Stocktake
inventoryRouter.get('/stocktakes', requireAuth, (req: Request, res: Response) => {
  try {
    const stocktakes = req.tenantRepo!.getStocktakes();
    return res.json({ stocktakes });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch stocktakes';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/stocktakes', requireAuth, (req: Request, res: Response) => {
  try {
    const { warehouseId, scopeType, categoryId, itemIds, snapshotDate } = req.body;
    const stocktake = req.tenantRepo!.createStocktake({
      warehouseId,
      scopeType,
      categoryId,
      itemIds,
      snapshotDate,
    });
    return res.status(201).json({ stocktake });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create stocktake';
    return res.status(400).json({ error: message });
  }
});

inventoryRouter.post('/stocktakes/:id/counts', requireAuth, (req: Request, res: Response) => {
  try {
    const { counts } = req.body;
    const stocktake = req.tenantRepo!.enterStocktakeCounts(req.params.id, counts);
    return res.json({ stocktake });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to enter counts';
    return res.status(400).json({ error: message });
  }
});

inventoryRouter.post('/stocktakes/:id/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const stocktake = await req.tenantRepo!.approveStocktake(req.params.id);
    return res.json({ stocktake });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to approve stocktake';
    return res.status(400).json({ error: message });
  }
});

// 6. Landed Cost Documents
inventoryRouter.get('/landed-cost', requireAuth, (req: Request, res: Response) => {
  try {
    const documents = req.tenantRepo!.getLandedCostDocuments();
    return res.json({ documents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch landed cost documents';
    return res.status(500).json({ error: message });
  }
});

inventoryRouter.post('/landed-cost', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sourceBillId, sourceBillNumber, allocationMethod, costLines, items } = req.body;
    const document = await req.tenantRepo!.createLandedCostDocument({
      sourceBillId,
      sourceBillNumber,
      allocationMethod,
      costLines,
      items,
    });
    return res.status(201).json({ document });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create landed cost document';
    return res.status(400).json({ error: message });
  }
});

// 7. Low Stock & Reorder Alerts
inventoryRouter.get('/low-stock-alerts', requireAuth, (req: Request, res: Response) => {
  try {
    const alerts = req.tenantRepo!.getLowStockAlerts();
    return res.json({ alerts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch low stock alerts';
    return res.status(500).json({ error: message });
  }
});


