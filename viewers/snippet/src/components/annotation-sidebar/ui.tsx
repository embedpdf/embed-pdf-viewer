import { Fragment, h, ComponentChildren } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';

import {
  STANDARD_FONT_FAMILIES,
  PdfStandardFontFamily,
  standardFontFamilyLabel,
  PdfAnnotationBorderStyle,
  PdfAnnotationLineEnding,
} from '@embedpdf/models';

/* * ==================================================================
 * Reusable Dropdown Hook & Generic Components
 * ==================================================================
 */

/**
 * A hook to manage the state and behavior of a dropdown component.
 * It handles:
 * 1. Open/closed state.
 * 2. Closing the dropdown when clicking outside of it.
 * 3. Scrolling the selected item into view when the dropdown opens.
 */
export const useDropdown = () => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLElement>(null);

  // Effect to close the dropdown on an outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  // Effect to scroll the selected item into view
  useEffect(() => {
    if (open && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'center',
        inline: 'start',
      });
    }
  }, [open]);

  return { open, setOpen, rootRef, selectedItemRef };
};

/**
 * A generic, reusable Select component built with the useDropdown hook.
 */
const GenericSelect = <T,>({
  value,
  onChange,
  options,
  getOptionKey,
  renderValue,
  renderOption,
  triggerClass = 'px-3 py-2',
}: {
  value: T;
  onChange: (item: T) => void;
  options: readonly T[];
  getOptionKey: (item: T) => string | number;
  renderValue: (value: T) => h.JSX.Element;
  renderOption: (item: T, isSelected: boolean) => h.JSX.Element;
  triggerClass?: string;
}) => {
  const { open, setOpen, rootRef, selectedItemRef } = useDropdown();

  return (
    <div ref={rootRef} class="relative inline-block w-full">
      {/* Trigger Button */}
      <button
        type="button"
        class={`border-border-default bg-bg-input flex w-full items-center justify-between gap-2 rounded border ${triggerClass}`}
        onClick={() => setOpen((o) => !o)}
      >
        {renderValue(value)}
        {/* Chevron */}
        <svg class="text-fg-secondary h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div class="border-border-default bg-bg-elevated absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border p-1 shadow-lg">
          {options.map((option) => {
            const isSelected = getOptionKey(option) === getOptionKey(value);
            return (
              <button
                // @ts-ignore
                ref={isSelected ? selectedItemRef : null}
                key={getOptionKey(option)}
                class={`hover:bg-interactive-hover block w-full rounded text-left ${
                  isSelected ? 'bg-interactive-hover' : ''
                }`}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {renderOption(option, isSelected)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* * ==================================================================
 * Shared Layout Components
 * ==================================================================
 */

/**
 * Section label for annotation property groups
 */
export const SectionLabel = ({
  children,
  className = '',
}: {
  children: ComponentChildren;
  className?: string;
}) => (
  <label class={`text-fg-primary mb-2 block text-sm font-medium ${className}`}>{children}</label>
);

/**
 * Value display for showing current values (e.g., "50%", "5px")
 */
export const ValueDisplay = ({
  children,
  className = '',
}: {
  children: ComponentChildren;
  className?: string;
}) => <span class={`text-fg-muted text-xs ${className}`}>{children}</span>;

/**
 * Section wrapper for consistent spacing
 */
export const Section = ({
  children,
  className = '',
}: {
  children: ComponentChildren;
  className?: string;
}) => <section class={`mb-6 ${className}`}>{children}</section>;

/* * ==================================================================
 * Original Components (Unchanged)
 * ==================================================================
 */

/* Slider ─────────────────────────────────────────────────────────── */
export const Slider = ({
  value,
  min = 0,
  max = 1,
  step = 0.1,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) => (
  <input
    type="range"
    class="range-sm bg-border-subtle mb-2 h-1 w-full cursor-pointer appearance-none rounded-lg"
    value={value}
    min={min}
    max={max}
    step={step}
    onInput={(e) => onChange(parseFloat((e.target as HTMLInputElement).value))}
  />
);

/* Color swatch ───────────────────────────────────────────────────── */
export const ColorSwatch = ({
  color,
  active,
  onSelect,
}: {
  color: string;
  active: boolean;
  onSelect: (c: string) => void;
}) => {
  const isTransparent = (c: string) =>
    c === 'transparent' ||
    /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)$/i.test(c) ||
    (/^#([0-9a-f]{8})$/i.test(c) && c.slice(-2).toLowerCase() === '00') ||
    (/^#([0-9a-f]{4})$/i.test(c) && c.slice(-1).toLowerCase() === '0');

  const baseStyle: h.JSX.CSSProperties = isTransparent(color)
    ? {
        backgroundColor: '#fff',
        backgroundImage:
          'linear-gradient(45deg, transparent 40%, red 40%, red 60%, transparent 60%)',
        backgroundSize: '100% 100%',
      }
    : { backgroundColor: color };

  return (
    <button
      title={color}
      class={`border-border-strong h-5 w-5 rounded-full border ${
        active ? 'outline-accent outline outline-2 outline-offset-2' : ''
      }`}
      style={baseStyle}
      onClick={() => onSelect(color)}
    />
  );
};

/* * ==================================================================
 * Refactored Components
 * ==================================================================
 */

// —— Stroke-style picker ────────────────────────────────────────────
type StrokeItem = { id: PdfAnnotationBorderStyle; dash?: number[] };

const STROKES: StrokeItem[] = [
  { id: PdfAnnotationBorderStyle.SOLID },
  { id: PdfAnnotationBorderStyle.DASHED, dash: [6, 2] },
  { id: PdfAnnotationBorderStyle.DASHED, dash: [8, 4] },
  { id: PdfAnnotationBorderStyle.DASHED, dash: [3, 3] },
  { id: PdfAnnotationBorderStyle.DASHED, dash: [1, 2] },
  { id: PdfAnnotationBorderStyle.DASHED, dash: [4, 2, 1, 2] },
  { id: PdfAnnotationBorderStyle.DASHED, dash: [8, 4, 1, 4] },
];

const renderStrokeSvg = (dash?: number[]) => (
  <svg width="80" height="8" viewBox="0 0 80 8">
    <line
      x1="0"
      y1="4"
      x2="80"
      y2="4"
      style={{
        strokeDasharray: dash?.join(' '),
        stroke: 'currentColor',
        strokeWidth: '2',
      }}
    />
  </svg>
);

export const StrokeStyleSelect = (props: {
  value: StrokeItem;
  onChange: (s: StrokeItem) => void;
}) => (
  <GenericSelect
    {...props}
    options={STROKES}
    getOptionKey={(s) => s.id + (s.dash?.join('-') || '')}
    renderValue={(v) => renderStrokeSvg(v.dash)}
    renderOption={(s) => <div class="px-1 py-2">{renderStrokeSvg(s.dash)}</div>}
  />
);

// —— Line-ending picker ─────────────────────────────────────────────
const ENDINGS: PdfAnnotationLineEnding[] = [
  PdfAnnotationLineEnding.None,
  PdfAnnotationLineEnding.Square,
  PdfAnnotationLineEnding.Circle,
  PdfAnnotationLineEnding.Diamond,
  PdfAnnotationLineEnding.OpenArrow,
  PdfAnnotationLineEnding.ClosedArrow,
  PdfAnnotationLineEnding.ROpenArrow,
  PdfAnnotationLineEnding.RClosedArrow,
  PdfAnnotationLineEnding.Butt,
  PdfAnnotationLineEnding.Slash,
];

const LineEndingIcon = ({
  ending,
  position,
}: {
  ending: PdfAnnotationLineEnding;
  position: 'start' | 'end';
}) => {
  const MARKERS: Partial<Record<PdfAnnotationLineEnding, h.JSX.Element>> = {
    [PdfAnnotationLineEnding.Square]: <path d="M68 -4 L76 -4 L76 4 L68 4 Z" />,
    [PdfAnnotationLineEnding.Circle]: <circle cx="72" cy="0" r="4" />,
    [PdfAnnotationLineEnding.Diamond]: <path d="M72 -5 L77 0 L72 5 L67 0 Z" />,
    [PdfAnnotationLineEnding.OpenArrow]: <path d="M67 -5 L77 0 L67 5" fill="none" />,
    [PdfAnnotationLineEnding.ClosedArrow]: <path d="M67 -5 L77 0 L67 5 Z" />,
    [PdfAnnotationLineEnding.ROpenArrow]: <path d="M77 -5 L67 0 L77 5" fill="none" />,
    [PdfAnnotationLineEnding.RClosedArrow]: <path d="M77 -5 L67 0 L77 5 Z" />,
    [PdfAnnotationLineEnding.Butt]: <path d="M72 -5 L72 5" fill="none" />,
    [PdfAnnotationLineEnding.Slash]: <path d="M67 -5 L77 5" fill="none" />,
  };
  const LINE_ENDPOINT_ADJUSTMENTS: Partial<Record<PdfAnnotationLineEnding, number>> = {
    [PdfAnnotationLineEnding.Square]: 68,
    [PdfAnnotationLineEnding.Circle]: 68,
    [PdfAnnotationLineEnding.Diamond]: 67,
    [PdfAnnotationLineEnding.OpenArrow]: 76,
    [PdfAnnotationLineEnding.ClosedArrow]: 67,
    [PdfAnnotationLineEnding.ROpenArrow]: 67,
    [PdfAnnotationLineEnding.RClosedArrow]: 67,
    [PdfAnnotationLineEnding.Butt]: 72,
    [PdfAnnotationLineEnding.Slash]: 72,
  };
  const marker = MARKERS[ending];
  const lineEndX = LINE_ENDPOINT_ADJUSTMENTS[ending] ?? 77;
  const groupTransform = position === 'start' ? 'rotate(180 40 10)' : '';

  return (
    <svg width="80" height="20" viewBox="0 0 80 20" class="text-fg-primary">
      <g transform={groupTransform}>
        <line x1="4" y1="10" x2={lineEndX} y2="10" stroke="currentColor" stroke-width="1.5" />
        {marker && (
          <g
            transform="translate(0, 10)"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="1.5"
          >
            {marker}
          </g>
        )}
      </g>
    </svg>
  );
};

export const LineEndingSelect = ({
  position,
  ...props
}: {
  value: PdfAnnotationLineEnding;
  onChange: (e: PdfAnnotationLineEnding) => void;
  position: 'start' | 'end';
}) => (
  <GenericSelect
    {...props}
    options={ENDINGS}
    getOptionKey={(e) => e}
    triggerClass="px-3 py-1"
    renderValue={(v) => <LineEndingIcon ending={v} position={position} />}
    renderOption={(e) => (
      <div class="px-1 py-1">
        <LineEndingIcon ending={e} position={position} />
      </div>
    )}
  />
);

// —— Font-family picker ─────────────────────────────────────────────
export const FontFamilySelect = (props: {
  value: PdfStandardFontFamily;
  onChange: (fam: PdfStandardFontFamily) => void;
}) => (
  <GenericSelect
    {...props}
    options={STANDARD_FONT_FAMILIES}
    getOptionKey={(f) => f}
    triggerClass="px-2 py-1 text-sm"
    renderValue={(v) => <span>{standardFontFamilyLabel(v)}</span>}
    renderOption={(f) => <div class="px-2 py-1">{standardFontFamilyLabel(f)}</div>}
  />
);

// —— Rotation input ─────────────────────────────────────────────────

/**
 * Compact rotation control with a numeric input and -90°/+90° quick-rotate buttons.
 * Values wrap around (e.g. 350 + 90 = 80, 10 - 90 = 280).
 */
export const RotationInput = ({
  value,
  onChange,
}: {
  value: number;
  onChange: (degrees: number) => void;
}) => {
  const norm = ((value % 360) + 360) % 360;

  const rotate = (delta: number) => {
    onChange((((norm + delta) % 360) + 360) % 360);
  };

  return (
    <div class="flex items-center gap-1">
      {/* Rotate counter-clockwise (-90°) */}
      <button
        type="button"
        title="-90°"
        class="border-border-default bg-bg-input text-fg-primary hover:bg-interactive-hover flex h-8 w-8 shrink-0 items-center justify-center rounded border"
        onClick={() => rotate(-90)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M1 4v6h6" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>

      {/* Numeric input */}
      <div class="relative flex-1">
        <input
          type="number"
          min="0"
          max="359"
          class="border-border-default bg-bg-input text-fg-primary h-8 w-full rounded border px-2 pr-6 text-center text-sm"
          value={norm}
          onInput={(e) => {
            const val = parseInt((e.target as HTMLInputElement).value, 10);
            if (Number.isFinite(val)) {
              onChange(((val % 360) + 360) % 360);
            }
          }}
        />
        <span class="text-fg-muted pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs">
          {'\u00B0'}
        </span>
      </div>

      {/* Rotate clockwise (+90°) */}
      <button
        type="button"
        title="+90°"
        class="border-border-default bg-bg-input text-fg-primary hover:bg-interactive-hover flex h-8 w-8 shrink-0 items-center justify-center rounded border"
        onClick={() => rotate(90)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M23 4v6h-6" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>
  );
};

// —— Font-size combo-box ────────────────────────────────────────────
export const FontSizeInputSelect = ({
  value,
  onChange,
  options = [8, 9, 10, 11, 12, 14, 16, 18, 24, 36, 48, 72],
}: {
  value: number;
  onChange: (size: number) => void;
  options?: readonly number[];
}) => {
  const { open, setOpen, rootRef, selectedItemRef } = useDropdown();

  const handleInput = (e: Event) => {
    const n = parseInt((e.target as HTMLInputElement).value, 10);
    if (Number.isFinite(n) && n > 0) onChange(n);
  };

  return (
    <div ref={rootRef} class="relative w-full">
      <input
        type="number"
        min="1"
        class="border-border-default bg-bg-input w-full rounded border px-2 py-1 pr-7 text-sm"
        value={value}
        onInput={handleInput}
        onClick={() => setOpen(true)} // Open on click as well
      />
      {/* Arrow toggle */}
      <button
        type="button"
        class="absolute inset-y-0 right-1 flex items-center"
        onClick={() => setOpen((o) => !o)}
        tabIndex={-1}
      >
        <svg class="text-fg-secondary h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div class="border-border-default bg-bg-elevated absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border shadow-lg">
          {options.map((sz) => {
            const isSelected = sz === value;
            return (
              <button
                // @ts-ignore
                ref={isSelected ? selectedItemRef : null}
                key={sz}
                class={`hover:bg-interactive-hover block w-full px-2 py-1 text-left text-sm ${
                  isSelected ? 'bg-interactive-hover' : ''
                }`}
                onClick={() => {
                  onChange(sz);
                  setOpen(false);
                }}
              >
                {sz}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
