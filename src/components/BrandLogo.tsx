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
  const textColor = variant === "light" ? "text-white" : "text-[#373737]";
  const subColor = variant === "light" ? "text-white/70" : "text-[#373737]/70";

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="1.5"
          y="1.5"
          width="33"
          height="33"
          rx="9"
          fill={variant === "light" ? "#262626" : "#373737"}
          stroke="#c1dbe3"
          strokeWidth="1.5"
        />
        {/* Layered grounded document stack */}
        <rect x="8" y="9" width="13" height="17" rx="2.5" fill="#c1dbe3" />
        <rect x="12" y="11" width="13" height="17" rx="2.5" fill="#c7dfc5" />
        <rect x="16" y="13" width="12" height="15" rx="2.5" fill="#f6feaa" />
        {/* Grounded lock/citation bar lines */}
        <line
          x1="18.5"
          y1="17.5"
          x2="25.5"
          y2="17.5"
          stroke="#373737"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="18.5"
          y1="21.5"
          x2="24"
          y2="21.5"
          stroke="#373737"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="25.5" cy="9.5" r="3" fill="#fce694" />
      </svg>
      <div className="leading-tight">
        <span className={`font-semibold tracking-tight text-[15px] ${textColor}`}>
          Context<span className={variant === "light" ? "text-[#f6feaa]" : "text-[#373737]"}>LM</span>
        </span>
        {showSubtitle && (
          <p className={`text-[11px] font-medium ${subColor}`}>
            Grounded Document Q&amp;A
          </p>
        )}
      </div>
    </div>
  );
}
