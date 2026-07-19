/**
 * The annotation style panel — the v2 snippet's style sidebar, rebuilt the v3
 * way. The plugin owns the schema AND the state; this file owns only how each
 * PropSpec renders and the flat patch it writes back. There is NO per-subtype
 * branching here: a new annotation kind that declares its `PropSpec[]` in the
 * kind table gets a working style panel for free.
 *
 * Data flow (mirrors v3/examples/react's AnnotationSidebar):
 *   selection present → useSelectionProps() specs/values, write updateSelection()
 *   nothing selected  → propsForTool(tool) specs + useAnnotationDefaults(tool)
 *                        values, write setDefaults(tool, …)
 *
 * The look is ported 1:1 from viewers/snippet's annotation-sidebar (six-column
 * swatch grid, range slider, SVG stroke / line-ending dropdowns, font-size
 * combo, align toggles), retinted from v2's `bg-bg-input`/`text-fg-primary`
 * tokens to this app's semantic ones (bg-surface / text-fg / border-border …).
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  useAnnotation,
  useSelectionProps,
  useAnnotationDefaults,
  useAnnotationSelected,
  type PropSpec,
  type AnnotationPropsPatch,
  type Border,
  type BlendMode,
  type LineEnding,
  type LineEndings,
  type TextAlign,
} from '@embedpdf-x/react/annotation';
import { useTool } from '@embedpdf-x/react/interaction';
import { useKernel, useOptionalCapability } from '@embedpdf-x/react/runtime';
import { RedactionToken } from '@embedpdf-x/react/redaction';
import { LinkToken, type PdfLinkTarget } from '@embedpdf-x/react/link';
import { useT } from '@embedpdf-x/react/i18n';
import { Icon } from './icons';
import { AnnotationFlagsSection } from './annotation-flags';

// ── app-level vocabulary (a viewer's decision, like v2's color presets) ──────
// The engine schema says WHICH controls to show; these lists say what the app
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
const borderKey = (b: Border): string =>
  b.kind === 'cloudy'
    ? `cloudy-${b.intensity >= 2 ? 2 : 1}`
    : b.kind === 'dashed'
      ? `dashed-${b.dash.join('-')}`
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
const isTransparent = (c: string | null) =>
  c == null ||
  c === 'transparent' ||
  (/^#([0-9a-f]{8})$/i.test(c) && c.slice(-2).toLowerCase() === '00');

function Swatch({
  color,
  active,
  onSelect,
}: {
  color: string;
  active: boolean;
  onSelect: (c: string) => void;
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
  onSelect: (c: string) => void;
  allowTransparent?: boolean;
}) {
  const active = (c: string) => c.toLowerCase() === (value ?? '').toLowerCase();
  return (
    <div className="grid grid-cols-6 gap-x-1 gap-y-3">
      {PRESET_COLORS.map((c) => (
        <Swatch key={c} color={c} active={active(c)} onSelect={onSelect} />
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
  onChange: (n: number) => void;
}) {
  return (
    <input
      type="range"
      className="accent-accent mb-1.5 h-1 w-full cursor-pointer"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  );
}

// ── dropdown shell (open state, outside-click, trigger + panel) ───────────────
function useOutsideClose(open: boolean, close: () => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
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
        onClick={() => setOpen((o) => !o)}
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
function borderSvg(b: Border): ReactNode {
  if (b.kind === 'cloudy') {
    const r = b.intensity >= 2 ? 5 : 3;
    const n = Math.ceil(80 / (r * 2));
    const step = 80 / n;
    const baseline = r + 1;
    const viewH = r * 2 + 2;
    const parts = [`M 0 ${baseline}`];
    for (let i = 0; i < n; i++) parts.push(`A ${r} ${r} 0 0 1 ${step * (i + 1)} ${baseline}`);
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
  const dash = b.kind === 'dashed' ? b.dash.join(' ') : undefined;
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
  onChange: (b: Border) => void;
}) {
  const opts = cloudy ? BORDER_OPTS : BORDER_OPTS.filter((o) => !o.key.startsWith('cloudy'));
  return (
    <DropdownShell trigger={<span className="text-fg-secondary">{borderSvg(value)}</span>}>
      {(close) =>
        opts.map((o) => {
          const b = o.make();
          return (
            <OptionRow
              key={o.key}
              selected={borderKey(value) === o.key}
              onClick={() => {
                onChange(b);
                close();
              }}
            >
              <span className="text-fg-secondary">{borderSvg(b)}</span>
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
  onChange: (v: LineEnding) => void;
}) {
  return (
    <DropdownShell trigger={<LineEndingPreview name={value} side={side} />}>
      {(close) =>
        LINE_ENDINGS.map((o) => (
          <OptionRow
            key={o.v}
            selected={value === o.v}
            onClick={() => {
              onChange(o.v);
              close();
            }}
          >
            <LineEndingPreview name={o.v} side={side} />
          </OptionRow>
        ))
      }
    </DropdownShell>
  );
}

// ── font family picker ───────────────────────────────────────────────────────
function FontFamilySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = FONT_OPTIONS.find((o) => o.v === value);
  return (
    <DropdownShell trigger={<span className="text-fg text-sm">{current?.label ?? value}</span>}>
      {(close) =>
        FONT_OPTIONS.map((o) => (
          <OptionRow
            key={o.v}
            selected={o.v === value}
            onClick={() => {
              onChange(o.v);
              close();
            }}
          >
            {o.label}
          </OptionRow>
        ))
      }
    </DropdownShell>
  );
}

// ── font-size combo (number input + preset dropdown) ─────────────────────────
function FontSizeCombo({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={rootRef} className="relative w-full">
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n) && n > 0) onChange(n);
        }}
        onClick={() => setOpen(true)}
        className="border-border bg-surface text-fg w-full rounded border px-2 py-1.5 pr-7 text-sm"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setOpen((o) => !o)}
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
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
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

/**
 * The link-target editor — v2's "Link / Go to link / Remove link" menu items,
 * rebuilt on the schema: any kind whose table declares the `link` spec gets
 * this control, and every write is the ONE `updateSelection({ link })` path
 * (the plugin materializes/retargets/deletes the attached children).
 */
function LinkTargetControl({
  label,
  value,
  mixed,
  onChange,
}: {
  label: string;
  value: PdfLinkTarget | null;
  mixed: boolean;
  onChange: (patch: AnnotationPropsPatch) => void;
}) {
  const kernel = useKernel();
  const link = useOptionalCapability(LinkToken);
  const [mode, setMode] = useState<'uri' | 'page'>(value?.kind === 'goto' ? 'page' : 'uri');
  const [uri, setUri] = useState(value?.kind === 'uri' ? value.uri : '');
  const [pageNo, setPageNo] = useState('1');

  // Adopt the selection's current target whenever it changes under us.
  useEffect(() => {
    setMode(value?.kind === 'goto' ? 'page' : 'uri');
    if (value?.kind === 'uri') setUri(value.uri);
  }, [value]);

  const apply = () => {
    if (mode === 'uri') {
      const trimmed = uri.trim();
      if (trimmed) onChange({ link: { kind: 'uri', uri: trimmed } });
      return;
    }
    // Page number (1-based) → the page's OBJECT NUMBER (stable across moves).
    const activeId = kernel.documents.activeId();
    const meta = activeId ? kernel.getState().core.documents[activeId] : null;
    const layout = meta?.pages[Math.max(0, Number(pageNo) - 1)];
    if (layout) {
      onChange({
        link: {
          kind: 'goto',
          destination: { kind: 'fit', pageObjectNumber: layout.pageObjectNumber },
        },
      });
    }
  };

  const inputCls = 'border-border bg-surface text-fg w-full rounded border px-3 py-1.5 text-sm';
  return (
    <Field label={label} mixed={mixed}>
      {value != null && (
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            className="border-border bg-surface text-fg flex-1 rounded border px-2 py-1.5 text-sm"
            onClick={() => link?.activate(value)}
          >
            Go to link
          </button>
          <button
            type="button"
            className="border-border bg-surface text-fg flex-1 rounded border px-2 py-1.5 text-sm"
            onClick={() => onChange({ link: null })}
          >
            Remove link
          </button>
        </div>
      )}
      <div className="mb-2 flex gap-2">
        <Toggle title="Link to a URL" active={mode === 'uri'} onClick={() => setMode('uri')}>
          URL
        </Toggle>
        <Toggle title="Link to a page" active={mode === 'page'} onClick={() => setMode('page')}>
          Page
        </Toggle>
      </div>
      {mode === 'uri' ? (
        <input
          type="url"
          className={inputCls}
          placeholder="https://…"
          value={uri}
          onChange={(e) => setUri(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
      ) : (
        <input
          type="number"
          min={1}
          className={inputCls}
          placeholder="Page number"
          value={pageNo}
          onChange={(e) => setPageNo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
      )}
      <button
        type="button"
        className="border-border bg-surface text-fg mt-2 w-full rounded border px-2 py-1.5 text-sm font-medium"
        onClick={apply}
      >
        {value == null ? 'Add link' : 'Update link'}
      </button>
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
            onSelect={(c) => onChange({ [spec.key]: c } as AnnotationPropsPatch)}
          />
        </Field>
      );
    case 'interiorColor':
      return (
        <Field label={spec.label} mixed={mixed}>
          <SwatchGrid
            value={value as string | null}
            allowTransparent
            onSelect={(c) => onChange({ interiorColor: c === 'transparent' ? null : c })}
          />
        </Field>
      );
    case 'opacity': {
      const v = (value as number) ?? 1;
      return (
        <Field label={spec.label} mixed={mixed}>
          <RangeSlider
            value={v}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            onChange={(n) => onChange({ opacity: n })}
          />
          <span className="text-fg-muted text-xs">{Math.round(v * 100)}%</span>
        </Field>
      );
    }
    case 'strokeWidth': {
      const v = (value as number) ?? spec.min;
      return (
        <Field label={spec.label} mixed={mixed}>
          <RangeSlider
            value={v}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            onChange={(n) => onChange({ strokeWidth: n })}
          />
          <span className="text-fg-muted text-xs">{v}px</span>
        </Field>
      );
    }
    case 'fontSize':
      return (
        <Field label={spec.label} mixed={mixed}>
          <FontSizeCombo
            value={(value as number) ?? 12}
            onChange={(n) => onChange({ fontSize: n })}
          />
        </Field>
      );
    case 'border':
      return (
        <Field label={spec.label} mixed={mixed}>
          <BorderSelect
            value={(value as Border) ?? { kind: 'solid' }}
            cloudy={spec.cloudy}
            onChange={(b) => onChange({ border: b })}
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
                onChange={(v) => onChange({ lineEndings: { start: v } })}
              />
            </div>
            <div>
              <div className="text-fg-muted mb-1.5 text-xs">End</div>
              <LineEndingSelect
                side="end"
                value={le.end}
                onChange={(v) => onChange({ lineEndings: { end: v } })}
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
            onChange={(v) => onChange({ fontFamily: v })}
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
    case 'blendMode':
      return (
        <Field label={spec.label} mixed={mixed}>
          <BlendModeSelect
            value={(value as BlendMode) ?? 'normal'}
            onChange={(blendMode) => onChange({ blendMode })}
          />
        </Field>
      );
    case 'link':
      return (
        <LinkTargetControl
          label={spec.label}
          value={(value as PdfLinkTarget | null) ?? null}
          mixed={mixed}
          onChange={onChange}
        />
      );
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
  const sel = useSelectionProps();
  const defaults = useAnnotationDefaults(activeToolId);
  const selected = useAnnotationSelected();

  const hasSel = sel.specs.length > 0;
  const specs = hasSel ? sel.specs : annotation.propsForTool(activeToolId);
  const values = hasSel ? sel.values : defaults;
  const write = (patch: AnnotationPropsPatch) =>
    hasSel ? annotation.updateSelection(patch) : annotation.setDefaults(activeToolId, patch);

  // A selection with no editable props (e.g. a stamp, or a LOCKED annotation —
  // its style is frozen) still shows its flags: that's how you unlock it.
  if (specs.length === 0 && selected.length === 0) return <EmptyState />;

  const context = hasSel ? `${selected.length} selected` : `${activeToolId} defaults`;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="text-fg-muted mb-4 text-[11px] font-semibold uppercase tracking-wide">
        {context}
      </p>
      {specs.map((spec) => (
        <PropControl
          key={spec.key}
          spec={spec}
          value={values[spec.key]}
          mixed={hasSel && sel.mixed.includes(spec.key)}
          onChange={write}
        />
      ))}
      {/* Redaction label (`/OverlayText` + `/Repeat`) — kind content, not a
          style prop, so it writes through the redaction plugin's setLabel. */}
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
  useEffect(() => setDraft(null), [mark?.ref && refKeyOfRedact(mark.ref)]);
  if (!redaction || !mark || mark.subtype !== 'redact') return null;

  const value = draft ?? mark.overlayText ?? '';
  const commit = () => {
    if (draft === null) return;
    void redaction.setLabel(mark.ref, { overlayText: draft.length > 0 ? draft : null });
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
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="border-border bg-surface text-fg w-full rounded-md border px-2 py-1.5 text-sm"
      />
      <label className="text-fg mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mark.repeat}
          onChange={(e) => void redaction.setLabel(mark.ref, { repeat: e.target.checked })}
        />
        {t('demo.redactLabelRepeat')}
      </label>
    </div>
  );
}

/** Stable key for the effect dep — mirrors the annotation model's ref keys. */
function refKeyOfRedact(ref: { kind: string } & Record<string, unknown>): string {
  return JSON.stringify(ref);
}
