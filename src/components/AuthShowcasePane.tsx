import { ShieldCheck, Zap, FileCheck2, Lock } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

export function AuthShowcasePane() {
  return (
    <div className="auth-brand-mesh relative hidden lg:flex lg:w-[52%] flex-col justify-between p-10 xl:p-14 overflow-hidden border-r border-[#373737]/10">
      {/* Subtle geometric vector backdrop */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]"
        viewBox="0 0 800 900"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="660" cy="180" r="190" stroke="#373737" strokeWidth="1" strokeDasharray="6 6" />
        <circle cx="140" cy="740" r="240" stroke="#373737" strokeWidth="1" strokeDasharray="4 8" />
        <path d="M0 540 C 240 460, 540 620, 800 500" stroke="#373737" strokeWidth="1" />
        <path d="M0 590 C 260 510, 560 660, 800 540" stroke="#373737" strokeWidth="1" opacity="0.5" />
      </svg>

      <div className="relative z-10">
        <BrandLogo size={34} variant="dark" showSubtitle />
      </div>

      <div className="relative z-10 max-w-lg space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/80 backdrop-blur-sm px-3.5 py-1.5 text-xs font-semibold text-[#373737] border border-[#373737]/12 shadow-xs">
          <Lock className="h-3.5 w-3.5" />
          <span>Strictly Grounded • Zero External Hallucination</span>
        </div>

        <h1 className="text-4xl xl:text-[42px] font-semibold tracking-tight text-[#373737] leading-[1.12]">
          Interrogate your documents at sub-second speed.
        </h1>

        <p className="text-[15px] leading-relaxed text-[#373737]/80">
          Upload up to 10 PDFs, contracts, specs, or spreadsheets and receive
          deterministic answers grounded exclusively in your selected sources—with
          clickable inline citations and 4-layer prompt-injection defense.
        </p>

        {/* Architecture highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="rounded-xl bg-white/85 backdrop-blur-xs p-3.5 border border-[#373737]/10 shadow-xs">
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#c1dbe3] text-[#373737]">
              <Zap className="h-4 w-4" />
            </div>
            <p className="text-xs font-semibold text-[#373737]">Fast-Path SSE</p>
            <p className="mt-0.5 text-[11px] leading-snug text-[#373737]/70">
              Prefix-cached 1.05M context streaming with zero vector-DB drag.
            </p>
          </div>

          <div className="rounded-xl bg-white/85 backdrop-blur-xs p-3.5 border border-[#373737]/10 shadow-xs">
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#c7dfc5] text-[#373737]">
              <FileCheck2 className="h-4 w-4" />
            </div>
            <p className="text-xs font-semibold text-[#373737]">Inline Citations</p>
            <p className="mt-0.5 text-[11px] leading-snug text-[#373737]/70">
              Every claim links directly to its numbered source snippet.
            </p>
          </div>

          <div className="rounded-xl bg-white/85 backdrop-blur-xs p-3.5 border border-[#373737]/10 shadow-xs">
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#fce694] text-[#373737]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <p className="text-xs font-semibold text-[#373737]">4-Layer Guard</p>
            <p className="mt-0.5 text-[11px] leading-snug text-[#373737]/70">
              Regex, nonce XML sandbox, nano classifier &amp; output canary.
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between text-xs text-[#373737]/70 border-t border-[#373737]/12 pt-5">
        <span className="font-mono">Deterministic Fast-Path Pipeline v1.0</span>
        <span>PDF • DOCX • TXT • MD • CSV</span>
      </div>
    </div>
  );
}
