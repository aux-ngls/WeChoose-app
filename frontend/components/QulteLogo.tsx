import { useId } from "react";

interface QulteLogoProps {
  compact?: boolean;
}

export default function QulteLogo({ compact = false }: QulteLogoProps) {
  const logoId = useId().replace(/:/g, "");
  const panelGradientId = `${logoId}-panel`;
  const glowGradientId = `${logoId}-glow`;

  return (
    <div className="flex items-center gap-3">
      <svg
        viewBox="0 0 72 72"
        className={compact ? "h-10 w-10" : "h-12 w-12"}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={panelGradientId} x1="10" y1="8" x2="60" y2="64" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFD87A" />
            <stop offset="0.45" stopColor="#FF8E53" />
            <stop offset="1" stopColor="#D9383D" />
          </linearGradient>
          <radialGradient id={glowGradientId} cx="0" cy="0" r="1" gradientTransform="translate(28 22) rotate(48) scale(30 28)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFF4D6" stopOpacity="0.95" />
            <stop offset="1" stopColor="#FFF4D6" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect x="5" y="5" width="62" height="62" rx="20" fill="#0D1117" />
        <rect x="6.5" y="6.5" width="59" height="59" rx="18.5" fill={`url(#${panelGradientId})`} opacity="0.92" />
        <rect x="10" y="10" width="52" height="52" rx="16" fill="#111318" />
        <circle cx="28" cy="22" r="18" fill={`url(#${glowGradientId})`} />

        <circle cx="35" cy="35" r="17" fill="none" stroke="#FFE8B0" strokeWidth="8" />
        <path d="M45 45 L57 57" stroke="#FFE8B0" strokeWidth="8" strokeLinecap="round" />
        <circle cx="29" cy="28" r="3.4" fill="#FFE8B0" />
        <circle cx="24" cy="45" r="2.2" fill="#FFB56B" />
        <circle cx="50" cy="23" r="2.6" fill="#FF7E5B" />
      </svg>

      {!compact && (
        <div className="flex flex-col leading-none">
          <span className="text-xl font-black tracking-[-0.08em] text-white">Qulte</span>
          <span className="text-[10px] uppercase tracking-[0.32em] text-amber-300/80">Cinema Social</span>
        </div>
      )}
    </div>
  );
}
