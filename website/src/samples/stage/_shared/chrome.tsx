/*
 * A tiny, shared UI kit that gives every Stage demo the same polished look.
 * It's presentational only — no EmbedPDF imports — so the demos themselves
 * stay focused on the Stage API. The styles live in demo.css and are injected
 * once, scoped under `.epdf-demo`, so they never touch the docs page.
 */
import type { CSSProperties, ReactNode } from 'react';

import css from './demo.css?inline';

// The demo bundles mount client-side, so this runs once per page load and
// dedupes across every demo sharing the DOM.
if (typeof document !== 'undefined' && !document.getElementById('epdf-demo-css')) {
  const style = document.createElement('style');
  style.id = 'epdf-demo-css';
  style.textContent = css;
  document.head.appendChild(style);
}

/** Scoped root — wrap each demo in this so the shared styles apply. */
export function Demo({ children }: { children: ReactNode }) {
  return <div className="epdf-demo">{children}</div>;
}

/** The control row above a stage. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="epdf-toolbar">{children}</div>;
}

/** Pushes whatever follows to the right edge of the toolbar. */
export function Spacer() {
  return <span className="epdf-spacer" />;
}

export function Button({
  onClick,
  disabled,
  icon,
  children,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: boolean;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={icon ? 'epdf-btn epdf-btn--icon' : 'epdf-btn'}
    >
      {children}
    </button>
  );
}

type Option<T extends string> = { value: T; label: string };

/** A segmented control for a small, mutually-exclusive set of choices. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: T) => void;
  options: Option<T>[];
}) {
  return (
    <div className="epdf-seg" role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="epdf-seg__btn"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** A labelled dropdown for a longer list of choices. */
export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
}) {
  return (
    <label className="epdf-field">
      {label}
      <select className="epdf-select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  onEnter,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
}) {
  return (
    <input
      className="epdf-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
    />
  );
}

/** A pill read-out, e.g. "Page 3 of 24". */
export function Badge({ children }: { children: ReactNode }) {
  return <span className="epdf-badge">{children}</span>;
}

/** A centered, fixed-width value read-out, e.g. the current zoom percentage. */
export function Readout({ children }: { children: ReactNode }) {
  return <span className="epdf-readout">{children}</span>;
}

/** A slim progress track; `value` is 0–1. */
export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="epdf-progress">
      <div
        className="epdf-progress__fill"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

/** The framed surface a stage sits on. Pass the stage as children. */
export function StageFrame({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div className="epdf-stage" style={{ height }}>
      {children}
    </div>
  );
}

/** Fill the StageFrame — hand this to `<Stage style>`. */
export const stageFill: CSSProperties = { height: '100%' };
