"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  activityTypeLabel,
  activityTypeLabelFromFileName,
  campaignNameFromCsvContent,
  campaignNameFromFileName,
  extractActivityType,
} from "@/lib/csv-utils";

interface ConvertedFile {
  sourceFileName: string;
  outputFileName: string;
  base64: string;
  stats: {
    totalSent: number;
    opens: number;
    clicks: number;
    hardBounces: number;
    softBounces: number;
    unsubscribes: number;
  };
}

interface UploadItem {
  id: string;
  file: File;
  campaignName: string;
}

const CARD_CLASS =
  "flex h-full min-h-[520px] flex-col rounded-2xl border border-border/80 bg-surface shadow-[0_4px_24px_rgba(44,44,42,0.06)]";

function downloadBase64File(base64: string, fileName: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}


function formatTotalSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function StepIndicator({ step, active, done }: { step: number; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${active ? "font-medium text-foreground" : done ? "text-accent" : "text-muted"}`}>
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
          done
            ? "bg-accent text-white"
            : active
              ? "bg-accent/15 text-accent ring-2 ring-accent/20"
              : "bg-surface-muted text-muted"
        }`}
      >
        {done ? "✓" : step}
      </span>
      {step === 1 ? "Upload" : step === 2 ? "Convert" : "Download"}
    </div>
  );
}

export default function ConverterPage() {
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [edmLabel, setEdmLabel] = useState("EDM 1");
  const [convertedFiles, setConvertedFiles] = useState<ConvertedFile[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { user?: { name?: string } };
        setUserName(payload.user?.name ?? null);
      } catch {
        setUserName(null);
      }
    }

    void loadUser();
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const campaignNames = useMemo(() => {
    return Object.fromEntries(
      uploadItems.map((item) => [item.file.name, item.campaignName]),
    );
  }, [uploadItems]);

  const hasFiles = uploadItems.length > 0;
  const hasResults = convertedFiles.length > 0;
  const isSplitView = hasFiles || hasResults;

  const totalUploadSize = useMemo(
    () => uploadItems.reduce((sum, item) => sum + item.file.size, 0),
    [uploadItems],
  );

  const primaryCampaignName = uploadItems[0]?.campaignName ?? "";

  const detectedActivityTypes = useMemo(() => {
    const types = uploadItems
      .map((item) => extractActivityType(item.file.name))
      .filter((type) => type !== "unknown");
    return [...new Set(types)];
  }, [uploadItems]);

  async function addFiles(fileList: FileList | null) {
    if (!fileList) {
      return;
    }

    const csvFiles = Array.from(fileList).filter((file) =>
      file.name.toLowerCase().endsWith(".csv"),
    );

    if (csvFiles.length === 0) {
      setError("Please upload CSV files only.");
      return;
    }

    setError(null);
    setConvertedFiles([]);

    const nextItems = await Promise.all(
      csvFiles.map(async (file) => {
        const content = await file.text();
        return {
          id: `${file.name}-${file.lastModified}`,
          file,
          campaignName: campaignNameFromCsvContent(content, file.name),
        };
      }),
    );

    const batchCampaignName = nextItems[0]?.campaignName ?? "";
    setUploadItems(
      nextItems.map((item) => ({ ...item, campaignName: batchCampaignName })),
    );
  }

  function removeItem(id: string) {
    setUploadItems((current) => current.filter((item) => item.id !== id));
    setConvertedFiles([]);
  }

  function updateBatchCampaignName(campaignName: string) {
    setUploadItems((current) =>
      current.map((item) => ({ ...item, campaignName })),
    );
    setConvertedFiles([]);
  }

  async function handleConvert() {
    if (uploadItems.length === 0) {
      setError("Upload at least one CSV file.");
      return;
    }

    setIsConverting(true);
    setError(null);
    setConvertedFiles([]);

    try {
      const formData = new FormData();
      uploadItems.forEach((item) => {
        formData.append("files", item.file);
      });
      formData.append("campaignNames", JSON.stringify(campaignNames));
      formData.append("edmLabel", edmLabel);

      const response = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        files?: ConvertedFile[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          [payload.error, "hint" in payload ? String(payload.hint) : ""]
            .filter(Boolean)
            .join(" "),
        );
      }

      setConvertedFiles(payload.files ?? []);
    } catch (convertError) {
      const message =
        convertError instanceof Error
          ? convertError.message
          : "Conversion failed.";
      setError(message);
    } finally {
      setIsConverting(false);
    }
  }

  const dropZoneInner = (
    <label
      htmlFor="csv-upload"
      className="flex h-full min-h-[200px] cursor-pointer flex-col items-center justify-center px-5 py-8 text-center"
    >
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${
          isDragging ? "bg-accent/10" : "bg-surface-muted"
        }`}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className={isDragging ? "text-accent" : "text-muted"}
          aria-hidden
        >
          <path
            d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="text-[15px] font-medium">
        {isDragging ? "Drop your CSV files here" : "Drop CSV files or click to browse"}
      </p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
        Select multiple files in one go — they merge into one Excel report.
      </p>
      <span className="mt-4 inline-flex items-center rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover">
        Choose files
      </span>
      <input
        id="csv-upload"
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </label>
  );

  return (
    <div className="relative min-h-full overflow-hidden text-foreground">
      {userName && (
        <div className="absolute right-5 top-5 z-10 flex items-center gap-3 sm:right-8 sm:top-8">
          <span className="hidden rounded-full border border-border/70 bg-surface/80 px-3 py-1.5 text-xs text-muted backdrop-blur-sm sm:inline">
            Signed in as <span className="font-medium text-foreground">{userName}</span>
          </span>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-full border border-border/70 bg-surface/80 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm transition hover:bg-surface-muted"
          >
            Sign out
          </button>
        </div>
      )}

      <main
        className={`relative mx-auto w-full px-5 pb-20 pt-12 transition-all duration-500 ease-out sm:px-8 sm:pt-14 ${
          isSplitView ? "max-w-5xl" : "max-w-2xl"
        }`}
      >
        {/* Logo always centered */}
        <div className="mb-8 flex flex-col items-center text-center sm:mb-10">
          <Image
            src="/nexuses-logo.png"
            alt="Nexuses"
            width={180}
            height={26}
            priority
            className="mb-6 h-7 w-auto sm:h-8"
          />

          <h1 className="max-w-lg text-[1.75rem] font-medium leading-[1.25] tracking-tight sm:text-[2rem]">
            {isSplitView
              ? "Convert your campaign reports"
              : "Turn CSV exports into polished Excel reports"}
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-7 text-muted">
            {isSplitView
              ? uploadItems.length > 1
                ? `${uploadItems.length} files will merge into one Excel report.`
                : "Upload on the left, download from the right."
              : "Select 4–5 CSV files at once — they merge into one Excel report."}
          </p>
        </div>

        {!isSplitView ? (
          /* Single centered upload before files */
          <div className="animate-fade-up">
            <section
              className={`rounded-2xl border-2 border-dashed bg-surface/80 backdrop-blur-sm transition-all duration-300 ${
                isDragging
                  ? "scale-[1.01] border-accent/60 bg-surface-muted shadow-[0_8px_30px_rgba(30,69,77,0.08)]"
                  : "border-border/80 hover:border-border hover:bg-surface"
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                addFiles(event.dataTransfer.files);
              }}
            >
              <label
                htmlFor="csv-upload"
                className="flex cursor-pointer flex-col items-center px-6 py-12 text-center sm:py-14"
              >
                <div
                  className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
                    isDragging ? "bg-accent/10" : "bg-surface-muted"
                  }`}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    className={isDragging ? "text-accent" : "text-muted"}
                    aria-hidden
                  >
                    <path
                      d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="text-[15px] font-medium">
                  {isDragging ? "Drop your CSV files here" : "Drop CSV files or click to browse"}
                </p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
                  Select 4–5 CSV files at once — merged into one Excel report.
                </p>
                <span className="mt-5 inline-flex items-center rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover">
                  Choose files
                </span>
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  className="hidden"
                  onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
                />
              </label>
            </section>

            {error && (
              <div className="mt-5 rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3.5 text-sm leading-6 text-red-700">
                {error}
              </div>
            )}
          </div>
        ) : (
          /* Equal left & right cards */
          <div className="grid animate-fade-up grid-cols-1 items-stretch gap-5 lg:grid-cols-2 lg:gap-6">
            {/* Left card */}
            <div className={`${CARD_CLASS} animate-shift-left`}>
              <div className="border-b border-border/70 px-5 py-4">
                <h2 className="text-sm font-medium">Upload & convert</h2>
                <p className="mt-0.5 text-xs text-muted">
                  Add CSV files and generate your report
                </p>
                <p className="mt-1 text-[11px] leading-4 text-muted">
                  Upload all files together — they merge into one report.
                </p>
              </div>

              <div
                className={`mx-4 mt-4 flex-1 rounded-xl border-2 border-dashed transition-all duration-300 ${
                  isDragging
                    ? "border-accent/60 bg-surface-muted"
                    : "border-border/70 bg-background hover:border-border"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  addFiles(event.dataTransfer.files);
                }}
              >
                {dropZoneInner}
              </div>

              {error && (
                <div className="mx-4 mt-3 rounded-xl border border-red-200/80 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-700">
                  {error}
                </div>
              )}

              {hasFiles && !hasResults && (
                <div className="mx-4 mt-4">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-xs font-medium text-muted">Campaign name</span>
                    <input
                      value={primaryCampaignName}
                      onChange={(event) =>
                        updateBatchCampaignName(event.target.value)
                      }
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/10"
                    />
                  </label>
                </div>
              )}

              <div className="mt-auto p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="flex flex-1 flex-col gap-1.5 text-sm">
                    <span className="text-xs font-medium text-muted">EDM label</span>
                    <input
                      value={edmLabel}
                      onChange={(event) => setEdmLabel(event.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent/40 focus:ring-2 focus:ring-accent/10"
                      placeholder="EDM 1"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleConvert}
                    disabled={isConverting || !hasFiles}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white shadow-[0_2px_12px_rgba(30,69,77,0.25)] transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                  >
                    {isConverting ? (
                      <>
                        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" className="opacity-25" />
                          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        Converting...
                      </>
                    ) : (
                      "Convert to Excel"
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right card */}
            <div className={`${CARD_CLASS} animate-slide-in-right`}>
              <div className="border-b border-border/70 px-5 py-4">
                <h2 className="text-sm font-medium">
                  {hasResults ? "Your reports" : "Uploaded files"}
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {hasResults
                    ? "Merged report ready to download"
                    : uploadItems.length > 1
                      ? `${uploadItems.length} files · merges into 1 report · ${formatTotalSize(totalUploadSize)}`
                      : `${uploadItems.length} file · ${formatTotalSize(totalUploadSize)}`}
                </p>
              </div>

              {!hasResults && hasFiles && (
                <div className="mx-4 mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-accent/10 px-3 py-2.5 text-center">
                    <p className="text-lg font-semibold text-accent">{uploadItems.length}</p>
                    <p className="text-[10px] text-muted">Files</p>
                  </div>
                  <div className="rounded-xl bg-accent/10 px-3 py-2.5 text-center">
                    <p className="text-lg font-semibold text-accent">{formatTotalSize(totalUploadSize)}</p>
                    <p className="text-[10px] text-muted">Total size</p>
                  </div>
                  <div className="rounded-xl bg-accent/10 px-3 py-2.5 text-center">
                    <p className="truncate text-sm font-semibold text-accent">{edmLabel}</p>
                    <p className="text-[10px] text-muted">EDM label</p>
                  </div>
                </div>
              )}

              {!hasResults && hasFiles && primaryCampaignName && (
                <div className="mx-4 mt-3 rounded-xl border border-border/60 bg-background px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Campaign</p>
                  <p className="mt-0.5 truncate text-sm font-medium">{primaryCampaignName}</p>
                </div>
              )}

              {!hasResults && hasFiles && detectedActivityTypes.length > 0 && (
                <div className="mx-4 mt-3 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                    Detected from file names
                  </p>
                  <p className="mt-1 text-xs leading-5 text-foreground">
                    {detectedActivityTypes.map((type) => activityTypeLabel(type)).join(" · ")}
                  </p>
                </div>
              )}

              <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
                {hasResults ? (
                  <div className="space-y-3">
                    {convertedFiles.map((file) => (
                      <div
                        key={file.sourceFileName}
                        className="rounded-xl border border-border/60 bg-background p-4"
                      >
                        <div className="mb-3 flex items-center gap-2 rounded-lg bg-success-bg px-3 py-2">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-success" aria-hidden>
                            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="text-xs font-medium text-success">Report ready</span>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-[10px] font-bold text-accent">
                            XLSX
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium leading-snug">
                              {file.outputFileName}
                            </p>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">
                              {file.sourceFileName}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-surface-muted px-2.5 py-2 text-center">
                            <p className="text-sm font-semibold">{file.stats.totalSent}</p>
                            <p className="text-[10px] text-muted">Sent</p>
                          </div>
                          <div className="rounded-lg bg-surface-muted px-2.5 py-2 text-center">
                            <p className="text-sm font-semibold">{file.stats.opens}</p>
                            <p className="text-[10px] text-muted">Opens</p>
                          </div>
                          <div className="rounded-lg bg-surface-muted px-2.5 py-2 text-center">
                            <p className="text-sm font-semibold">{file.stats.clicks}</p>
                            <p className="text-[10px] text-muted">Clicks</p>
                          </div>
                          <div className="rounded-lg bg-surface-muted px-2.5 py-2 text-center">
                            <p className="text-sm font-semibold">
                              {file.stats.hardBounces + file.stats.softBounces}
                            </p>
                            <p className="text-[10px] text-muted">Bounces</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            downloadBase64File(file.base64, file.outputFileName)
                          }
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Download Excel
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {uploadItems.map((item, index) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-border/60 bg-background p-3.5"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-[10px] font-bold text-accent">
                              {String(index + 1).padStart(2, "0")}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium">{item.file.name}</p>
                                <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-muted">
                                  {activityTypeLabelFromFileName(item.file.name)}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-muted">
                                {(item.file.size / 1024).toFixed(1)} KB
                              </p>
                              <p className="mt-1.5 truncate text-[11px] text-accent/80">
                                → {item.campaignName}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              aria-label={`Remove ${item.file.name}`}
                              className="shrink-0 rounded-md p-1 text-muted transition hover:bg-surface-muted hover:text-foreground"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-border/60 bg-background p-4">
                      <p className="mb-3 text-xs font-medium">Progress</p>
                      <div className="flex items-center justify-between gap-2">
                        <StepIndicator step={1} active={false} done />
                        <div className="h-px flex-1 bg-accent/30" />
                        <StepIndicator step={2} active={!isConverting} done={false} />
                        <div className="h-px flex-1 bg-border" />
                        <StepIndicator step={3} active={false} done={false} />
                      </div>
                      <p className="mt-3 text-[11px] leading-5 text-muted">
                        {uploadItems.length > 1
                          ? "All files will merge into one Excel report. Hit "
                          : "Hit "}
                        <span className="font-medium text-foreground">Convert to Excel</span> to
                        generate your report.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
