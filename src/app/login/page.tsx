"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertTriangle, ArrowRight, Loader2, Lock, User } from "lucide-react";
import { AuthShowcasePane } from "@/components/AuthShowcasePane";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<
    | null
    | "missing"
    | "invalid"
    | "blocked"
    | "network"
    | "google"
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const effectiveErrorKey =
    errorKey ?? (searchParams.get("error") === "AccountBlocked" ? "blocked" : null);

  const errorMessage =
    effectiveErrorKey === "missing"
      ? t.auth.errMissingCreds
      : effectiveErrorKey === "invalid"
        ? t.auth.errInvalidCreds
        : effectiveErrorKey === "blocked"
          ? t.auth.errAccountBlocked
          : effectiveErrorKey === "network"
            ? t.auth.errNetworkLogin
            : effectiveErrorKey === "google"
              ? t.auth.errGoogleNotConfigured
              : null;

  async function handleCredentialsSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorKey(null);
    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setErrorKey("missing");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        username: trimmedUser,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        if (result?.code === "account_blocked") {
          setErrorKey("blocked");
        } else {
          setErrorKey("invalid");
        }
        setIsSubmitting(false);
        return;
      }

      const sessionRes = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "include",
      });
      const sessionData = (await sessionRes.json()) as {
        user?: { role?: string };
      };
      const destination =
        sessionData?.user?.role === "ADMIN" ? "/admin" : "/workspace";

      router.push(destination);
      router.refresh();
    } catch {
      setErrorKey("network");
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setErrorKey(null);
    setIsGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: "/workspace" });
    } catch {
      setErrorKey("google");
      setIsGoogleLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex bg-[#f2fafb]">
      <AuthShowcasePane />

      <section className="relative flex-1 flex flex-col justify-center items-center px-6 py-10 sm:px-10">
        {/* Top-End Language Switcher */}
        <div className="absolute top-5 end-5 sm:top-6 sm:end-6 z-20">
          <LanguageToggle variant="light" id="login-lang-toggle" />
        </div>

        <div className="w-full max-w-[420px] animate-fade-in-up">
          <div className="mb-8 lg:hidden">
            <BrandLogo size={32} variant="dark" showSubtitle />
          </div>

          <div className="rounded-2xl bg-white p-7 sm:p-8 border border-[#9db4c0]/45 shadow-[0_14px_38px_-14px_rgba(37,50,55,0.14)]">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-[#253237]">
                {t.auth.loginTitle}
              </h2>
              <p className="mt-1.5 text-sm text-[#5c6b73]">
                {t.auth.loginSubtitle}
              </p>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="animate-toast-in mb-5 flex items-start gap-2.5 rounded-xl bg-[#e0fbfc] px-3.5 py-3 text-xs font-medium text-[#253237] border-[1.5px] border-[#253237]/45"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#253237]" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              id="google-signin-btn"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isSubmitting}
              className="interactive-chip w-full flex items-center justify-center gap-2.5 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-[#253237] border border-[#9db4c0]/70 hover:bg-[#e0fbfc]/45 hover:border-[#5c6b73] disabled:opacity-50 cursor-pointer"
            >
              {isGoogleLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                  />
                </svg>
              )}
              <span>{t.auth.continueWithGoogle}</span>
            </button>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#9db4c0]/40" />
              <span className="text-[11px] font-medium text-[#5c6b73]">
                {t.auth.orWithCredentials}
              </span>
              <div className="h-px flex-1 bg-[#9db4c0]/40" />
            </div>

            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-semibold text-[#253237] mb-1.5"
                >
                  {t.auth.username}
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5c6b73]" />
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t.auth.usernamePlaceholder}
                    className="w-full rounded-xl bg-[#f2fafb] ps-9 pe-3.5 py-2.5 text-sm text-[#253237] placeholder:text-[#5c6b73]/60 border border-[#9db4c0]/55 focus:outline-none focus:border-[#253237] focus:bg-white focus:ring-2 focus:ring-[#c2dfe3]/60 transition-all"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-[#253237] mb-1.5"
                >
                  {t.auth.password}
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5c6b73]" />
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.auth.passwordPlaceholder}
                    className="w-full rounded-xl bg-[#f2fafb] ps-9 pe-3.5 py-2.5 text-sm text-[#253237] placeholder:text-[#5c6b73]/60 border border-[#9db4c0]/55 focus:outline-none focus:border-[#253237] focus:bg-white focus:ring-2 focus:ring-[#c2dfe3]/60 transition-all"
                  />
                </div>
              </div>

              <button
                id="login-submit-btn"
                type="submit"
                disabled={isSubmitting || isGoogleLoading}
                className="btn-jet w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t.auth.signingIn}</span>
                  </>
                ) : (
                  <>
                    <span>{t.auth.signIn}</span>
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-[#9db4c0]/30 flex items-center justify-between text-xs">
              <span className="text-[#5c6b73]">{t.auth.newToContextLm}</span>
              <Link
                id="goto-signup-link"
                href="/signup"
                className="interactive-chip inline-flex items-center gap-1 rounded-lg bg-[#c2dfe3]/65 hover:bg-[#c2dfe3] px-3 py-1.5 font-semibold text-[#253237]"
              >
                <span>{t.auth.createAccount}</span>
                <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#f2fafb]" />}>
      <LoginFormContent />
    </Suspense>
  );
}
