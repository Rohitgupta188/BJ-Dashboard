import ExcelJS from "exceljs";

export interface CatalogExportRow {
  rfid:           string;
  sku:            string;
  designNumber:   string;
  imageName:      string;
  itemStatus:     string;
  itemType:       string;
  size:           number | string;
  grossWeight:    number;
  netWeight:      number;
  collectionLine: string;
  itemCategory:   string;
  metalType:      string;
  metalPurity:    string;
}


const COLUMNS: { header: string; key: keyof CatalogExportRow; width: number }[] = [
  { header: "RFID Tag",        key: "rfid",           width: 14 },
  { header: "SKU Number",      key: "sku",            width: 16 },
  { header: "Design Number",   key: "designNumber",   width: 18 },
  { header: "Image Name",      key: "imageName",      width: 22 },
  { header: "Item Status",     key: "itemStatus",     width: 12 },
  { header: "Item Type",       key: "itemType",       width: 14 },
  { header: "Size",            key: "size",           width:  8 },
  { header: "Gross Weight",    key: "grossWeight",    width: 13 },
  { header: "Net Weight",      key: "netWeight",      width: 12 },
  { header: "Collection Line", key: "collectionLine", width: 18 },
  { header: "Item Category",   key: "itemCategory",   width: 16 },
  { header: "Metal Type",      key: "metalType",      width: 12 },
  { header: "Metal Purity",    key: "metalPurity",    width: 13 },
];

/**
 * Builds a formatted xlsx workbook from catalog rows.
 * Returns an ArrayBuffer — call Buffer.from(result) if you need a Node Buffer.
 */
export async function buildCatalogExcel(
  rows:      CatalogExportRow[],
  sheetName: string = "Products"
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator  = "Brahammand Jewels Dashboard";
  wb.created  = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet(sheetName);

  // Set column definitions (headers + widths in one step)
  ws.columns = COLUMNS.map((c) => ({
    header: c.header,
    key:    c.key,
    width:  c.width,
  }));

  // Style the header row
  const headerRow = ws.getRow(1);
  headerRow.font      = { bold: true };
  headerRow.fill      = {
    type:    "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1C1D24" }, // dark background matching dashboard theme
  };
  headerRow.font      = { bold: true, color: { argb: "FFC5A059" } }; // gold text
  headerRow.alignment = { vertical: "middle" };
  headerRow.commit();

  // Add data rows
  for (const row of rows) {
    ws.addRow(row);
  }

  // Freeze the header row so it stays visible while scrolling
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Builds a single-row sample xlsx file (for the "Download Sample" button).
 */
export async function buildSampleExcel(): Promise<Buffer> {
  const sample: CatalogExportRow[] = [
    {
      rfid:           "RFID001",
      sku:            "DZLR3387",
      designNumber:   "DZLR-54068",
      imageName:      "DZLR-54068.jpg",
      itemStatus:     "INSTOCK",
      itemType:       "Ring",
      size:           "",
      grossWeight:    5.234,
      netWeight:      4.891,
      collectionLine: "Classic",
      itemCategory:   "",
      metalType:      "Y",
      metalPurity:    "18",
    },
  ];
  return buildCatalogExcel(sample, "Products");
}
