/**
 * The annotation style panel. The plugin owns the schema and the state; this
 * file owns only how each PropSpec renders and the flat patch it writes back.
 * There is no per-subtype branching here: a new annotation kind that declares
 * its `PropSpec[]` in the kind table gets a working style panel for free.
 *
 * Data flow (mirrors examples/react's AnnotationSidebar):
 *   selection present → useSelectionProps() specs/values, write updateSelection()
 *   nothing selected  → propsForTool(tool) specs + useAnnotationDefaults(tool)
 *                        values, write setDefaults(tool, …)
 *
 * The look: a six-column swatch grid, range slider, SVG stroke / line-ending
 * dropdowns, font-size combo and align toggles, styled with this app's
 * semantic tokens (bg-surface / text-fg / border-border …).
 */
import { useEffect, useRef, useState } from 'react';
import { annotationKey } from '@embedpdf/react/annotation';
import type { ReactNode } from 'react';
import {
  useAnnotation,
  useSelectionProps,
  useAnnotationDefaults,
  useAnnotationSelected,
  type PropKey,
  type PropSpec,
  type AnnotationPropsPatch,
  type Border,
  type BlendMode,
  type LineEnding,
  type LineEndings,
  type TextAlign,
} from '@embedpdf/react/annotation';
import { useTool } from '@embedpdf/react/interaction';
import { useOptionalCapability } from '@embedpdf/react/runtime';
import { RedactionToken } from '@embedpdf/react/redaction';
import { useT } from '@embedpdf/react/i18n';
import { Icon } from './icons';
import { useAnnotationFonts } from './annotation-fonts';
import { AnnotationFlagsSection } from './annotation-flags';

// ── app-level vocabulary (a viewer's decision) ────────────────────────────────
// The engine schema says which controls to show; these lists say what the app
// offers inside a color / font / stroke picker.
const PRESET_COLORS = [
  '#000000',
  '#5f6368',
  '#e44234',
  '#ff8b00',
  '#ffd500',
  '#00cc66',
  '#00b8d9',
  '#4a90e2',
  '#9b51e0',
  '#f272c8',
  '#a0522d',
  '#ffffff',
];

const FONT_OPTIONS: { v: string; label: string }[] = [
  { v: 'helvetica', label: 'Helvetica' },
  { v: 'helvetica-bold', label: 'Helvetica Bold' },
  { v: 'times-roman', label: 'Times Roman' },
  { v: 'courier', label: 'Courier' },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 36, 48, 72];

const BORDER_OPTS: { key: string; make: () => Border }[] = [
  { key: 'solid', make: () => ({ kind: 'solid' }) },
  { key: 'dashed-6-2', make: () => ({ kind: 'dashed', dash: [6, 2] }) },
  { key: 'dashed-3-3', make: () => ({ kind: 'dashed', dash: [3, 3] }) },
  { key: 'dashed-1-2', make: () => ({ kind: 'dashed', dash: [1, 2] }) },
  { key: 'cloudy-1', make: () => ({ kind: 'cloudy', intensity: 1 }) },
  { key: 'cloudy-2', make: () => ({ kind: 'cloudy', intensity: 2 }) },
];
const borderKey = (border: Border): string =>
  border.kind === 'cloudy'
    ? `cloudy-${border.intensity >= 2 ? 2 : 1}`
    : border.kind === 'dashed'
      ? `dashed-${border.dash.join('-')}`
      : 'solid';

const LINE_ENDINGS: { v: LineEnding; label: string }[] = [
  { v: 'none', label: 'None' },
  { v: 'open-arrow', label: 'Open arrow' },
  { v: 'closed-arrow', label: 'Closed arrow' },
  { v: 'r-open-arrow', label: 'Reverse open' },
  { v: 'r-closed-arrow', label: 'Reverse closed' },
  { v: 'circle', label: 'Circle' },
  { v: 'square', label: 'Square' },
  { v: 'diamond', label: 'Diamond' },
  { v: 'butt', label: 'Butt' },
  { v: 'slash', label: 'Slash' },
];

const BLEND_MODES: { v: BlendMode; label: string }[] = [
  { v: 'normal', label: 'Normal' },
  { v: 'multiply', label: 'Multiply' },
  { v: 'screen', label: 'Screen' },
  { v: 'overlay', label: 'Overlay' },
  { v: 'darken', label: 'Darken' },
  { v: 'lighten', label: 'Lighten' },
  { v: 'color-dodge', label: 'Color Dodge' },
  { v: 'color-burn', label: 'Color Burn' },
  { v: 'hard-light', label: 'Hard Light' },
  { v: 'soft-light', label: 'Soft Light' },
  { v: 'difference', label: 'Difference' },
  { v: 'exclusion', label: 'Exclusion' },
  { v: 'hue', label: 'Hue' },
  { v: 'saturation', label: 'Saturation' },
  { v: 'color', label: 'Color' },
  { v: 'luminosity', label: 'Luminosity' },
];

// ── layout primitives ────────────────────────────────────────────────────────
function Field({
  label,
  mixed,
  children,
}: {
  label: string;
  mixed?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="mb-5">
      <label className="text-fg mb-2 block text-sm font-medium">
        {label}
        {mixed && <span className="text-fg-muted ml-1.5 text-xs font-normal">(mixed)</span>}
      </label>
      {children}
    </section>
  );
}

// ── color swatch grid ────────────────────────────────────────────────────────
const isTransparent = (color: string | null) =>
  color == null ||
  color === 'transparent' ||
  (/^#([0-9a-f]{8})$/i.test(color) && color.slice(-2).toLowerCase() === '00');

function Swatch({
  color,
  active,
  onSelect,
}: {
  color: string;
  active: boolean;
  onSelect: (color: string) => void;
}) {
  const style = isTransparent(color)
    ? {
        backgroundColor: '#fff',
        backgroundImage:
          'linear-gradient(45deg, transparent 40%, #ef4444 40%, #ef4444 60%, transparent 60%)',
        backgroundSize: '100% 100%',
      }
    : { backgroundColor: color };
  return (
    <button
      type="button"
      title={color}
      onClick={() => onSelect(color)}
      className={`border-border-strong h-5 w-5 rounded-full border ${active ? 'outline-accent outline outline-2 outline-offset-2' : ''}`}
      style={style}
    />
  );
}

function SwatchGrid({
  value,
  onSelect,
  allowTransparent,
}: {
  value: string | null | undefined;
  onSelect: (color: string) => void;
  allowTransparent?: boolean;
}) {
  const active = (color: string) => color.toLowerCase() === (value ?? '').toLowerCase();
  return (
    <div className="grid grid-cols-6 gap-x-1 gap-y-3">
      {PRESET_COLORS.map((color) => (
        <Swatch key={color} color={color} active={active(color)} onSelect={onSelect} />
      ))}
      {allowTransparent && (
        <Swatch color="transparent" active={isTransparent(value ?? null)} onSelect={onSelect} />
      )}
    </div>
  );
}

// ── range slider ─────────────────────────────────────────────────────────────
function RangeSlider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      className="accent-accent mb-1.5 h-1 w-full cursor-pointer"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(parseFloat(event.target.value))}
    />
  );
}

// ── dropdown shell (open state, outside-click, trigger + panel) ───────────────
function useOutsideClose(open: boolean, close: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      // composedPath, not contains(event.target): at the document level an event
      // from inside the viewer's shadow root retargets to the host element, so
      // contains() reads every inside click as outside and unmounts the panel
      // on mousedown — before the option's click can fire.
      if (rootRef.current && !event.composedPath().includes(rootRef.current)) close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);
  return rootRef;
}

function DropdownShell({
  trigger,
  children,
}: {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="border-border bg-surface text-fg flex w-full items-center justify-between gap-2 rounded border px-3 py-1.5"
      >
        {trigger}
        <Icon name="chevronDown" size={16} className="text-fg-secondary shrink-0" />
      </button>
      {open && (
        <div className="border-border bg-elevated absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border p-1 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function OptionRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`hover:bg-hover flex w-full items-center rounded px-2 py-1.5 text-left text-sm ${selected ? 'bg-selected text-accent' : 'text-fg'}`}
    >
      {children}
    </button>
  );
}

// ── stroke / border preview + picker ─────────────────────────────────────────
function borderSvg(border: Border): ReactNode {
  if (border.kind === 'cloudy') {
    const radius = border.intensity >= 2 ? 5 : 3;
    const bumps = Math.ceil(80 / (radius * 2));
    const step = 80 / bumps;
    const baseline = radius + 1;
    const viewH = radius * 2 + 2;
    const parts = [`M 0 ${baseline}`];
    for (let i = 0; i < bumps; i++)
      parts.push(`A ${radius} ${radius} 0 0 1 ${step * (i + 1)} ${baseline}`);
    return (
      <svg width="80" height={viewH} viewBox={`0 0 80 ${viewH}`}>
        <path
          d={parts.join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  const dash = border.kind === 'dashed' ? border.dash.join(' ') : undefined;
  return (
    <svg width="80" height="8" viewBox="0 0 80 8">
      <line
        x1="0"
        y1="4"
        x2="80"
        y2="4"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={dash}
      />
    </svg>
  );
}

function BorderSelect({
  value,
  cloudy,
  onChange,
}: {
  value: Border;
  cloudy: boolean;
  onChange: (border: Border) => void;
}) {
  const options = cloudy
    ? BORDER_OPTS
    : BORDER_OPTS.filter((option) => !option.key.startsWith('cloudy'));
  return (
    <DropdownShell trigger={<span className="text-fg-secondary">{borderSvg(value)}</span>}>
      {(close) =>
        options.map((option) => {
          const border = option.make();
          return (
            <OptionRow
              key={option.key}
              selected={borderKey(value) === option.key}
              onClick={() => {
                onChange(border);
                close();
              }}
            >
              <span className="text-fg-secondary">{borderSvg(border)}</span>
            </OptionRow>
          );
        })
      }
    </DropdownShell>
  );
}

// ── line-ending preview + picker ─────────────────────────────────────────────
const LE_MARKERS: Partial<Record<LineEnding, ReactNode>> = {
  square: <path d="M68 -4 L76 -4 L76 4 L68 4 Z" />,
  circle: <circle cx="72" cy="0" r="4" />,
  diamond: <path d="M72 -5 L77 0 L72 5 L67 0 Z" />,
  'open-arrow': <path d="M67 -5 L77 0 L67 5" fill="none" />,
  'closed-arrow': <path d="M67 -5 L77 0 L67 5 Z" />,
  'r-open-arrow': <path d="M77 -5 L67 0 L77 5" fill="none" />,
  'r-closed-arrow': <path d="M77 -5 L67 0 L77 5 Z" />,
  butt: <path d="M72 -5 L72 5" fill="none" />,
  slash: <path d="M67 -5 L77 5" fill="none" />,
};
const LE_LINE_END: Partial<Record<LineEnding, number>> = {
  square: 68,
  circle: 68,
  diamond: 67,
  'open-arrow': 76,
  'closed-arrow': 67,
  'r-open-arrow': 67,
  'r-closed-arrow': 67,
  butt: 72,
  slash: 72,
};

function LineEndingPreview({ name, side }: { name: LineEnding; side: 'start' | 'end' }) {
  const marker = LE_MARKERS[name];
  const lineEndX = LE_LINE_END[name] ?? 77;
  const transform = side === 'start' ? 'rotate(180 40 10)' : undefined;
  return (
    <svg width="80" height="20" viewBox="0 0 80 20" className="text-fg">
      <g transform={transform}>
        <line x1="4" y1="10" x2={lineEndX} y2="10" stroke="currentColor" strokeWidth="1.5" />
        {marker && (
          <g
            transform="translate(0, 10)"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            {marker}
          </g>
        )}
      </g>
    </svg>
  );
}

function LineEndingSelect({
  side,
  value,
  onChange,
}: {
  side: 'start' | 'end';
  value: LineEnding;
  onChange: (ending: LineEnding) => void;
}) {
  return (
    <DropdownShell trigger={<LineEndingPreview name={value} side={side} />}>
      {(close) =>
        LINE_ENDINGS.map((option) => (
          <OptionRow
            key={option.v}
            selected={value === option.v}
            onClick={() => {
              onChange(option.v);
              close();
            }}
          >
            <LineEndingPreview name={option.v} side={side} />
          </OptionRow>
        ))
      }
    </DropdownShell>
  );
}

// ── font family picker ───────────────────────────────────────────────────────
function FontFamilySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (family: string) => void;
}) {
  // The standard faces plus the configured fonts that are registered and
  // mounted (`annotations.fonts`) — a registered key is a `fontFamily` value
  // like any standard name.
  const configured = useAnnotationFonts();
  const options = [
    ...FONT_OPTIONS,
    ...configured.map((font) => ({ v: font.key, label: font.label })),
  ];
  const current = options.find((option) => option.v === value);
  return (
    <DropdownShell trigger={<span className="text-fg text-sm">{current?.label ?? value}</span>}>
      {(close) =>
        options.map((option) => (
          <OptionRow
            key={option.v}
            selected={option.v === value}
            onClick={() => {
              onChange(option.v);
              close();
            }}
          >
            {option.label}
          </OptionRow>
        ))
      }
    </DropdownShell>
  );
}

// ── font-size combo (number input + preset dropdown) ─────────────────────────
function FontSizeCombo({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useOutsideClose(open, () => setOpen(false));
  // Typed text is a draft until Enter or blur (Escape discards): committing
  // per keystroke would apply "2" on the way to "24" — to the selected text
  // while editing. Presets commit at once.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const size = parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(size) && size > 0 && size !== value) onChange(size);
  };
  return (
    <div ref={rootRef} className="relative w-full">
      <input
        type="number"
        min={1}
        value={draft ?? value}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            setOpen(false);
          } else if (event.key === 'Escape') {
            setDraft(null);
            setOpen(false);
          }
        }}
        onClick={() => setOpen(true)}
        className="border-border bg-surface text-fg w-full rounded border px-2 py-1.5 pr-7 text-sm"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setOpen((previous) => !previous)}
        className="absolute inset-y-0 right-1 flex items-center"
      >
        <Icon name="chevronDown" size={16} className="text-fg-secondary" />
      </button>
      {open && (
        <div className="border-border bg-elevated absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border p-1 shadow-lg">
          {FONT_SIZES.map((sz) => (
            <OptionRow
              key={sz}
              selected={sz === value}
              onClick={() => {
                setDraft(null);
                onChange(sz);
                setOpen(false);
              }}
            >
              {sz}
            </OptionRow>
          ))}
        </div>
      )}
    </div>
  );
}

function BlendModeSelect({
  value,
  onChange,
}: {
  value: BlendMode;
  onChange: (mode: BlendMode) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as BlendMode)}
      className="border-border bg-surface text-fg w-full rounded border px-3 py-1.5 text-sm"
    >
      {BLEND_MODES.map((mode) => (
        <option key={mode.v} value={mode.v}>
          {mode.label}
        </option>
      ))}
    </select>
  );
}

// ── align toggle ─────────────────────────────────────────────────────────────
function Toggle({
  active,
  title,
  onClick,
  keepFocus,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  /** Don't take focus on press — a text editor's selection survives the click. */
  keepFocus?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
      className={`flex h-9 w-9 items-center justify-center rounded border transition-colors ${
        active
          ? 'border-accent bg-accent text-on-accent'
          : 'border-border bg-surface text-fg hover:bg-hover'
      }`}
    >
      {children}
    </button>
  );
}

// ── rich-text formatting: bold / italic / underline in one row ──────────────
type FormatSpec = Extract<PropSpec, { key: 'bold' | 'italic' | 'underline' }>;
const isFormatSpec = (spec: PropSpec): spec is FormatSpec =>
  spec.key === 'bold' || spec.key === 'italic' || spec.key === 'underline';

/**
 * The format toggles a free-text kind declares, in one row. While the text
 * editor holds a range they read and write that range's runs (the plugin
 * routes `updateSelection`); otherwise the annotation's body. The buttons
 * keep focus in the editor so the range survives the click.
 */
function FormatToggles({
  specs,
  values,
  mixed,
  onChange,
}: {
  specs: FormatSpec[];
  values: Partial<Record<PropKey, unknown>>;
  mixed: PropKey[];
  onChange: (patch: AnnotationPropsPatch) => void;
}) {
  const t = useT();
  return (
    <Field
      label={t('demo.formatLabel', { fallback: 'Format' })}
      mixed={specs.some((spec) => mixed.includes(spec.key))}
    >
      <div className="flex gap-2">
        {specs.map((spec) => {
          const active = values[spec.key] === true && !mixed.includes(spec.key);
          return (
            <Toggle
              key={spec.key}
              title={spec.label}
              active={active}
              keepFocus
              onClick={() => onChange({ [spec.key]: !active } as AnnotationPropsPatch)}
            >
              <Icon name={spec.key} size={18} />
            </Toggle>
          );
        })}
      </div>
    </Field>
  );
}

// ── one control per PropSpec — the entire surface an app customizes ──────────
function PropControl({
  spec,
  value,
  mixed,
  onChange,
}: {
  spec: PropSpec;
  value: unknown;
  mixed: boolean;
  onChange: (patch: AnnotationPropsPatch) => void;
}) {
  switch (spec.key) {
    case 'color':
    case 'fontColor':
      return (
        <Field label={spec.label} mixed={mixed}>
          <SwatchGrid
            value={value as string}
            onSelect={(color) => onChange({ [spec.key]: color } as AnnotationPropsPatch)}
          />
        </Field>
      );
    case 'interiorColor':
      return (
        <Field label={spec.label} mixed={mixed}>
          <SwatchGrid
            value={value as string | null}
            allowTransparent
            onSelect={(color) =>
              onChange({ interiorColor: color === 'transparent' ? null : color })
            }
          />
        </Field>
      );
    case 'opacity': {
      const opacity = (value as number) ?? 1;
      return (
        <Field label={spec.label} mixed={mixed}>
          <RangeSlider
            value={opacity}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            onChange={(next) => onChange({ opacity: next })}
          />
          <span className="text-fg-muted text-xs">{Math.round(opacity * 100)}%</span>
        </Field>
      );
    }
    case 'strokeWidth': {
      const strokeWidth = (value as number) ?? spec.min;
      return (
        <Field label={spec.label} mixed={mixed}>
          <RangeSlider
            value={strokeWidth}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            onChange={(next) => onChange({ strokeWidth: next })}
          />
          <span className="text-fg-muted text-xs">{strokeWidth}px</span>
        </Field>
      );
    }
    case 'fontSize':
      return (
        <Field label={spec.label} mixed={mixed}>
          <FontSizeCombo
            value={(value as number) ?? 12}
            onChange={(next) => onChange({ fontSize: next })}
          />
        </Field>
      );
    case 'border':
      return (
        <Field label={spec.label} mixed={mixed}>
          <BorderSelect
            value={(value as Border) ?? { kind: 'solid' }}
            cloudy={spec.cloudy}
            onChange={(border) => onChange({ border })}
          />
        </Field>
      );
    case 'lineEndings': {
      const le = (value as LineEndings) ?? { start: 'none', end: 'none' };
      return (
        <Field label={spec.label} mixed={mixed}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-fg-muted mb-1.5 text-xs">Start</div>
              <LineEndingSelect
                side="start"
                value={le.start}
                onChange={(ending) => onChange({ lineEndings: { start: ending } })}
              />
            </div>
            <div>
              <div className="text-fg-muted mb-1.5 text-xs">End</div>
              <LineEndingSelect
                side="end"
                value={le.end}
                onChange={(ending) => onChange({ lineEndings: { end: ending } })}
              />
            </div>
          </div>
        </Field>
      );
    }
    case 'fontFamily':
      return (
        <Field label={spec.label} mixed={mixed}>
          <FontFamilySelect
            value={(value as string) ?? 'helvetica'}
            onChange={(family) => onChange({ fontFamily: family })}
          />
        </Field>
      );
    case 'textAlign': {
      const alignIcon: Record<TextAlign, string> = {
        left: 'alignLeft',
        center: 'alignCenter',
        right: 'alignRight',
      };
      return (
        <Field label={spec.label} mixed={mixed}>
          <div className="flex gap-2">
            {(['left', 'center', 'right'] as TextAlign[]).map((al) => (
              <Toggle
                key={al}
                title={`Align ${al}`}
                active={value === al}
                onClick={() => onChange({ textAlign: al })}
              >
                <Icon name={alignIcon[al]} size={18} />
              </Toggle>
            ))}
          </div>
        </Field>
      );
    }
    // The rich-text format toggles render as one row (see `FormatToggles`);
    // each spec is still declared by the kind, so a kind without rich text
    // never shows them.
    case 'bold':
    case 'italic':
    case 'underline':
      return null;
    case 'blendMode':
      return (
        <Field label={spec.label} mixed={mixed}>
          <BlendModeSelect
            value={(value as BlendMode) ?? 'normal'}
            onChange={(blendMode) => onChange({ blendMode })}
          />
        </Field>
      );
    // `link` deliberately renders nothing here: a link is a verb on the
    // selection, edited in the anchored popover (see ui/link-editor.tsx) —
    // never a style-panel section.
    case 'link':
      return null;
    default:
      return null;
  }
}

// ── the panel ────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="text-fg-muted flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <Icon name="palette" size={40} className="text-fg-disabled" />
      <p className="max-w-[180px] text-sm">
        Pick a draw tool or select an annotation to edit its style.
      </p>
    </div>
  );
}

/**
 * The schema-driven style panel. Rendered inside the right sidebar's
 * `annotation-style` surface (see ui/panels.tsx). Owns its own scroll.
 */
export function AnnotationStylePanel() {
  const annotation = useAnnotation();
  const { activeToolId } = useTool();
  const selection = useSelectionProps();
  const defaults = useAnnotationDefaults(activeToolId);
  const selected = useAnnotationSelected();

  const hasSel = selection.specs.length > 0;
  const specs = hasSel ? selection.specs : annotation.listPropSpecs(activeToolId);
  const values = hasSel ? selection.values : defaults;
  const write = (patch: AnnotationPropsPatch) =>
    hasSel ? annotation.updateSelection(patch) : annotation.setToolDefaults(activeToolId, patch);

  // A selection with no editable props (e.g. a stamp, or a locked annotation —
  // its style is frozen) still shows its flags: that's how you unlock it.
  if (specs.length === 0 && selected.length === 0) return <EmptyState />;

  const context = hasSel ? `${selected.length} selected` : `${activeToolId} defaults`;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="text-fg-muted mb-4 text-[11px] font-semibold uppercase tracking-wide">
        {context}
      </p>
      {specs.map((spec) =>
        spec.key === 'bold' ? (
          <FormatToggles
            key="format"
            specs={specs.filter((spec): spec is FormatSpec => isFormatSpec(spec))}
            values={values}
            mixed={hasSel ? selection.mixed : []}
            onChange={write}
          />
        ) : (
          <PropControl
            key={spec.key}
            spec={spec}
            value={values[spec.key]}
            mixed={hasSel && selection.mixed.includes(spec.key)}
            onChange={write}
          />
        ),
      )}
      {/* Redaction label (`/OverlayText` + `/Repeat`) — kind content, not a
          style prop, so it writes through the redaction plugin's updateLabel. */}
      <RedactionLabelSection />
      {/* `/F` flags for whatever is selected — the live flags test surface. */}
      <AnnotationFlagsSection />
    </div>
  );
}

/**
 * Label editor shown when exactly one redaction mark is selected. The text is
 * what the destructive apply paints over the region (white-on-black by the
 * tool defaults); `repeat` tiles it. Writes ride the annotation update verb
 * via the redaction plugin, which preserves the label's `/DA` styling.
 */
function RedactionLabelSection() {
  const t = useT();
  const redaction = useOptionalCapability(RedactionToken);
  const selected = useAnnotationSelected();
  const mark = selected.length === 1 && selected[0]!.subtype === 'redact' ? selected[0]! : null;
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [mark?.ref && annotationKey(mark.ref)]);
  if (!redaction || !mark || mark.subtype !== 'redact') return null;

  const value = draft ?? (mark.raw?.subtype === 'redact' ? mark.raw.overlayText : null) ?? '';
  const commit = () => {
    if (draft === null) return;
    void redaction.updateLabel(mark.ref, { overlayText: draft.length > 0 ? draft : null });
    setDraft(null);
  };

  return (
    <div className="border-border-subtle mt-4 border-t pt-4">
      <p className="text-fg-muted mb-2 text-[11px] font-semibold uppercase tracking-wide">
        {t('demo.redactLabelTitle')}
      </p>
      <input
        type="text"
        value={value}
        placeholder={t('demo.redactLabelPlaceholder')}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === 'Enter' && commit()}
        className="border-border bg-surface text-fg w-full rounded-md border px-2 py-1.5 text-sm"
      />
      <label className="text-fg mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mark.raw?.subtype === 'redact' ? mark.raw.repeat : false}
          onChange={(event) =>
            void redaction.updateLabel(mark.ref, { repeat: event.target.checked })
          }
        />
        {t('demo.redactLabelRepeat')}
      </label>
    </div>
  );
}
