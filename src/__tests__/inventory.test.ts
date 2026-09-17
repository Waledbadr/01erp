import { describe, it, expect } from 'vitest';
import { calculateWAC, resolveBarcode, allocateLandedCostByValue, ItemMaster } from '../lib/inventory';

describe('Inventory Engine & WAC Recalculation (Rules I1-I5)', () => {
  it('should accurately calculate perpetual WAC according to Rule I2', () => {
    // Current stock: 100 units @ 10.00 SAR (Value: 1,000 SAR)
    // Incoming receipt: 50 units @ 16.00 SAR (Value: 800 SAR)
    // Total stock: 150 units, Total value: 1,800 SAR
    // Expected WAC = 1800 / 150 = 12.00 SAR
    const result = calculateWAC(100, 10.0, 50, 16.0);
    expect(result.newQty).toBe(150);
    expect(result.newWAC).toBe(12.0);
    expect(result.totalNewValue).toBe(1800.0);
  });

  it('should reject incoming receipts with zero or negative quantity', () => {
    expect(() => calculateWAC(100, 10.0, 0, 15.0)).toThrow();
    expect(() => calculateWAC(100, 10.0, -10, 15.0)).toThrow();
  });

  it('should resolve item-unit specific barcodes according to Rule I4', () => {
    const mockItems: ItemMaster[] = [
      {
        id: 'item-1',
        sku: 'BEV-001',
        nameAr: 'مشروب غازي',
        nameEn: 'Carbonated Drink',
        baseUnit: 'Piece',
        currentStock: 240,
        currentWAC: 2.5,
        units: [
          {
            id: 'uom-1',
            nameAr: 'حبة',
            nameEn: 'Piece',
            conversionFactor: 1,
            barcode: '628100000001',
            isBaseUnit: true,
          },
          {
            id: 'uom-2',
            nameAr: 'كرتون (٢٤ حبة)',
            nameEn: 'Carton (24 Pcs)',
            conversionFactor: 24,
            barcode: '628100000002',
            isBaseUnit: false,
          },
        ],
      },
    ];

    const pieceMatch = resolveBarcode(mockItems, '628100000001');
    expect(pieceMatch).not.toBeNull();
    expect(pieceMatch?.unit.conversionFactor).toBe(1);

    const cartonMatch = resolveBarcode(mockItems, '628100000002');
    expect(cartonMatch).not.toBeNull();
    expect(cartonMatch?.unit.conversionFactor).toBe(24);

    const missingMatch = resolveBarcode(mockItems, '999999999999');
    expect(missingMatch).toBeNull();
  });

  it('should allocate landed costs across lines proportionally by value (Rule I5)', () => {
    const lines = [
      { id: 'line-1', netAmount: 1000, quantity: 10 },
      { id: 'line-2', netAmount: 3000, quantity: 20 },
    ];
    // Total net = 4000
    // Total landed cost = 400
    // Line 1: 1000/4000 * 400 = 100 (10 SAR/unit)
    // Line 2: 3000/4000 * 400 = 300 (15 SAR/unit)
    const allocations = allocateLandedCostByValue(lines, 400);
    expect(allocations[0].allocatedCost).toBe(100);
    expect(allocations[0].additionalCostPerUnit).toBe(10);
    expect(allocations[1].allocatedCost).toBe(300);
    expect(allocations[1].additionalCostPerUnit).toBe(15);
  });
});
