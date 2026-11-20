"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, PanelRightOpen } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n";
import { MAX_ACTIVE_CONTEXT_TOKENS, MAX_FILES_PER_USER } from "@/lib/constants";

interface NavbarProps {
  mode: "workspace" | "admin" | "developer";
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
  const { lang, t } = useLanguage();
  const isHe = lang === "he";
  const tokenRatio = Math.min(1, activeTokens / MAX_ACTIVE_CONTEXT_TOKENS);
  const isNearTokenLimit = tokenRatio >= 0.8;
  const initials = (user.name || user.username || "U")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="relative z-30 shrink-0 bg-[#253237] text-[#ffffff] border-b border-white/10">
      <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Start: Brand + Mode Navigation */}
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href={
              mode === "developer"
                ? "/developer"
                : mode === "admin"
                  ? "/admin"
                  : "/workspace"
            }
            className="shrink-0 focus:outline-none"
          >
            <BrandLogo size={26} variant="light" />
          </Link>

          <span className="hidden sm:inline-block h-4 w-px bg-white/15" />

          <nav className="hidden sm:flex items-center gap-1">
            {(user.role === "ADMIN" || user.role === "DEVELOPER") ? (
              <>
                <Link
                  id="nav-workspace-link"
                  href="/workspace"
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    mode === "workspace"
                      ? "bg-white/15 text-white"
                      : "text-[#c2dfe3] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {t.navbar.workspaceBtn}
                </Link>
                <Link
                  id="nav-admin-link"
                  href="/admin"
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    mode === "admin"
                      ? "bg-white/15 text-white"
                      : "text-[#c2dfe3] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {t.navbar.adminPortalBtn}
                </Link>
                <Link
                  id="nav-developer-link"
                  href="/developer"
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    mode === "developer"
                      ? "bg-white/15 text-white"
                      : "text-[#c2dfe3] hover:text-white hover:bg-white/5"
                  }`}
                >
                  {isHe ? "דיאגנוסטיקה ולוגים" : "Developer Ops"}
                </Link>
              </>
            ) : (
              <span className="text-xs font-medium text-[#c2dfe3] truncate">
                {t.navbar.workspaceTitle}
              </span>
            )}
          </nav>
        </div>

        {/* Center: Clean Tabular Context Readout (Workspace mode only) */}
        {mode === "workspace" && (
          <div className="hidden md:flex items-center gap-3 text-xs font-mono text-[#c2dfe3]">
            <span>
              <strong className="text-white font-semibold">{sourceCount}</strong>
              <span className="text-[#9db4c0]">/{MAX_FILES_PER_USER}</span>{" "}
              {t.navbar.sourcesUnit}
            </span>
            <span className="text-white/20">|</span>
            <div className="flex items-center gap-2">
              <span>
                <strong className="text-white font-semibold">
                  {activeTokens.toLocaleString()}
                </strong>
                <span className="text-[#9db4c0]">
                  /{MAX_ACTIVE_CONTEXT_TOKENS.toLocaleString()}
                </span>{" "}
                {t.navbar.tokensUnit}
              </span>
              <div className="w-14 h-1 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.max(activeTokens > 0 ? 4 : 0, Math.round(tokenRatio * 100))}%`,
                    backgroundColor: isNearTokenLimit ? "#e0fbfc" : "#9db4c0",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* End: Utilities & User */}
        <div className="flex items-center gap-2 shrink-0">
          <LanguageToggle variant="dark" id="navbar-lang-toggle" />

          {mode === "workspace" && onToggleSidebar && (
            <button
              id="toggle-sources-btn"
              type="button"
              onClick={onToggleSidebar}
              title={sidebarOpen ? t.navbar.collapseSources : t.navbar.openSources}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[#c2dfe3] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <PanelRightOpen className="h-3.5 w-3.5 rtl:scale-x-[-1]" />
              <span className="hidden sm:inline">{t.navbar.sourcesCount(sourceCount)}</span>
            </button>
          )}

          <div className="flex items-center gap-2 ps-2.5 border-s border-white/15">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name || user.username}
                width={24}
                height={24}
                unoptimized
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-white/15 text-white flex items-center justify-center text-[10px] font-semibold">
                {initials}
              </div>
            )}
            <span className="hidden lg:inline text-xs font-medium text-[#c2dfe3] max-w-[110px] truncate">
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
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-[#9db4c0] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5 rtl:scale-x-[-1]" />
            <span className="hidden sm:inline">{t.navbar.logout}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
