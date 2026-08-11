import { NextResponse } from "next/server";
import {
  campaignNameFromFileName,
  describeCsvFormat,
  mergeActivityFiles,
  parseCsvContent,
  resolveSentAndDeliveredCounts,
} from "@/lib/csv-utils";
import { convertLeadsToReport } from "@/lib/generate-report";

export const runtime = "nodejs";

interface ConvertedFilePayload {
  sourceFileName: string;
  outputFileName: string;
  base64: string;
  stats: {
    totalSent: number;
    totalDelivered: number;
    opens: number;
    clicks: number;
    hardBounces: number;
    softBounces: number;
    unsubscribes: number;
  };
}

function resolveCampaignName(
  fileNames: string[],
  campaignNames: Record<string, string>,
): string {
  for (const fileName of fileNames) {
    const customName = campaignNames[fileName]?.trim();
    if (customName) {
      return customName;
    }
  }

  return campaignNameFromFileName(fileNames[0] ?? "Campaign Report");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "Upload at least one CSV file." }, { status: 400 });
    }

    const campaignNamesRaw = formData.get("campaignNames");
    const campaignNames =
      typeof campaignNamesRaw === "string" && campaignNamesRaw.trim()
        ? (JSON.parse(campaignNamesRaw) as Record<string, string>)
        : {};

    const edmLabelRaw = formData.get("edmLabel");
    const edmLabel = typeof edmLabelRaw === "string" ? edmLabelRaw : "EDM 1";

    const parsedFiles = [];

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".csv")) {
        return NextResponse.json(
          { error: `"${file.name}" is not a CSV file.` },
          { status: 400 },
        );
      }

      const content = await file.text();
      const parsed = parseCsvContent(content, file.name);

      if (parsed.rows.length === 0) {
        return NextResponse.json(
          {
            error: `"${file.name}" does not contain any lead rows.`,
            hint: `Detected format: ${describeCsvFormat(content)}. Expected an "email" or "Email address" column with contact data.`,
          },
          { status: 400 },
        );
      }

      parsedFiles.push(parsed);
    }

    const fileNames = parsedFiles.map((file) => file.fileName);
    const campaignName = resolveCampaignName(fileNames, campaignNames);
    const converted: ConvertedFilePayload[] = [];

    if (parsedFiles.length === 1) {
      const parsed = parsedFiles[0];
      const counts = resolveSentAndDeliveredCounts(parsedFiles);
      const result = await convertLeadsToReport(parsed.rows, parsed.fileName, {
        campaignName,
        edmLabel,
        totalSentOverride: counts.totalSent,
        totalDeliveredOverride: counts.totalDelivered,
      });

      converted.push({
        sourceFileName: parsed.fileName,
        outputFileName: result.fileName,
        base64: result.buffer.toString("base64"),
        stats: result.stats,
      });
    } else {
      const mergedRows = mergeActivityFiles(parsedFiles);
      const sourceFileName = fileNames.join(", ");
      const counts = resolveSentAndDeliveredCounts(parsedFiles);
      const result = await convertLeadsToReport(mergedRows, fileNames[0] ?? "merged-campaign.csv", {
        campaignName,
        edmLabel,
        totalSentOverride: counts.totalSent,
        totalDeliveredOverride: counts.totalDelivered,
      });

      converted.push({
        sourceFileName,
        outputFileName: result.fileName,
        base64: result.buffer.toString("base64"),
        stats: result.stats,
      });
    }

    return NextResponse.json({ files: converted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Conversion failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
