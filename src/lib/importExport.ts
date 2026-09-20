import {
  ImportTemplate,
  ImportMode,
  ValidationResult,
  ImportJob,
  ExportFilterParams,
} from '../../server/modules/importexport/types.js';
import { IMPORT_TEMPLATES_CONFIG } from '../../server/modules/importexport/templateDefinitions.js';

export * from '../../server/modules/importexport/types.js';
export { IMPORT_TEMPLATES_CONFIG } from '../../server/modules/importexport/templateDefinitions.js';

// =========================================================================
// 1. CSV PARSING & INTELLIGENT AUTO-MAPPING
// =========================================================================

export function parseCsvText(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  if (!csvText) return { headers: [], rows: [] };

  // Remove BOM if present
  let text = csvText;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // Parse lines considering quotes
  const lines: string[][] = [];
  let currentField = '';
  let currentRecord: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRecord.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRecord.push(currentField.trim());
        if (currentRecord.some((f) => f !== '')) lines.push(currentRecord);
        currentRecord = [];
        currentField = '';
      } else if (char === '\n') {
        currentRecord.push(currentField.trim());
        if (currentRecord.some((f) => f !== '')) lines.push(currentRecord);
        currentRecord = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField !== '' || currentRecord.length > 0) {
    currentRecord.push(currentField.trim());
    if (currentRecord.some((f) => f !== '')) lines.push(currentRecord);
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  const rawHeaders = lines[0];
  const dataLines = lines.slice(1);

  const rows = dataLines.map((line) => {
    const rowObj: Record<string, string> = {};
    rawHeaders.forEach((hdr, idx) => {
      rowObj[hdr] = line[idx] !== undefined ? line[idx] : '';
    });
    return rowObj;
  });

  return { headers: rawHeaders, rows };
}

export function autoMapColumns(
  fileHeaders: string[],
  template: ImportTemplate
): Record<string, string> {
  const config = IMPORT_TEMPLATES_CONFIG[template];
  if (!config) return {};

  const mapping: Record<string, string> = {}; // systemField -> fileHeader

  const normalizeStr = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\s\-_#\(\)\[\]\.\/]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي');

  for (const fieldDef of config.fields) {
    const targets = [
      fieldDef.field,
      fieldDef.labelAr,
      fieldDef.labelEn,
      ...fieldDef.aliases,
    ].map(normalizeStr);

    // Priority 1: Exact match against field name, labelAr, labelEn, or aliases
    let matchedHeader = '';
    for (const header of fileHeaders) {
      const normHdr = normalizeStr(header);
      if (targets.some((t) => t === normHdr)) {
        matchedHeader = header;
        break;
      }
    }

    // Priority 2: Substring match if no exact match found
    if (!matchedHeader) {
      for (const header of fileHeaders) {
        const normHdr = normalizeStr(header);
        if (targets.some((t) => normHdr.includes(t) || t.includes(normHdr))) {
          matchedHeader = header;
          break;
        }
      }
    }

    if (matchedHeader) {
      mapping[fieldDef.field] = matchedHeader;
    }
  }

  return mapping;
}

export function applyColumnMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>
): Record<string, any>[] {
  return rows.map((row) => {
    const mappedRow: Record<string, any> = {};
    for (const [systemField, fileHeader] of Object.entries(mapping)) {
      if (fileHeader && row[fileHeader] !== undefined) {
        mappedRow[systemField] = row[fileHeader];
      }
    }
    return mappedRow;
  });
}

// =========================================================================
// 2. API CALLS
// =========================================================================

function getAuthHeaders() {
  const token = localStorage.getItem('token') || '';
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };
}

export async function fetchTemplatesApi() {
  const res = await fetch('/api/v1/import-export/templates', { credentials: 'omit', headers: getAuthHeaders() });
  return res.json();
}

export async function validateImportApi(
  template: ImportTemplate,
  mode: ImportMode,
  rows: Record<string, any>[]
): Promise<{ success: boolean; result: ValidationResult; error?: string }> {
  const res = await fetch('/api/v1/import-export/validate', {
    method: 'POST',
    credentials: 'omit',
    headers: getAuthHeaders(),
    body: JSON.stringify({ template, mode, rows }),
  });
  return res.json();
}

export async function commitImportApi(
  template: ImportTemplate,
  mode: ImportMode,
  rows: Record<string, any>[],
  filename?: string
): Promise<{ success: boolean; job?: ImportJob; error?: string; messageAr?: string; messageEn?: string }> {
  const res = await fetch('/api/v1/import-export/commit', {
    method: 'POST',
    credentials: 'omit',
    headers: getAuthHeaders(),
    body: JSON.stringify({ template, mode, rows, filename }),
  });
  return res.json();
}

export async function rollbackImportApi(
  jobId: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  const res = await fetch(`/api/v1/import-export/rollback/${jobId}`, {
    method: 'POST',
    credentials: 'omit',
    headers: getAuthHeaders(),
  });
  return res.json();
}

export async function fetchImportJobsApi(): Promise<{ success: boolean; jobs: ImportJob[] }> {
  const res = await fetch('/api/v1/import-export/jobs', { credentials: 'omit', headers: getAuthHeaders() });
  return res.json();
}

export async function exportResourceApi(params: ExportFilterParams) {
  const res = await fetch('/api/v1/import-export/export', {
    method: 'POST',
    credentials: 'omit',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  return res.json();
}
