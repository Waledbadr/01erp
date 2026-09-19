import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  DocumentType,
  DocumentTemplate,
  DocumentDataPayload,
  PaperSize,
} from './types.js';
import { bidiReorderForPdf, hasArabicText } from '../../../src/lib/arabicShaper.js';

export interface GeneratedPdfResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
  sizeBytes: number;
}

export class PdfEngineService {
  /**
   * Generates a real structured vector PDF document (NOT a screenshot)
   */
  public static async generateDocumentPdf(
    data: DocumentDataPayload,
    template: DocumentTemplate
  ): Promise<GeneratedPdfResult> {
    const paperSize = template.paperSize;
    const isThermal = paperSize === 'THERMAL_80MM';

    let doc: jsPDF;

    if (isThermal) {
      // 80mm thermal receipt = ~226.77 pt width, variable height based on line items
      const estimatedHeightPt = 350 + (data.lines.length * 40) + 150;
      doc = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: [226.77, Math.max(500, estimatedHeightPt)],
      });
    } else if (paperSize === 'A5') {
      doc = new jsPDF({
        orientation: template.orientation === 'LANDSCAPE' ? 'l' : 'p',
        unit: 'pt',
        format: 'a5',
      });
    } else if (paperSize === 'LETTER') {
      doc = new jsPDF({
        orientation: template.orientation === 'LANDSCAPE' ? 'l' : 'p',
        unit: 'pt',
        format: 'letter',
      });
    } else {
      // Default A4
      doc = new jsPDF({
        orientation: template.orientation === 'LANDSCAPE' ? 'l' : 'p',
        unit: 'pt',
        format: 'a4',
      });
    }

    // PDF Metadata
    doc.setProperties({
      title: `${data.documentNumber} - ${data.company.nameAr}`,
      subject: `${data.documentType} - ${data.documentNumber}`,
      author: data.company.nameAr,
      creator: 'Saudi Enterprise Cloud ERP (Phase 13 Document Engine)',
      keywords: `VAT, ZATCA, Saudi ERP, ${data.documentNumber}, ${data.currency}`,
    });

    if (isThermal) {
      await this.renderThermal80mm(doc, data, template);
    } else {
      await this.renderStandardSheet(doc, data, template);
    }

    const arrayBuf = doc.output('arraybuffer');
    const buffer = Buffer.from(arrayBuf);
    const filename = `${data.documentNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

    return {
      buffer,
      contentType: 'application/pdf',
      filename,
      sizeBytes: buffer.length,
    };
  }

  /**
   * Renders Standard A4/A5/Letter Sheet Layout with exact coordinates
   */
  private static async renderStandardSheet(
    doc: jsPDF,
    data: DocumentDataPayload,
    template: DocumentTemplate
  ) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 36; // 0.5 inch margins
    const printableWidth = pageWidth - margin * 2;

    const colors = template.colors;
    const isAr = template.languageMode === 'AR';
    const isBilingual = template.languageMode === 'BILINGUAL';

    // 1. Header Bar (Primary Brand Color)
    doc.setFillColor(colors.primary);
    doc.rect(margin, margin, printableWidth, 5, 'F');

    let currentY = margin + 25;

    // 2. Company Identity (Left or Right depending on RTL)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(colors.secondary);

    const compNameAr = bidiReorderForPdf(data.company.nameAr);
    doc.text(compNameAr, pageWidth - margin, currentY, { align: 'right' });

    currentY += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 90, 105);

    if (template.companyInfoBlocks.showCompanyName && data.company.nameEn) {
      doc.text(data.company.nameEn, pageWidth - margin, currentY, { align: 'right' });
      currentY += 12;
    }

    if (template.companyInfoBlocks.showVatNumber) {
      const vatText = bidiReorderForPdf(`الرقم الضريبي: ${data.company.vatNumber} (VAT)`);
      doc.text(vatText, pageWidth - margin, currentY, { align: 'right' });
      currentY += 12;
    }

    if (template.companyInfoBlocks.showCrNumber) {
      const crText = bidiReorderForPdf(`س.ت: ${data.company.crNumber} (CR)`);
      doc.text(crText, pageWidth - margin, currentY, { align: 'right' });
      currentY += 12;
    }

    if (template.companyInfoBlocks.showNationalAddress && data.company.nationalAddress) {
      const addr = bidiReorderForPdf(data.company.nationalAddress.slice(0, 60));
      doc.text(addr, pageWidth - margin, currentY, { align: 'right' });
      currentY += 12;
    }

    // 3. Document Title & Badge (Top Left / Opposite Side)
    const titleY = margin + 25;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(colors.primary);

    const docTypeTitles: Record<DocumentType, { ar: string; en: string }> = {
      SALES_INVOICE: { ar: 'فاتورة ضريبية', en: 'TAX INVOICE' },
      PURCHASE_BILL: { ar: 'فاتورة مشتريات', en: 'PURCHASE BILL' },
      QUOTATION: { ar: 'عرض سعر', en: 'PRICE QUOTATION' },
      SALES_ORDER: { ar: 'أمر بيع', en: 'SALES ORDER' },
      PURCHASE_ORDER: { ar: 'أمر شراء', en: 'PURCHASE ORDER' },
      RECEIPT_VOUCHER: { ar: 'سند قبض مالي', en: 'RECEIPT VOUCHER' },
      PAYMENT_VOUCHER: { ar: 'سند صرف مالي', en: 'PAYMENT VOUCHER' },
      CREDIT_NOTE: { ar: 'إشعار دائن ضريبي', en: 'TAX CREDIT NOTE' },
      DEBIT_NOTE: { ar: 'إشعار مدين ضريبي', en: 'TAX DEBIT NOTE' },
      CUSTOMER_STATEMENT: { ar: 'كشف حساب عميل', en: 'CUSTOMER STATEMENT' },
      SUPPLIER_STATEMENT: { ar: 'كشف حساب مورد', en: 'SUPPLIER STATEMENT' },
      BARCODE_LABEL: { ar: 'ملصق صنف وباركود', en: 'BARCODE LABEL' },
    };

    const titles = docTypeTitles[data.documentType] || { ar: data.documentType, en: data.documentType };
    const displayTitle = isAr ? titles.ar : isBilingual ? `${titles.ar} / ${titles.en}` : titles.en;

    doc.text(bidiReorderForPdf(displayTitle), margin, titleY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(`# ${data.documentNumber}`, margin, titleY + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(bidiReorderForPdf(`تاريخ الإصدار / Date: ${data.issueDate}`), margin, titleY + 30);
    if (data.dueDate) {
      doc.text(bidiReorderForPdf(`تاريخ الاستحقاق / Due: ${data.dueDate}`), margin, titleY + 42);
    }

    // 4. ZATCA QR Code (if present)
    if (data.zatca?.qrCodeBase64 && template.qrCode.visible) {
      try {
        const qrDataUrl = await QRCode.toDataURL(data.zatca.qrCodeBase64, {
          width: template.qrCode.size || 85,
          margin: 1,
        });
        const qrX = margin + 175;
        const qrY = margin + 12;
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, 70, 70);
      } catch (err) {
        // QR rendering error fallback
      }
    }

    currentY = Math.max(currentY + 10, margin + 100);

    // 5. Party / Customer / Vendor Block
    if (data.party) {
      doc.setFillColor(248, 250, 252); // slate 50
      doc.setDrawColor(226, 232, 240); // slate 200
      doc.roundedRect(margin, currentY, printableWidth, 54, 4, 4, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(colors.primary);
      const partyLabel = data.party.partyType === 'CUSTOMER' ? 'بيانات العميل / Customer Details:' : 'بيانات المورد / Supplier Details:';
      doc.text(bidiReorderForPdf(partyLabel), pageWidth - margin - 10, currentY + 14, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      const partyName = bidiReorderForPdf(data.party.nameAr + (data.party.nameEn ? ` (${data.party.nameEn})` : ''));
      doc.text(partyName, pageWidth - margin - 10, currentY + 28, { align: 'right' });

      const partyVat = data.party.vatNumber ? bidiReorderForPdf(`الرقم الضريبي / Tax ID: ${data.party.vatNumber}`) : '';
      if (partyVat) {
        doc.text(partyVat, pageWidth - margin - 10, currentY + 42, { align: 'right' });
      }

      if (data.party.phone || data.party.email) {
        doc.text(bidiReorderForPdf(`الهاتف / Phone: ${data.party.phone || data.party.email || ''}`), margin + 10, currentY + 28);
      }

      currentY += 66;
    }

    // 6. Line Items Table
    const tableHeaderY = currentY;
    const tableHeaderHeight = 22;

    if (typeof template.colors.tableHeaderBg === 'string' && template.colors.tableHeaderBg.startsWith('#')) {
      doc.setFillColor(template.colors.tableHeaderBg);
    } else {
      doc.setFillColor(241, 245, 249);
    }
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, tableHeaderY, printableWidth, tableHeaderHeight, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(colors.secondary);

    // Columns
    const activeColumns = template.columns.filter((c) => c.visible).sort((a, b) => a.order - b.order);
    let colX = margin;

    // Draw Column Headers
    for (const col of activeColumns) {
      const colWidth = (col.widthPct / 100) * printableWidth;
      const headerLabel = isAr ? col.labelAr : isBilingual ? `${col.labelAr} / ${col.labelEn}` : col.labelEn;
      doc.text(bidiReorderForPdf(headerLabel), colX + 4, tableHeaderY + 14);
      colX += colWidth;
    }

    currentY += tableHeaderHeight;

    // Draw Rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);

    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i];
      const rowHeight = 20;

      // Alternate row background
      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, currentY, printableWidth, rowHeight, 'F');
      }

      doc.setDrawColor(241, 245, 249);
      doc.line(margin, currentY + rowHeight, margin + printableWidth, currentY + rowHeight);

      let rowColX = margin;
      for (const col of activeColumns) {
        const colWidth = (col.widthPct / 100) * printableWidth;

        let val = '';
        if (col.id === 'lineNumber') val = String(line.lineNumber);
        else if (col.id === 'itemCode') val = line.itemCode;
        else if (col.id === 'name') val = line.nameAr;
        else if (col.id === 'quantity') val = `${line.quantity} ${line.unitName}`;
        else if (col.id === 'unitPrice') val = line.unitPriceSar.toFixed(2);
        else if (col.id === 'discount') val = line.discountSar > 0 ? line.discountSar.toFixed(2) : '-';
        else if (col.id === 'vatRate') val = `${line.vatRatePct}%`;
        else if (col.id === 'total') val = `${line.totalSar.toFixed(2)} SAR`;
        else if (col.id === 'description') val = line.nameAr;
        else if (col.id === 'amount') val = `${line.totalSar.toFixed(2)} SAR`;
        else if (col.id === 'barcode') val = line.barcode || line.itemCode;

        doc.text(bidiReorderForPdf(val), rowColX + 4, currentY + 13);
        rowColX += colWidth;
      }

      currentY += rowHeight;
    }

    currentY += 15;

    // 7. Totals & VAT Summary Block (Right/Bottom)
    const totalsBoxWidth = 200;
    const totalsX = margin + printableWidth - totalsBoxWidth;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(totalsX, currentY, totalsBoxWidth, 80, 4, 4, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);

    let totLineY = currentY + 16;
    doc.text(bidiReorderForPdf('المجموع الخاضع للضريبة / Taxable:'), totalsX + 10, totLineY);
    doc.text(`${data.totals.taxableAmountSar.toFixed(2)} SAR`, totalsX + totalsBoxWidth - 10, totLineY, { align: 'right' });

    totLineY += 16;
    doc.text(bidiReorderForPdf('ضريبة القيمة المضافة / VAT (15%):'), totalsX + 10, totLineY);
    doc.text(`${data.totals.vatAmountSar.toFixed(2)} SAR`, totalsX + totalsBoxWidth - 10, totLineY, { align: 'right' });

    totLineY += 18;
    doc.setFillColor(colors.primary);
    doc.rect(totalsX, totLineY - 12, totalsBoxWidth, 24, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(bidiReorderForPdf('الإجمالي المستحق / Total Due:'), totalsX + 10, totLineY + 4);
    doc.text(`${data.totals.totalAmountSar.toFixed(2)} SAR`, totalsX + totalsBoxWidth - 10, totLineY + 4, { align: 'right' });

    // 8. Payment & Bank Details (Left side)
    if (template.companyInfoBlocks.showBankAccounts && data.company.bankAccounts && data.company.bankAccounts.length > 0) {
      const bankX = margin;
      const bankY = currentY;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(colors.primary);
      doc.text(bidiReorderForPdf('معلومات التحويل البنكي / Bank Details:'), bankX, bankY + 12);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      const bnk = data.company.bankAccounts[0];
      doc.text(bidiReorderForPdf(`البنك: ${bnk.bankName}`), bankX, bankY + 26);
      doc.text(`IBAN: ${bnk.iban}`, bankX, bankY + 38);
    }

    currentY += 95;

    // 9. Notes & Terms
    if (data.notes || template.notes) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const nText = bidiReorderForPdf(`ملاحظات / Notes: ${data.notes || template.notes || ''}`);
      doc.text(nText, margin, currentY);
      currentY += 14;
    }

    // 10. Footer Bar
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    const footer = bidiReorderForPdf(template.footerText || `${data.company.nameAr} - جميع الحقوق محفوظة`);
    doc.text(footer, pageWidth / 2, pageHeight - 20, { align: 'center' });
  }

  /**
   * Renders 80mm Thermal Receipt Layout (Point-of-Sale continuous format)
   */
  private static async renderThermal80mm(
    doc: jsPDF,
    data: DocumentDataPayload,
    template: DocumentTemplate
  ) {
    const pageWidth = 226.77; // 80mm in points
    const margin = 10;
    const printableWidth = pageWidth - margin * 2;
    let currentY = 20;

    // 1. Center Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    const compName = bidiReorderForPdf(data.company.nameAr);
    doc.text(compName, pageWidth / 2, currentY, { align: 'center' });

    currentY += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    if (data.company.nameEn) {
      doc.text(data.company.nameEn, pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;
    }

    doc.text(bidiReorderForPdf(`الرقم الضريبي: ${data.company.vatNumber}`), pageWidth / 2, currentY, { align: 'center' });
    currentY += 10;
    doc.text(bidiReorderForPdf(`س.ت: ${data.company.crNumber}`), pageWidth / 2, currentY, { align: 'center' });
    currentY += 12;

    // Separator line
    doc.setLineDashPattern([2, 2], 0);
    doc.setDrawColor(0, 0, 0);
    doc.line(margin, currentY, margin + printableWidth, currentY);
    currentY += 12;

    // 2. Receipt Info
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    const isSimplified = data.zatca?.isSimplified ?? true;
    const title = isSimplified ? 'فاتورة ضريبية مبسطة (POS)' : 'إيصال مبيعات رسمي';
    doc.text(bidiReorderForPdf(title), pageWidth / 2, currentY, { align: 'center' });

    currentY += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(bidiReorderForPdf(`رقم الفاتورة: ${data.documentNumber}`), margin, currentY);
    currentY += 10;
    doc.text(bidiReorderForPdf(`التاريخ: ${data.issueDate}`), margin, currentY);
    currentY += 12;

    // Separator line
    doc.line(margin, currentY, margin + printableWidth, currentY);
    currentY += 10;

    // 3. Line Items Table (Condensed Monospace)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(bidiReorderForPdf('الصنف / Item'), margin, currentY);
    doc.text(bidiReorderForPdf('الكمية'), margin + 95, currentY);
    doc.text(bidiReorderForPdf('الإجمالي'), margin + printableWidth, currentY, { align: 'right' });
    currentY += 10;

    doc.setFont('helvetica', 'normal');
    for (const item of data.lines) {
      doc.text(bidiReorderForPdf(item.nameAr.slice(0, 24)), margin, currentY);
      doc.text(`${item.quantity}`, margin + 100, currentY);
      doc.text(`${item.totalSar.toFixed(2)}`, margin + printableWidth, currentY, { align: 'right' });
      currentY += 12;
    }

    // Separator line
    doc.line(margin, currentY, margin + printableWidth, currentY);
    currentY += 12;

    // 4. Totals Block
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(bidiReorderForPdf('المجموع غير شامل الضريبة:'), margin, currentY);
    doc.text(`${data.totals.taxableAmountSar.toFixed(2)} SAR`, margin + printableWidth, currentY, { align: 'right' });
    currentY += 11;

    doc.text(bidiReorderForPdf('ضريبة القيمة المضافة 15%:'), margin, currentY);
    doc.text(`${data.totals.vatAmountSar.toFixed(2)} SAR`, margin + printableWidth, currentY, { align: 'right' });
    currentY += 13;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(bidiReorderForPdf('المجموع الكلي:'), margin, currentY);
    doc.text(`${data.totals.totalAmountSar.toFixed(2)} SAR`, margin + printableWidth, currentY, { align: 'right' });
    currentY += 18;

    // 5. ZATCA QR Code (Center 80mm thermal)
    if (data.zatca?.qrCodeBase64) {
      try {
        const qrDataUrl = await QRCode.toDataURL(data.zatca.qrCodeBase64, {
          width: 100,
          margin: 1,
        });
        const qrX = (pageWidth - 80) / 2;
        doc.addImage(qrDataUrl, 'PNG', qrX, currentY, 80, 80);
        currentY += 88;
      } catch (err) {
        // Fallback
      }
    }

    // 6. Tear line
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(bidiReorderForPdf('--- شكراً لزيارتكم ونتطلع لخدمتكم مجدداً ---'), pageWidth / 2, currentY, { align: 'center' });
  }
}
