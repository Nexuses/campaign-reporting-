import type ExcelJS from "exceljs";

export const COLORS = {
  titleBg: "FFEEF0F3",
  sectionBg: "FF000000",
  headerBg: "FFEBEBEB",
  clickerRow: "FFEFF6EE",
  openRow: "FFEEF3FB",
  hardBounceRow: "FFFDEEEE",
  softBounceRow: "FFFEF9EC",
  unsubRow: "FFF5F0FB",
  statusClickedBg: "FFD4EDDA",
  statusOpenedBg: "FFD0E4F8",
  statusHardBg: "FFFAD4D4",
  statusSoftBg: "FFFDE8A0",
  titleText: "FF1A1A1A",
  subtitleText: "FF888888",
  sectionText: "FFAAAAAA",
  headerText: "FF404040",
  indexText: "FF888888",
  nameText: "FF1A1A1A",
  bodyText: "FF404040",
  domainText: "FF888888",
  mutedText: "FFAAAAAA",
  greenText: "FF276B3A",
  blueText: "FF1A4F8A",
  redText: "FF8B1A1A",
  amberText: "FF7A5C00",
} as const;

export const ROW_HEIGHTS = {
  topSpacer: 9.75,
  title: 27.75,
  subtitle: 15.75,
  spacerSmall: 7.5,
  spacerTiny: 6.75,
  section: 12.75,
  tableHeader: 16.5,
  data: 18,
} as const;

export const FONT = "Calibri";

type CellStyle = {
  size?: number;
  bold?: boolean;
  color?: string;
  fill?: string;
};

export function fillRange(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  startColumn: number,
  endColumn: number,
  fill: string,
) {
  for (let column = startColumn; column <= endColumn; column += 1) {
    styleCell(worksheet.getRow(rowNumber).getCell(column), { fill });
  }
}

export function styleCell(cell: ExcelJS.Cell, style: CellStyle) {
  cell.font = {
    name: FONT,
    size: style.size ?? 11,
    bold: style.bold ?? false,
    color: style.color ? { argb: style.color } : undefined,
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };

  if (style.fill) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: style.fill },
    };
  }
}

export function setupHeaderBlock(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  title: string,
  subtitle: string,
  lastColumn: number,
) {
  worksheet.getRow(1).height = ROW_HEIGHTS.topSpacer;

  const titleRow = worksheet.getRow(2);
  titleRow.height = ROW_HEIGHTS.title;
  fillRange(worksheet, 2, 1, lastColumn, COLORS.titleBg);
  styleCell(titleRow.getCell(2), {
    size: 14,
    bold: true,
    color: COLORS.titleText,
    fill: COLORS.titleBg,
  });
  titleRow.getCell(2).value = title;

  const subtitleRow = worksheet.getRow(3);
  subtitleRow.height = ROW_HEIGHTS.subtitle;
  fillRange(worksheet, 3, 1, lastColumn, COLORS.titleBg);
  styleCell(subtitleRow.getCell(2), {
    size: 9,
    color: COLORS.subtitleText,
    fill: COLORS.titleBg,
  });
  subtitleRow.getCell(2).value = subtitle;

  worksheet.getRow(4).height = ROW_HEIGHTS.spacerSmall;
  worksheet.getRow(5).height = ROW_HEIGHTS.spacerTiny;
}

export function writeSectionLabel(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  text: string,
  lastColumn: number,
) {
  const row = worksheet.getRow(rowNumber);
  row.height = ROW_HEIGHTS.section;
  fillRange(worksheet, rowNumber, 1, lastColumn, COLORS.sectionBg);
  styleCell(row.getCell(2), {
    size: 7,
    bold: true,
    color: COLORS.sectionText,
    fill: COLORS.sectionBg,
  });
  row.getCell(2).value = text;
}

export function writeTableHeader(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  headers: string[],
  startColumn = 2,
) {
  const row = worksheet.getRow(rowNumber);
  row.height = ROW_HEIGHTS.tableHeader;

  headers.forEach((header, index) => {
    styleCell(row.getCell(startColumn + index), {
      size: 8,
      bold: true,
      color: COLORS.headerText,
      fill: COLORS.headerBg,
    });
    row.getCell(startColumn + index).value = header;
  });
}

export function stylePersonRowCell(
  cell: ExcelJS.Cell,
  style: CellStyle,
) {
  styleCell(cell, style);
}

export function styleClickerDataRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  values: Array<string | number>,
) {
  const row = worksheet.getRow(rowNumber);
  row.height = ROW_HEIGHTS.data;
  const fill = COLORS.clickerRow;

  styleCell(row.getCell(2), { size: 9, color: COLORS.indexText, fill });
  styleCell(row.getCell(3), { size: 9, bold: true, color: COLORS.nameText, fill });
  styleCell(row.getCell(4), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(5), { size: 9, color: COLORS.nameText, fill });
  styleCell(row.getCell(6), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(7), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(8), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(9), { size: 9, color: COLORS.nameText, fill });
  styleCell(row.getCell(10), { size: 9, bold: true, color: COLORS.greenText, fill });
  styleCell(row.getCell(11), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(12), {
    size: 8,
    bold: true,
    color: COLORS.greenText,
    fill: COLORS.statusClickedBg,
  });

  values.forEach((value, index) => {
    row.getCell(index + 2).value = value;
  });
}

export function styleOpenOnlyDataRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  values: Array<string | number>,
) {
  const row = worksheet.getRow(rowNumber);
  row.height = ROW_HEIGHTS.data;
  const fill = COLORS.openRow;

  styleCell(row.getCell(2), { size: 9, color: COLORS.indexText, fill });
  styleCell(row.getCell(3), { size: 9, bold: true, color: COLORS.nameText, fill });
  styleCell(row.getCell(4), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(5), { size: 9, color: COLORS.nameText, fill });
  styleCell(row.getCell(6), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(7), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(8), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(9), { size: 9, color: COLORS.nameText, fill });
  styleCell(row.getCell(10), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(11), { size: 9, color: COLORS.mutedText, fill });
  styleCell(row.getCell(12), {
    size: 8,
    bold: true,
    color: COLORS.blueText,
    fill: COLORS.statusOpenedBg,
  });

  values.forEach((value, index) => {
    row.getCell(index + 2).value = value;
  });
}

export function styleHardBounceDataRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  values: Array<string | number>,
) {
  const row = worksheet.getRow(rowNumber);
  row.height = ROW_HEIGHTS.data;
  const fill = COLORS.hardBounceRow;

  styleCell(row.getCell(2), { size: 9, color: COLORS.indexText, fill });
  styleCell(row.getCell(3), { size: 9, bold: true, color: COLORS.nameText, fill });
  styleCell(row.getCell(4), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(5), { size: 9, color: COLORS.nameText, fill });
  styleCell(row.getCell(6), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(7), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(8), { size: 9, color: COLORS.redText, fill });
  styleCell(row.getCell(9), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(10), {
    size: 8,
    bold: true,
    color: COLORS.redText,
    fill: COLORS.statusHardBg,
  });

  values.forEach((value, index) => {
    row.getCell(index + 2).value = value;
  });
}

export function styleSoftBounceDataRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  values: Array<string | number>,
) {
  const row = worksheet.getRow(rowNumber);
  row.height = ROW_HEIGHTS.data;
  const fill = COLORS.softBounceRow;

  styleCell(row.getCell(2), { size: 9, color: COLORS.indexText, fill });
  styleCell(row.getCell(3), { size: 9, bold: true, color: COLORS.nameText, fill });
  styleCell(row.getCell(4), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(5), { size: 9, color: COLORS.nameText, fill });
  styleCell(row.getCell(6), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(7), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(8), { size: 9, color: COLORS.amberText, fill });
  styleCell(row.getCell(9), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(10), {
    size: 8,
    bold: true,
    color: COLORS.amberText,
    fill: COLORS.statusSoftBg,
  });

  values.forEach((value, index) => {
    row.getCell(index + 2).value = value;
  });
}

export function styleUnsubDataRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  values: Array<string | number>,
) {
  const row = worksheet.getRow(rowNumber);
  row.height = ROW_HEIGHTS.data;
  const fill = COLORS.unsubRow;

  styleCell(row.getCell(2), { size: 9, color: COLORS.indexText, fill });
  styleCell(row.getCell(3), { size: 9, bold: true, color: COLORS.nameText, fill });
  styleCell(row.getCell(4), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(5), { size: 9, color: COLORS.nameText, fill });
  styleCell(row.getCell(6), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(7), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(8), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(9), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(10), {
    size: 8,
    bold: true,
    color: COLORS.bodyText,
    fill,
  });

  values.forEach((value, index) => {
    row.getCell(index + 2).value = value;
  });
}

export function writeFooterLabel(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  text: string,
  lastColumn: number,
) {
  fillRange(worksheet, rowNumber, 1, lastColumn, COLORS.titleBg);
  styleCell(worksheet.getRow(rowNumber).getCell(2), {
    size: 9,
    color: COLORS.subtitleText,
    fill: COLORS.titleBg,
  });
  worksheet.getRow(rowNumber).getCell(2).value = text;
}

export type SummaryMetricStyle =
  | "default"
  | "clicks"
  | "hardBounce"
  | "softBounce"
  | "unsub";

const SUMMARY_ROW_FILLS: Record<SummaryMetricStyle, string> = {
  default: COLORS.openRow,
  clicks: COLORS.clickerRow,
  hardBounce: COLORS.hardBounceRow,
  softBounce: COLORS.softBounceRow,
  unsub: COLORS.unsubRow,
};

export function styleSummaryOverviewRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  metric: string,
  count: number | string,
  rate: string,
  benchmark: string,
  vsBenchmark: string,
  notes: string,
  metricStyle: SummaryMetricStyle,
) {
  const row = worksheet.getRow(rowNumber);
  row.height = ROW_HEIGHTS.data;
  const fill = SUMMARY_ROW_FILLS[metricStyle];

  styleCell(row.getCell(2), { size: 9, bold: true, color: COLORS.nameText, fill });
  styleCell(row.getCell(3), { size: 9, color: COLORS.nameText, fill });
  styleCell(row.getCell(4), { size: 9, color: COLORS.bodyText, fill });
  styleCell(row.getCell(5), { size: 9, color: COLORS.indexText, fill });
  styleCell(row.getCell(6), {
    size: 9,
    color:
      vsBenchmark.includes("↑") || vsBenchmark.includes("✓")
        ? COLORS.greenText
        : vsBenchmark.includes("↓")
          ? COLORS.redText
          : COLORS.bodyText,
    fill,
  });
  styleCell(row.getCell(7), { size: 9, color: COLORS.indexText, fill });

  row.getCell(2).value = metric;
  row.getCell(3).value = count;
  row.getCell(4).value = rate;
  row.getCell(5).value = benchmark;
  row.getCell(6).value = vsBenchmark;
  row.getCell(7).value = notes;
}

export function styleSummaryCompanyRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  company: string,
  domain: string,
  contactsOpened: number,
  contactsClicked: number,
  totalOpens: number,
  status: "Clicked" | "Opened",
) {
  const row = worksheet.getRow(rowNumber);
  row.height = ROW_HEIGHTS.data;
  const fill = status === "Clicked" ? COLORS.clickerRow : COLORS.openRow;

  styleCell(row.getCell(2), { size: 9, bold: true, color: COLORS.nameText, fill });
  styleCell(row.getCell(3), { size: 9, color: COLORS.domainText, fill });
  styleCell(row.getCell(4), { size: 9, color: COLORS.nameText, fill });
  styleCell(row.getCell(5), {
    size: 9,
    bold: contactsClicked > 0,
    color: contactsClicked > 0 ? COLORS.greenText : COLORS.domainText,
    fill,
  });
  styleCell(row.getCell(6), { size: 9, color: COLORS.nameText, fill });

  if (status === "Clicked") {
    styleCell(row.getCell(7), {
      size: 8,
      bold: true,
      color: COLORS.greenText,
      fill: COLORS.statusClickedBg,
    });
  } else {
    styleCell(row.getCell(7), {
      size: 8,
      bold: true,
      color: COLORS.blueText,
      fill: COLORS.statusOpenedBg,
    });
  }

  row.getCell(2).value = company;
  row.getCell(3).value = domain;
  row.getCell(4).value = contactsOpened;
  row.getCell(5).value = contactsClicked;
  row.getCell(6).value = totalOpens;
  row.getCell(7).value = status;
}

export function setColumnWidths(worksheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
}
