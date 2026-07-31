"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthTapeStrip } from "@/components/auth/auth-tape-strip";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  formSize?: "default" | "large";
  showTapeStrip?: boolean;
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  formSize = "default",
  showTapeStrip = false,
}: AuthShellProps) {
  const isLarge = formSize === "large";

  return (
    <div
      className={`relative min-h-full overflow-x-hidden text-foreground ${
        showTapeStrip ? "pb-24 sm:pb-28" : ""
      }`}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-accent/8 blur-3xl" />
      </div>

      {showTapeStrip && <AuthTapeStrip />}

      <main className="relative z-10 mx-auto flex min-h-full w-full max-w-6xl items-center px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12">
          <section className="hidden animate-fade-up lg:block">
            <Image
              src="/nexuses-logo.png"
              alt="Nexuses"
              width={180}
              height={26}
              priority
              className="mb-10 h-8 w-auto"
            />
            <p className="mb-4 inline-flex items-center rounded-full border border-accent/15 bg-accent/5 px-3 py-1 text-xs font-medium text-accent">
              Campaign Report Converter
            </p>
            <h1 className="max-w-md text-4xl font-medium leading-tight tracking-tight">
              Turn CSV exports into polished Excel reports.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-7 text-muted">
              Upload delivered, opened, bounced, and unsubscribed files in one
              batch. The tool reads file names, merges the data, and generates
              your formatted report.
            </p>

            <div className="mt-10 grid max-w-md gap-3">
              {[
                "Merge 4–5 activity files into one report",
                "Auto-detect opens, bounces, and unsubscribes",
                "Download Excel in your campaign template",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-2xl border border-border/70 bg-surface/70 px-4 py-3 backdrop-blur-sm"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-semibold text-accent">
                    ✓
                  </span>
                  <p className="text-sm leading-6 text-foreground">{item}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="animate-fade-up">
            <div
              className={`mx-auto w-full rounded-3xl border border-accent/25 bg-surface/90 shadow-[0_20px_60px_rgba(30,69,77,0.12)] ring-1 ring-accent/10 backdrop-blur-sm ${
                isLarge
                  ? "max-w-lg p-8 sm:p-10"
                  : "max-w-md p-7 sm:p-8"
              }`}
            >
              <div className="mb-8 lg:hidden">
                <Image
                  src="/nexuses-logo.png"
                  alt="Nexuses"
                  width={160}
                  height={24}
                  priority
                  className="mx-auto mb-6 h-7 w-auto"
                />
              </div>

              <div className={`text-center lg:text-left ${isLarge ? "mb-10" : "mb-8"}`}>
                <h2
                  className={`font-medium tracking-tight ${
                    isLarge ? "text-3xl" : "text-2xl"
                  }`}
                >
                  {title}
                </h2>
                <p
                  className={`mt-2 leading-6 text-muted ${
                    isLarge ? "text-[15px]" : "text-sm"
                  }`}
                >
                  {subtitle}
                </p>
              </div>

              {children}

              {footer && (
                <div
                  className={`text-center text-muted lg:text-left ${
                    isLarge ? "mt-8 text-[15px]" : "mt-6 text-sm"
                  }`}
                >
                  {footer}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

interface AuthFieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  placeholder?: string;
  autoComplete?: string;
  large?: boolean;
  onChange: (value: string) => void;
}

export function AuthField({
  id,
  label,
  type = "text",
  value,
  placeholder,
  autoComplete,
  large = false,
  onChange,
}: AuthFieldProps) {
  return (
    <label htmlFor={id} className="block">
      <span
        className={`mb-2 block font-medium ${
          large ? "text-[15px]" : "text-sm"
        }`}
      >
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-xl border border-accent/20 bg-background outline-none transition focus:border-accent/50 focus:ring-4 focus:ring-accent/10 ${
          large ? "px-4 py-3.5 text-base" : "px-4 py-3 text-sm"
        }`}
      />
    </label>
  );
}

export function AuthSubmitButton({
  children,
  loading,
  large = false,
}: {
  children: ReactNode;
  loading?: boolean;
  large?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={`flex w-full items-center justify-center rounded-xl bg-accent font-medium text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70 ${
        large ? "px-4 py-3.5 text-base" : "px-4 py-3 text-sm"
      }`}
    >
      {loading ? "Please wait..." : children}
    </button>
  );
}

export function AuthLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="font-medium text-accent transition hover:text-accent-hover">
      {children}
    </Link>
  );
}
