"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { formatUsd } from "@/lib/pricing";
import { MAX_FILES_PER_USER } from "@/lib/constants";
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
  pendingDeleteUserId: string | null;
  onToggleBlockUser: (
    userId: string,
    isBlocked: boolean,
    reason?: string
  ) => Promise<void>;
  onDeleteUserPermanently: (userId: string) => Promise<void>;
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
  pendingDeleteUserId,
  onToggleBlockUser,
  onDeleteUserPermanently,
}: UsersTableProps) {
  const { lang, t } = useLanguage();
  const isHe = lang === "he";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked">(
    "all"
  );
  const [sortKey, setSortKey] = useState<SortKey>("totalTokens");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [blockModalUser, setBlockModalUser] = useState<AdminUserRow | null>(
    null
  );
  const [deleteModalUser, setDeleteModalUser] = useState<AdminUserRow | null>(
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
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[#253237]">
              {t.admin.usersTableTitle}
            </h2>
            <p className="text-sm text-[#5c6b73] mt-0.5">
              {t.admin.usersTableSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Status Filter Tabs */}
            <div className="inline-flex items-center gap-1 text-xs">
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
                    className={`rounded-md px-2.5 py-1 transition-colors cursor-pointer ${
                      active
                        ? "bg-teal-600 text-white font-semibold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:flex-none sm:w-56">
              <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                id="admin-users-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.admin.searchPlaceholder}
                className="w-full rounded-lg bg-slate-50 ps-8 pe-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:outline-none focus:border-teal-600 focus:bg-white transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full text-start border-collapse text-xs">
            <thead>
              <tr className="text-[11px] font-medium text-slate-500 border-b border-slate-200">
                <th className="py-2.5 pe-4 text-start">
                  <button
                    type="button"
                    onClick={() => toggleSort("username")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colUser}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-start">{t.admin.colStatus}</th>
                <th className="py-2.5 px-3 text-start">
                  <button
                    type="button"
                    onClick={() => toggleSort("totalFiles")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colFiles}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-start">
                  <button
                    type="button"
                    onClick={() => toggleSort("validQueries")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colQueries}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-end">
                  <button
                    type="button"
                    onClick={() => toggleSort("promptTokens")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colInputTok}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-end">
                  <button
                    type="button"
                    onClick={() => toggleSort("completionTokens")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colOutputTok}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-end">
                  <button
                    type="button"
                    onClick={() => toggleSort("totalTokens")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colTotalTok}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-end">
                  <button
                    type="button"
                    onClick={() => toggleSort("estimatedCostUsd")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colEstCost}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-2.5 px-3 text-end">
                  <button
                    type="button"
                    onClick={() => toggleSort("lastActiveAt")}
                    className={headerButtonClass}
                  >
                    <span>{t.admin.colLastActive}</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="py-2.5 ps-3 text-end">{t.admin.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAndSorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-10 text-center text-sm text-slate-500"
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
                      className={`hover:bg-slate-50 transition-colors ${
                        u.isBlocked ? "bg-rose-50/30" : ""
                      }`}
                    >
                      <td className="py-3 pe-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-900 truncate">
                              {u.name}
                            </span>
                            {u.role === "ADMIN" && (
                              <span className="inline-flex items-center rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-teal-800 shrink-0">
                                {isHe ? "מנהל" : "ADMIN"}
                              </span>
                            )}
                            {u.role === "DEVELOPER" && (
                              <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-indigo-800 shrink-0">
                                {isHe ? "מפתח" : "DEVELOPER"}
                              </span>
                            )}
                          </div>
                          <p
                            className="text-[11px] font-mono text-slate-400"
                            dir="ltr"
                          >
                            @{u.username} ·{" "}
                            {u.provider === "google"
                              ? t.admin.providerGoogle
                              : t.admin.providerCredentials}
                          </p>
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {u.isBlocked ? (
                          <div>
                            <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              {t.admin.statusBlocked}
                            </span>
                            {u.blockedReason && (
                              <p
                                title={u.blockedReason}
                                className="max-w-[140px] truncate text-[10px] text-rose-500"
                              >
                                {u.blockedReason}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {t.admin.statusActive}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono">
                        <span className="font-medium text-slate-900">
                          {u.activeFiles}
                        </span>
                        <span className="text-slate-400">
                          /{MAX_FILES_PER_USER}
                        </span>
                        <p className="text-[10px] text-slate-400">
                          {t.admin.totalFilesSub(u.totalFiles)}
                        </p>
                      </td>

                      <td className="py-3 px-3 font-mono">
                        <span className="font-medium text-slate-900">
                          {u.validQueries}
                        </span>
                        {u.dangerousFlags > 0 && (
                          <span
                            title={t.admin.dangerousFlagsTooltip(
                              u.dangerousFlags
                            )}
                            className="ms-1.5 text-[11px] font-bold text-rose-600"
                          >
                            ({u.dangerousFlags}!)
                          </span>
                        )}
                      </td>

                      <td
                        className="py-3 px-3 text-end font-mono text-slate-800"
                        title={t.admin.cachedTooltip(
                          u.cachedTokens.toLocaleString()
                        )}
                      >
                        <div>{u.promptTokens.toLocaleString()}</div>
                        {u.cachedTokens > 0 && (
                          <div className="text-[10px] text-teal-700">
                            {t.admin.cachedSub(u.cachedTokens.toLocaleString())}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-end font-mono text-slate-800">
                        {u.completionTokens.toLocaleString()}
                      </td>

                      <td className="py-3 px-3 text-end font-mono font-semibold text-slate-900">
                        {u.totalTokens.toLocaleString()}
                      </td>

                      <td
                        dir="ltr"
                        className="py-3 px-3 text-end font-mono font-medium text-slate-900"
                      >
                        {formatUsd(u.estimatedCostUsd)}
                      </td>

                      <td className="py-3 px-3 text-end font-mono text-slate-400 whitespace-nowrap">
                        {formatRelativeTime(u.lastActiveAt, t)}
                      </td>

                      <td className="py-3 ps-3 text-end whitespace-nowrap">
                        {isSelfOrAdmin ? (
                          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            {u.role === "DEVELOPER"
                              ? isHe
                                ? "חשבון מפתח מוגן"
                                : "Protected Developer"
                              : isHe
                                ? "חשבון מנהל מוגן"
                                : "Protected Admin"}
                          </span>
                        ) : u.isBlocked ? (
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                            <button
                              id={`unblock-user-${u.id}`}
                              type="button"
                              disabled={isBusy || pendingDeleteUserId === u.id}
                              onClick={() => void onToggleBlockUser(u.id, false)}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 px-2.5 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-40 transition-colors cursor-pointer"
                            >
                              {isBusy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              <span>
                                {isBusy
                                  ? t.admin.unblocking
                                  : isHe
                                    ? "שחזר"
                                    : "Restore"}
                              </span>
                            </button>
                            <button
                              id={`delete-user-${u.id}`}
                              type="button"
                              disabled={isBusy || pendingDeleteUserId === u.id}
                              onClick={() => setDeleteModalUser(u)}
                              className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 hover:bg-rose-600 hover:text-white hover:border-rose-600 px-2.5 py-1 text-xs font-semibold text-rose-700 disabled:opacity-40 transition-colors cursor-pointer"
                            >
                              {pendingDeleteUserId === u.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                              <span>
                                {isHe ? "מחק לצמיתות" : "Delete Data"}
                              </span>
                            </button>
                          </div>
                        ) : (
                          <button
                            id={`block-user-${u.id}`}
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setBlockModalUser(u);
                              setBlockReason("");
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-50 hover:bg-rose-600 hover:text-white hover:border-rose-600 px-2.5 py-1 text-xs font-semibold text-rose-700 disabled:opacity-40 transition-colors cursor-pointer"
                          >
                            {isBusy && (
                              <Loader2 className="h-3 w-3 animate-spin" />
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
      </section>

      {/* Block User Confirmation Modal */}
      {blockModalUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#253237]/40 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl bg-white border border-[#253237]/12 shadow-[0_12px_36px_rgba(37,50,55,0.16)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#253237]/10 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#253237]">
                {t.admin.blockModalTitle(blockModalUser.username)}
              </h3>
              <button
                type="button"
                onClick={() => setBlockModalUser(null)}
                className="rounded-md p-1 text-[#5c6b73] hover:text-[#253237] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm leading-relaxed text-[#5c6b73]">
                {t.admin.blockModalDesc}
              </p>

              <div>
                <label
                  htmlFor="block-reason-input"
                  className="block text-xs font-medium text-[#253237] mb-1.5"
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
                  className="w-full rounded-lg bg-[#f8fafb] p-3 text-sm text-[#253237] placeholder:text-[#5c6b73]/60 border border-[#253237]/18 focus:outline-none focus:border-[#253237] focus:bg-white transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setBlockModalUser(null)}
                  className="rounded-lg px-3.5 py-2 text-xs font-medium text-[#5c6b73] hover:text-[#253237] transition-colors cursor-pointer"
                >
                  {t.admin.cancel}
                </button>
                <button
                  id="confirm-block-user-btn"
                  type="button"
                  disabled={pendingBlockUserId === blockModalUser.id}
                  onClick={() => void handleConfirmBlock()}
                  className="btn-jet inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium cursor-pointer"
                >
                  {pendingBlockUserId === blockModalUser.id && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  <span>{t.admin.confirmBlock}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete All User Data Modal */}
      {deleteModalUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div
            dir={isHe ? "rtl" : "ltr"}
            className="animate-modal-in w-full max-w-md rounded-2xl bg-white border border-rose-200 shadow-[0_18px_48px_rgba(15,23,42,0.22)] overflow-hidden"
          >
            <div className="px-5 py-4 bg-rose-50/80 border-b border-rose-200/80 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-rose-900">
                <AlertTriangle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                <h3 className="text-sm font-bold">
                  {isHe
                    ? `מחיקה לצמיתות של @${deleteModalUser.username}`
                    : `Permanently delete @${deleteModalUser.username}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalUser(null)}
                className="rounded-md p-1 text-rose-500 hover:text-rose-900 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm leading-relaxed text-slate-700">
                {isHe
                  ? `פעולה זו תמחק לצמיתות את חשבון המשתמש @${deleteModalUser.username} ואת כל המידע שלו מהאתר: כל המסמכים שהעלה (${deleteModalUser.totalFiles}), היסטוריית הצ'אט, לוגי השימוש ולוגי המערכת. לא ניתן לשחזר מידע זה.`
                  : `This will permanently erase @${deleteModalUser.username} and ALL of their site data: all uploaded documents (${deleteModalUser.totalFiles}), chat messages, usage telemetry, and system logs. This action cannot be undone.`}
              </p>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteModalUser(null)}
                  className="rounded-lg px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                >
                  {t.admin.cancel}
                </button>
                <button
                  id="confirm-permanent-delete-user-btn"
                  type="button"
                  disabled={pendingDeleteUserId === deleteModalUser.id}
                  onClick={async () => {
                    const targetId = deleteModalUser.id;
                    await onDeleteUserPermanently(targetId);
                    setDeleteModalUser(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 cursor-pointer"
                >
                  {pendingDeleteUserId === deleteModalUser.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {isHe ? "מחק את כל המידע לצמיתות" : "Delete All Data Permanently"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
