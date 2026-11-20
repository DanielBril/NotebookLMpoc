"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  Ban,
  CheckCircle2,
  Loader2,
  Search,
  Shield,
  ShieldAlert,
  Unlock,
  X,
} from "lucide-react";
import { formatUsd } from "@/lib/pricing";
import { useLanguage, type Translations } from "@/lib/i18n";

export interface AdminUserRow {
  id: string;
  username: string;
  name: string;
  email: string | null;
  provider: string;
  role: string;
  isBlocked: boolean;
  blockedAt: string | null;
  blockedReason: string | null;
  activeFiles: number;
  totalFiles: number;
  storageBytes: number;
  validQueries: number;
  dangerousFlags: number;
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
  currentAdminId: string;
  pendingBlockUserId: string | null;
  onToggleBlockUser: (
    userId: string,
    isBlocked: boolean,
    reason?: string
  ) => Promise<void>;
}

function formatRelativeTime(isoDate: string, t: Translations): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (diffMs < 60_000) return t.admin.relJustNow;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return t.admin.relMinsAgo(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t.admin.relHoursAgo(hours);
  const days = Math.floor(hours / 24);
  return t.admin.relDaysAgo(days);
}

export function UsersTable({
  users,
  currentAdminId,
  pendingBlockUserId,
  onToggleBlockUser,
}: UsersTableProps) {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked">(
    "all"
  );
  const [sortKey, setSortKey] = useState<SortKey>("totalTokens");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [blockModalUser, setBlockModalUser] = useState<AdminUserRow | null>(
    null
  );
  const [blockReason, setBlockReason] = useState("");

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
    const filtered = users.filter((u) => {
      if (statusFilter === "active" && u.isBlocked) return false;
      if (statusFilter === "blocked" && !u.isBlocked) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        u.provider.toLowerCase().includes(q)
      );
    });

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
  }, [users, search, statusFilter, sortKey, sortDir]);

  async function handleConfirmBlock() {
    if (!blockModalUser) return;
    await onToggleBlockUser(blockModalUser.id, true, blockReason.trim());
    setBlockModalUser(null);
    setBlockReason("");
  }

  const headerButtonClass =
    "inline-flex items-center gap-1 hover:text-[#253237] transition-colors cursor-pointer";

  return (
    <>
      <div className="animate-fade-in-up stagger-3 rounded-2xl bg-white border border-[#9db4c0]/45 shadow-[0_2px_10px_rgba(37,50,55,0.04)] overflow-hidden">
        <div className="p-5 border-b border-[#9db4c0]/35 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[#253237]">
              {t.admin.usersTableTitle}
            </h2>
            <p className="text-xs text-[#5c6b73] mt-0.5">
              {t.admin.usersTableSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {/* Status Filter Pills */}
            <div className="inline-flex rounded-xl bg-[#f2fafb] p-1 border border-[#9db4c0]/45 text-[11px] font-semibold">
              {(["all", "active", "blocked"] as const).map((tab) => {
                const active = statusFilter === tab;
                const label =
                  tab === "all"
                    ? t.admin.filterAll
                    : tab === "active"
                      ? t.admin.filterActive
                      : t.admin.filterBlocked;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    className={`rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                      active
                        ? "bg-[#253237] text-[#e0fbfc] shadow-xs"
                        : "text-[#5c6b73] hover:text-[#253237]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:flex-none sm:w-60">
              <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5c6b73]" />
              <input
                id="admin-users-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.admin.searchPlaceholder}
                className="w-full rounded-xl bg-[#f2fafb] ps-8 pe-3 py-1.5 text-xs text-[#253237] placeholder:text-[#5c6b73]/65 border border-[#9db4c0]/55 focus:outline-none focus:border-[#253237] focus:bg-white focus:ring-2 focus:ring-[#c2dfe3]/60 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="bg-[#f2fafb] text-[11px] font-semibold uppercase tracking-wider text-[#5c6b73] border-b border-[#9db4c0]/35">
                <th className="py-3 px-4 text-start">
                  <button
                    type="button"
                    onClick={() => toggleSort("username")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colUser}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-3 text-start">{t.admin.colStatus}</th>
                <th className="py-3 px-3 text-start">
                  <button
                    type="button"
                    onClick={() => toggleSort("totalFiles")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colFiles}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-3 text-start">
                  <button
                    type="button"
                    onClick={() => toggleSort("validQueries")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colQueries}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-3 text-end">
                  <button
                    type="button"
                    onClick={() => toggleSort("promptTokens")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colInputTok}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-3 text-end">
                  <button
                    type="button"
                    onClick={() => toggleSort("completionTokens")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colOutputTok}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-3 text-end">
                  <button
                    type="button"
                    onClick={() => toggleSort("totalTokens")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colTotalTok}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-3 text-end">
                  <button
                    type="button"
                    onClick={() => toggleSort("estimatedCostUsd")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colEstCost}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-3 text-end">
                  <button
                    type="button"
                    onClick={() => toggleSort("lastActiveAt")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colLastActive}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-end">{t.admin.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#9db4c0]/25">
              {filteredAndSorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-8 text-center text-xs text-[#5c6b73]"
                  >
                    {t.admin.noMatchingUsers}
                  </td>
                </tr>
              ) : (
                filteredAndSorted.map((u) => {
                  const isSelfOrAdmin =
                    u.role === "ADMIN" ||
                    u.role === "DEVELOPER" ||
                    u.id === currentAdminId;
                  const isBusy = pendingBlockUserId === u.id;

                  return (
                    <tr
                      key={u.id}
                      className={`transition-colors ${
                        u.isBlocked
                          ? "bg-[#e0fbfc]/35 hover:bg-[#e0fbfc]/60"
                          : "hover:bg-[#c2dfe3]/20"
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`h-8 w-8 rounded-full font-bold text-[11px] flex items-center justify-center shrink-0 ${
                              u.isBlocked
                                ? "bg-[#253237] text-[#e0fbfc]"
                                : "bg-[#c2dfe3] text-[#253237]"
                            }`}
                          >
                            {u.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-[#253237] truncate">
                                {u.name}
                              </span>
                              {u.role === "ADMIN" && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-[#253237] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#e0fbfc]">
                                  <Shield className="h-2.5 w-2.5" />
                                  {t.navbar.adminBadge}
                                </span>
                              )}
                              {u.role === "DEVELOPER" && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-[#5c6b73] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#e0fbfc]">
                                  <Shield className="h-2.5 w-2.5" />
                                  DEV
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-[#5c6b73]">
                              <span className="font-mono" dir="ltr">
                                @{u.username}
                              </span>
                              <span>•</span>
                              <span className="rounded bg-[#f2fafb] px-1.5 py-0.2 border border-[#9db4c0]/40">
                                {u.provider === "google"
                                  ? t.admin.providerGoogle
                                  : t.admin.providerCredentials}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {u.isBlocked ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#253237] px-2.5 py-0.5 text-[10px] font-bold text-[#e0fbfc]">
                              <Ban className="h-2.5 w-2.5" />
                              {t.admin.statusBlocked}
                            </span>
                            {u.blockedReason && (
                              <p
                                title={u.blockedReason}
                                className="max-w-[140px] truncate text-[10px] text-[#5c6b73]"
                              >
                                {u.blockedReason}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#e0fbfc] px-2.5 py-0.5 text-[10px] font-semibold text-[#253237] border border-[#9db4c0]/60">
                            <CheckCircle2 className="h-2.5 w-2.5 text-[#5c6b73]" />
                            {t.admin.statusActive}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono">
                        <span className="font-semibold text-[#253237]">
                          {u.activeFiles}
                        </span>
                        <span className="text-[#5c6b73]"> / 10</span>
                        <p className="text-[10px] text-[#5c6b73]">
                          {t.admin.totalFilesSub(u.totalFiles)}
                        </p>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="font-semibold text-[#253237]">
                            {u.validQueries}
                          </span>
                          {u.dangerousFlags > 0 && (
                            <span
                              title={t.admin.dangerousFlagsTooltip(
                                u.dangerousFlags
                              )}
                              className="inline-flex items-center gap-0.5 rounded-full bg-[#253237] px-1.5 py-0.5 text-[10px] font-bold text-[#e0fbfc]"
                            >
                              <ShieldAlert className="h-2.5 w-2.5" />
                              {u.dangerousFlags}
                            </span>
                          )}
                        </div>
                      </td>

                      <td
                        className="py-3 px-3 text-end font-mono text-[#253237]"
                        title={t.admin.cachedTooltip(
                          u.cachedTokens.toLocaleString()
                        )}
                      >
                        <div>{u.promptTokens.toLocaleString()}</div>
                        {u.cachedTokens > 0 && (
                          <div className="text-[10px] text-[#5c6b73]">
                            {t.admin.cachedSub(u.cachedTokens.toLocaleString())}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-end font-mono text-[#253237]">
                        {u.completionTokens.toLocaleString()}
                      </td>

                      <td className="py-3 px-3 text-end font-mono font-bold text-[#253237]">
                        {u.totalTokens.toLocaleString()}
                      </td>

                      <td className="py-3 px-3 text-end font-mono">
                        <span
                          dir="ltr"
                          className="rounded-md bg-[#e0fbfc] px-2 py-0.5 font-semibold text-[#253237] border border-[#9db4c0]/45"
                        >
                          {formatUsd(u.estimatedCostUsd)}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-end font-mono text-[#5c6b73] whitespace-nowrap">
                        {formatRelativeTime(u.lastActiveAt, t)}
                      </td>

                      <td className="py-3 px-4 text-end whitespace-nowrap">
                        {isSelfOrAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-[#f2fafb] px-2.5 py-1 text-[11px] font-medium text-[#5c6b73] border border-[#9db4c0]/35">
                            <Shield className="h-3 w-3" />
                            {t.admin.protectedAdmin}
                          </span>
                        ) : u.isBlocked ? (
                          <button
                            id={`unblock-user-${u.id}`}
                            type="button"
                            disabled={isBusy}
                            onClick={() => void onToggleBlockUser(u.id, false)}
                            className="interactive-chip inline-flex items-center gap-1 rounded-lg bg-[#c2dfe3] hover:bg-[#9db4c0] px-2.5 py-1.5 text-[11px] font-semibold text-[#253237] disabled:opacity-50 cursor-pointer"
                          >
                            {isBusy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Unlock className="h-3 w-3" />
                            )}
                            <span>
                              {isBusy
                                ? t.admin.unblocking
                                : t.admin.unblockBtn}
                            </span>
                          </button>
                        ) : (
                          <button
                            id={`block-user-${u.id}`}
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setBlockModalUser(u);
                              setBlockReason("");
                            }}
                            className="interactive-chip inline-flex items-center gap-1 rounded-lg bg-[#253237] hover:bg-[#5c6b73] px-2.5 py-1.5 text-[11px] font-semibold text-[#e0fbfc] disabled:opacity-50 cursor-pointer"
                          >
                            {isBusy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Ban className="h-3 w-3" />
                            )}
                            <span>
                              {isBusy ? t.admin.blocking : t.admin.blockBtn}
                            </span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Block User Confirmation Modal */}
      {blockModalUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#253237]/50 backdrop-blur-xs p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="animate-modal-in w-full max-w-md rounded-2xl bg-white border border-[#9db4c0]/60 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#253237] text-[#e0fbfc] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#e0fbfc] text-[#253237]">
                  <Ban className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-semibold">
                  {t.admin.blockModalTitle(blockModalUser.username)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBlockModalUser(null)}
                className="rounded-md p-1 text-[#c2dfe3] hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs leading-relaxed text-[#5c6b73]">
                {t.admin.blockModalDesc}
              </p>

              <div>
                <label
                  htmlFor="block-reason-input"
                  className="block text-xs font-semibold text-[#253237] mb-1.5"
                >
                  {t.admin.blockReasonLabel}
                </label>
                <textarea
                  id="block-reason-input"
                  rows={3}
                  maxLength={240}
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder={t.admin.blockReasonPlaceholder}
                  className="w-full rounded-xl bg-[#f2fafb] p-3 text-xs text-[#253237] placeholder:text-[#5c6b73]/60 border border-[#9db4c0]/60 focus:outline-none focus:border-[#253237] focus:bg-white focus:ring-2 focus:ring-[#c2dfe3]/60 transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setBlockModalUser(null)}
                  className="rounded-xl bg-[#f2fafb] hover:bg-[#c2dfe3]/50 px-3.5 py-2 text-xs font-semibold text-[#253237] border border-[#9db4c0]/55 transition-colors cursor-pointer"
                >
                  {t.admin.cancel}
                </button>
                <button
                  id="confirm-block-user-btn"
                  type="button"
                  disabled={pendingBlockUserId === blockModalUser.id}
                  onClick={() => void handleConfirmBlock()}
                  className="btn-jet inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer"
                >
                  {pendingBlockUserId === blockModalUser.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Ban className="h-3.5 w-3.5" />
                  )}
                  <span>{t.admin.confirmBlock}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
