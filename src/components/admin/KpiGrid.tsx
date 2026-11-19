"use client";

import { Cpu, Files, ShieldAlert, Users } from "lucide-react";
import { formatTokensCompact, formatUsd } from "@/lib/pricing";

export interface AdminKpis {
  totalUsers: number;
  nonAdminUsers: number;
  newUsers24h: number;
  totalFilesUploaded: number;
  totalStorageBytes: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCachedTokens: number;
  totalCompletionTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  guardrailBlocks: number;
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
  const cacheRate =
    kpis.totalPromptTokens > 0
      ? Math.round((kpis.totalCachedTokens / kpis.totalPromptTokens) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* 1. Total Users (--pale-sky accent) */}
      <div className="rounded-2xl bg-white border border-[#373737]/12 border-t-4 border-t-[#c1dbe3] p-5 shadow-[0_2px_10px_rgba(55,55,55,0.04)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#373737]/60">
            Total Users
          </p>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#c1dbe3]/60 text-[#373737]">
            <Users className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold tracking-tight text-[#373737] font-mono">
          {kpis.totalUsers.toLocaleString()}
        </p>
        <div className="mt-2.5 flex items-center justify-between text-xs text-[#373737]/70">
          <span>
            <strong className="text-[#373737]">+{kpis.newUsers24h}</strong> in last 24h
          </span>
          <span className="rounded-md bg-[#c1dbe3]/40 px-2 py-0.5 font-mono text-[11px]">
            {kpis.nonAdminUsers} standard
          </span>
        </div>
      </div>

      {/* 2. Total Files Uploaded (--tea-green accent) */}
      <div className="rounded-2xl bg-white border border-[#373737]/12 border-t-4 border-t-[#c7dfc5] p-5 shadow-[0_2px_10px_rgba(55,55,55,0.04)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#373737]/60">
            Files Uploaded
          </p>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#c7dfc5]/70 text-[#373737]">
            <Files className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold tracking-tight text-[#373737] font-mono">
          {kpis.totalFilesUploaded.toLocaleString()}
        </p>
        <div className="mt-2.5 flex items-center justify-between text-xs text-[#373737]/70">
          <span>Total indexed storage</span>
          <span className="rounded-md bg-[#c7dfc5]/55 px-2 py-0.5 font-mono text-[11px] font-semibold text-[#373737]">
            {formatStorageMb(kpis.totalStorageBytes)}
          </span>
        </div>
      </div>

      {/* 3. Total Tokens Consumed (--lime-cream accent) */}
      <div className="rounded-2xl bg-white border border-[#373737]/12 border-t-4 border-t-[#f6feaa] p-5 shadow-[0_2px_10px_rgba(55,55,55,0.04)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#373737]/60">
            Tokens Consumed
          </p>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#f6feaa] text-[#373737] border border-[#373737]/12">
            <Cpu className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold tracking-tight text-[#373737] font-mono">
          {formatTokensCompact(kpis.totalTokens)}
        </p>
        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-[#373737]/70">
          <span className="truncate">
            Cached:{" "}
            <strong className="text-[#373737]">
              {formatTokensCompact(kpis.totalCachedTokens)}
            </strong>{" "}
            ({cacheRate}%)
          </span>
          <span className="rounded-md bg-[#f6feaa] px-2 py-0.5 font-mono text-[11px] font-bold text-[#373737] shrink-0">
            {formatUsd(kpis.totalCostUsd)}
          </span>
        </div>
      </div>

      {/* 4. System Performance & Security (--jasmine accent) */}
      <div className="rounded-2xl bg-white border border-[#373737]/12 border-t-4 border-t-[#fce694] p-5 shadow-[0_2px_10px_rgba(55,55,55,0.04)]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#373737]/60">
            Latency &amp; Security
          </p>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#fce694] text-[#373737]">
            <ShieldAlert className="h-4 w-4" />
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold tracking-tight text-[#373737] font-mono">
          {kpis.avgLatencyMs > 0 ? `${kpis.avgLatencyMs}ms` : "—"}
        </p>
        <div className="mt-2.5 flex items-center justify-between text-xs text-[#373737]/70">
          <span>
            <strong className="text-[#373737]">{kpis.totalQueries}</strong> answered
          </span>
          <span className="rounded-md bg-[#fce694] px-2 py-0.5 font-mono text-[11px] font-bold text-[#373737]">
            {kpis.guardrailBlocks} blocked
          </span>
        </div>
      </div>
    </div>
  );
}
