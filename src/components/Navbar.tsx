"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  ChevronDown,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
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
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const navMenuRef = useRef<HTMLDivElement | null>(null);
  const isPrivileged = user.role === "ADMIN" || user.role === "DEVELOPER";

  useEffect(() => {
    if (!navMenuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (
        navMenuRef.current &&
        !navMenuRef.current.contains(e.target as Node)
      ) {
        setNavMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [navMenuOpen]);

  const initials = (user.name || user.username || "U")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const navItems: Array<{
    id: string;
    key: "workspace" | "admin" | "developer";
    href: string;
    label: string;
  }> = [
    {
      id: "nav-workspace-link",
      key: "workspace",
      href: "/workspace",
      label: t.navbar.workspaceBtn,
    },
    {
      id: "nav-admin-link",
      key: "admin",
      href: "/admin",
      label: t.navbar.adminPortalBtn,
    },
    {
      id: "nav-developer-link",
      key: "developer",
      href: "/developer",
      label: isHe ? "דיאגנוסטיקה ולוגים" : "Developer Ops",
    },
  ];

  const currentNavLabel =
    navItems.find((item) => item.key === mode)?.label ?? t.navbar.workspaceBtn;

  return (
    <header className="sticky top-0 z-30 shrink-0 w-full max-w-full bg-[#0f172a]/90 backdrop-blur-xl text-white border-b border-white/12 shadow-[0_8px_28px_-12px_rgba(15,23,42,0.45)]">
      <div className="h-14 px-2.5 sm:px-5 flex items-center justify-between gap-1.5 sm:gap-3 min-w-0">
        {/* Start: Brand + Mode Navigation */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <Link
            href="/workspace"
            title={isHe ? "דף הבית — מרחב עבודה" : "Home — Workspace"}
            className="shrink-0 focus:outline-none transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            <BrandLogo size={24} variant="light" />
          </Link>

          <span className="hidden lg:inline-block h-4 w-px bg-white/15 shrink-0" />

          {/* Desktop Inline Role Navigation (>= 1024px) */}
          <nav className="hidden lg:flex items-center gap-1 min-w-0">
            {isPrivileged ? (
              navItems.map((item) => (
                <Link
                  key={item.key}
                  id={item.id}
                  href={item.href}
                  className={`interactive-chip shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    mode === item.key
                      ? "bg-teal-600/90 text-white shadow-[0_2px_10px_rgba(13,148,136,0.4)] border border-teal-400/30"
                      : "text-slate-300 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              ))
            ) : (
              <span className="text-xs font-medium text-slate-300 truncate">
                {t.navbar.workspaceTitle}
              </span>
            )}
          </nav>

          {/* Compact Role Switcher Dropdown for Narrow / Phone Viewports (< 1024px) */}
          {isPrivileged && (
            <div ref={navMenuRef} className="relative lg:hidden min-w-0">
              <button
                type="button"
                onClick={() => setNavMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 px-2 py-1.5 text-[11px] font-medium text-white max-w-[118px] sm:max-w-[180px] cursor-pointer"
              >
                <span className="truncate">{currentNavLabel}</span>
                <ChevronDown
                  className={`h-3 w-3 shrink-0 text-slate-300 transition-transform duration-150 ${
                    navMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {navMenuOpen && (
                <div
                  dir={isHe ? "rtl" : "ltr"}
                  className="animate-popover-in fixed top-[3.75rem] inset-x-3 sm:absolute sm:top-full sm:inset-x-auto sm:left-0 sm:mt-2 sm:w-52 rounded-xl bg-[#0f172a]/96 backdrop-blur-xl border border-white/15 shadow-2xl p-1.5 z-50 space-y-1"
                >
                  {navItems.map((item) => (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => setNavMenuOpen(false)}
                      className={`block rounded-lg px-3 py-2.5 sm:py-2 text-xs font-medium transition-colors ${
                        mode === item.key
                          ? "bg-teal-600 text-white"
                          : "text-slate-200 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* End: Utilities & User (Zero token or source counters in navbar) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <LanguageToggle variant="dark" id="navbar-lang-toggle" />

          {mode === "workspace" && onToggleSidebar && (
            <button
              id="toggle-sources-btn"
              type="button"
              onClick={onToggleSidebar}
              title={
                sidebarOpen ? t.navbar.collapseSources : t.navbar.openSources
              }
              className={`inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-medium border cursor-pointer ${
                sidebarOpen
                  ? "bg-teal-500/20 text-teal-100 border-teal-400/35 hover:bg-teal-500/30"
                  : "bg-white/8 text-slate-200 border-white/12 hover:bg-white/15 hover:text-white"
              }`}
            >
              {sidebarOpen ? (
                <PanelRightClose className="h-3.5 w-3.5 shrink-0 transition-transform duration-200" />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5 shrink-0 transition-transform duration-200" />
              )}
              <span className="hidden md:inline">{t.sources.title}</span>
            </button>
          )}

          <div className="hidden sm:flex items-center gap-2 ps-2 border-s border-white/15 shrink-0">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name || user.username}
                width={24}
                height={24}
                unoptimized
                className="h-6 w-6 rounded-full object-cover ring-1 ring-white/25 shrink-0"
              />
            ) : (
              <div className="h-6 w-6 rounded-full bg-teal-500/25 text-teal-200 ring-1 ring-teal-400/30 flex items-center justify-center text-[10px] font-semibold shrink-0">
                {initials}
              </div>
            )}
            <span className="hidden xl:inline text-xs font-medium text-slate-200 max-w-[110px] truncate">
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
            className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap rounded-lg px-2 sm:px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-rose-200 hover:bg-rose-500/15 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0 rtl:scale-x-[-1]" />
            <span className="hidden md:inline">{t.navbar.logout}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
