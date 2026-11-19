"use client";

import { Globe } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface LanguageToggleProps {
  variant?: "dark" | "light";
  id?: string;
}

export function LanguageToggle({
  variant = "dark",
  id = "language-toggle-btn",
}: LanguageToggleProps) {
  const { toggleLang, t } = useLanguage();

  const styles =
    variant === "dark"
      ? "bg-white/10 hover:bg-[#e0fbfc]/20 text-[#e0fbfc] border border-[#c2dfe3]/25 hover:border-[#e0fbfc]/50"
      : "bg-white/90 hover:bg-[#e0fbfc] text-[#253237] border border-[#9db4c0]/60 hover:border-[#5c6b73] shadow-xs";

  return (
    <button
      id={id}
      type="button"
      onClick={toggleLang}
      title={t.lang.switchTitle}
      aria-label={t.lang.switchTitle}
      className={`interactive-chip inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${styles}`}
    >
      <Globe className="h-3.5 w-3.5 shrink-0" />
      <span>{t.lang.switchLabel}</span>
    </button>
  );
}
