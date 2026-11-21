"use client";

import {
  formatLatencySeconds,
  formatTokensCompact,
  formatUsd,
} from "@/lib/pricing";
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

  const items = [
    {
      label: t.admin.kpiTotalUsers,
      value: kpis.totalUsers.toLocaleString(),
      dot: "bg-blue-500",
      note: `${t.admin.kpiLast24h(kpis.newUsers24h)} · ${
        kpis.blockedUsers > 0
          ? t.admin.kpiBlockedBadge(kpis.blockedUsers)
          : t.admin.kpiStandardBadge(kpis.nonAdminUsers)
      }`,
    },
    {
      label: t.admin.kpiFilesUploaded,
      value: kpis.totalFilesUploaded.toLocaleString(),
      dot: "bg-teal-500",
      note: `${t.admin.kpiIndexedStorage} ${formatStorageMb(kpis.totalStorageBytes)}`,
    },
    {
      label: t.admin.kpiTokensConsumed,
      value: formatTokensCompact(kpis.totalTokens),
      dot: "bg-indigo-500",
      note: `${t.admin.kpiCached(
        formatTokensCompact(kpis.totalCachedTokens),
        cacheRate
      )} · ${formatUsd(kpis.totalCostUsd)}`,
    },
    {
      label: t.admin.kpiLatencySecurity,
      value:
        kpis.avgLatencyMs > 0 ? formatLatencySeconds(kpis.avgLatencyMs) : "—",
      dot: kpis.dangerousFlags > 0 ? "bg-rose-500" : "bg-emerald-500",
      note: `${t.admin.kpiAnswered(kpis.totalQueries)} · ${t.admin.kpiDangerousFlags(kpis.dangerousFlags)}`,
    },
  ];

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-y-8 gap-x-8 border-y border-slate-200 py-8">
      {items.map((it) => (
        <div key={it.label}>
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className={`h-2 w-2 rounded-full ${it.dot}`} />
            {it.label}
          </p>
          <p
            dir="ltr"
            className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-900 font-mono text-start"
          >
            {it.value}
          </p>
          <p className="mt-1.5 text-[11px] text-slate-400">{it.note}</p>
        </div>
      ))}
    </section>
  );
}
