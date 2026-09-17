import { describe, it, expect, beforeEach } from 'vitest';
import {
  centralStore,
  TenantScopedRepository,
  ConflictError,
  ValidationError,
  Item,
} from '../../server/core/tenantGuard.js';

describe('PHASE-03: Product Master, Multi-UOM, Barcode Identity & Multi-Warehouse', () => {
  let tenantId: string;
  let branchId: string;
  let adminRepo: TenantScopedRepository;
  let cashierRepo: TenantScopedRepository;

  beforeEach(() => {
    // Reset seed data
    centralStore.initDefaultSeed();

    // Find the seeded demo tenant
    const demoTenant = Array.from(centralStore.tenants.values())[0];
    tenantId = demoTenant.id;
    const branch = centralStore.branches.get(tenantId)![0];
    branchId = branch.id;

    // Admin repository (has all permissions)
    adminRepo = new TenantScopedRepository({
      userId: 'user-admin-01',
      tenantId,
      userEmail: 'admin@al-inma.sa',
      role: 'OWNER',
      roleCode: 'OWNER',
      permissions: ['*'],
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest Agent',
    });

    // Cashier repository (sales & pos, restricted from viewing inventory cost/WAC)
    cashierRepo = new TenantScopedRepository({
      userId: 'user-cashier-01',
      tenantId,
      userEmail: 'cashier@al-inma.sa',
      role: 'CASHIER',
      roleCode: 'CASHIER',
      permissions: ['pos:order:create', 'sales:invoice:create', 'inventory:product:view'],
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest Cashier Agent',
    });
  });

  // ====================================================
  // 1. PRODUCT MASTER & MULTI-UOM SPECIFICATIONS
  // ====================================================
  describe('Product Master & Multi-UOM Definition', () => {
    it('creates an item with multiple UOMs, correct conversion factors, and base unit', () => {
      const item = adminRepo.createItem({
        sku: 'TEST-BEV-001',
        primaryBarcode: '6281009990011',
        nameAr: 'عصير برتقال طبيعي ١ لتر',
        nameEn: 'Fresh Orange Juice 1L',
        baseUnit: 'حبة',
        sellingPrice: 12.0,
        cost: 8.0,
        units: [
          {
            nameAr: 'حبة',
            nameEn: 'Piece',
            conversionFactor: 1.0,
            barcode: '6281009990011',
            isBaseUnit: true,
            salePrice: 12.0,
            cost: 8.0,
          },
          {
            nameAr: 'كرتون (١٢ حبة)',
            nameEn: 'Carton (12 Pcs)',
            conversionFactor: 12.0,
            barcode: '6281009990012',
            isBaseUnit: false,
            salePrice: 130.0,
            cost: 96.0,
          },
        ],
      });

      expect(item.id).toBeDefined();
      expect(item.sku).toBe('TEST-BEV-001');
      expect(item.baseUnit).toBe('حبة');
      expect(item.units.length).toBe(2);

      const baseUom = item.units.find((u) => u.isBaseUnit);
      expect(baseUom).toBeDefined();
      expect(baseUom!.conversionFactor).toBe(1.0);

      const cartonUom = item.units.find((u) => !u.isBaseUnit);
      expect(cartonUom).toBeDefined();
      expect(cartonUom!.conversionFactor).toBe(12.0);
    });

    it('rejects creating an item without any units defined', () => {
      expect(() => {
        adminRepo.createItem({
          sku: 'INVALID-001',
          nameAr: 'منتج غير صالح',
          baseUnit: 'حبة',
          sellingPrice: 10,
          units: [],
        });
      }).toThrow(ValidationError);
    });
  });

  // ====================================================
  // 2. RULE I4: BARCODE IDENTITY SPECIFICATIONS
  // ====================================================
  describe('Rule I4: Barcode Identity & Item-Unit Tuple Resolution', () => {
    it('resolves a barcode strictly to the (Item, Unit) tuple with correct pricing and tax', () => {
      // Create an item with Piece and Carton
      adminRepo.createItem({
        sku: 'BARCODE-TEST-01',
        nameAr: 'مياه شرب معبأة ٣٣٠ مل',
        nameEn: 'Bottled Water 330ml',
        baseUnit: 'حبة',
        sellingPrice: 1.5,
        cost: 0.8,
        units: [
          {
            nameAr: 'حبة',
            conversionFactor: 1.0,
            barcode: '6289990001',
            isBaseUnit: true,
            salePrice: 1.5,
            cost: 0.8,
          },
          {
            nameAr: 'كرتون (٤٠ حبة)',
            conversionFactor: 40.0,
            barcode: '6289990002',
            isBaseUnit: false,
            salePrice: 50.0,
            cost: 32.0,
          },
        ],
      });

      // 1. Resolve Piece barcode
      const pieceResolution = adminRepo.resolveBarcode('6289990001');
      expect(pieceResolution).not.toBeNull();
      expect(pieceResolution!.item.sku).toBe('BARCODE-TEST-01');
      expect(pieceResolution!.unit.nameAr).toBe('حبة');
      expect(pieceResolution!.unit.conversionFactor).toBe(1.0);
      expect(pieceResolution!.salePrice).toBe(1.5);
      expect(pieceResolution!.vatAmount).toBe(0.23); // 1.5 * 15% = 0.225 -> 0.23

      // 2. Resolve Carton barcode
      const cartonResolution = adminRepo.resolveBarcode('6289990002');
      expect(cartonResolution).not.toBeNull();
      expect(cartonResolution!.item.sku).toBe('BARCODE-TEST-01');
      expect(cartonResolution!.unit.nameAr).toBe('كرتون (٤٠ حبة)');
      expect(cartonResolution!.unit.conversionFactor).toBe(40.0);
      expect(cartonResolution!.salePrice).toBe(50.0);
      expect(cartonResolution!.vatAmount).toBe(7.5); // 50 * 15% = 7.5
    });

    it('rejects duplicate barcodes across different items (Rule I4)', () => {
      // First item with barcode '6287770001'
      adminRepo.createItem({
        sku: 'ITEM-A',
        nameAr: 'المنتج الأول',
        baseUnit: 'حبة',
        sellingPrice: 20,
        units: [
          {
            nameAr: 'حبة',
            conversionFactor: 1.0,
            barcode: '6287770001',
            isBaseUnit: true,
            salePrice: 20,
          },
        ],
      });

      // Second item attempting to use the same barcode
      expect(() => {
        adminRepo.createItem({
          sku: 'ITEM-B',
          nameAr: 'المنتج الثاني',
          baseUnit: 'حبة',
          sellingPrice: 30,
          units: [
            {
              nameAr: 'حبة',
              conversionFactor: 1.0,
              barcode: '6287770001',
              isBaseUnit: true,
              salePrice: 30,
            },
          ],
        });
      }).toThrow(ConflictError);
    });

    it('rejects duplicate barcodes within the same item units list', () => {
      expect(() => {
        adminRepo.createItem({
          sku: 'ITEM-DUP-UNIT',
          nameAr: 'منتج مع باركود مكرر داخلياً',
          baseUnit: 'حبة',
          sellingPrice: 15,
          units: [
            {
              nameAr: 'حبة',
              conversionFactor: 1.0,
              barcode: '6288880001',
              isBaseUnit: true,
              salePrice: 15,
            },
            {
              nameAr: 'حزمة',
              conversionFactor: 6.0,
              barcode: '6288880001', // Same barcode!
              isBaseUnit: false,
              salePrice: 80,
            },
          ],
        });
      }).toThrow(ConflictError);
    });

    it('returns null when querying a non-existent barcode', () => {
      const nonExistent = adminRepo.resolveBarcode('999999999999999');
      expect(nonExistent).toBeNull();
    });
  });

  // ====================================================
  // 3. MULTI-WAREHOUSE & INVENTORY VALUATION
  // ====================================================
  describe('Multi-Warehouse Stock & Valuation', () => {
    it('initializes stock across multiple warehouses and calculates total stock summary', () => {
      const warehouses = adminRepo.getWarehouses();
      expect(warehouses.length).toBeGreaterThanOrEqual(2);

      const wh1 = warehouses[0];
      const wh2 = warehouses[1];

      const item = adminRepo.createItem({
        sku: 'MULTI-WH-01',
        nameAr: 'محول طاقة ذكي',
        nameEn: 'Smart Power Adapter',
        baseUnit: 'حبة',
        sellingPrice: 85.0,
        cost: 50.0,
        units: [
          {
            nameAr: 'حبة',
            conversionFactor: 1.0,
            barcode: '6285550001',
            isBaseUnit: true,
            salePrice: 85.0,
            cost: 50.0,
          },
        ],
        initialStockPerWarehouse: {
          [wh1.id]: 100,
          [wh2.id]: 25,
        },
      });

      // Total stock across warehouses should be 125
      expect(item.currentStock).toBe(125);

      // Verify stocks in wh1 and wh2
      const stocksWh1 = adminRepo.getWarehouseStocks(wh1.id, item.id);
      expect(stocksWh1.length).toBe(1);
      expect(stocksWh1[0].currentStockBaseQty).toBe(100);

      const stocksWh2 = adminRepo.getWarehouseStocks(wh2.id, item.id);
      expect(stocksWh2.length).toBe(1);
      expect(stocksWh2[0].currentStockBaseQty).toBe(25);

      // Stock summary check
      const summaries = adminRepo.getWarehouseStockSummary();
      const itemSummary = summaries.find((s) => s.itemId === item.id);
      expect(itemSummary).toBeDefined();
      expect(itemSummary!.totalStockBaseQty).toBe(125);
      expect(itemSummary!.totalValuationSar).toBe(125 * 50.0); // 6250 SAR
    });

    it('creates a new warehouse with bins and updates warehouse settings', () => {
      const newWh = adminRepo.createWarehouse({
        branchId,
        code: 'WH-DAMMAM',
        nameAr: 'مستودع فرع الدمام',
        nameEn: 'Dammam Branch Warehouse',
        address: 'المنطقة الشرقية، الدمام، حي الشاطئ',
        bins: [
          { code: 'D-A1-01', aisle: 'A1', shelf: '01' },
          { code: 'D-A1-02', aisle: 'A1', shelf: '02' },
        ],
      });

      expect(newWh.id).toBeDefined();
      expect(newWh.code).toBe('WH-DAMMAM');
      expect(newWh.bins.length).toBe(2);

      // Update warehouse
      const updated = adminRepo.updateWarehouse(newWh.id, {
        managerName: 'عبدالله الدوسري',
        contactPhone: '+966509998877',
      });
      expect(updated.managerName).toBe('عبدالله الدوسري');
      expect(updated.contactPhone).toBe('+966509998877');
    });
  });

  // ====================================================
  // 4. SECURITY & FINANCIAL SCRUBBING (RULE C)
  // ====================================================
  describe('Rule C: Server-Side Financial Field Scrubbing', () => {
    it('redacts cost and currentWac for cashiers without accounting permission', () => {
      // Cashier queries items
      const cashierItems = cashierRepo.getItems();
      expect(cashierItems.length).toBeGreaterThan(0);

      for (const item of cashierItems) {
        expect((item as unknown as Record<string, unknown>).cost).toBeUndefined();
        expect((item as unknown as Record<string, unknown>).currentWac).toBeUndefined();
        for (const unit of item.units) {
          expect((unit as unknown as Record<string, unknown>).cost).toBeUndefined();
        }
      }

      // Cashier queries stock summary: valuation should be scrubbed
      const cashierSummary = cashierRepo.getWarehouseStockSummary();
      for (const sum of cashierSummary) {
        expect((sum as unknown as Record<string, unknown>).totalValuationSar).toBeUndefined();
        expect((sum as unknown as Record<string, unknown>).currentWac).toBeUndefined();
      }

      // Admin queries items: cost and currentWac MUST be preserved
      const adminItems = adminRepo.getItems();
      const itemWithCost = adminItems.find((i) => i.cost > 0);
      expect(itemWithCost).toBeDefined();
      expect(itemWithCost!.cost).toBeGreaterThan(0);
      expect(itemWithCost!.currentWac).toBeGreaterThan(0);
    });

    it('redacts cost from barcode scan responses for cashiers', () => {
      const cashierScan = cashierRepo.resolveBarcode('628100100101'); // Seeded royal dates piece
      expect(cashierScan).not.toBeNull();
      expect((cashierScan!.item as unknown as Record<string, unknown>).cost).toBeUndefined();
      expect((cashierScan!.item as unknown as Record<string, unknown>).currentWac).toBeUndefined();
      expect((cashierScan!.unit as unknown as Record<string, unknown>).cost).toBeUndefined();
      // But retail sale price and tax must be present for checkout!
      expect(cashierScan!.salePrice).toBe(35.0);
      expect(cashierScan!.vatAmount).toBeGreaterThan(0);
      expect(cashierScan!.salePriceInclusive).toBeGreaterThan(cashierScan!.salePrice);
    });
  });

  // ====================================================
  // 5. CATEGORIES & BRANDS WITH SAUDI VAT (15%)
  // ====================================================
  describe('Categories & Brands Hierarchy', () => {
    it('creates an item category with default 15% VAT and links to accounts', () => {
      const cat = adminRepo.createItemCategory({
        code: 'CAT-PERIPHERALS',
        nameAr: 'ملحقات الحاسوب والإلكترونيات',
        nameEn: 'Computer Peripherals',
        defaultTaxRate: 15,
      });

      expect(cat.id).toBeDefined();
      expect(cat.code).toBe('CAT-PERIPHERALS');
      expect(cat.defaultTaxRate).toBe(15);
      expect(cat.isActive).toBe(true);
    });

    it('creates an item brand with country of origin', () => {
      const brand = adminRepo.createItemBrand({
        code: 'BRD-LOGITECH',
        nameAr: 'لوجيتك',
        nameEn: 'Logitech',
        countryOfOrigin: 'Switzerland',
      });

      expect(brand.id).toBeDefined();
      expect(brand.nameAr).toBe('لوجيتك');
      expect(brand.countryOfOrigin).toBe('Switzerland');
    });
  });
});
