"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Loader2,
  Lock,
  User,
} from "lucide-react";
import { AuthShowcasePane } from "@/components/AuthShowcasePane";
import { BrandLogo } from "@/components/BrandLogo";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedUser = username.trim();
    const trimmedName = name.trim();

    if (!USERNAME_PATTERN.test(trimmedUser)) {
      setError(
        "Username must be 3–24 characters using only letters, numbers, and underscores."
      );
      return;
    }

    if (!trimmedName) {
      setError("Please enter your display name.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmedUser,
          name: trimmedName,
          password,
          confirmPassword,
        }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Unable to create account.");
        setIsSubmitting(false);
        return;
      }

      // Auto-sign-in right after registration
      const loginRes = await signIn("credentials", {
        username: trimmedUser,
        password,
        redirect: false,
      });

      if (loginRes?.error) {
        router.push("/login");
        return;
      }

      router.push("/workspace");
      router.refresh();
    } catch {
      setError("Network error while creating your account. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex bg-[#f7fafb]">
      <AuthShowcasePane />

      <section className="flex-1 flex flex-col justify-center items-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[430px]">
          <div className="mb-8 lg:hidden">
            <BrandLogo size={32} variant="dark" showSubtitle />
          </div>

          <div className="rounded-2xl bg-white p-7 sm:p-8 border border-[#373737]/12 shadow-[0_8px_30px_rgba(55,55,55,0.06)]">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-[#373737]">
                Create your account
              </h2>
              <p className="mt-1.5 text-sm text-[#373737]/65">
                Start uploading up to 10 grounded sources in seconds.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-xl bg-[#fce694] px-3.5 py-3 text-xs font-medium text-[#373737] border border-[#373737]/25"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="signup-username"
                  className="block text-xs font-semibold text-[#373737] mb-1.5"
                >
                  Username
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#373737]/45" />
                  <input
                    id="signup-username"
                    name="username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="3–24 letters, numbers, or _"
                    className="w-full rounded-xl bg-[#f7fafb] pl-9 pr-3.5 py-2.5 text-sm text-[#373737] placeholder:text-[#373737]/40 border border-[#373737]/15 focus:outline-none focus:border-[#373737] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-name"
                  className="block text-xs font-semibold text-[#373737] mb-1.5"
                >
                  Display Name
                </label>
                <div className="relative">
                  <BadgeCheck className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#373737]/45" />
                  <input
                    id="signup-name"
                    name="name"
                    type="text"
                    required
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Maya Patel"
                    className="w-full rounded-xl bg-[#f7fafb] pl-9 pr-3.5 py-2.5 text-sm text-[#373737] placeholder:text-[#373737]/40 border border-[#373737]/15 focus:outline-none focus:border-[#373737] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-semibold text-[#373737] mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#373737]/45" />
                  <input
                    id="signup-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full rounded-xl bg-[#f7fafb] pl-9 pr-3.5 py-2.5 text-sm text-[#373737] placeholder:text-[#373737]/40 border border-[#373737]/15 focus:outline-none focus:border-[#373737] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-confirm-password"
                  className="block text-xs font-semibold text-[#373737] mb-1.5"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#373737]/45" />
                  <input
                    id="signup-confirm-password"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full rounded-xl bg-[#f7fafb] pl-9 pr-3.5 py-2.5 text-sm text-[#373737] placeholder:text-[#373737]/40 border border-[#373737]/15 focus:outline-none focus:border-[#373737] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <button
                id="signup-submit-btn"
                type="submit"
                disabled={isSubmitting}
                className="btn-graphite w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#f6feaa] cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating account…</span>
                  </>
                ) : (
                  <>
                    <span>Sign Up &amp; Open Notebook</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-[#373737]/10 flex items-center justify-between text-xs">
              <span className="text-[#373737]/65">Already have an account?</span>
              <Link
                id="goto-login-link"
                href="/login"
                className="inline-flex items-center gap-1 font-semibold text-[#373737] hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Sign In</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
