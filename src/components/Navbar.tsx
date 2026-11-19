"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  Activity,
  BookOpen,
  LogOut,
  PanelRightOpen,
  Shield,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
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
  const tokenRatio = Math.min(1, activeTokens / MAX_ACTIVE_CONTEXT_TOKENS);
  const isNearTokenLimit = tokenRatio >= 0.8;
  const initials = (user.name || user.username || "U")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="relative z-30 shrink-0 bg-[#373737] text-white">
      <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* Left: Brand + Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={user.role === "ADMIN" && mode === "admin" ? "/admin" : "/workspace"}
            className="shrink-0 focus:outline-none"
          >
            <BrandLogo size={28} variant="light" />
          </Link>
          <span className="hidden sm:inline-block h-5 w-px bg-white/15" />
          <div className="hidden sm:flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-medium text-white/95 truncate">
              {mode === "admin"
                ? "Eagle's Eye Telemetry Portal"
                : "My Grounded Notebook"}
            </h1>
            {mode === "admin" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#fce694] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#373737]">
                <Shield className="h-3 w-3" />
                Admin
              </span>
            )}
          </div>
        </div>

        {/* Center: Active Context Meter (Workspace mode) */}
        {mode === "workspace" && (
          <div className="hidden md:flex items-center gap-3 rounded-full bg-white/10 px-3.5 py-1.5 text-xs border border-white/10">
            <span className="font-mono text-white/90">
              <strong className="text-[#c7dfc5]">{sourceCount}</strong> / {MAX_FILES_PER_USER} Sources
            </span>
            <span className="text-white/35">•</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-white/90">
                <strong className={isNearTokenLimit ? "text-[#fce694]" : "text-[#f6feaa]"}>
                  {activeTokens.toLocaleString()}
                </strong>{" "}
                / {MAX_ACTIVE_CONTEXT_TOKENS.toLocaleString()} tokens
              </span>
              <div className="w-16 h-1.5 rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.max(activeTokens > 0 ? 4 : 0, Math.round(tokenRatio * 100))}%`,
                    backgroundColor: isNearTokenLimit ? "#fce694" : "#c7dfc5",
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Right: Admin Switcher + Sidebar Toggle + User + Sign Out */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {user.role === "ADMIN" && (
            <Link
              id="nav-role-switcher"
              href={mode === "admin" ? "/workspace" : "/admin"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#fce694] hover:bg-[#f6feaa] px-2.5 py-1.5 text-xs font-semibold text-[#373737] transition-colors"
            >
              {mode === "admin" ? (
                <>
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Workspace</span>
                </>
              ) : (
                <>
                  <Activity className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Admin Portal</span>
                </>
              )}
            </Link>
          )}

          {mode === "workspace" && onToggleSidebar && (
            <button
              id="toggle-sources-btn"
              type="button"
              onClick={onToggleSidebar}
              title={sidebarOpen ? "Collapse Sources panel" : "Open Sources panel"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer"
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sources ({sourceCount})</span>
            </button>
          )}

          <div className="flex items-center gap-2 pl-1.5 border-l border-white/15">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name || user.username}
                width={28}
                height={28}
                unoptimized
                className="h-7 w-7 rounded-full object-cover border border-white/25"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-[#f6feaa] text-[#373737] flex items-center justify-center text-[11px] font-bold">
                {initials}
              </div>
            )}
            <span className="hidden lg:inline text-xs font-medium text-white/90 max-w-[110px] truncate">
              {user.name || user.username}
            </span>
          </div>

          <button
            id="logout-btn"
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign out"
            className="inline-flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1.5 text-xs font-medium text-white/90 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>

      {/* 3px Brand Gradient Bottom Border */}
      <div
        className="h-[3px] w-full"
        style={{
          background:
            "linear-gradient(90deg, #c1dbe3ff 0%, #c7dfc5ff 50%, #f6feaaff 100%)",
        }}
      />
    </header>
  );
}
