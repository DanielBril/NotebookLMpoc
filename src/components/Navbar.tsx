"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Activity,
  BookOpen,
  LogOut,
  PanelRightOpen,
  Shield,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n";
import { MAX_ACTIVE_CONTEXT_TOKENS, MAX_FILES_PER_USER } from "@/lib/constants";

interface NavbarProps {
  mode: "workspace" | "admin";
  user: {
    username: string;
    name?: string | null;
    image?: string | null;
    role: string;
  };
  sourceCount?: number;
  activeTokens?: number;
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

export function Navbar({
  mode,
  user,
  sourceCount = 0,
  activeTokens = 0,
  onToggleSidebar,
  sidebarOpen,
}: NavbarProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const tokenRatio = Math.min(1, activeTokens / MAX_ACTIVE_CONTEXT_TOKENS);
  const isNearTokenLimit = tokenRatio >= 0.8;
  const initials = (user.name || user.username || "U")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="relative z-30 shrink-0 bg-[#253237] text-[#e0fbfc] shadow-[0_4px_18px_rgba(37,50,55,0.16)]">
      <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* Start: Brand + Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={user.role === "ADMIN" && mode === "admin" ? "/admin" : "/workspace"}
            className="shrink-0 focus:outline-none"
          >
            <BrandLogo size={28} variant="light" />
          </Link>
          <span className="hidden sm:inline-block h-5 w-px bg-[#9db4c0]/25" />
          <div className="hidden sm:flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-medium text-[#e0fbfc] truncate">
              {mode === "admin"
                ? t.navbar.adminPortalTitle
                : t.navbar.workspaceTitle}
            </h1>
            {mode === "admin" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#c2dfe3] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#253237]">
                <Shield className="h-3 w-3" />
                {t.navbar.adminBadge}
              </span>
            )}
          </div>
        </div>

        {/* Center: Active Context Meter (Workspace mode) */}
        {mode === "workspace" && (
          <div className="hidden md:flex items-center gap-3 rounded-full bg-[#5c6b73]/30 px-3.5 py-1.5 text-xs border border-[#9db4c0]/25">
            <span className="font-mono text-[#c2dfe3]">
              <strong className="text-[#e0fbfc]">{sourceCount}</strong> / {MAX_FILES_PER_USER}{" "}
              {t.navbar.sourcesUnit}
            </span>
            <span className="text-[#9db4c0]/50">•</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[#c2dfe3]">
                <strong className={isNearTokenLimit ? "text-[#e0fbfc]" : "text-[#c2dfe3]"}>
                  {activeTokens.toLocaleString()}
                </strong>{" "}
                / {MAX_ACTIVE_CONTEXT_TOKENS.toLocaleString()} {t.navbar.tokensUnit}
              </span>
              <div className="w-16 h-1.5 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.max(activeTokens > 0 ? 4 : 0, Math.round(tokenRatio * 100))}%`,
                    backgroundColor: isNearTokenLimit ? "#e0fbfc" : "#c2dfe3",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* End: Language Toggle + Admin Switcher + Sidebar Toggle + User + Sign Out */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <LanguageToggle variant="dark" id="navbar-lang-toggle" />

          {user.role === "ADMIN" && (
            <Link
              id="nav-role-switcher"
              href={mode === "admin" ? "/workspace" : "/admin"}
              className="interactive-chip inline-flex items-center gap-1.5 rounded-lg bg-[#e0fbfc] hover:bg-[#c2dfe3] px-2.5 py-1.5 text-xs font-semibold text-[#253237]"
            >
              {mode === "admin" ? (
                <>
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.navbar.workspaceBtn}</span>
                </>
              ) : (
                <>
                  <Activity className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.navbar.adminPortalBtn}</span>
                </>
              )}
            </Link>
          )}

          {mode === "workspace" && onToggleSidebar && (
            <button
              id="toggle-sources-btn"
              type="button"
              onClick={onToggleSidebar}
              title={sidebarOpen ? t.navbar.collapseSources : t.navbar.openSources}
              className="interactive-chip inline-flex items-center gap-1.5 rounded-lg bg-[#5c6b73]/35 hover:bg-[#5c6b73]/60 px-2.5 py-1.5 text-xs font-medium text-[#e0fbfc] border border-[#9db4c0]/25 cursor-pointer"
            >
              <PanelRightOpen className="h-3.5 w-3.5 rtl:scale-x-[-1]" />
              <span className="hidden sm:inline">{t.navbar.sourcesCount(sourceCount)}</span>
            </button>
          )}

          <div className="flex items-center gap-2 ps-2 border-s border-[#9db4c0]/25">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name || user.username}
                width={28}
                height={28}
                unoptimized
                className="h-7 w-7 rounded-full object-cover border border-[#c2dfe3]/40"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-[#c2dfe3] text-[#253237] flex items-center justify-center text-[11px] font-bold">
                {initials}
              </div>
            )}
            <span className="hidden lg:inline text-xs font-medium text-[#e0fbfc]/90 max-w-[110px] truncate">
              {user.name || user.username}
            </span>
          </div>

          <button
            id="logout-btn"
            type="button"
            onClick={() =>
              void signOut({ redirect: false }).then(() => {
                router.push("/login");
                router.refresh();
              })
            }
            title={t.navbar.signOutTitle}
            className="interactive-chip inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-xs font-medium text-[#e0fbfc] cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5 rtl:scale-x-[-1]" />
            <span className="hidden sm:inline">{t.navbar.logout}</span>
          </button>
        </div>
      </div>

      {/* 3px Animated Brand Gradient Bottom Border */}
      <div className="h-[3px] w-full gradient-bar-animated" />
    </header>
  );
}
