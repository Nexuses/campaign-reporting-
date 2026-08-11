import ExcelJS from "exceljs";
import {
  setColumnWidths,
  setupHeaderBlock,
  styleClickerDataRow,
  styleHardBounceDataRow,
  styleOpenOnlyDataRow,
  styleSoftBounceDataRow,
  styleSummaryCompanyRow,
  styleSummaryOverviewRow,
  styleUnsubDataRow,
  writeFooterLabel,
  writeSectionLabel,
  writeTableHeader,
  type SummaryMetricStyle,
} from "./excel-styles";
import {
  bounceReason,
  classifyBounce,
  extractDomain,
  formatCompany,
  formatDisplayDate,
  formatPersonName,
  getCampaignDate,
  parseBool,
  parseSentTime,
  pct,
} from "./lead-utils";
import type { ConvertOptions, ConvertResult, LeadRow } from "./types";
import { outputFileName } from "./csv-utils";

function compareRate(
  ratePercent: number,
  benchmark: string,
  higherIsBetter: boolean,
): string {
  if (benchmark === "—") {
    return "—";
  }

  const match = benchmark.match(/([\d.]+)/);
  if (!match) {
    return "—";
  }

  const benchmarkValue = Number(match[1]);
  const isAbove = ratePercent > benchmarkValue;
  const isBelow = ratePercent < benchmarkValue;

  if (Math.abs(ratePercent - benchmarkValue) < 0.05) {
    return "✓ OK";
  }

  if (higherIsBetter) {
    return isAbove ? "↑ Above" : isBelow ? "↓ Below" : "✓ OK";
  }

  return isAbove ? "↑ Above" : isBelow ? "✓ OK" : "✓ OK";
}

function parsePercent(value: string): number {
  if (value === "—") {
    return 0;
  }

  return Number(value.replace("%", ""));
}

function buildOpensAndClicksSheet(
  workbook: ExcelJS.Workbook,
  rows: LeadRow[],
  campaignName: string,
  edmLabel: string,
  stats: ConvertResult["stats"],
) {
  const worksheet = workbook.addWorksheet("Opens & Clicks");
  const lastColumn = 12;
  setColumnWidths(worksheet, [3, 22, 24, 20, 16, 12, 11, 10, 7, 8, 18, 8.71]);

  setupHeaderBlock(
    worksheet,
    2,
    `${campaignName} — Opens & Clicks Tracker`,
    `${edmLabel} · ${getCampaignDate(rows)} · ${stats.opens} Opens · ${stats.clicks} Clicks · ${stats.totalSent} Total Sent`,
    lastColumn,
  );

  const clickers = rows.filter(
    (row) => parseBool(row.is_opened) && parseBool(row.is_clicked),
  );
  const opensOnly = rows.filter(
    (row) => parseBool(row.is_opened) && !parseBool(row.is_clicked),
  );

  let currentRow = 6;
  writeSectionLabel(
    worksheet,
    currentRow,
    "CLICKERS  —  Opened & Clicked a Link",
    lastColumn,
  );
  currentRow += 1;

  const openHeaders = [
    "#",
    "Person Name",
    "Email Address",
    "Company",
    "Domain",
    "Open Date",
    "Open Time",
    "Opens",
    "Clicks",
    "CTA Clicked",
    "Status",
  ];
  writeTableHeader(worksheet, currentRow, openHeaders);
  currentRow += 1;

  clickers.forEach((lead, index) => {
    const sent = parseSentTime(lead.sent_time);
    styleClickerDataRow(worksheet, currentRow, [
      index + 1,
      formatPersonName(lead),
      lead.email,
      formatCompany(lead),
      extractDomain(lead.email),
      sent.date,
      sent.time,
      1,
      1,
      "Link Clicked",
      "Clicked",
    ]);
    currentRow += 1;
  });

  currentRow += 1;
  writeSectionLabel(
    worksheet,
    currentRow,
    "OPENS ONLY  —  Opened Email, No Click",
    lastColumn,
  );
  currentRow += 1;
  writeTableHeader(worksheet, currentRow, openHeaders);
  currentRow += 1;

  opensOnly.forEach((lead, index) => {
    const sent = parseSentTime(lead.sent_time);
    styleOpenOnlyDataRow(worksheet, currentRow, [
      index + 1,
      formatPersonName(lead),
      lead.email,
      formatCompany(lead),
      extractDomain(lead.email),
      sent.date,
      sent.time,
      1,
      0,
      "—",
      "Opened",
    ]);
    currentRow += 1;
  });
}

function buildBouncesSheet(
  workbook: ExcelJS.Workbook,
  rows: LeadRow[],
  campaignName: string,
  edmLabel: string,
  stats: ConvertResult["stats"],
) {
  const worksheet = workbook.addWorksheet("Bounces & Unsubscribes");
  const lastColumn = 10;
  setColumnWidths(worksheet, [3, 22, 24, 20, 16, 14, 11, 20, 14, 8.71]);

  setupHeaderBlock(
    worksheet,
    2,
    `${campaignName} — Bounces & Unsubscribes`,
    `${edmLabel} · ${getCampaignDate(rows)} · ${stats.hardBounces} Hard Bounces · ${stats.softBounces} Soft Bounces · ${stats.unsubscribes} Unsubscribes`,
    lastColumn,
  );

  const hardBounces = rows.filter((row) => classifyBounce(row) === "hard");
  const softBounces = rows.filter((row) => classifyBounce(row) === "soft");
  const unsubscribes = rows.filter((row) => parseBool(row.is_unsubscribed ?? "false"));
  const campaignDate = getCampaignDate(rows);

  const headers = [
    "#",
    "Person Name",
    "Email Address",
    "Company",
    "Domain",
    "Send Date",
    "Bounce / Unsub Date",
    "Reason / Note",
    "Status",
  ];

  let currentRow = 6;

  const sections: Array<{
    label: string;
    items: LeadRow[];
    status: string;
    styleRow: (
      sheet: ExcelJS.Worksheet,
      rowNumber: number,
      values: Array<string | number>,
    ) => void;
  }> = [
    {
      label: "HARD BOUNCES  —  Invalid / Permanently Undeliverable",
      items: hardBounces,
      status: "Hard Bounce",
      styleRow: styleHardBounceDataRow,
    },
    {
      label: "SOFT BOUNCES  —  Temporary Delivery Failure",
      items: softBounces,
      status: "Soft Bounce",
      styleRow: styleSoftBounceDataRow,
    },
    {
      label: "UNSUBSCRIBES  —  Opted Out",
      items: unsubscribes,
      status: "Unsubscribed",
      styleRow: styleUnsubDataRow,
    },
  ];

  for (const section of sections) {
    writeSectionLabel(worksheet, currentRow, section.label, lastColumn);
    currentRow += 1;
    writeTableHeader(worksheet, currentRow, headers);
    currentRow += 1;

    section.items.forEach((lead, index) => {
      const sent = parseSentTime(lead.sent_time);
      section.styleRow(worksheet, currentRow, [
        index + 1,
        formatPersonName(lead),
        lead.email,
        formatCompany(lead),
        extractDomain(lead.email),
        sent.date === "—" ? campaignDate : sent.date,
        sent.date,
        bounceReason(lead),
        section.status,
      ]);
      currentRow += 1;
    });

    currentRow += 1;
  }

  writeFooterLabel(
    worksheet,
    currentRow + 1,
    `${campaignName} — Bounces & Unsubscribes · Confidential`,
    lastColumn,
  );
}

function buildSummarySheet(
  workbook: ExcelJS.Workbook,
  rows: LeadRow[],
  campaignName: string,
  edmLabel: string,
  stats: ConvertResult["stats"],
) {
  const worksheet = workbook.addWorksheet("Summary");
  const lastColumn = 7;
  setColumnWidths(worksheet, [3, 30, 16, 12, 13, 14, 20, 8.71]);

  const delivered = stats.totalDelivered;
  const openRate = pct(stats.opens, delivered);
  const clickRate = pct(stats.clicks, delivered);
  const clickToOpenRate = pct(stats.clicks, stats.opens);
  const hardBounceRate = pct(stats.hardBounces, stats.totalSent);
  const softBounceRate = pct(stats.softBounces, stats.totalSent);
  const unsubRate = pct(stats.unsubscribes, delivered);

  setupHeaderBlock(
    worksheet,
    2,
    `${campaignName} — Campaign Summary`,
    `${edmLabel} · Sent ${getCampaignDate(rows)}`,
    lastColumn,
  );

  let currentRow = 6;
  writeSectionLabel(worksheet, currentRow, "CAMPAIGN PERFORMANCE OVERVIEW", lastColumn);
  currentRow += 1;

  writeTableHeader(worksheet, currentRow, [
    "Metric",
    "Count",
    "Rate",
    "Benchmark",
    "vs Benchmark",
    "Notes",
  ]);
  currentRow += 1;

  const overviewRows: Array<{
    metric: string;
    count: number | string;
    rate: string;
    benchmark: string;
    vsBenchmark: string;
    notes: string;
    style: SummaryMetricStyle;
  }> = [
    {
      metric: "Total Sent",
      count: stats.totalSent,
      rate: "—",
      benchmark: "—",
      vsBenchmark: "—",
      notes: "Emails dispatched",
      style: "default",
    },
    {
      metric: "Total Delivered",
      count: delivered,
      rate: "—",
      benchmark: "—",
      vsBenchmark: "—",
      notes: "Excl. all bounces",
      style: "default",
    },
    {
      metric: "Total Opens",
      count: stats.opens,
      rate: openRate,
      benchmark: "20–25%",
      vsBenchmark: compareRate(parsePercent(openRate), "22.5", true),
      notes: "Unique opens",
      style: "default",
    },
    {
      metric: "Total Clicks",
      count: stats.clicks,
      rate: clickRate,
      benchmark: "2–5%",
      vsBenchmark: compareRate(parsePercent(clickRate), "3.5", true),
      notes: "Unique clicks",
      style: "clicks",
    },
    {
      metric: "Click-to-Open Rate",
      count: "—",
      rate: clickToOpenRate,
      benchmark: "10–15%",
      vsBenchmark: compareRate(parsePercent(clickToOpenRate), "12.5", true),
      notes: "Clicks ÷ Opens",
      style: "default",
    },
    {
      metric: "Hard Bounces",
      count: stats.hardBounces,
      rate: hardBounceRate,
      benchmark: "<2%",
      vsBenchmark: compareRate(parsePercent(hardBounceRate), "2", false),
      notes: "Permanent failures",
      style: "hardBounce",
    },
    {
      metric: "Soft Bounces",
      count: stats.softBounces,
      rate: softBounceRate,
      benchmark: "<5%",
      vsBenchmark: compareRate(parsePercent(softBounceRate), "5", false),
      notes: "Temporary failures",
      style: "softBounce",
    },
    {
      metric: "Unsubscribes",
      count: stats.unsubscribes,
      rate: unsubRate,
      benchmark: "<0.5%",
      vsBenchmark: compareRate(parsePercent(unsubRate), "0.5", false),
      notes: "Opted out",
      style: "unsub",
    },
  ];

  overviewRows.forEach((row) => {
    styleSummaryOverviewRow(
      worksheet,
      currentRow,
      row.metric,
      row.count,
      row.rate,
      row.benchmark,
      row.vsBenchmark,
      row.notes,
      row.style,
    );
    currentRow += 1;
  });

  currentRow += 1;
  writeSectionLabel(worksheet, currentRow, "TOP COMPANIES BY ENGAGEMENT", lastColumn);
  currentRow += 1;
  writeTableHeader(worksheet, currentRow, [
    "Company",
    "Domain",
    "Contacts Opened",
    "Contacts Clicked",
    "Total Opens",
    "Status",
  ]);
  currentRow += 1;

  const companyMap = new Map<
    string,
    { company: string; domain: string; opened: number; clicked: number; totalOpens: number }
  >();

  rows.forEach((lead) => {
    const domain = extractDomain(lead.email);
    const key = domain || formatCompany(lead);
    const existing = companyMap.get(key) ?? {
      company: formatCompany(lead),
      domain,
      opened: 0,
      clicked: 0,
      totalOpens: 0,
    };

    if (parseBool(lead.is_opened)) {
      existing.opened += 1;
      existing.totalOpens += 1;
    }

    if (parseBool(lead.is_clicked)) {
      existing.clicked += 1;
    }

    companyMap.set(key, existing);
  });

  const topCompanies = [...companyMap.values()]
    .filter((company) => company.opened > 0 || company.clicked > 0)
    .sort((a, b) => {
      if (b.clicked !== a.clicked) {
        return b.clicked - a.clicked;
      }

      if (b.opened !== a.opened) {
        return b.opened - a.opened;
      }

      return b.totalOpens - a.totalOpens;
    })
    .slice(0, 25);

  topCompanies.forEach((company) => {
    const status = company.clicked > 0 ? "Clicked" : "Opened";
    styleSummaryCompanyRow(
      worksheet,
      currentRow,
      company.company,
      company.domain,
      company.opened,
      company.clicked,
      company.totalOpens,
      status,
    );
    currentRow += 1;
  });
}

function computeStats(
  rows: LeadRow[],
  totalSentOverride?: number,
  totalDeliveredOverride?: number,
): ConvertResult["stats"] {
  const hardBounces = rows.filter((row) => classifyBounce(row) === "hard").length;
  const softBounces = rows.filter((row) => classifyBounce(row) === "soft").length;
  const uniqueLeadCount = new Set(rows.map((row) => row.email.toLowerCase())).size;
  const computedSent = totalSentOverride ?? uniqueLeadCount;
  const computedDelivered =
    totalDeliveredOverride ?? computedSent - hardBounces - softBounces;

  const totalSent = Math.max(0, computedSent);
  const totalDelivered = Math.min(totalSent, Math.max(0, computedDelivered));

  return {
    totalSent,
    totalDelivered,
    opens: rows.filter((row) => parseBool(row.is_opened)).length,
    clicks: rows.filter((row) => parseBool(row.is_clicked)).length,
    hardBounces,
    softBounces,
    unsubscribes: rows.filter((row) => parseBool(row.is_unsubscribed ?? "false")).length,
  };
}

export async function convertLeadsToReport(
  rows: LeadRow[],
  inputFileName: string,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const stats = computeStats(
    rows,
    options.totalSentOverride,
    options.totalDeliveredOverride,
  );
  const campaignName = options.campaignName.trim() || "Campaign Report";
  const edmLabel = options.edmLabel?.trim() || "EDM 1";

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Campaign Report Converter";
  workbook.created = new Date();

  buildOpensAndClicksSheet(workbook, rows, campaignName, edmLabel, stats);
  buildBouncesSheet(workbook, rows, campaignName, edmLabel, stats);
  buildSummarySheet(workbook, rows, campaignName, edmLabel, stats);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    fileName: outputFileName(inputFileName, campaignName),
    buffer,
    stats,
  };
}

export function formatDisplayDateForRows(rows: LeadRow[]): string {
  return getCampaignDate(rows);
}

export { formatDisplayDate };
