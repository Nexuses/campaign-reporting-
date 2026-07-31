"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AuthField,
  AuthShell,
  AuthSubmitButton,
} from "@/components/auth/auth-shell";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to sign in.");
      }

      router.push("/");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to sign in.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      formSize="large"
      showTapeStrip
      title="Welcome back"
      subtitle="Sign in to convert and download your campaign reports."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <AuthField
          id="email"
          label="Email"
          type="email"
          large
          value={email}
          placeholder="you@company.com"
          autoComplete="email"
          onChange={setEmail}
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          large
          value={password}
          placeholder="Enter your password"
          autoComplete="current-password"
          onChange={setPassword}
        />

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-[15px] text-red-700">
            {error}
          </div>
        )}

        <AuthSubmitButton large loading={loading}>
          Sign in
        </AuthSubmitButton>
      </form>
    </AuthShell>
  );
}
