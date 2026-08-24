import type { ReactNode } from 'react';

/**
 * The pill-badge section eyebrow (kit: `.ep-2ways-eyebrow` family).
 * `tone="dark"` is the Quick Start variant on the navy background.
 */
export function Eyebrow({
  children,
  icon,
  dot = false,
  tone = 'light',
}: {
  children: ReactNode;
  icon?: ReactNode;
  dot?: boolean;
  tone?: 'light' | 'dark';
}) {
  const toneClasses =
    tone === 'dark'
      ? 'border-[rgba(8,118,253,0.35)] bg-[rgba(8,118,253,0.14)] text-[#7BB2FF]'
      : 'border-[#BFD8FB] bg-[#ECF3FE] text-ep-blue700';
  return (
    <span
      className={`font-display inline-flex items-center gap-2 rounded-full border py-[7px] pl-[11px] pr-[14px] text-xs font-bold uppercase tracking-[0.08em] ${toneClasses}`}
    >
      {dot && (
        <span className="bg-ep-blue h-1.5 w-1.5 rounded-full shadow-[0_0_0_4px_rgba(8,118,253,0.18)]" />
      )}
      {icon}
      {children}
    </span>
  );
}

/** Signature pill divider under section headings (kit scale: 60×7). */
export function PillDivider({ gradient = false }: { gradient?: boolean }) {
  return (
    <div
      className={`h-[7px] w-[60px] rounded-[10px] ${
        gradient ? 'from-ep-blue to-ep-purple bg-gradient-to-r' : 'bg-ep-blue'
      }`}
    />
  );
}
