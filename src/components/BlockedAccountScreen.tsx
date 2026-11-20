"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Ban, LogOut } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n";

interface BlockedAccountScreenProps {
  reason?: string | null;
}

export function BlockedAccountScreen({ reason }: BlockedAccountScreenProps) {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <main className="min-h-screen flex flex-col bg-[#f2fafb] text-[#253237]">
      <header className="px-6 py-4 flex items-center justify-between border-b border-[#9db4c0]/35 bg-white/80 backdrop-blur-xs">
        <BrandLogo size={30} variant="dark" showSubtitle />
        <LanguageToggle variant="light" id="blocked-lang-toggle" />
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="animate-fade-in-up w-full max-w-md rounded-2xl bg-white p-8 border border-[#9db4c0]/55 shadow-[0_14px_38px_-14px_rgba(37,50,55,0.18)] text-center space-y-5">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#253237] text-[#e0fbfc] shadow-sm">
            <Ban className="h-7 w-7" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-bold tracking-tight text-[#253237]">
              {t.blocked.title}
            </h1>
            <p className="text-sm text-[#5c6b73] leading-relaxed">
              {t.blocked.subtitle}
            </p>
          </div>

          <div className="rounded-xl bg-[#e0fbfc]/60 border border-[#9db4c0]/60 p-4 text-start space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#5c6b73]">
              {t.blocked.reasonLabel}
            </p>
            <p className="text-xs font-medium text-[#253237] leading-relaxed">
              {reason || t.blocked.defaultReason}
            </p>
          </div>

          <p className="text-xs text-[#5c6b73]">{t.blocked.contactNote}</p>

          <button
            id="blocked-signout-btn"
            type="button"
            onClick={() =>
              void signOut({ redirect: false }).then(() => {
                router.push("/login");
                router.refresh();
              })
            }
            className="btn-jet w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>{t.blocked.signOut}</span>
          </button>
        </div>
      </div>
    </main>
  );
}
