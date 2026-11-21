"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, PanelRightClose, PanelRightOpen } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/lib/i18n";

interface NavbarProps {
  mode: "workspace" | "admin" | "developer";
  user: {
    username: string;
    name?: string | null;
    image?: string | null;
    role: string;
  };
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

export function Navbar({
  mode,
  user,
  onToggleSidebar,
  sidebarOpen,
}: NavbarProps) {
  const router = useRouter();
  const { lang, t } = useLanguage();
  const isHe = lang === "he";
  const initials = (user.name || user.username || "U")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="relative z-30 shrink-0 bg-[#0f172a]/88 backdrop-blur-xl text-white border-b border-white/12 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.45)]">
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
            className="shrink-0 focus:outline-none transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            <BrandLogo size={26} variant="light" />
          </Link>

          <span className="hidden sm:inline-block h-4 w-px bg-white/15" />

          <nav className="hidden sm:flex items-center gap-1">
            {user.role === "ADMIN" || user.role === "DEVELOPER" ? (
              <>
                <Link
                  id="nav-workspace-link"
                  href="/workspace"
                  className={`interactive-chip rounded-lg px-3 py-1.5 text-xs font-medium ${
                    mode === "workspace"
                      ? "bg-teal-600/90 text-white shadow-[0_2px_10px_rgba(13,148,136,0.4)] border border-teal-400/30"
                      : "text-slate-300 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {t.navbar.workspaceBtn}
                </Link>
                <Link
                  id="nav-admin-link"
                  href="/admin"
                  className={`interactive-chip rounded-lg px-3 py-1.5 text-xs font-medium ${
                    mode === "admin"
                      ? "bg-teal-600/90 text-white shadow-[0_2px_10px_rgba(13,148,136,0.4)] border border-teal-400/30"
                      : "text-slate-300 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {t.navbar.adminPortalBtn}
                </Link>
                <Link
                  id="nav-developer-link"
                  href="/developer"
                  className={`interactive-chip rounded-lg px-3 py-1.5 text-xs font-medium ${
                    mode === "developer"
                      ? "bg-teal-600/90 text-white shadow-[0_2px_10px_rgba(13,148,136,0.4)] border border-teal-400/30"
                      : "text-slate-300 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {isHe ? "דיאגנוסטיקה ולוגים" : "Developer Ops"}
                </Link>
              </>
            ) : (
              <span className="text-xs font-medium text-slate-300 truncate">
                {t.navbar.workspaceTitle}
              </span>
            )}
          </nav>
        </div>

        {/* End: Utilities & User (Zero token or source counters in navbar) */}
        <div className="flex items-center gap-2 shrink-0">
          <LanguageToggle variant="dark" id="navbar-lang-toggle" />

          {mode === "workspace" && onToggleSidebar && (
            <button
              id="toggle-sources-btn"
              type="button"
              onClick={onToggleSidebar}
              title={
                sidebarOpen ? t.navbar.collapseSources : t.navbar.openSources
              }
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border cursor-pointer ${
                sidebarOpen
                  ? "bg-teal-500/20 text-teal-100 border-teal-400/35 hover:bg-teal-500/30"
                  : "bg-white/8 text-slate-200 border-white/12 hover:bg-white/15 hover:text-white"
              }`}
            >
              {sidebarOpen ? (
                <PanelRightClose className="h-3.5 w-3.5 transition-transform duration-200" />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5 transition-transform duration-200" />
              )}
              <span className="hidden sm:inline">{t.sources.title}</span>
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
                className="h-6 w-6 rounded-full object-cover ring-1 ring-white/25"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-teal-500/25 text-teal-200 ring-1 ring-teal-400/30 flex items-center justify-center text-[10px] font-semibold">
                {initials}
              </div>
            )}
            <span className="hidden lg:inline text-xs font-medium text-slate-200 max-w-[110px] truncate">
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
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-rose-200 hover:bg-rose-500/15 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5 rtl:scale-x-[-1]" />
            <span className="hidden sm:inline">{t.navbar.logout}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
