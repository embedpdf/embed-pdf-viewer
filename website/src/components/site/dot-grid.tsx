/** The brand's 4×4 dotted-grid orientation mark (kit: 9px dots, 26px gap). */
export function DotGrid({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`grid h-[117px] w-[119px] grid-cols-4 gap-[26px] ${className}`}>
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className="h-[9px] w-[9px] rounded-full bg-[#ABC9FD]" />
      ))}
    </div>
  );
}
