import ExcelJS from "exceljs";

export const MANDATORY_COLUMNS = [
  "RFID Tag",
  "SKU Number",
  "Design Number",
  "Image Name",
  "Item Status",
  "Item Type",
  "Gross Weight",
  "Net Weight",
  "Metal Type",
  "Metal Purity",
] as const;

// Hard limit — prevents runaway memory on massive uploads 
const MAX_ROWS = 10_000;

// Max length for any string field 
const MAX_STRING_LENGTH = 200;

export interface NormalizedRow {
  /** Original 1-based row number in the sheet (including header = row 1) */
  rowNumber: number;

  rfid:           string;
  sku:            string;
  designNumber:   string;
  imageName:      string;
  itemStatus:     string; // raw — business layer interprets "CATALOGUE" / "INSTOCK"
  itemType:       string;
  grossWeight:    number;
  netWeight:      number;
  metalType:      string;
  metalPurity:    string;

  collectionLine: string;
  stoneWeight:    number;
  size:           number;
  itemCategory:   string;
}

export interface ParseError {
  rowNumber: number;
  sku:       string;
  reason:    string;
}

export interface ExcelParseResult {
  rows:     NormalizedRow[];
  errors:   ParseError[];
  rowCount: number;
}

/**
 * Safely extracts a string from an ExcelJS cell.
 * Handles: string, number, boolean, Date, formula ({formula, result}), error cell.
 */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    // Formula cell: { formula: string, result: any, ... }
    if ("result" in v) return String((v as ExcelJS.CellFormulaValue).result ?? "").trim();
    // Error cell: { error: string }
    if ("error" in v) return "";
    // Rich text: { richText: [...] }
    if ("richText" in v) {
      return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("").trim();
    }
    // Date — shouldn't appear in our text fields but handle gracefully
    if (v instanceof Date) return "";
  }
  return String(v).trim();
}

/**
 * Safely extracts a non-negative number from an ExcelJS cell.
 * Returns 0 for blank, non-numeric, or negative values.
 */
function cellNumber(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (v === null || v === undefined) return 0;
  let num: number;
  if (typeof v === "number") {
    num = v;
  } else if (typeof v === "object" && "result" in v) {
    num = Number((v as ExcelJS.CellFormulaValue).result) || 0;
  } else {
    num = Number(v) || 0;
  }
  return num < 0 ? 0 : num;
}

/** Truncates a string to MAX_STRING_LENGTH, logs a warning if truncated. */
function truncate(value: string, field: string, rowNumber: number): string {
  if (value.length > MAX_STRING_LENGTH) {
    console.warn(
      `[excel/parse] Row ${rowNumber}: field "${field}" truncated ` +
      `(${value.length} → ${MAX_STRING_LENGTH} chars)`
    );
    return value.slice(0, MAX_STRING_LENGTH);
  }
  return value;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Parses an xlsx Buffer and returns normalized rows + row-level errors.
 * Never throws — all parse failures are returned as errors[].
 */
export async function parseExcelBuffer(buffer: Buffer): Promise<ExcelParseResult> {
  const rows:   NormalizedRow[] = [];
  const errors: ParseError[]    = [];

  // ── Load workbook ─────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as any);
  } catch (err) {
    return {
      rows:     [],
      errors:   [{ rowNumber: 0, sku: "", reason: `Could not read Excel file: ${err instanceof Error ? err.message : String(err)}` }],
      rowCount: 0,
    };
  }

  const ws = wb.worksheets[0];
  if (!ws) {
    return {
      rows:     [],
      errors:   [{ rowNumber: 0, sku: "", reason: "Workbook has no sheets." }],
      rowCount: 0,
    };
  }

  // ── Extract headers from row 1 ────────────────────────────────────────────
  const headerRow = ws.getRow(1);
  const headers   = new Map<string, number>(); // column name → 1-based column index

  headerRow.eachCell((cell, colIndex) => {
    const name = String(cell.value ?? "").trim();
    if (name) headers.set(name, colIndex);
  });

  // ── Validate mandatory columns exist ──────────────────────────────────────
  const missingColumns = MANDATORY_COLUMNS.filter((col) => !headers.has(col));
  if (missingColumns.length > 0) {
    return {
      rows:     [],
      errors:   [{
        rowNumber: 1,
        sku:       "",
        reason:    `Missing mandatory column(s): ${missingColumns.join(", ")}`,
      }],
      rowCount: 0,
    };
  }

  // Helpers to read named columns by header name
  const col = (row: ExcelJS.Row, name: string): ExcelJS.Cell =>
    row.getCell(headers.get(name) ?? 0);
  const optCol = (row: ExcelJS.Row, name: string): ExcelJS.Cell | null =>
    headers.has(name) ? row.getCell(headers.get(name)!) : null;

  // ── Row count guard ───────────────────────────────────────────────────────
  const actualRowCount = ws.actualRowCount - 1; // subtract header row
  if (actualRowCount > MAX_ROWS) {
    return {
      rows:     [],
      errors:   [{
        rowNumber: 0,
        sku:       "",
        reason:    `File has ${actualRowCount} data rows — maximum allowed is ${MAX_ROWS}.`,
      }],
      rowCount: actualRowCount,
    };
  }

  // ── Parse data rows ───────────────────────────────────────────────────────
  let dataRowCount = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    // Skip completely empty rows
    const rowValues = row.values as (ExcelJS.CellValue | undefined)[];
    const hasContent = rowValues.slice(1).some((v) => v !== null && v !== undefined && v !== "");
    if (!hasContent) return;

    dataRowCount++;

    const sku          = cellText(col(row, "SKU Number"));
    const designNumber = cellText(col(row, "Design Number"));
    const rfid         = cellText(col(row, "RFID Tag"));

    // Validate required fields at row level
    const missing: string[] = [];
    if (!sku)          missing.push("SKU Number");
    if (!designNumber) missing.push("Design Number");
    if (!rfid)         missing.push("RFID Tag");

    if (missing.length > 0) {
      errors.push({
        rowNumber,
        sku: sku || "(blank)",
        reason: `Missing required field(s): ${missing.join(", ")}`,
      });
      return;
    }

    // Validate numeric fields are non-negative
    const grossWeight = cellNumber(col(row, "Gross Weight"));
    const netWeight   = cellNumber(col(row, "Net Weight"));

    if (grossWeight < netWeight) {
      errors.push({
        rowNumber,
        sku,
        reason: `Gross weight (${grossWeight}) is less than net weight (${netWeight}) — row accepted but check values.`,
      });
      // Not a hard error — accept the row, just warn
    }

    // Helper for optional columns — returns empty string / 0 if column not present
    const optText = (name: string) => {
      const c = optCol(row, name);
      return c ? truncate(cellText(c), name, rowNumber) : "";
    };
    const optNum = (name: string) => {
      const c = optCol(row, name);
      return c ? cellNumber(c) : 0;
    };

    rows.push({
      rowNumber,
      rfid:           truncate(rfid,          "RFID Tag",      rowNumber),
      sku:            truncate(sku,           "SKU Number",    rowNumber),
      designNumber:   truncate(designNumber,  "Design Number", rowNumber),
      imageName:      truncate(cellText(col(row, "Image Name")),   "Image Name",   rowNumber),
      itemStatus:     truncate(cellText(col(row, "Item Status")),   "Item Status",  rowNumber),
      itemType:       truncate(cellText(col(row, "Item Type")),     "Item Type",    rowNumber),
      grossWeight,
      netWeight,
      metalType:      truncate(cellText(col(row, "Metal Type")),    "Metal Type",   rowNumber),
      metalPurity:    truncate(cellText(col(row, "Metal Purity")),  "Metal Purity", rowNumber),
      collectionLine: optText("Collection Line"),
      stoneWeight:    optNum("Stone Weight"),
      size:           optNum("Size"),
      itemCategory:   optText("Item Category"),
    });
  });

  return { rows, errors, rowCount: dataRowCount };
}
