"use client";

import { Cpu, Files, ShieldAlert, Users } from "lucide-react";
import { formatTokensCompact, formatUsd } from "@/lib/pricing";
import { useLanguage } from "@/lib/i18n";

export interface AdminKpis {
  totalUsers: number;
  nonAdminUsers: number;
  blockedUsers: number;
  newUsers24h: number;
  totalFilesUploaded: number;
  totalStorageBytes: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCachedTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  dangerousFlags: number;
  totalQueries: number;
}

interface KpiGridProps {
  kpis: AdminKpis;
}

function formatStorageMb(bytes: number): string {
  if (bytes === 0) return "0.00 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 0.01) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${mb.toFixed(2)} MB`;
}

export function KpiGrid({ kpis }: KpiGridProps) {
  const { t } = useLanguage();
  const cacheRate =
    kpis.totalPromptTokens > 0
      ? Math.round((kpis.totalCachedTokens / kpis.totalPromptTokens) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* 1. Total Users (--light-blue accent) */}
      <div className="animate-fade-in-up stagger-1 interactive-card rounded-2xl bg-white border border-[#9db4c0]/45 border-t-4 border-t-[#c2dfe3] p-5 shadow-[0_2px_10px_rgba(37,50,55,0.04)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#5c6b73]">
            {t.admin.kpiTotalUsers}
          </p>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#e0fbfc] text-[#253237] border border-[#9db4c0]/40">
            <Users className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold tracking-tight text-[#253237] font-mono">
          {kpis.totalUsers.toLocaleString()}
        </p>
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-[#5c6b73]">
          <span>{t.admin.kpiLast24h(kpis.newUsers24h)}</span>
          <span className="rounded-md bg-[#c2dfe3]/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#253237]">
            {kpis.blockedUsers > 0
              ? t.admin.kpiBlockedBadge(kpis.blockedUsers)
              : t.admin.kpiStandardBadge(kpis.nonAdminUsers)}
          </span>
        </div>
      </div>

      {/* 2. Total Files Uploaded (--cool-steel accent) */}
      <div className="animate-fade-in-up stagger-2 interactive-card rounded-2xl bg-white border border-[#9db4c0]/45 border-t-4 border-t-[#9db4c0] p-5 shadow-[0_2px_10px_rgba(37,50,55,0.04)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#5c6b73]">
            {t.admin.kpiFilesUploaded}
          </p>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#c2dfe3]/75 text-[#253237]">
            <Files className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold tracking-tight text-[#253237] font-mono">
          {kpis.totalFilesUploaded.toLocaleString()}
        </p>
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-[#5c6b73]">
          <span className="truncate">{t.admin.kpiIndexedStorage}</span>
          <span
            dir="ltr"
            className="rounded-md bg-[#e0fbfc] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#253237] border border-[#9db4c0]/40 shrink-0"
          >
            {formatStorageMb(kpis.totalStorageBytes)}
          </span>
        </div>
      </div>

      {/* 3. Total Tokens Consumed (--blue-slate accent) */}
      <div className="animate-fade-in-up stagger-3 interactive-card rounded-2xl bg-white border border-[#9db4c0]/45 border-t-4 border-t-[#5c6b73] p-5 shadow-[0_2px_10px_rgba(37,50,55,0.04)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#5c6b73]">
            {t.admin.kpiTokensConsumed}
          </p>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#9db4c0]/45 text-[#253237]">
            <Cpu className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold tracking-tight text-[#253237] font-mono">
          {formatTokensCompact(kpis.totalTokens)}
        </p>
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-[#5c6b73]">
          <span className="truncate">
            {t.admin.kpiCached(
              formatTokensCompact(kpis.totalCachedTokens),
              cacheRate
            )}
          </span>
          <span
            dir="ltr"
            className="rounded-md bg-[#c2dfe3]/75 px-2 py-0.5 font-mono text-[11px] font-bold text-[#253237] shrink-0"
          >
            {formatUsd(kpis.totalCostUsd)}
          </span>
        </div>
      </div>

      {/* 4. System Performance & Security (--jet-black accent) */}
      <div className="animate-fade-in-up stagger-4 interactive-card rounded-2xl bg-white border border-[#9db4c0]/45 border-t-4 border-t-[#253237] p-5 shadow-[0_2px_10px_rgba(37,50,55,0.04)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#5c6b73]">
            {t.admin.kpiLatencySecurity}
          </p>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#253237] text-[#e0fbfc]">
            <ShieldAlert className="h-4 w-4" />
          </span>
        </div>
        <p
          dir="ltr"
          className="mt-3 text-3xl font-bold tracking-tight text-[#253237] font-mono text-start"
        >
          {kpis.avgLatencyMs > 0 ? `${kpis.avgLatencyMs}ms` : "—"}
        </p>
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-[#5c6b73]">
          <span>{t.admin.kpiAnswered(kpis.totalQueries)}</span>
          <span className="rounded-md bg-[#253237] px-2 py-0.5 font-mono text-[11px] font-bold text-[#e0fbfc]">
            {t.admin.kpiDangerousFlags(kpis.dangerousFlags)}
          </span>
        </div>
      </div>
    </div>
  );
}
