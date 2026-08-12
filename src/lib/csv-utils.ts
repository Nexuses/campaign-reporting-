import Papa from "papaparse";
import type { LeadRow } from "./types";

type RawRow = Record<string, string | undefined>;

export type CsvFormat =
  | "leads-campaign"
  | "activity"
  | "brevo-campaign"
  | "sequence-export";

export type ActivityType =
  | "sent"
  | "delivered"
  | "opened"
  | "not-opened"
  | "clicked"
  | "bounced"
  | "unsubscribed"
  | "unknown";

const ACTIVITY_FILE_PATTERNS: Array<{ type: ActivityType; pattern: RegExp }> = [
  { type: "sent", pattern: /(?:^|[-_\s])sent(?:$|[-_\s.]|\.csv)/i },
  { type: "not-opened", pattern: /not[-_\s]?opened/i },
  { type: "delivered", pattern: /delivered/i },
  {
    type: "clicked",
    pattern: /(?:link[-_\s]?)?clicked|click[-_\s]?activities|(?:^|[-_\s])clicks?(?:$|[-_\s.]|\.csv)/i,
  },
  {
    type: "opened",
    pattern: /(?:email[-_\s]?)?opened|(?:^|[-_\s])opens?(?:$|[-_\s.]|\.csv)/i,
  },
  { type: "bounced", pattern: /bounced|bounce[-_]activities/i },
  { type: "unsubscribed", pattern: /unsubscribed|unsubscribe/i },
];

const ACTIVITY_MERGE_ORDER: Record<ActivityType, number> = {
  sent: 0,
  delivered: 1,
  opened: 2,
  clicked: 3,
  "not-opened": 4,
  bounced: 5,
  unsubscribed: 6,
  unknown: 7,
};

export interface ParsedCsvFile {
  fileName: string;
  format: CsvFormat;
  rows: LeadRow[];
  campaignId?: string;
  activityType?: ActivityType;
  sentCount?: number;
}

function normalizeKey(key: string): string {
  return key
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/\s+/g, "_");
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

  if (
    normalized.includes("email") &&
    (normalized.includes("sentat") || normalized.includes("openedat")) &&
    (normalized.includes("firstname") || normalized.includes("companyname"))
  ) {
    return "sequence-export";
  }

  return "leads-campaign";
}

function rowWasSent(row: RawRow): boolean {
  return valuesForKeyPattern(row, /^sentat\d*$/).length > 0;
}

function valuesForKeyPattern(row: RawRow, pattern: RegExp): string[] {
  return Object.entries(row)
    .filter(([key, value]) => pattern.test(normalizeKey(key)) && value?.trim())
    .map(([, value]) => value!.trim());
}

function earliestTimestamp(values: string[]): string {
  if (values.length === 0) {
    return "";
  }

  const sorted = [...values].sort(
    (left, right) => new Date(left).getTime() - new Date(right).getTime(),
  );
  return sorted[0] ?? "";
}

function inferActivityTypeFromHeaders(headers: string[]): ActivityType {
  const normalized = headers.map(normalizeKey);

  const matches: ActivityType[] = [];
  if (normalized.includes("clicked_at")) matches.push("clicked");
  if (normalized.includes("opened_at") && !normalized.includes("clicked_at")) {
    matches.push("opened");
  }
  if (normalized.includes("bounced_at")) matches.push("bounced");
  if (normalized.includes("unsubscribed_at")) matches.push("unsubscribed");
  if (normalized.includes("delivered_at")) matches.push("delivered");
  if (normalized.includes("sent_at")) matches.push("sent");

  // Only infer when exactly one activity timestamp column is present,
  // otherwise filename (or unknown) is safer than a wrong guess.
  return matches.length === 1 ? matches[0] : "unknown";
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
    case "sent":
      return "Sent";
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

  if (/^fil_/i.test(fileName) || /sentat|openedat/i.test(fileName)) {
    return "Sequence export";
  }

  const activityType = extractActivityType(fileName);
  if (activityType !== "unknown") {
    return activityTypeLabel(activityType);
  }

  return "Campaign CSV";
}

function normalizeSequenceExportRow(row: RawRow): LeadRow | null {
  const email = pickValue(row, ["email"]);
  if (!email) {
    return null;
  }

  const sentTimes = valuesForKeyPattern(row, /^sentat\d*$/);
  const openedTimes = valuesForKeyPattern(row, /^openedat\d*$/);
  const clickedTimes = valuesForKeyPattern(row, /^clickedat\d*$/);
  const bouncedTimes = valuesForKeyPattern(row, /^bouncedat\d*$/);
  const unsubTimes = valuesForKeyPattern(row, /^unsubscribedat\d*$/);
  const repliedTimes = valuesForKeyPattern(row, /^repliedat\d*$/);
  const failedMessages = valuesForKeyPattern(row, /^failedmessage\d*$/);

  const isOpened = openedTimes.length > 0 || clickedTimes.length > 0 ? "true" : "false";
  const isClicked = clickedTimes.length > 0 ? "true" : "false";
  const isBounced = bouncedTimes.length > 0 ? "true" : "false";
  const isUnsubscribed = unsubTimes.length > 0 ? "true" : "false";
  const gotReply = repliedTimes.length > 0 ? "true" : "false";

  const sentTime =
    earliestTimestamp(sentTimes) ||
    earliestTimestamp(openedTimes) ||
    earliestTimestamp(clickedTimes) ||
    earliestTimestamp(bouncedTimes);

  return {
    email,
    first_name: pickValue(row, ["firstname", "first_name"]),
    last_name: pickValue(row, ["lastname", "last_name"]),
    company_name: pickValue(row, ["companyname", "company_name"]),
    phone_number: pickValue(row, ["phone", "phone_number"]),
    website: pickValue(row, ["companydomain", "website"]),
    location: pickValue(row, ["location"]),
    linkedin_profile: pickValue(row, ["linkedinurl", "linkedin_profile"]),
    lead_status: pickValue(row, ["jobtitle", "lead_status"]),
    current_seq_num: pickValue(row, ["sentstep", "current_seq_num"]),
    email_account: pickValue(row, ["senduser", "email_account"]),
    lead_category: failedMessages[0] ?? "",
    is_opened: isOpened,
    is_clicked: isClicked,
    is_bounced: isBounced,
    is_unsubscribed: isUnsubscribed,
    got_reply: gotReply,
    sent_time: sentTime,
  };
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

function inferActivityTypeFromRow(
  row: RawRow,
  fileActivityType: ActivityType,
): ActivityType {
  if (fileActivityType !== "unknown") {
    return fileActivityType;
  }

  const event = pickValue(row, [
    "event_type",
    "event",
    "activity",
    "activity_type",
    "type",
    "status",
  ]).toLowerCase();

  if (!event) {
    return "unknown";
  }
  if (/not[-_\s]?open/.test(event)) return "not-opened";
  if (/click/.test(event)) return "clicked";
  if (/open/.test(event)) return "opened";
  if (/bounc/.test(event)) return "bounced";
  if (/unsub|opt[-_\s]?out/.test(event)) return "unsubscribed";
  if (/deliver/.test(event)) return "delivered";
  if (/(^|[^a-z])sent([^a-z]|$)|email sent/.test(event)) return "sent";
  return "unknown";
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
    "clicked_at",
    "bounced_at",
    "unsubscribed_at",
    "sent_at",
    "sent_time",
    "timestamp",
    "time",
    "date",
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
  const fileNameActivityType = extractActivityType(fileName);
  const activityType =
    format === "activity" && fileNameActivityType === "unknown"
      ? inferActivityTypeFromHeaders(headers)
      : fileNameActivityType;

  const rows =
    format === "activity"
      ? result.data
          .map((row) =>
            normalizeActivityRow(row, inferActivityTypeFromRow(row, activityType)),
          )
          .filter((row): row is LeadRow => row !== null)
      : format === "brevo-campaign"
        ? result.data
            .map(normalizeBrevoCampaignRow)
            .filter((row): row is LeadRow => row !== null)
        : format === "sequence-export"
          ? result.data
              .map(normalizeSequenceExportRow)
              .filter((row): row is LeadRow => row !== null)
          : result.data
              .map(normalizeLeadsCampaignRow)
              .filter((row): row is LeadRow => row !== null);

  const sentCount =
    format === "sequence-export"
      ? result.data.filter((row) => rowWasSent(row)).length
      : undefined;

  return {
    fileName,
    format,
    rows,
    campaignId,
    activityType,
    sentCount,
  };
}

export function parseCsv(content: string): LeadRow[] {
  return parseCsvContent(content, "upload.csv").rows;
}

interface MergedLead extends LeadRow {
  is_unsubscribed: string;
}

function uniqueEmailCount(rows: LeadRow[]): number {
  return new Set(rows.map((row) => row.email.toLowerCase())).size;
}

export function deliveredCountFromFiles(parsedFiles: ParsedCsvFile[]): number | undefined {
  const deliveredFile = parsedFiles.find((file) => file.activityType === "delivered");
  if (!deliveredFile) {
    return undefined;
  }

  return uniqueEmailCount(deliveredFile.rows);
}

export function sentCountFromFiles(parsedFiles: ParsedCsvFile[]): number | undefined {
  const sentFile = parsedFiles.find((file) => file.activityType === "sent");
  if (sentFile) {
    return uniqueEmailCount(sentFile.rows);
  }

  const sequenceSent = parsedFiles
    .filter((file) => file.format === "sequence-export")
    .reduce((total, file) => total + (file.sentCount ?? 0), 0);

  return sequenceSent > 0 ? sequenceSent : undefined;
}

function uniqueEmailsFromActivity(
  parsedFiles: ParsedCsvFile[],
  activityType: ActivityType,
): Set<string> {
  const emails = new Set<string>();
  for (const file of parsedFiles) {
    if (file.activityType !== activityType) {
      continue;
    }
    for (const row of file.rows) {
      emails.add(row.email.toLowerCase());
    }
  }
  return emails;
}

/**
 * Resolve Sent vs Delivered independently.
 * - Sent: explicit sent file, else unique(delivered ∪ bounced)
 * - Delivered: explicit delivered file when present
 */
export function resolveSentAndDeliveredCounts(parsedFiles: ParsedCsvFile[]): {
  totalSent?: number;
  totalDelivered?: number;
} {
  const sentFromFile = sentCountFromFiles(parsedFiles);
  const deliveredFromFile = deliveredCountFromFiles(parsedFiles);

  const deliveredEmails = uniqueEmailsFromActivity(parsedFiles, "delivered");
  const bouncedEmails = uniqueEmailsFromActivity(parsedFiles, "bounced");

  let totalSent = sentFromFile;
  if (totalSent === undefined && deliveredEmails.size > 0) {
    const sentEmails = new Set<string>([...deliveredEmails, ...bouncedEmails]);
    totalSent = sentEmails.size;
  }

  let totalDelivered = deliveredFromFile;
  if (
    totalDelivered === undefined &&
    totalSent !== undefined &&
    bouncedEmails.size > 0
  ) {
    totalDelivered = Math.max(0, totalSent - bouncedEmails.size);
  }

  if (totalSent !== undefined && totalDelivered !== undefined) {
    totalDelivered = Math.min(totalSent, totalDelivered);
  }

  return { totalSent, totalDelivered };
}

/**
 * Opens/Clicks source of truth from activity files (unique emails).
 * Click always counts as an open.
 */
export function resolveOpenAndClickCounts(parsedFiles: ParsedCsvFile[]): {
  opens?: number;
  clicks?: number;
  openedEmails: Set<string>;
  clickedEmails: Set<string>;
} {
  const openedEmails = new Set<string>();
  const clickedEmails = new Set<string>();

  for (const file of parsedFiles) {
    if (
      file.format !== "activity" &&
      file.format !== "leads-campaign" &&
      file.format !== "brevo-campaign" &&
      file.format !== "sequence-export"
    ) {
      continue;
    }

    for (const row of file.rows) {
      const email = row.email.toLowerCase();
      if (!email) continue;

      // Prefer explicit activity-file classification when present.
      if (file.activityType === "clicked" || row.is_clicked === "true") {
        clickedEmails.add(email);
        openedEmails.add(email);
        continue;
      }
      if (file.activityType === "opened" || row.is_opened === "true") {
        openedEmails.add(email);
      }
    }
  }

  // Also include dedicated activity-type sets (covers rows before flags if needed).
  for (const email of uniqueEmailsFromActivity(parsedFiles, "clicked")) {
    clickedEmails.add(email);
    openedEmails.add(email);
  }
  for (const email of uniqueEmailsFromActivity(parsedFiles, "opened")) {
    openedEmails.add(email);
  }

  const hasEngagementFiles = parsedFiles.some(
    (file) => file.activityType === "opened" || file.activityType === "clicked",
  );
  const hasEngagementFlags = openedEmails.size > 0 || clickedEmails.size > 0;

  if (!hasEngagementFiles && !hasEngagementFlags) {
    return { openedEmails, clickedEmails };
  }

  return {
    opens: openedEmails.size,
    clicks: clickedEmails.size,
    openedEmails,
    clickedEmails,
  };
}

/**
 * Ensure every opened/clicked email exists in the lead rows with correct flags,
 * so Summary counts and Opens & Clicks sheet rows cannot diverge.
 */
export function applyOpenAndClickEngagement(
  rows: LeadRow[],
  engagement: {
    openedEmails: Set<string>;
    clickedEmails: Set<string>;
  },
): LeadRow[] {
  const { openedEmails, clickedEmails } = engagement;
  if (openedEmails.size === 0 && clickedEmails.size === 0) {
    return rows;
  }

  const byEmail = new Map<string, LeadRow>();
  for (const row of rows) {
    const key = row.email.trim().toLowerCase();
    if (!key) continue;
    byEmail.set(key, { ...row });
  }

  const allEmails = new Set<string>([...openedEmails, ...clickedEmails, ...byEmail.keys()]);
  const result: LeadRow[] = [];

  for (const email of allEmails) {
    const existing = byEmail.get(email);
    const isClicked = clickedEmails.has(email) || existing?.is_clicked === "true";
    const isOpened =
      openedEmails.has(email) ||
      isClicked ||
      existing?.is_opened === "true";

    if (existing) {
      result.push({
        ...existing,
        is_opened: isOpened ? "true" : "false",
        is_clicked: isClicked ? "true" : "false",
      });
      continue;
    }

    if (!openedEmails.has(email) && !clickedEmails.has(email)) {
      continue;
    }

    result.push({
      email,
      first_name: "",
      last_name: "",
      company_name: "",
      phone_number: "",
      website: "",
      location: "",
      linkedin_profile: "",
      lead_status: "",
      current_seq_num: "",
      email_account: "",
      lead_category: "",
      is_opened: isOpened ? "true" : "false",
      is_clicked: isClicked ? "true" : "false",
      is_bounced: "false",
      is_unsubscribed: "false",
      got_reply: "false",
      sent_time: "",
    });
  }

  return result;
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
    if (row.is_clicked === "true") {
      existing.is_clicked = "true";
      existing.is_opened = "true";
    }
    if (row.is_bounced === "true") {
      existing.is_bounced = "true";
      if (row.lead_category) existing.lead_category = row.lead_category;
      if (row.sent_time) existing.sent_time = row.sent_time;
    }
    if (row.is_unsubscribed === "true") {
      existing.is_unsubscribed = "true";
      if (row.sent_time) existing.sent_time = row.sent_time;
    }

    if ((row.is_opened === "true" || row.is_clicked === "true") && row.sent_time) {
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

  const baselineFile =
    parsedFiles.find((file) => file.activityType === "delivered") ??
    parsedFiles.find((file) => file.activityType === "sent");
  const allRows = [...merged.values()];

  if (!baselineFile) {
    return allRows;
  }

  const baselineEmails = new Set(
    baselineFile.rows.map((row) => row.email.toLowerCase()),
  );

  return allRows.filter(
    (row) =>
      baselineEmails.has(row.email.toLowerCase()) ||
      row.is_bounced === "true" ||
      row.is_opened === "true" ||
      row.is_clicked === "true" ||
      row.is_unsubscribed === "true",
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

  const sequenceMatch = base.match(/^fil_[^_]+_(.+)$/i);
  let cleanedBase = sequenceMatch?.[1] ?? base;
  cleanedBase = cleanedBase.replace(/^[a-z0-9]+_/i, "");

  return cleanedBase
    .replace(/^\d+\.\s*/, "")
    .replace(/\s*\(\d+\)\s*$/, "")
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

  if (format === "sequence-export") {
    return "sequence export (email, firstName, sentAt, openedAt, etc.)";
  }

  return "leads campaign export (email, first_name, is_opened, etc.)";
}
