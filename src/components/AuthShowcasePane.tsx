"use client";

import { ShieldCheck, Zap, FileCheck2, Lock } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useLanguage } from "@/lib/i18n";

export function AuthShowcasePane() {
  const { lang, t } = useLanguage();
  const isHe = lang === "he";

  return (
    <div className="auth-brand-mesh relative hidden lg:flex lg:w-[50%] flex-col justify-between p-12 xl:p-16 overflow-hidden border-e border-slate-800 text-white">
      <div className="relative z-10">
        <BrandLogo size={32} variant="light" showSubtitle />
      </div>

      <div
        dir={isHe ? "rtl" : "ltr"}
        className="relative z-10 max-w-lg space-y-6"
      >
        <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/15 px-3.5 py-1.5 text-xs font-medium text-teal-200 border border-teal-400/30">
          <Lock className="h-3.5 w-3.5 text-teal-300" />
          <span>{t.auth.badge}</span>
        </div>

        <h1 className="text-4xl xl:text-[42px] font-semibold tracking-tight text-white leading-[1.15]">
          {t.auth.headline}
        </h1>

        <p className="text-[15px] leading-relaxed text-slate-300">
          {t.auth.description}
        </p>

        {/* Architecture highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/10">
          <div className="space-y-1.5">
            <Zap className="h-4 w-4 text-teal-400" />
            <p className="text-xs font-semibold text-white">
              {t.auth.feature1Title}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-400">
              {t.auth.feature1Desc}
            </p>
          </div>

          <div className="space-y-1.5">
            <FileCheck2 className="h-4 w-4 text-emerald-400" />
            <p className="text-xs font-semibold text-white">
              {t.auth.feature2Title}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-400">
              {t.auth.feature2Desc}
            </p>
          </div>

          <div className="space-y-1.5">
            <ShieldCheck className="h-4 w-4 text-blue-400" />
            <p className="text-xs font-semibold text-white">
              {t.auth.feature3Title}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-400">
              {t.auth.feature3Desc}
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 border-t border-white/10 pt-5">
        <span className="font-mono">{t.auth.footerPipeline}</span>
        <span dir="ltr" className="font-mono text-slate-300">
          PDF · DOCX · TXT · MD · CSV
        </span>
      </div>
    </div>
  );
}
