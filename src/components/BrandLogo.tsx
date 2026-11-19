"use client";

import { useLanguage } from "@/lib/i18n";

interface BrandLogoProps {
  size?: number;
  variant?: "light" | "dark";
  showSubtitle?: boolean;
}

export function BrandLogo({
  size = 28,
  variant = "light",
  showSubtitle = false,
}: BrandLogoProps) {
  const { t } = useLanguage();
  const textColor = variant === "light" ? "text-[#e0fbfc]" : "text-[#253237]";
  const subColor =
    variant === "light" ? "text-[#c2dfe3]/85" : "text-[#5c6b73]";

  return (
    <div className="group inline-flex items-center gap-2.5 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0 transition-transform duration-300 ease-out group-hover:scale-105 group-hover:-rotate-3"
      >
        <rect
          x="1.5"
          y="1.5"
          width="33"
          height="33"
          rx="9"
          fill={variant === "light" ? "#1d282c" : "#253237"}
          stroke="#9db4c0"
          strokeWidth="1.5"
        />
        {/* Layered grounded document stack in new palette */}
        <rect x="8" y="9" width="13" height="17" rx="2.5" fill="#5c6b73" />
        <rect x="12" y="11" width="13" height="17" rx="2.5" fill="#9db4c0" />
        <rect x="16" y="13" width="12" height="15" rx="2.5" fill="#e0fbfc" />
        {/* Grounded lock/citation bar lines */}
        <line
          x1="18.5"
          y1="17.5"
          x2="25.5"
          y2="17.5"
          stroke="#253237"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="18.5"
          y1="21.5"
          x2="24"
          y2="21.5"
          stroke="#253237"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="25.5" cy="9.5" r="3" fill="#c2dfe3" />
      </svg>
      <div className="leading-tight">
        <span
          dir="ltr"
          className={`inline-block font-semibold tracking-tight text-[15px] ${textColor}`}
        >
          Context
          <span
            className={
              variant === "light" ? "text-[#c2dfe3]" : "text-[#5c6b73]"
            }
          >
            LM
          </span>
        </span>
        {showSubtitle && (
          <p className={`text-[11px] font-medium ${subColor}`}>
            {t.brand.subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
