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
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

export default function SignupPage() {
  const router = useRouter();
  const { lang, t } = useLanguage();
  const isHe = lang === "he";
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
      setError(t.auth.errUsernamePattern);
      return;
    }

    if (!trimmedName) {
      setError(t.auth.errDisplayName);
      return;
    }

    if (password.length < 8) {
      setError(t.auth.errPasswordLength);
      return;
    }

    if (password !== confirmPassword) {
      setError(t.auth.errPasswordMismatch);
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
        setError(data.error || t.auth.errUnableCreate);
        setIsSubmitting(false);
        return;
      }

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
      setError(t.auth.errNetworkSignup);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh flex bg-slate-50">
      <AuthShowcasePane />

      <section className="relative flex-1 flex flex-col justify-center items-center px-4 py-6 sm:px-10 sm:py-10">
        {/* Desktop Top-End Language Switcher */}
        <div className="hidden lg:block absolute top-6 end-6 z-20">
          <LanguageToggle variant="light" id="signup-lang-toggle-desktop" />
        </div>

        <div className="w-full max-w-[420px]">
          {/* Mobile Header: BrandLogo + LanguageToggle cleanly aligned */}
          <div className="mb-5 flex items-center justify-between gap-3 lg:hidden">
            <BrandLogo size={28} variant="dark" showSubtitle />
            <LanguageToggle variant="light" id="signup-lang-toggle" />
          </div>

          <div
            dir={isHe ? "rtl" : "ltr"}
            className="rounded-2xl bg-white p-5 sm:p-8 border border-slate-200 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.1)]"
          >
            <div className="mb-5 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                {t.auth.signupTitle}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-500">
                {t.auth.signupSubtitle}
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-lg bg-rose-50 px-3.5 py-3 text-xs font-medium text-rose-900 border border-rose-200 border-s-4 border-s-rose-600"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="signup-username"
                  className="block text-xs font-semibold text-[#253237] mb-1.5"
                >
                  {t.auth.username}
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5c6b73]" />
                  <input
                    id="signup-username"
                    name="username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t.auth.usernameSignupPlaceholder}
                    className="w-full rounded-xl bg-[#f2fafb] ps-9 pe-3.5 py-2.5 text-[16px] sm:text-sm text-[#253237] placeholder:text-[#5c6b73]/60 border border-[#9db4c0]/55 focus:outline-none focus:border-[#253237] focus:bg-white focus:ring-2 focus:ring-[#c2dfe3]/60 transition-all"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-name"
                  className="block text-xs font-semibold text-[#253237] mb-1.5"
                >
                  {t.auth.displayName}
                </label>
                <div className="relative">
                  <BadgeCheck className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5c6b73]" />
                  <input
                    id="signup-name"
                    name="name"
                    type="text"
                    required
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.auth.displayNamePlaceholder}
                    className="w-full rounded-xl bg-[#f2fafb] ps-9 pe-3.5 py-2.5 text-[16px] sm:text-sm text-[#253237] placeholder:text-[#5c6b73]/60 border border-[#9db4c0]/55 focus:outline-none focus:border-[#253237] focus:bg-white focus:ring-2 focus:ring-[#c2dfe3]/60 transition-all"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="block text-xs font-semibold text-[#253237] mb-1.5"
                >
                  {t.auth.password}
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5c6b73]" />
                  <input
                    id="signup-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.auth.passwordMinPlaceholder}
                    className="w-full rounded-xl bg-[#f2fafb] ps-9 pe-3.5 py-2.5 text-[16px] sm:text-sm text-[#253237] placeholder:text-[#5c6b73]/60 border border-[#9db4c0]/55 focus:outline-none focus:border-[#253237] focus:bg-white focus:ring-2 focus:ring-[#c2dfe3]/60 transition-all"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-confirm-password"
                  className="block text-xs font-semibold text-[#253237] mb-1.5"
                >
                  {t.auth.confirmPassword}
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5c6b73]" />
                  <input
                    id="signup-confirm-password"
                    name="confirmPassword"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t.auth.confirmPasswordPlaceholder}
                    className="w-full rounded-xl bg-[#f2fafb] ps-9 pe-3.5 py-2.5 text-[16px] sm:text-sm text-[#253237] placeholder:text-[#5c6b73]/60 border border-[#9db4c0]/55 focus:outline-none focus:border-[#253237] focus:bg-white focus:ring-2 focus:ring-[#c2dfe3]/60 transition-all"
                  />
                </div>
              </div>

              <button
                id="signup-submit-btn"
                type="submit"
                disabled={isSubmitting}
                className="btn-jet w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t.auth.creatingAccount}</span>
                  </>
                ) : (
                  <>
                    <span>{t.auth.signUpAndOpen}</span>
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-[#9db4c0]/30 flex items-center justify-between text-xs">
              <span className="text-[#5c6b73]">{t.auth.alreadyHaveAccount}</span>
              <Link
                id="goto-login-link"
                href="/login"
                className="inline-flex items-center gap-1 font-semibold text-[#253237] hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                <span>{t.auth.signIn}</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
