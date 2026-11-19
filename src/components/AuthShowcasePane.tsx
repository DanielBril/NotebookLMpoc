"use client";

import { ShieldCheck, Zap, FileCheck2, Lock } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useLanguage } from "@/lib/i18n";

export function AuthShowcasePane() {
  const { t } = useLanguage();

  return (
    <div className="auth-brand-mesh relative hidden lg:flex lg:w-[52%] flex-col justify-between p-10 xl:p-14 overflow-hidden border-e border-[#253237]/12">
      {/* Subtle animated geometric vector backdrop */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.2] animate-float-slow"
        viewBox="0 0 800 900"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="660"
          cy="180"
          r="190"
          stroke="#253237"
          strokeWidth="1"
          strokeDasharray="6 6"
        />
        <circle
          cx="140"
          cy="740"
          r="240"
          stroke="#253237"
          strokeWidth="1"
          strokeDasharray="4 8"
        />
        <path
          d="M0 540 C 240 460, 540 620, 800 500"
          stroke="#253237"
          strokeWidth="1"
        />
        <path
          d="M0 590 C 260 510, 560 660, 800 540"
          stroke="#253237"
          strokeWidth="1"
          opacity="0.5"
        />
      </svg>

      <div className="relative z-10 animate-fade-in-up">
        <BrandLogo size={34} variant="dark" showSubtitle />
      </div>

      <div className="relative z-10 max-w-lg space-y-6">
        <div className="animate-fade-in-up stagger-1 inline-flex items-center gap-2 rounded-full bg-white/85 backdrop-blur-sm px-3.5 py-1.5 text-xs font-semibold text-[#253237] border border-[#253237]/15 shadow-xs">
          <Lock className="h-3.5 w-3.5 text-[#5c6b73]" />
          <span>{t.auth.badge}</span>
        </div>

        <h1 className="animate-fade-in-up stagger-2 text-4xl xl:text-[42px] font-semibold tracking-tight text-[#253237] leading-[1.14]">
          {t.auth.headline}
        </h1>

        <p className="animate-fade-in-up stagger-3 text-[15px] leading-relaxed text-[#253237]/85">
          {t.auth.description}
        </p>

        {/* Architecture highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="animate-fade-in-up stagger-2 interactive-card rounded-xl bg-white/88 backdrop-blur-xs p-3.5 border border-[#253237]/12 shadow-xs">
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#e0fbfc] text-[#253237] border border-[#9db4c0]/40">
              <Zap className="h-4 w-4" />
            </div>
            <p className="text-xs font-semibold text-[#253237]">
              {t.auth.feature1Title}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-[#5c6b73]">
              {t.auth.feature1Desc}
            </p>
          </div>

          <div className="animate-fade-in-up stagger-3 interactive-card rounded-xl bg-white/88 backdrop-blur-xs p-3.5 border border-[#253237]/12 shadow-xs">
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#c2dfe3] text-[#253237] border border-[#9db4c0]/40">
              <FileCheck2 className="h-4 w-4" />
            </div>
            <p className="text-xs font-semibold text-[#253237]">
              {t.auth.feature2Title}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-[#5c6b73]">
              {t.auth.feature2Desc}
            </p>
          </div>

          <div className="animate-fade-in-up stagger-4 interactive-card rounded-xl bg-white/88 backdrop-blur-xs p-3.5 border border-[#253237]/12 shadow-xs">
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#253237] text-[#e0fbfc]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <p className="text-xs font-semibold text-[#253237]">
              {t.auth.feature3Title}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-[#5c6b73]">
              {t.auth.feature3Desc}
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between text-xs text-[#253237]/80 border-t border-[#253237]/15 pt-5">
        <span className="font-mono">{t.auth.footerPipeline}</span>
        <span dir="ltr">PDF • DOCX • TXT • MD • CSV</span>
      </div>
    </div>
  );
}
