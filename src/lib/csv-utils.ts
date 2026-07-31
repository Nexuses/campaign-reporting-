import Papa from "papaparse";
import type { LeadRow } from "./types";

type RawRow = Record<string, string | undefined>;

export type CsvFormat = "leads-campaign" | "activity" | "brevo-campaign";

export type ActivityType =
  | "delivered"
  | "opened"
  | "not-opened"
  | "clicked"
  | "bounced"
  | "unsubscribed"
  | "unknown";

const ACTIVITY_FILE_PATTERNS: Array<{ type: ActivityType; pattern: RegExp }> = [
  { type: "not-opened", pattern: /not[-_]opened/i },
  { type: "delivered", pattern: /delivered/i },
  { type: "clicked", pattern: /clicked|click[-_]activities/i },
  { type: "opened", pattern: /opened/i },
  { type: "bounced", pattern: /bounced|bounce[-_]activities/i },
  { type: "unsubscribed", pattern: /unsubscribed|unsubscribe/i },
];

const ACTIVITY_MERGE_ORDER: Record<ActivityType, number> = {
  delivered: 0,
  opened: 1,
  clicked: 2,
  "not-opened": 3,
  bounced: 4,
  unsubscribed: 5,
  unknown: 6,
};

export interface ParsedCsvFile {
  fileName: string;
  format: CsvFormat;
  rows: LeadRow[];
  campaignId?: string;
  activityType?: ActivityType;
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

function pickValue(row: RawRow, keys: string[]): string {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeKey(key), value ?? ""]),
  );

  for (const key of keys) {
    const value = normalized[normalizeKey(key)];
    if (value?.trim()) {
      return value.trim();
    }
  }

  return "";
}

function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/)[0] ?? "";
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function detectFormat(headers: string[]): CsvFormat {
  const normalized = headers.map(normalizeKey);

  if (
    normalized.includes("email_id") ||
    (normalized.includes("campaign_id") && normalized.includes("send_date"))
  ) {
    return "brevo-campaign";
  }

  if (normalized.includes("email_address") || normalized.includes("lead_id")) {
    return "activity";
  }

  return "leads-campaign";
}

function normalizeBrevoDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const match = trimmed.match(
    /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/,
  );

  if (!match) {
    return trimmed;
  }

  const [, day, month, year, hours = "00", minutes = "00", seconds = "00"] = match;
  return new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`).toISOString();
}

function parseCount(value: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeBrevoCampaignRow(row: RawRow): LeadRow | null {
  const email = pickValue(row, ["email_id", "email"]);
  if (!email) {
    return null;
  }

  const openDate = pickValue(row, ["open_date"]);
  const totalOpens = parseCount(pickValue(row, ["total_opens"]));
  const clickedCount = parseCount(pickValue(row, ["clicked_links_count"]));
  const hardBounceDate = pickValue(row, ["hard_bounce_date"]);
  const softBounceDate = pickValue(row, ["soft_bounce_date"]);
  const unsubDate = pickValue(row, ["unsubscribe_date"]);
  const hardReason = pickValue(row, ["hard_bounce_reason"]);
  const softReason = pickValue(row, ["soft_bounce_reason"]);

  const isOpened = openDate || totalOpens > 0 ? "true" : "false";
  const isClicked = clickedCount > 0 ? "true" : "false";
  const isUnsubscribed = unsubDate ? "true" : "false";
  const isBounced = hardBounceDate || softBounceDate ? "true" : "false";

  let leadCategory = "";
  if (hardBounceDate) {
    leadCategory = hardReason ? `hard bounce - ${hardReason}` : "hard bounce";
  } else if (softBounceDate) {
    leadCategory = softReason ? `soft bounce - ${softReason}` : "Message delivery failed";
  }

  const sentTime = normalizeBrevoDate(
    openDate ||
      pickValue(row, ["delivered_date"]) ||
      pickValue(row, ["send_date"]),
  );

  return {
    email,
    first_name: "",
    last_name: "",
    company_name: "",
    phone_number: "",
    website: "",
    location: pickValue(row, ["open_ip"]),
    linkedin_profile: "",
    lead_status: "",
    current_seq_num: "",
    email_account: "",
    lead_category: leadCategory,
    is_opened: isOpened,
    is_clicked: isClicked,
    is_bounced: isBounced,
    is_unsubscribed: isUnsubscribed,
    got_reply: "false",
    sent_time: sentTime,
  };
}

export function extractCampaignId(fileName: string): string | undefined {
  const activityMatch = fileName.match(/campaign-id-(\d+)/i);
  if (activityMatch) {
    return activityMatch[1];
  }

  const brevoMatch = fileName.match(/campaign-\[(\d+)\]/i);
  return brevoMatch?.[1];
}

export function extractActivityType(fileName: string): ActivityType {
  for (const { type, pattern } of ACTIVITY_FILE_PATTERNS) {
    if (pattern.test(fileName)) {
      return type;
    }
  }

  return "unknown";
}

export function activityTypeLabel(activityType: ActivityType): string {
  switch (activityType) {
    case "delivered":
      return "Delivered";
    case "opened":
      return "Opened";
    case "not-opened":
      return "Not opened";
    case "clicked":
      return "Clicked";
    case "bounced":
      return "Bounced";
    case "unsubscribed":
      return "Unsubscribed";
    default:
      return "Unknown";
  }
}

export function activityTypeLabelFromFileName(fileName: string): string {
  if (/campaign-\[/i.test(fileName)) {
    return "Brevo export";
  }

  if (/leads-campaign/i.test(fileName)) {
    return "Leads export";
  }

  const activityType = extractActivityType(fileName);
  if (activityType !== "unknown") {
    return activityTypeLabel(activityType);
  }

  return "Campaign CSV";
}

function normalizeLeadsCampaignRow(row: RawRow): LeadRow | null {
  const email = pickValue(row, ["email"]);
  if (!email) {
    return null;
  }

  return {
    email,
    first_name: pickValue(row, ["first_name"]),
    last_name: pickValue(row, ["last_name"]),
    company_name: pickValue(row, ["company_name"]),
    phone_number: pickValue(row, ["phone_number"]),
    website: pickValue(row, ["website"]),
    location: pickValue(row, ["location"]),
    linkedin_profile: pickValue(row, ["linkedin_profile"]),
    lead_status: pickValue(row, ["lead_status"]),
    current_seq_num: pickValue(row, ["current_seq_num"]),
    email_account: pickValue(row, ["email_account"]),
    lead_category: pickValue(row, ["lead_category"]),
    is_opened: pickValue(row, ["is_opened"]) || "false",
    is_clicked: pickValue(row, ["is_clicked"]) || "false",
    is_bounced: pickValue(row, ["is_bounced"]) || "false",
    is_unsubscribed: pickValue(row, ["is_unsubscribed"]) || "false",
    got_reply: pickValue(row, ["got_reply"]) || "false",
    sent_time: pickValue(row, ["sent_time"]),
  };
}

function normalizeActivityRow(row: RawRow, activityType: ActivityType): LeadRow | null {
  const email = pickValue(row, ["email_address", "email"]);
  if (!email) {
    return null;
  }

  const firstName = pickValue(row, ["first_name", "first name"]);
  const lastName = pickValue(row, ["last_name", "last name"]);
  const sentTime = pickValue(row, [
    "delivered_at",
    "opened_at",
    "bounced_at",
    "unsubscribed_at",
    "sent_time",
  ]);
  const bounceType = pickValue(row, ["bounce_type"]);
  const bounceDetails = pickValue(row, ["bounce_details"]);

  const isOpened =
    activityType === "opened" || activityType === "clicked" ? "true" : "false";

  const isClicked = activityType === "clicked" ? "true" : "false";
  const isBounced = activityType === "bounced" ? "true" : "false";
  const isUnsubscribed = activityType === "unsubscribed" ? "true" : "false";

  return {
    email,
    first_name: firstName,
    last_name: lastName,
    company_name: "",
    phone_number: "",
    website: "",
    location: pickValue(row, ["geo_location"]),
    linkedin_profile: "",
    lead_status: "",
    current_seq_num: "",
    email_account: "",
    lead_category:
      activityType === "bounced"
        ? [bounceType, bounceDetails].filter(Boolean).join(" - ")
        : "",
    is_opened: isOpened,
    is_clicked: isClicked,
    is_bounced: isBounced,
    is_unsubscribed: isUnsubscribed,
    got_reply: "false",
    sent_time: sentTime,
  };
}

export function parseCsvContent(content: string, fileName: string): ParsedCsvFile {
  const delimiter = detectDelimiter(content);
  const result = Papa.parse<RawRow>(content, {
    header: true,
    skipEmptyLines: true,
    delimiter,
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.message ?? "Failed to parse CSV");
  }

  const headers = result.meta.fields ?? [];
  const format = detectFormat(headers);
  const campaignId = extractCampaignId(fileName);
  const activityType = extractActivityType(fileName);

  const rows =
    format === "activity"
      ? result.data
          .map((row) => normalizeActivityRow(row, activityType))
          .filter((row): row is LeadRow => row !== null)
      : format === "brevo-campaign"
        ? result.data
            .map(normalizeBrevoCampaignRow)
            .filter((row): row is LeadRow => row !== null)
        : result.data
            .map(normalizeLeadsCampaignRow)
            .filter((row): row is LeadRow => row !== null);

  return {
    fileName,
    format,
    rows,
    campaignId,
    activityType,
  };
}

export function parseCsv(content: string): LeadRow[] {
  return parseCsvContent(content, "upload.csv").rows;
}

interface MergedLead extends LeadRow {
  is_unsubscribed: string;
}

export function deliveredCountFromFiles(parsedFiles: ParsedCsvFile[]): number | undefined {
  const deliveredFile = parsedFiles.find((file) => file.activityType === "delivered");
  return deliveredFile?.rows.length;
}

export function mergeActivityFiles(parsedFiles: ParsedCsvFile[]): LeadRow[] {
  const sortedFiles = [...parsedFiles].sort(
    (left, right) =>
      (ACTIVITY_MERGE_ORDER[left.activityType ?? "unknown"] ?? 99) -
      (ACTIVITY_MERGE_ORDER[right.activityType ?? "unknown"] ?? 99),
  );

  const merged = new Map<string, MergedLead>();

  function upsert(row: LeadRow): MergedLead {
    const existing = merged.get(row.email.toLowerCase()) ?? {
      ...row,
      is_opened: "false",
      is_clicked: "false",
      is_bounced: "false",
      is_unsubscribed: "false",
      got_reply: "false",
      lead_category: "",
      sent_time: "",
    };

    if (row.first_name) existing.first_name = row.first_name;
    if (row.last_name) existing.last_name = row.last_name;
    if (row.location) existing.location = row.location;
    if (row.sent_time && !existing.sent_time) existing.sent_time = row.sent_time;

    if (row.is_opened === "true") existing.is_opened = "true";
    if (row.is_clicked === "true") existing.is_clicked = "true";
    if (row.is_bounced === "true") {
      existing.is_bounced = "true";
      if (row.lead_category) existing.lead_category = row.lead_category;
      if (row.sent_time) existing.sent_time = row.sent_time;
    }
    if (row.is_unsubscribed === "true") {
      existing.is_unsubscribed = "true";
      if (row.sent_time) existing.sent_time = row.sent_time;
    }

    if (row.is_opened === "true" && row.sent_time) {
      existing.sent_time = row.sent_time;
    }

    merged.set(row.email.toLowerCase(), existing);
    return existing;
  }

  for (const file of sortedFiles) {
    for (const row of file.rows) {
      upsert(row);
    }
  }

  const deliveredFile = parsedFiles.find((file) => file.activityType === "delivered");
  const allRows = [...merged.values()];

  if (!deliveredFile) {
    return allRows;
  }

  const deliveredEmails = new Set(
    deliveredFile.rows.map((row) => row.email.toLowerCase()),
  );

  return allRows.filter(
    (row) =>
      deliveredEmails.has(row.email.toLowerCase()) || row.is_bounced === "true",
  );
}

export function campaignNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.csv$/i, "");
  const campaignMatch = base.match(/campaign-id-(\d+)/i);
  if (campaignMatch) {
    return `Campaign ${campaignMatch[1]} Report`;
  }

  const brevoMatch = base.match(/campaign-\[(\d+)\]/i);
  if (brevoMatch) {
    return `Campaign ${brevoMatch[1]} Report`;
  }

  const leadsMatch = base.match(/leads-campaign-(\d+)/i);
  if (leadsMatch) {
    return `Campaign ${leadsMatch[1]} Report`;
  }

  return base
    .replace(/^\d+\.\s*/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function campaignNameFromCsvContent(content: string, fileName: string): string {
  const parsed = parseCsvContent(content, fileName);
  if (parsed.format !== "brevo-campaign") {
    return campaignNameFromFileName(fileName);
  }

  const delimiter = detectDelimiter(content);
  const preview = Papa.parse<RawRow>(content, {
    header: true,
    preview: 1,
    delimiter,
  });
  const campaignName = pickValue(preview.data[0] ?? {}, ["campaign_name"]);
  if (campaignName) {
    return `${campaignName} Report`;
  }

  return campaignNameFromFileName(fileName);
}

export function outputFileName(inputFileName: string, campaignName: string): string {
  const safeName = campaignName.replace(/[<>:"/\\|?*]/g, "").trim();
  const base = inputFileName.replace(/\.csv$/i, "");
  const normalizedName = safeName || base;
  const suffix = normalizedName.toLowerCase().endsWith("report")
    ? ".xlsx"
    : " Report.xlsx";
  return `${normalizedName}${suffix}`;
}

export function describeCsvFormat(content: string): string {
  const delimiter = detectDelimiter(content);
  const preview = Papa.parse(content, { preview: 1, header: true, delimiter });
  const headers = preview.meta.fields ?? [];
  const format = detectFormat(headers);

  if (format === "activity") {
    return "activity export (Email address, Lead ID, etc.)";
  }

  if (format === "brevo-campaign") {
    return "Brevo campaign export (Email_ID, Open_Date, etc.)";
  }

  return "leads campaign export (email, first_name, is_opened, etc.)";
}
