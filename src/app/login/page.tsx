"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertTriangle, ArrowRight, Loader2, Lock, User } from "lucide-react";
import { AuthShowcasePane } from "@/components/AuthShowcasePane";
import { BrandLogo } from "@/components/BrandLogo";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  async function handleCredentialsSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setError("Please enter both your username and password.");
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
        setError("Invalid username or password. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // Fetch live session to route ADMIN directly to /admin and USER to /workspace
      const sessionRes = await fetch("/api/auth/session", { cache: "no-store" });
      const sessionData = (await sessionRes.json()) as {
        user?: { role?: string };
      };
      const destination =
        sessionData?.user?.role === "ADMIN" ? "/admin" : "/workspace";

      router.push(destination);
      router.refresh();
    } catch {
      setError("Network error while signing in. Please try again.");
      setIsSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setIsGoogleLoading(true);
    try {
      await signIn("google", { callbackUrl: "/workspace" });
    } catch {
      setError(
        "Google OAuth is not configured on this instance. Use username/password or configure GOOGLE_CLIENT_ID."
      );
      setIsGoogleLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex bg-[#f7fafb]">
      <AuthShowcasePane />

      <section className="flex-1 flex flex-col justify-center items-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <BrandLogo size={32} variant="dark" showSubtitle />
          </div>

          <div className="rounded-2xl bg-white p-7 sm:p-8 border border-[#373737]/12 shadow-[0_8px_30px_rgba(55,55,55,0.06)]">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold tracking-tight text-[#373737]">
                Sign in to ContextLM
              </h2>
              <p className="mt-1.5 text-sm text-[#373737]/65">
                Access your grounded document notebook or telemetry portal.
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

            <button
              id="google-signin-btn"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isSubmitting}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-[#373737] border border-[#373737]/20 hover:bg-[#f7fafb] hover:border-[#373737]/35 transition-colors disabled:opacity-50 cursor-pointer"
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
              <span>Continue with Google</span>
            </button>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#373737]/12" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#373737]/50">
                Or with credentials
              </span>
              <div className="h-px flex-1 bg-[#373737]/12" />
            </div>

            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-xs font-semibold text-[#373737] mb-1.5"
                >
                  Username
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#373737]/45" />
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. alex_chen or admin"
                    className="w-full rounded-xl bg-[#f7fafb] pl-9 pr-3.5 py-2.5 text-sm text-[#373737] placeholder:text-[#373737]/40 border border-[#373737]/15 focus:outline-none focus:border-[#373737] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-semibold text-[#373737] mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#373737]/45" />
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl bg-[#f7fafb] pl-9 pr-3.5 py-2.5 text-sm text-[#373737] placeholder:text-[#373737]/40 border border-[#373737]/15 focus:outline-none focus:border-[#373737] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <button
                id="login-submit-btn"
                type="submit"
                disabled={isSubmitting || isGoogleLoading}
                className="btn-graphite w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#f6feaa] cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-[#373737]/10 flex items-center justify-between text-xs">
              <span className="text-[#373737]/65">New to ContextLM?</span>
              <Link
                id="goto-signup-link"
                href="/signup"
                className="inline-flex items-center gap-1 rounded-lg bg-[#c7dfc5]/60 hover:bg-[#c7dfc5] px-3 py-1.5 font-semibold text-[#373737] transition-colors"
              >
                <span>Create Account</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
