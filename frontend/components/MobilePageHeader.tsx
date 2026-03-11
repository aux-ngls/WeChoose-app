import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  accent?: "red" | "sky" | "amber" | "emerald" | "slate";
  trailing?: ReactNode;
}

const ACCENT_STYLES = {
  red: {
    chip: "bg-red-500/12 text-red-200",
    border: "border-red-500/15",
  },
  sky: {
    chip: "bg-sky-500/12 text-sky-200",
    border: "border-sky-500/15",
  },
  amber: {
    chip: "bg-amber-500/12 text-amber-200",
    border: "border-amber-500/15",
  },
  emerald: {
    chip: "bg-emerald-500/12 text-emerald-200",
    border: "border-emerald-500/15",
  },
  slate: {
    chip: "bg-white/10 text-white",
    border: "border-white/10",
  },
} as const;

export default function MobilePageHeader({
  title,
  subtitle,
  icon: Icon,
  accent = "slate",
  trailing,
}: MobilePageHeaderProps) {
  const accentStyle = ACCENT_STYLES[accent];

  return (
    <section
      className={`mb-4 overflow-hidden rounded-[26px] border ${accentStyle.border} bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-4 shadow-[0_18px_46px_rgba(0,0,0,0.34)] backdrop-blur-md md:hidden`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${accentStyle.chip}`}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black tracking-tight text-white">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p> : null}
          </div>
        </div>

        {trailing ? <div className="flex-shrink-0">{trailing}</div> : null}
      </div>
    </section>
  );
}
