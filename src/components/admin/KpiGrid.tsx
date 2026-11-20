"use client";

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

  const items = [
    {
      label: t.admin.kpiTotalUsers,
      value: kpis.totalUsers.toLocaleString(),
      note: `${t.admin.kpiLast24h(kpis.newUsers24h)} · ${
        kpis.blockedUsers > 0
          ? t.admin.kpiBlockedBadge(kpis.blockedUsers)
          : t.admin.kpiStandardBadge(kpis.nonAdminUsers)
      }`,
    },
    {
      label: t.admin.kpiFilesUploaded,
      value: kpis.totalFilesUploaded.toLocaleString(),
      note: `${t.admin.kpiIndexedStorage} ${formatStorageMb(kpis.totalStorageBytes)}`,
    },
    {
      label: t.admin.kpiTokensConsumed,
      value: formatTokensCompact(kpis.totalTokens),
      note: `${t.admin.kpiCached(
        formatTokensCompact(kpis.totalCachedTokens),
        cacheRate
      )} · ${formatUsd(kpis.totalCostUsd)}`,
    },
    {
      label: t.admin.kpiLatencySecurity,
      value: kpis.avgLatencyMs > 0 ? `${kpis.avgLatencyMs}ms` : "—",
      note: `${t.admin.kpiAnswered(kpis.totalQueries)} · ${t.admin.kpiDangerousFlags(kpis.dangerousFlags)}`,
    },
  ];

  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-y-8 gap-x-8 border-y border-[#253237]/10 py-8">
      {items.map((it) => (
        <div key={it.label}>
          <p className="text-xs text-[#5c6b73]">{it.label}</p>
          <p
            dir="ltr"
            className="mt-1.5 text-3xl font-semibold tracking-tight text-[#253237] font-mono text-start"
          >
            {it.value}
          </p>
          <p className="mt-1.5 text-[11px] text-[#9db4c0]">{it.note}</p>
        </div>
      ))}
    </section>
  );
}
