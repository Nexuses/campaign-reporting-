import type { LeadRow } from "./types";

export function parseBool(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

export function extractDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function formatPersonName(row: LeadRow): string {
  const first = row.first_name?.trim();
  const last = row.last_name?.trim();

  if (first && last) {
    return `${first} ${last}`;
  }

  if (first) {
    return first;
  }

  const localPart = row.email.split("@")[0] ?? "";
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatCompany(row: LeadRow): string {
  const company = row.company_name?.trim();
  if (company) {
    return company.replace(/\s+/g, "");
  }

  const domain = extractDomain(row.email);
  const root = domain.split(".")[0] ?? domain;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

export function parseSentTime(sentTime: string): { date: string; time: string } {
  if (!sentTime) {
    return { date: "—", time: "—" };
  }

  const parsed = parseFlexibleDate(sentTime);
  if (Number.isNaN(parsed.getTime())) {
    return { date: "—", time: "—" };
  }

  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const year = parsed.getUTCFullYear();
  const hours = String(parsed.getUTCHours()).padStart(2, "0");
  const minutes = String(parsed.getUTCMinutes()).padStart(2, "0");
  const seconds = String(parsed.getUTCSeconds()).padStart(2, "0");

  return {
    date: `${day}-${month}-${year}`,
    time: `${hours}:${minutes}:${seconds}`,
  };
}

function parseFlexibleDate(value: string): Date {
  const trimmed = value.trim();
  const brevoMatch = trimmed.match(
    /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/,
  );

  if (brevoMatch) {
    const [, day, month, year, hours = "00", minutes = "00", seconds = "00"] = brevoMatch;
    return new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`);
  }

  return new Date(trimmed);
}

export function formatDisplayDate(sentTime: string): string {
  if (!sentTime) {
    return "—";
  }

  const parsed = parseFlexibleDate(sentTime);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type BounceType = "hard" | "soft";

export function classifyBounce(row: LeadRow): BounceType | null {
  if (!parseBool(row.is_bounced)) {
    return null;
  }

  const category = row.lead_category?.toLowerCase() ?? "";
  if (row.lead_status === "BLOCKED") {
    return "hard";
  }

  if (category.includes("hard")) {
    return "hard";
  }

  if (
    category.includes("soft") ||
    category.includes("sender originated") ||
    category.includes("transient")
  ) {
    return "soft";
  }

  return "soft";
}

export function bounceReason(row: LeadRow): string {
  if (row.lead_category?.trim()) {
    return row.lead_category.trim();
  }

  const type = classifyBounce(row);
  if (type === "hard") {
    return "hard bounce";
  }

  if (type === "soft") {
    return "Message delivery failed";
  }

  return "—";
}

export function getCampaignDate(rows: LeadRow[]): string {
  const timestamps = rows
    .map((row) => row.sent_time)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));

  if (timestamps.length === 0) {
    return formatDisplayDate(new Date().toISOString());
  }

  const earliest = new Date(Math.min(...timestamps));
  return formatDisplayDate(earliest.toISOString());
}

export function pct(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return "—";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
