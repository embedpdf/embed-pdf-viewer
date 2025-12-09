import { h } from 'preact';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

export const Checkbox = ({ label, checked, onChange }: CheckboxProps) => (
  <label className="text-fg-secondary inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium">
    {/* 1️⃣ the real checkbox (still visible so we keep keyboard a11y) */}
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
      className="border-border-default bg-bg-input checked:border-accent checked:bg-accent peer h-4 w-4 shrink-0 appearance-none rounded-[3px] border transition-all"
    />

    {/* 2️⃣ overlayed check icon that fades in only when checked */}
    <svg
      viewBox="0 0 24 24"
      className="/* fine-tune centering */ text-fg-on-accent pointer-events-none absolute h-3.5 w-3.5 translate-x-[1px] translate-y-[1px] opacity-0 peer-checked:opacity-100"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>

    {label}
  </label>
);
