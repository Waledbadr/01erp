/**
 * Professional Code 128 Vector Barcode & Label Generation Engine
 * Supports Code 128 Subset B/C, SVG rendering, thermal printer labels (50x25, 100x50, 38x25),
 * and Zebra ZPL-II command string generation.
 */

// Code 128 Pattern Table (107 patterns, each 11 modules wide, except stop pattern which is 13)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112' // 100-106 (106 is STOP pattern)
];

const START_B = 104;
const STOP = 106;

/**
 * Encodes text into Code 128 Subset B values with checksum calculation.
 */
function encodeCode128B(text: string): number[] {
  const codes: number[] = [START_B];
  let checkSum = START_B;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Subset B maps ASCII 32-127 directly to codes 0-95
    const value = charCode >= 32 && charCode <= 126 ? charCode - 32 : 0;
    codes.push(value);
    checkSum += value * (i + 1);
  }

  const checkDigit = checkSum % 103;
  codes.push(checkDigit);
  codes.push(STOP);
  return codes;
}

export interface BarcodeSvgOptions {
  width?: number; // total width in px
  height?: number; // barcode height in px
  showText?: boolean;
  barWidth?: number; // module width in px
  quietZone?: number;
  lineColor?: string;
  textColor?: string;
}

/**
 * Generates an SVG string representation of a Code 128 barcode.
 */
export function generateCode128Svg(value: string, options: BarcodeSvgOptions = {}): string {
  const safeValue = value && value.trim() ? value.trim() : '00000000';
  const codes = encodeCode128B(safeValue);

  const barWidth = options.barWidth || 2;
  const height = options.height || 60;
  const quietZone = options.quietZone !== undefined ? options.quietZone : 10 * barWidth;
  const showText = options.showText !== false;
  const lineColor = options.lineColor || '#000000';
  const textColor = options.textColor || '#111827';

  // Build binary modules
  let binary = '';
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) continue;
    let isBar = true;
    for (const widthChar of pattern) {
      const w = parseInt(widthChar, 10);
      binary += (isBar ? '1' : '0').repeat(w);
      isBar = !isBar;
    }
  }

  const totalModules = binary.length;
  const svgWidth = quietZone * 2 + totalModules * barWidth;
  const textHeight = showText ? 18 : 0;
  const svgHeight = height + textHeight + 8;

  let rects = '';
  let x = quietZone;
  let currentRun = 0;
  let inBar = false;

  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === '1') {
      if (!inBar) {
        inBar = true;
        currentRun = barWidth;
      } else {
        currentRun += barWidth;
      }
    } else {
      if (inBar) {
        rects += `<rect x="${x - currentRun}" y="4" width="${currentRun}" height="${height}" fill="${lineColor}"/>`;
        inBar = false;
        currentRun = 0;
      }
    }
    x += barWidth;
  }
  if (inBar) {
    rects += `<rect x="${x - currentRun}" y="4" width="${currentRun}" height="${height}" fill="${lineColor}"/>`;
  }

  let textElement = '';
  if (showText) {
    textElement = `<text x="${svgWidth / 2}" y="${height + 18}" font-family="monospace" font-size="12" font-weight="600" text-anchor="middle" fill="${textColor}">${safeValue}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">${rects}${textElement}</svg>`;
}

// ==========================================
// 2. LABEL TEMPLATE SIZES & FORMATS
// ==========================================

export type LabelSizePreset = '50x25' | '100x50' | '38x25' | '75x50';

export interface LabelDesignConfig {
  size: LabelSizePreset;
  showCompanyName: boolean;
  showNameAr: boolean;
  showNameEn: boolean;
  showPrice: boolean;
  showPriceWithVat: boolean;
  showSku: boolean;
  showBarcodeNumber: boolean;
  showUnitName: boolean;
  companyNameAr?: string;
  currencySymbol?: string;
}

export const DEFAULT_LABEL_CONFIG: LabelDesignConfig = {
  size: '50x25',
  showCompanyName: true,
  showNameAr: true,
  showNameEn: false,
  showPrice: true,
  showPriceWithVat: true,
  showSku: true,
  showBarcodeNumber: true,
  showUnitName: true,
  companyNameAr: 'شركة الإنماء للحلول التجارية والتقنية',
  currencySymbol: 'ر.س',
};

export interface LabelPrintItem {
  id: string;
  sku: string;
  barcode: string;
  nameAr: string;
  nameEn?: string;
  unitNameAr: string;
  unitNameEn?: string;
  price: number;
  taxRate?: number;
  quantityToPrint: number;
}

/**
 * Generates Zebra Programming Language (ZPL-II) commands for direct thermal barcode printer output.
 */
export function generateZplLabel(item: LabelPrintItem, config: LabelDesignConfig = DEFAULT_LABEL_CONFIG): string {
  const taxRate = item.taxRate || 15;
  const priceWithVat = item.price * (1 + taxRate / 100);
  const vatText = `${priceWithVat.toFixed(2)} ${config.currencySymbol || 'SAR'}`;

  // Dimensions in dots (assuming 203 DPI, 8 dots/mm)
  // 50mm x 25mm = 400 dots x 200 dots
  // 100mm x 50mm = 800 dots x 400 dots
  const isLarge = config.size === '100x50';
  const labelWidth = isLarge ? 800 : 400;
  const labelHeight = isLarge ? 400 : 200;

  return `
^XA
^PW${labelWidth}
^LL${labelHeight}
^CI28
^FO20,15^A0N,20,20^FD${config.showCompanyName ? (config.companyNameAr || 'ERP') : ''}^FS
^FO20,38^A0N,24,24^FD${item.sku}^FS
^FO${labelWidth - 160},38^A0N,28,28^FD${config.showPrice ? vatText : ''}^FS
^FO30,75^BY2,3,65^BCN,65,Y,N,N^FD${item.barcode}^FS
^FO20,165^A0N,18,18^FD${item.unitNameAr}^FS
^PQ${item.quantityToPrint || 1}
^XZ
`.trim();
}

/**
 * Generates an HTML print page string containing the batch barcode labels.
 */
export function generatePrintableBatchHtml(
  items: LabelPrintItem[],
  config: LabelDesignConfig = DEFAULT_LABEL_CONFIG
): string {
  const sizeMap: Record<LabelSizePreset, { widthMm: number; heightMm: number; barcodeHeight: number }> = {
    '50x25': { widthMm: 50, heightMm: 25, barcodeHeight: 38 },
    '100x50': { widthMm: 100, heightMm: 50, barcodeHeight: 80 },
    '38x25': { widthMm: 38, heightMm: 25, barcodeHeight: 32 },
    '75x50': { widthMm: 75, heightMm: 50, barcodeHeight: 70 },
  };

  const currentSize = sizeMap[config.size] || sizeMap['50x25'];

  const labelsHtml: string[] = [];

  items.forEach((item) => {
    const qty = Math.max(1, item.quantityToPrint || 1);
    const taxRate = item.taxRate || 15;
    const priceWithVat = item.price * (1 + taxRate / 100);

    const barcodeSvg = generateCode128Svg(item.barcode, {
      height: currentSize.barcodeHeight,
      showText: config.showBarcodeNumber,
      barWidth: config.size === '100x50' ? 2 : 1.5,
    });

    for (let i = 0; i < qty; i++) {
      labelsHtml.push(`
        <div class="label-box" style="width: ${currentSize.widthMm}mm; height: ${currentSize.heightMm}mm;">
          ${config.showCompanyName ? `<div class="label-header">${config.companyNameAr || ''}</div>` : ''}
          <div class="label-title" dir="rtl">${config.showNameAr ? item.nameAr : ''}</div>
          ${config.showNameEn && item.nameEn ? `<div class="label-subtitle">${item.nameEn}</div>` : ''}
          <div class="label-meta">
            ${config.showSku ? `<span class="label-sku">SKU: ${item.sku}</span>` : ''}
            ${config.showUnitName ? `<span class="label-unit">${item.unitNameAr}</span>` : ''}
          </div>
          <div class="label-barcode">
            ${barcodeSvg}
          </div>
          ${config.showPrice ? `
            <div class="label-price" dir="rtl">
              <span class="price-val">${priceWithVat.toFixed(2)}</span>
              <span class="price-cur">${config.currencySymbol || 'ر.س'}</span>
              ${config.showPriceWithVat ? '<span class="price-vat">(شامل الضريبة)</span>' : ''}
            </div>
          ` : ''}
        </div>
      `);
    }
  });

  return `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>طباعة ملصقات الباركود - Barcode Labels</title>
  <style>
    @page {
      size: auto;
      margin: 2mm;
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 4mm;
      background: #f9fafb;
      color: #111827;
      display: flex;
      flex-wrap: wrap;
      gap: 3mm;
      justify-content: flex-start;
    }
    .label-box {
      box-sizing: border-box;
      background: #ffffff;
      border: 1px dashed #d1d5db;
      padding: 1.5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      page-break-inside: avoid;
    }
    @media print {
      body {
        background: transparent;
        padding: 0;
        gap: 1mm;
      }
      .label-box {
        border: none;
      }
    }
    .label-header {
      font-size: 7pt;
      font-weight: 600;
      color: #4b5563;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }
    .label-title {
      font-size: 8pt;
      font-weight: 700;
      line-height: 1.1;
      max-height: 2.2em;
      overflow: hidden;
      text-align: center;
    }
    .label-subtitle {
      font-size: 6.5pt;
      color: #6b7280;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .label-meta {
      display: flex;
      justify-content: space-between;
      font-size: 6.5pt;
      color: #374151;
      font-family: monospace;
      padding: 0 1mm;
    }
    .label-barcode {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0.5mm 0;
    }
    .label-barcode svg {
      max-width: 95%;
      height: auto;
    }
    .label-price {
      text-align: center;
      font-size: 9pt;
      font-weight: 800;
      color: #047857;
      line-height: 1.1;
    }
    .price-cur {
      font-size: 7pt;
      margin-inline-start: 1.5mm;
    }
    .price-vat {
      font-size: 5.5pt;
      font-weight: 400;
      color: #6b7280;
      margin-inline-start: 1mm;
    }
  </style>
</head>
<body>
  ${labelsHtml.join('\n')}
</body>
</html>
  `.trim();
}
