import ExcelJS from "exceljs";
import {
  extractActivityType,
  mergeActivityFiles,
  parseCsvContent,
  resolveSentAndDeliveredCounts,
} from "../src/lib/csv-utils";
import { convertLeadsToReport } from "../src/lib/generate-report";

type Expectation = {
  name: string;
  totalSent: number;
  totalDelivered: number;
  opens: number;
  clicks: number;
  hardBounces: number;
  softBounces: number;
};

function assertEqual(label: string, actual: number, expected: number) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function activityCsv(
  emails: Array<{ email: string; first?: string; last?: string; at?: string; bounceType?: string }>,
  timestampColumn: string,
): string {
  const header = [
    "Email address",
    "First Name",
    "Last Name",
    "Lead ID",
    timestampColumn,
    "bounce_type",
    "bounce_details",
  ].join(",");

  const rows = emails.map((row, index) =>
    [
      row.email,
      row.first ?? "Test",
      row.last ?? `User${index + 1}`,
      String(1000 + index),
      row.at ?? "2026-03-01T10:00:00Z",
      row.bounceType ?? "",
      row.bounceType ? "failed" : "",
    ].join(","),
  );

  return [header, ...rows].join("\n");
}

async function readSummaryCounts(buffer: Buffer): Promise<{
  totalSent: number;
  totalDelivered: number;
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Summary");
  if (!sheet) {
    throw new Error("Summary sheet missing");
  }

  let totalSent = -1;
  let totalDelivered = -1;

  sheet.eachRow((row) => {
    const metric = String(row.getCell(2).value ?? "");
    const count = Number(row.getCell(3).value ?? NaN);
    if (metric === "Total Sent") totalSent = count;
    if (metric === "Total Delivered") totalDelivered = count;
  });

  return { totalSent, totalDelivered };
}

async function runCase(
  name: string,
  files: Array<{ fileName: string; content: string }>,
  expected: Expectation,
) {
  const parsedFiles = files.map((file) => parseCsvContent(file.content, file.fileName));
  const mergedRows = mergeActivityFiles(parsedFiles);
  const counts = resolveSentAndDeliveredCounts(parsedFiles);
  const result = await convertLeadsToReport(mergedRows, files[0]?.fileName ?? "merged.csv", {
    campaignName: "Accuracy Test",
    edmLabel: "EDM 1",
    totalSentOverride: counts.totalSent,
    totalDeliveredOverride: counts.totalDelivered,
  });

  assertEqual(`${name} totalSent`, result.stats.totalSent, expected.totalSent);
  assertEqual(`${name} totalDelivered`, result.stats.totalDelivered, expected.totalDelivered);
  assertEqual(`${name} opens`, result.stats.opens, expected.opens);
  assertEqual(`${name} clicks`, result.stats.clicks, expected.clicks);
  assertEqual(`${name} hardBounces`, result.stats.hardBounces, expected.hardBounces);
  assertEqual(`${name} softBounces`, result.stats.softBounces, expected.softBounces);

  const excel = await readSummaryCounts(result.buffer);
  assertEqual(`${name} excel Total Sent`, excel.totalSent, expected.totalSent);
  assertEqual(`${name} excel Total Delivered`, excel.totalDelivered, expected.totalDelivered);

  // Core accuracy invariant for this bug
  if (result.stats.totalDelivered === result.stats.totalSent && expected.totalDelivered !== expected.totalSent) {
    throw new Error(`${name}: Delivered incorrectly equals Sent`);
  }

  console.log(`PASS  ${name}`);
  console.log(
    `      Sent=${result.stats.totalSent} Delivered=${result.stats.totalDelivered} Opens=${result.stats.opens} Clicks=${result.stats.clicks} Hard=${result.stats.hardBounces} Soft=${result.stats.softBounces}`,
  );
}

async function main() {
  // Detection sanity
  assertEqual(
    "detect delivered filename",
    extractActivityType("campaign-id-111-delivered.csv") === "delivered" ? 1 : 0,
    1,
  );
  assertEqual(
    "detect sent filename",
    extractActivityType("campaign-id-111-sent.csv") === "sent" ? 1 : 0,
    1,
  );
  assertEqual(
    "detect opened filename",
    extractActivityType("campaign-id-111-opened.csv") === "opened" ? 1 : 0,
    1,
  );

  // Case A: Instantly-style multi-file (no explicit sent file)
  // Delivered: a,b,c,d,e (5)
  // Opened: a,b,c (3)
  // Clicked: a (1)
  // Bounced: f hard, g soft (2) — not in delivered
  // Expected Sent = 7, Delivered = 5
  await runCase(
    "instantly multi-file without sent",
    [
      {
        fileName: "campaign-id-100-delivered.csv",
        content: activityCsv(
          [
            { email: "a@ex.com" },
            { email: "b@ex.com" },
            { email: "c@ex.com" },
            { email: "d@ex.com" },
            { email: "e@ex.com" },
          ],
          "delivered_at",
        ),
      },
      {
        fileName: "campaign-id-100-opened.csv",
        content: activityCsv(
          [{ email: "a@ex.com" }, { email: "b@ex.com" }, { email: "c@ex.com" }],
          "opened_at",
        ),
      },
      {
        fileName: "campaign-id-100-clicked.csv",
        content: activityCsv([{ email: "a@ex.com" }], "clicked_at"),
      },
      {
        fileName: "campaign-id-100-bounced.csv",
        content: activityCsv(
          [
            { email: "f@ex.com", bounceType: "hard" },
            { email: "g@ex.com", bounceType: "soft" },
          ],
          "bounced_at",
        ),
      },
    ],
    {
      name: "instantly multi-file without sent",
      totalSent: 7,
      totalDelivered: 5,
      opens: 3,
      clicks: 1,
      hardBounces: 1,
      softBounces: 1,
    },
  );

  // Case B: explicit sent + delivered files (Delivered must NOT equal Sent)
  // Sent: 6, Delivered: 4, Bounced: 2
  await runCase(
    "explicit sent and delivered files",
    [
      {
        fileName: "campaign-id-200-sent.csv",
        content: activityCsv(
          [
            { email: "a@ex.com" },
            { email: "b@ex.com" },
            { email: "c@ex.com" },
            { email: "d@ex.com" },
            { email: "e@ex.com" },
            { email: "f@ex.com" },
          ],
          "sent_at",
        ),
      },
      {
        fileName: "campaign-id-200-delivered.csv",
        content: activityCsv(
          [
            { email: "a@ex.com" },
            { email: "b@ex.com" },
            { email: "c@ex.com" },
            { email: "d@ex.com" },
          ],
          "delivered_at",
        ),
      },
      {
        fileName: "campaign-id-200-opened.csv",
        content: activityCsv([{ email: "a@ex.com" }, { email: "b@ex.com" }], "opened_at"),
      },
      {
        fileName: "campaign-id-200-bounced.csv",
        content: activityCsv(
          [
            { email: "e@ex.com", bounceType: "hard" },
            { email: "f@ex.com", bounceType: "soft" },
          ],
          "bounced_at",
        ),
      },
    ],
    {
      name: "explicit sent and delivered files",
      totalSent: 6,
      totalDelivered: 4,
      opens: 2,
      clicks: 0,
      hardBounces: 1,
      softBounces: 1,
    },
  );

  // Case C: duplicate emails in delivered file must not inflate Delivered
  await runCase(
    "delivered duplicates do not inflate counts",
    [
      {
        fileName: "campaign-id-300-delivered.csv",
        content: activityCsv(
          [
            { email: "a@ex.com" },
            { email: "a@ex.com" },
            { email: "b@ex.com" },
            { email: "b@ex.com" },
            { email: "c@ex.com" },
          ],
          "delivered_at",
        ),
      },
      {
        fileName: "campaign-id-300-opened.csv",
        content: activityCsv([{ email: "a@ex.com" }], "opened_at"),
      },
      {
        fileName: "campaign-id-300-bounced.csv",
        content: activityCsv([{ email: "d@ex.com", bounceType: "hard" }], "bounced_at"),
      },
    ],
    {
      name: "delivered duplicates do not inflate counts",
      totalSent: 4,
      totalDelivered: 3,
      opens: 1,
      clicks: 0,
      hardBounces: 1,
      softBounces: 0,
    },
  );

  // Case D: regression — Delivered must never be computed as "same as Sent file"
  // when only delivered exists with no bounces: equal is OK, but Excel labels must still
  // come from delivered override (5), not a swapped mapping.
  await runCase(
    "delivered-only multi-file equals sent when no bounces",
    [
      {
        fileName: "campaign-id-400-delivered.csv",
        content: activityCsv(
          [
            { email: "a@ex.com" },
            { email: "b@ex.com" },
            { email: "c@ex.com" },
            { email: "d@ex.com" },
            { email: "e@ex.com" },
          ],
          "delivered_at",
        ),
      },
      {
        fileName: "campaign-id-400-opened.csv",
        content: activityCsv([{ email: "a@ex.com" }, { email: "b@ex.com" }], "opened_at"),
      },
    ],
    {
      name: "delivered-only multi-file equals sent when no bounces",
      totalSent: 5,
      totalDelivered: 5,
      opens: 2,
      clicks: 0,
      hardBounces: 0,
      softBounces: 0,
    },
  );

  // Case E: leads-campaign single export (Delivered = Sent − bounces)
  {
    const lead = (fields: {
      email: string;
      first: string;
      last: string;
      leadStatus?: string;
      leadCategory?: string;
      opened?: boolean;
      clicked?: boolean;
      bounced?: boolean;
    }) =>
      [
        fields.email,
        fields.first,
        fields.last,
        "",
        "",
        "",
        "",
        "",
        fields.leadStatus ?? "",
        "",
        "",
        fields.leadCategory ?? "",
        String(fields.opened ?? false),
        String(fields.clicked ?? false),
        String(fields.bounced ?? false),
        "false",
        "false",
        "2026-03-01T10:00:00Z",
      ].join(",");

    const leadsContent = [
      "email,first_name,last_name,company_name,phone_number,website,location,linkedin_profile,lead_status,current_seq_num,email_account,lead_category,is_opened,is_clicked,is_bounced,is_unsubscribed,got_reply,sent_time",
      lead({ email: "a@ex.com", first: "A", last: "One", opened: true }),
      lead({ email: "b@ex.com", first: "B", last: "Two", opened: true, clicked: true }),
      lead({ email: "c@ex.com", first: "C", last: "Three" }),
      lead({
        email: "d@ex.com",
        first: "D",
        last: "Four",
        leadStatus: "BLOCKED",
        leadCategory: "hard bounce",
        bounced: true,
      }),
      lead({
        email: "e@ex.com",
        first: "E",
        last: "Five",
        leadCategory: "soft bounce",
        bounced: true,
      }),
    ].join("\n");

    const parsed = parseCsvContent(leadsContent, "leads-campaign-500.csv");
    const counts = resolveSentAndDeliveredCounts([parsed]);
    const result = await convertLeadsToReport(parsed.rows, parsed.fileName, {
      campaignName: "Leads Test",
      edmLabel: "EDM 1",
      totalSentOverride: counts.totalSent,
      totalDeliveredOverride: counts.totalDelivered,
    });

    assertEqual("leads totalSent", result.stats.totalSent, 5);
    assertEqual("leads totalDelivered", result.stats.totalDelivered, 3);
    assertEqual("leads opens", result.stats.opens, 2);
    assertEqual("leads clicks", result.stats.clicks, 1);
    assertEqual("leads hardBounces", result.stats.hardBounces, 1);
    assertEqual("leads softBounces", result.stats.softBounces, 1);

    const excel = await readSummaryCounts(result.buffer);
    assertEqual("leads excel Total Sent", excel.totalSent, 5);
    assertEqual("leads excel Total Delivered", excel.totalDelivered, 3);
    console.log("PASS  leads-campaign single file");
    console.log(
      `      Sent=${result.stats.totalSent} Delivered=${result.stats.totalDelivered} Opens=${result.stats.opens} Clicks=${result.stats.clicks} Hard=${result.stats.hardBounces} Soft=${result.stats.softBounces}`,
    );
  }

  console.log("\nAll delivered/sent accuracy checks passed.");
}

main().catch((error) => {
  console.error("\nFAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
