"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Search, Shield, ShieldAlert } from "lucide-react";
import { formatUsd } from "@/lib/pricing";

export interface AdminUserRow {
  id: string;
  username: string;
  name: string;
  email: string | null;
  provider: string;
  role: string;
  activeFiles: number;
  totalFiles: number;
  storageBytes: number;
  validQueries: number;
  blockedAttempts: number;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
  lastActiveAt: string;
}

type SortKey =
  | "username"
  | "totalFiles"
  | "validQueries"
  | "promptTokens"
  | "completionTokens"
  | "totalTokens"
  | "estimatedCostUsd"
  | "lastActiveAt";

interface UsersTableProps {
  users: AdminUserRow[];
}

function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (diffMs < 60_000) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function UsersTable({ users }: UsersTableProps) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalTokens");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(nextKey);
      setSortDir("desc");
    }
  }

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? users.filter(
          (u) =>
            u.username.toLowerCase().includes(q) ||
            u.name.toLowerCase().includes(q) ||
            (u.email && u.email.toLowerCase().includes(q)) ||
            u.provider.toLowerCase().includes(q)
        )
      : users;

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "username") {
        cmp = a.username.localeCompare(b.username);
      } else if (sortKey === "lastActiveAt") {
        cmp =
          new Date(a.lastActiveAt).getTime() -
          new Date(b.lastActiveAt).getTime();
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [users, search, sortKey, sortDir]);

  const headerButtonClass =
    "inline-flex items-center gap-1 hover:text-[#373737] transition-colors cursor-pointer";

  return (
    <div className="rounded-2xl bg-white border border-[#373737]/12 shadow-[0_2px_10px_rgba(55,55,55,0.04)] overflow-hidden">
      <div className="p-5 border-b border-[#373737]/10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#373737]">
            Per-User Usage &amp; Cost Leaderboard
          </h2>
          <p className="text-xs text-[#373737]/60 mt-0.5">
            Exact token accounting, active file quotas, guardrail blocks, and USD spend
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#373737]/45" />
          <input
            id="admin-users-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter username, name, auth…"
            className="w-full rounded-xl bg-[#f7fafb] pl-8 pr-3 py-1.5 text-xs text-[#373737] placeholder:text-[#373737]/45 border border-[#373737]/15 focus:outline-none focus:border-[#373737] focus:bg-white"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#f7fafb] text-[11px] font-semibold uppercase tracking-wider text-[#373737]/65 border-b border-[#373737]/10">
              <th className="py-3 px-4">
                <button
                  type="button"
                  onClick={() => toggleSort("username")}
                  className={headerButtonClass}
                >
                  <span>User</span>
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="py-3 px-3">
                <button
                  type="button"
                  onClick={() => toggleSort("totalFiles")}
                  className={headerButtonClass}
                >
                  <span>Files</span>
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="py-3 px-3">
                <button
                  type="button"
                  onClick={() => toggleSort("validQueries")}
                  className={headerButtonClass}
                >
                  <span>Queries</span>
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="py-3 px-3 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("promptTokens")}
                  className={headerButtonClass}
                >
                  <span>Input Tok</span>
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="py-3 px-3 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("completionTokens")}
                  className={headerButtonClass}
                >
                  <span>Output Tok</span>
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="py-3 px-3 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("totalTokens")}
                  className={headerButtonClass}
                >
                  <span>Total Tok</span>
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="py-3 px-3 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("estimatedCostUsd")}
                  className={headerButtonClass}
                >
                  <span>Est. Cost</span>
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="py-3 px-4 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort("lastActiveAt")}
                  className={headerButtonClass}
                >
                  <span>Last Active</span>
                  <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#373737]/8">
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="py-8 text-center text-xs text-[#373737]/55"
                >
                  No matching users found.
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-[#c1dbe3]/15 transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-[#c1dbe3]/60 text-[#373737] font-bold text-[11px] flex items-center justify-center shrink-0">
                        {u.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[#373737] truncate">
                            {u.name}
                          </span>
                          {u.role === "ADMIN" && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-[#373737] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#f6feaa]">
                              <Shield className="h-2.5 w-2.5" />
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-[#373737]/60">
                          <span className="font-mono">@{u.username}</span>
                          <span>•</span>
                          <span className="capitalize rounded bg-[#f7fafb] px-1.5 py-0.2 border border-[#373737]/10">
                            {u.provider}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-3 font-mono">
                    <span className="font-semibold text-[#373737]">
                      {u.activeFiles}
                    </span>
                    <span className="text-[#373737]/55"> / 10</span>
                    <p className="text-[10px] text-[#373737]/55">
                      {u.totalFiles} total
                    </p>
                  </td>

                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="font-semibold text-[#373737]">
                        {u.validQueries}
                      </span>
                      {u.blockedAttempts > 0 && (
                        <span
                          title={`${u.blockedAttempts} blocked injection / out-of-scope attempts`}
                          className="inline-flex items-center gap-0.5 rounded-full bg-[#fce694] px-1.5 py-0.5 text-[10px] font-bold text-[#373737] border border-[#373737]/20"
                        >
                          <ShieldAlert className="h-2.5 w-2.5" />
                          {u.blockedAttempts}
                        </span>
                      )}
                    </div>
                  </td>

                  <td
                    className="py-3 px-3 text-right font-mono text-[#373737]"
                    title={`Cached tokens saved: ${u.cachedTokens.toLocaleString()}`}
                  >
                    <div>{u.promptTokens.toLocaleString()}</div>
                    {u.cachedTokens > 0 && (
                      <div className="text-[10px] text-[#373737]/60">
                        ({u.cachedTokens.toLocaleString()} cached)
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-[#373737]">
                    {u.completionTokens.toLocaleString()}
                  </td>

                  <td className="py-3 px-3 text-right font-mono font-bold text-[#373737]">
                    {u.totalTokens.toLocaleString()}
                  </td>

                  <td className="py-3 px-3 text-right font-mono">
                    <span className="rounded-md bg-[#f6feaa]/80 px-2 py-0.5 font-semibold text-[#373737]">
                      {formatUsd(u.estimatedCostUsd)}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-right font-mono text-[#373737]/65 whitespace-nowrap">
                    {formatRelativeTime(u.lastActiveAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
