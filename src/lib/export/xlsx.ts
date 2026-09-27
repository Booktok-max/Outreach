import ExcelJS from "exceljs";

import { neutralizeFormulaValue } from "@/lib/text";

import type { ExportDataset } from "./datasets";

/**
 * XLSX writer.
 *
 * Every cell is written as a string and formula-injection payloads are prefixed
 * with an apostrophe, so opening an export in Excel can never execute content
 * that came from an imported file.
 */
export async function buildXlsx(dataset: ExportDataset, sheetName = "Export"): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Atomic Shelf Outreach";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31) || "Export", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.addRow(dataset.headers.map((header) => neutralizeFormulaValue(header)));

  for (const row of dataset.rows) {
    worksheet.addRow(
      row.map((value) => (value === null || value === undefined ? "" : neutralizeFormulaValue(String(value)))),
    );
  }

  worksheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
