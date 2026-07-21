import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createCapabilityToken } from '@embedpdf/core';
import { stagePlugin } from '@embedpdf/plugin-stage';
import type {
  Direction,
  FlowMode,
  GridColumns,
  LayoutKind,
  SpreadMode,
  SizingMode,
  StageCapability,
  StageSettings,
} from '@embedpdf/plugin-stage';
import { interactionPlugin } from '@embedpdf/plugin-interaction';
import { selectionPlugin } from '@embedpdf/plugin-selection';
import { annotationPlugin } from '@embedpdf/plugin-annotation';
import { persistPlugin } from '@embedpdf/plugin-persist';
import { renderPlugin } from '@embedpdf/plugin-render';
import { pageEditPlugin } from '@embedpdf/plugin-page-edit';
import { metadataPlugin } from '@embedpdf/plugin-metadata';
import { formPlugin, fieldKeyOf } from '@embedpdf/plugin-form';
import type { FormFieldPatch } from '@embedpdf/plugin-form';
import { searchPlugin, validateSearchRegex, SearchToken } from '@embedpdf/plugin-search';
import { stampPlugin } from '@embedpdf/plugin-stamp';
import type { StampAsset } from '@embedpdf/plugin-stamp';
import { i18nPlugin, negotiateLocale } from '@embedpdf/plugin-i18n';
import { viewManagerPlugin } from '@embedpdf/plugin-view-manager';
import type { ViewInfo } from '@embedpdf/plugin-view-manager';
import {
  Viewer,
  Stage,
  DocumentScope,
  RenderLayer,
  SelectionLayer,
  AnnotationLayer,
  AnnotationDraftMenu,
  AnnotationMenu,
  useAnnotation,
  useAnnotationSelection,
  useAnnotationDefaults,
  useSelectionProps,
  usePage,
  useTool,
  useZoom,
  usePages,
  useLayout,
  useStageSettings,
  useDocuments,
  useViews,
  usePageEditor,
  useMetadata,
  useSelector,
  FormLayer,
  useForm,
  useFormField,
  SearchLayer,
  useSearch,
  useSearchState,
  useStamp,
  useStampAssets,
  useStampAssetPreviewUrl,
  useArmStampAsset,
  useT,
  useLocale,
} from '@embedpdf/react';
import type {
  AnnotationProps,
  AnnotationPropsPatch,
  Border,
  LineEndings,
  PropSpec,
  TextAlign,
} from '@embedpdf/react';
import type { DocumentMetadata, MetadataPatch, OpenInput, PdfSaveMode } from '@embedpdf/core';
import {
  selectedEngine,
  engineMode,
  loadInitialDocuments,
  newDocument,
  SAMPLES,
  fetchBytes,
} from './engine';
import { en } from './locales/en';

/** Shared button style for the selection menu overlay. */
const MENU_BTN: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,.18)',
  borderRadius: 6,
  color: '#e6e6e6',
  cursor: 'pointer',
  fontSize: 12,
  padding: '3px 8px',
};
const DRAFT_MENU_BTN: React.CSSProperties = {
  width: 40,
  height: 40,
  border: '1px solid rgba(255,255,255,.18)',
  borderRadius: 8,
  background: 'transparent',
  color: '#f2f4f8',
  cursor: 'pointer',
  fontSize: 20,
  lineHeight: 1,
  padding: 0,
};
// The Stage is a LENS: a document can be viewed through several at once. The
// sidebar is a second lens — wrapped grid, fixed thumbnail zoom — with its own
// camera per document, fully independent of the main view.
const ThumbsStageToken = createCapabilityToken<StageCapability>('stage-thumbs');

// Plugins are plain, pure values — engine-agnostic. The engine is chosen in
// ./engine and injected at the root; nothing here knows local vs cloud vs fake.
const plugins = [
  stagePlugin({ layout: 'vertical', interaction: true }), // main lens; drives the interaction hub (pan/select)
  stagePlugin({
    id: 'stage-thumbs',
    token: ThumbsStageToken,
    layout: 'grid',
    columns: 'auto', // WRAPPED: re-wraps as the sidebar resizes
    sizing: 'uniform', // equalize pages so the pixel target hits every thumb
    zoom: { pageWidth: 110 }, // thumbs are 110 SCREEN px wide — for ANY document
    padding: 10,
    gap: { px: 12 }, // UI-stable spacing: 12px between thumbs in EVERY document
    pageFrame: { top: 0, right: 0, bottom: 16, left: 0 }, // reserved label band (screen px)
    fitAlign: { x: 'center', y: 'start' }, // few pages? thumbs hug the TOP, not the middle
    scrollBehavior: 'instant',
  }),
  renderPlugin(), // document-scoped: renders pages through the engine handle
  pageEditPlugin(), // document-scoped: PON-addressed rotate/move/delete over the handle
  metadataPlugin(), // document-scoped: reactive Info-dict metadata (own + remote SSE edits)
  interactionPlugin({ defaultTool: 'pointer' }), // the pointer/tool/cursor hub
  selectionPlugin(), // text selection (requires the interaction hub)
  annotationPlugin(), // shapes: create/edit/delete (ambient editing + draw tools)
  // workspace plugin: stamp ASSET libraries (import a PDF → one vector stamp per
  // page). No assetEngine configured — the kernel's local engine doubles as the
  // asset engine; a cloud deployment would add one line here (see StampConfig).
  stampPlugin(),
  formPlugin(), // interactive forms: fill mode over doc.forms (fields stay engine truth)
  // document text search: budgeted engine slices, viewport-first scanning. Hit
  // navigation lands the match at the viewport's top-middle (y: 0.35 — the
  // browser find-bar feel); try y: 0.5 for dead center, y: 0.65 for bottom.
  searchPlugin({ reveal: { anchor: { y: 0.35 }, behavior: 'smooth' } }),
  // workspace plugin, engine-free: locale packs as store state. Alive from
  // createKernel() — the shell below translates while the engine still boots.
  // 'en' ships eagerly; 'es' is a lazy pack fetched on first switch. The
  // startup locale is negotiated OUTSIDE the plugin (it never touches the DOM).
  i18nPlugin({
    locale: negotiateLocale(['en', 'es'], navigator.languages) ?? 'en',
    fallbackLocale: 'en',
    locales: [en],
    loaders: { es: () => import('./locales/es').then((m) => m.es) },
  }),
  // effects-only plugin: requires Stage, mirrors per-document view-state to localStorage.
  persistPlugin({ key: 'embedpdf:v3-demo' }),
  // workspace plugin: partitions open documents into reorderable panes (each pane
  // owns its own tab strip; tabs can be dragged between panes).
  viewManagerPlugin(),
];

// "Presets" are a CUSTOMER concern, not the plugin's: they're just objects of
// settings the app keeps and applies with stage.update(...). Define as many as you like.
const PRESETS: Record<string, Partial<StageSettings>> = {
  Document: {
    flow: 'continuous',
    layout: 'vertical',
    bounded: true,
    padding: 24,
    gap: 16,
    arrivalAlign: { x: 'start', y: 'start' }, // land at the reading start, at EVERY zoom
    anchorAlign: { x: 'start', y: 'start' }, // browser-style resizes: the top stays pinned
    zoomAlign: { x: 'center', y: 'center' }, // button zoom inflates around the middle
    zoom: { mode: 'automatic' },
  },
  // Construction: every sheet in view on an infinite canvas, then zoom in to work.
  // The canvas feel is "all center": arrivals present the sheet, resizes balloon
  // symmetrically (Figma), zoom stays around the middle.
  Canvas: {
    flow: 'continuous',
    layout: 'grid',
    bounded: false,
    padding: 24,
    gap: 56, // sheets spread out on a table
    arrivalAlign: { x: 'center', y: 'center' }, // drawings: arrive centered (Drawboard feel)
    anchorAlign: { x: 'center', y: 'center' },
    zoomAlign: { x: 'center', y: 'center' },
    zoom: { mode: 'fit-all' },
  },
};

// Arrival alignment, expressed as the combos a UI actually offers. The plugin
// keeps the orthogonal per-axis primitive; naming the useful pairs is the
// app's concern. LOGICAL: 'reading start' = top-left in LTR, top-RIGHT in RTL.
const ALIGNMENTS: Record<string, StageSettings['arrivalAlign']> = {
  'reading start': { x: 'start', y: 'start' }, // where the text begins (direction-aware)
  'reading end': { x: 'end', y: 'start' }, // the far edge of the line
  center: { x: 'center', y: 'center' }, // drawings (Drawboard feel)
};

// ── drag payloads: a tab (document) or a whole pane (view) ───────────────────
type DragPayload =
  | { kind: 'doc'; documentId: string; fromViewId: string }
  | { kind: 'view'; viewId: string };

const writePayload = (e: React.DragEvent, payload: DragPayload) =>
  e.dataTransfer.setData('text/plain', JSON.stringify(payload));
const readPayload = (e: React.DragEvent): DragPayload | null => {
  try {
    return JSON.parse(e.dataTransfer.getData('text/plain')) as DragPayload;
  } catch {
    return null;
  }
};

// A user-defined layer — no SDK involvement, just reads PageContext.
function WatermarkLayer() {
  const page = usePage();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          transform: 'rotate(-28deg)',
          fontSize: page.transform.contentWidth * 0.13,
          fontWeight: 800,
          color: 'rgba(220,0,0,0.10)',
        }}
      >
        DRAFT
      </div>
    </div>
  );
}

// Compact toolbar primitives — small font, tight controls, micro-labels.
const tbRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  fontSize: 11,
};
const tbSelect: React.CSSProperties = {
  fontSize: 11,
  padding: '1px 4px',
  border: '1px solid #ccc',
  borderRadius: 4,
  background: '#fff',
};
const tbBtn: React.CSSProperties = {
  fontSize: 11,
  padding: '2px 7px',
  border: '1px solid #ccc',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
};
const tbNum: React.CSSProperties = { ...tbSelect, width: 44 };
const Divider = () => (
  <span style={{ width: 1, height: 16, background: '#ddd', margin: '0 2px' }} />
);
/** A compact labelled control: a muted micro-label + the input, inline. */
function Field({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <label title={title} style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#666' }}>
      <span style={{ color: '#aaa' }}>{label}</span>
      {children}
    </label>
  );
}

// The /LE line endings the demo can set on a line / polyline (engine wire names).
type LineEndingName =
  | 'none'
  | 'open-arrow'
  | 'closed-arrow'
  | 'r-open-arrow'
  | 'r-closed-arrow'
  | 'circle'
  | 'square'
  | 'diamond'
  | 'butt'
  | 'slash';
const LINE_ENDINGS: { v: LineEndingName; label: string }[] = [
  { v: 'none', label: 'none' },
  { v: 'open-arrow', label: 'open arrow' },
  { v: 'closed-arrow', label: 'closed arrow' },
  { v: 'r-open-arrow', label: 'r open arrow' },
  { v: 'r-closed-arrow', label: 'r closed arrow' },
  { v: 'circle', label: 'circle' },
  { v: 'square', label: 'square' },
  { v: 'diamond', label: 'diamond' },
  { v: 'butt', label: 'butt' },
  { v: 'slash', label: 'slash' },
];
const DRAW_TOOLS = new Set(['square', 'circle', 'line', 'ink']);

// Border styles a square/circle can take. The model is a discriminated union, so
// each option just constructs the variant it means — no enum + intensity to keep
// in sync. Cloudy bulges its scallops back out to the box edge (see plugin-render).
const BORDER_OPTS: { key: string; label: string; make: () => Border }[] = [
  { key: 'solid', label: '▭ solid', make: () => ({ kind: 'solid' }) },
  { key: 'dashed', label: '┄ dashed', make: () => ({ kind: 'dashed', dash: [6, 3] }) },
  { key: 'cloudy1', label: '◌ cloud 1', make: () => ({ kind: 'cloudy', intensity: 1 }) },
  { key: 'cloudy2', label: '◌ cloud 2', make: () => ({ kind: 'cloudy', intensity: 2 }) },
];
const borderKey = (b: Border): string =>
  b.kind === 'cloudy' ? `cloudy${b.intensity >= 2 ? 2 : 1}` : b.kind;
const NO_ENDS = { start: 'none', end: 'none' } as const;

const TOOLS: { id: string; label: string; title: string }[] = [
  { id: 'pointer', label: '↖ select', title: 'select text or drag to select annotations' },
  { id: 'form-fill', label: '✍ fill', title: 'fill form fields' },
  { id: 'pan', label: '✋ pan', title: 'pan (hand)' },
  { id: 'square', label: '▭ square', title: 'draw a square' },
  { id: 'circle', label: '◯ circle', title: 'draw a circle' },
  { id: 'line', label: '╱ line', title: 'draw a line' },
  { id: 'polygon', label: '⬠ polygon', title: 'click vertices, double-click to finish' },
  { id: 'polyline', label: '⌁ polyline', title: 'click vertices, double-click to finish' },
  { id: 'ink', label: '✎ ink', title: 'draw freehand' },
  { id: 'free-text', label: 'T text', title: 'add a text box (drag or click, then type)' },
  {
    id: 'free-text-callout',
    label: '↳ callout',
    title: 'click the tip, click the elbow, then drag/click the text box',
  },
];
// Text-selection tools create from a TEXT SELECTION (select text with the tool active).
const MARKUP_TOOLS: { id: string; label: string; title: string }[] = [
  { id: 'highlight', label: '🖍 highlight', title: 'select text to highlight' },
  { id: 'underline', label: 'U̲ underline', title: 'select text to underline' },
  { id: 'strikeout', label: 'S̶ strikeout', title: 'select text to strike out' },
  { id: 'squiggly', label: '∿ squiggly', title: 'select text to squiggly-underline' },
  { id: 'insert-text', label: '⌃ caret', title: 'select text to add an insert caret' },
];
const MARKUP_SUBTYPES = new Set(['highlight', 'underline', 'squiggly', 'strikeout']);
// Field palette: draw (or click) to place a field; the widget is instantly a
// selectable annotation, and the field panel appears in the styles sidebar.
const FORM_DESIGN_TOOLS: { id: string; label: string; title: string }[] = [
  { id: 'form-text', label: '▭ field', title: 'draw a text field' },
  { id: 'form-checkbox', label: '☑ check', title: 'place a checkbox' },
  { id: 'form-radio', label: '◉ radio', title: 'place a radio option' },
  { id: 'form-combobox', label: '▾ dropdown', title: 'draw a dropdown' },
  { id: 'form-listbox', label: '≡ list', title: 'draw a list box' },
];

/**
 * The stamp tool button: opens a file picker (PNG / JPEG / single-page PDF)
 * and arms the payload — every subsequent page click places one stamp until
 * the tool changes. One line of integration: `annotation.armStamp({ source })`.
 */
function StampButton({ active }: { active: boolean }) {
  const annotation = useAnnotation();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        title="pick an image (or single-page PDF), then click a page to place it"
        style={toolBtn(active)}
      >
        🖼 stamp
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void annotation.armStamp({ source: file });
          e.target.value = ''; // allow re-picking the same file later
        }}
      />
    </>
  );
}

/**
 * The stamp LIBRARY strip: import any PDF as a library (each page becomes one
 * VECTOR stamp), thumbnails render from the plugin's cached previews, and a
 * click arms the asset — hovering a page then ghosts the exact placement, and
 * every click places one. Total integration: `stampPlugin()` + three hooks.
 */
function StampLibraryBar() {
  const stamp = useStamp();
  const assets = useStampAssets();
  const { armAsset } = useArmStampAsset();
  const { activeToolId } = useTool();
  const fileRef = useRef<HTMLInputElement>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The hub owns tool state: leaving the stamp tool un-highlights the gallery.
  useEffect(() => {
    if (activeToolId !== 'stamp') setArmedId(null);
  }, [activeToolId]);
  const importPdf = (source: Blob, name: string) => {
    setBusy(true);
    stamp
      .importLibraryPdf(source, { name })
      .catch((err) => console.error('[demo] library import failed:', err))
      .finally(() => setBusy(false));
  };
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <button
        onClick={() => fileRef.current?.click()}
        title="import a PDF as a stamp library — each page becomes one vector stamp"
        style={toolBtn(false)}
        disabled={busy}
      >
        {busy ? '⏳ importing…' : '📚 library'}
      </button>
      {assets.length === 0 && (
        <button
          onClick={() => {
            void fetch('/mixed_page_sizes_test.pdf')
              .then((r) => r.blob())
              .then((blob) => importPdf(blob, 'Sample stamps'));
          }}
          title="import the bundled sample PDF as a stamp library"
          style={toolBtn(false)}
          disabled={busy}
        >
          ⭐ sample
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) importPdf(file, file.name.replace(/\.pdf$/i, ''));
        }}
      />
      {assets.map((a) => (
        <StampAssetButton
          key={a.id}
          asset={a}
          armed={armedId === a.id}
          onArm={() => {
            setArmedId(a.id);
            void armAsset(a.id).catch((err) => console.error('[demo] arm failed:', err));
          }}
        />
      ))}
    </div>
  );
}

/** One gallery thumbnail: the plugin's cached preview via an object-URL hook. */
function StampAssetButton({
  asset,
  armed,
  onArm,
}: {
  asset: StampAsset;
  armed: boolean;
  onArm: () => void;
}) {
  const url = useStampAssetPreviewUrl(asset.id);
  return (
    <button
      onClick={onArm}
      title={`${asset.name} — click, then click a page to place it (hover previews)`}
      style={{ ...toolBtn(armed), padding: '2px 4px' }}
    >
      {url ? (
        <img
          src={url}
          alt={asset.name}
          style={{ height: 20, display: 'block', border: '1px solid #ddd' }}
        />
      ) : (
        asset.name
      )}
    </button>
  );
}

/**
 * The tool band: the interaction hub's single active tool, switched in one place
 * (select / pan + the draw tools). The "styles" button opens the property sidebar —
 * it's opt-in, so the canvas stays full-width until you actually want to edit.
 */
function AnnotationBar({
  stylesOpen,
  onToggleStyles,
}: {
  stylesOpen: boolean;
  onToggleStyles: () => void;
}) {
  const { activeToolId, activate } = useTool();
  const annotation = useAnnotation();
  // Seed the line tool with an arrow default (Adobe's "line arrow"), demonstrating
  // per-tool configurable defaults — the sidebar lets you change it live. The fill
  // default makes a CLOSED ending (closed arrow / circle / square) solid out of the
  // box; stroke and fill stay independently editable.
  useEffect(() => {
    annotation.setDefaults('line', {
      interiorColor: '#e5484d',
      lineEndings: { start: 'none', end: 'open-arrow' },
    });
  }, [annotation]);
  return (
    <div style={{ ...tbRow, background: '#fff', borderBottom: '1px solid #eee' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => activate(t.id)}
            title={t.title}
            style={toolBtn(activeToolId === t.id)}
          >
            {t.label}
          </button>
        ))}
        {/* stamp: pick an image (or single-page PDF), then click a page to place it —
            `armStamp` validates the bytes and activates the stamp tool itself */}
        <StampButton active={activeToolId === 'stamp'} />
      </div>
      <Divider />
      {/* stamp library: import a PDF, click a thumbnail, hover a page — the ghost
          previews the exact placement (v2 rubber-stamp feel, vector content) */}
      <StampLibraryBar />
      <Divider />
      {/* text-selection tools: created by selecting text with the tool active */}
      <div style={{ display: 'flex', gap: 2 }}>
        {MARKUP_TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => activate(t.id)}
            title={t.title}
            style={toolBtn(activeToolId === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Divider />
      <div style={{ display: 'flex', gap: 2 }}>
        {FORM_DESIGN_TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => activate(t.id)}
            title={t.title}
            style={toolBtn(activeToolId === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <span style={{ marginLeft: 'auto' }} />
      <FormDataButtons />
      <button onClick={onToggleStyles} title="edit annotation styles" style={toolBtn(stylesOpen)}>
        ⚙ styles
      </button>
    </div>
  );
}

/** Form-data interchange: export the current values as XFDF, or apply an
 *  FDF/XFDF file — the engine sniffs the format and validates per field. */
function FormDataButtons() {
  const form = useForm();
  const [note, setNote] = useState('');
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {note && <span style={{ fontSize: 10, color: '#666' }}>{note}</span>}
      <button
        title="export form data (XFDF)"
        style={tbBtn}
        onClick={async () => {
          const { bytes } = await form.exportData('xfdf');
          saveToDisk(bytes, 'form-data.xfdf');
        }}
      >
        ⇩ form
      </button>
      <button
        title="import form data (FDF/XFDF)"
        style={tbBtn}
        onClick={async () => {
          const file = await pickFile('.xfdf,.fdf');
          if (!file) return;
          const r = await form.importData(new Uint8Array(await file.arrayBuffer()));
          setNote(`applied ${r.fieldsApplied}/${r.fieldsTotal}`);
        }}
      >
        ⇧ form
      </button>
    </div>
  );
}

/** A vertical labelled control for the sidebar: a micro-label stacked over the input. */
function SideField({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <label title={title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: '#999' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </label>
  );
}

// The standard PDF fonts the demo offers (any registered font key works too).
const FONT_OPTIONS: { v: string; label: string }[] = [
  { v: 'helvetica', label: 'Helvetica' },
  { v: 'helvetica-bold', label: 'Helvetica Bold' },
  { v: 'times-roman', label: 'Times Roman' },
  { v: 'courier', label: 'Courier' },
];

/**
 * ONE control for ONE property spec — the entire per-property UI. The spec's
 * `key` fixes the control type and its constraints (min/max/step, cloudy);
 * `onChange` emits a flat `{ [key]: value }` patch. This switch is the whole
 * surface an app customizes — the plugin decides WHICH controls show, in what
 * order, per kind (see `useSelectionProps` / `propsForTool`).
 */
function PropControl({
  spec,
  value,
  mixed,
  onChange,
}: {
  spec: PropSpec;
  value: AnnotationProps[PropSpec['key']] | undefined;
  mixed: boolean;
  onChange: (patch: AnnotationPropsPatch) => void;
}) {
  const colorInput = (v: string, set: (c: string) => void) => (
    <input
      type="color"
      value={v}
      onChange={(e) => set(e.target.value)}
      style={{ width: 36, height: 24, padding: 0, border: '1px solid #ccc', borderRadius: 4 }}
    />
  );
  const label = mixed ? `${spec.label} (mixed)` : spec.label;

  switch (spec.key) {
    case 'color':
    case 'fontColor':
      return (
        <SideField label={label}>
          {colorInput((value as string) ?? '#000000', (c) => onChange({ [spec.key]: c }))}
        </SideField>
      );
    case 'interiorColor': {
      const fill = (value as string | null) ?? null;
      return (
        <SideField label={label} title="toggle off for transparent">
          <input
            type="checkbox"
            checked={fill != null}
            onChange={(e) => onChange({ interiorColor: e.target.checked ? '#ffffff' : null })}
            style={{ margin: 0 }}
          />
          {colorInput(fill ?? '#ffffff', (c) => onChange({ interiorColor: c }))}
        </SideField>
      );
    }
    case 'opacity':
      return (
        <SideField label={label}>
          <input
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={(value as number) ?? 1}
            onChange={(e) => onChange({ opacity: Number(e.target.value) })}
            style={{ width: '100%' }}
          />
        </SideField>
      );
    case 'strokeWidth':
    case 'fontSize':
      return (
        <SideField label={label}>
          <input
            type="number"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={(value as number) ?? spec.min}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange({ [spec.key]: n });
            }}
            style={{ ...tbSelect, width: '100%' }}
          />
        </SideField>
      );
    case 'border': {
      const border = (value as Border) ?? { kind: 'solid' };
      const opts = spec.cloudy
        ? BORDER_OPTS
        : BORDER_OPTS.filter((o) => !o.key.startsWith('cloudy'));
      return (
        <SideField label={label} title="cloudy scallops bulge out to the box edge">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, width: '100%' }}>
            {opts.map((o) => (
              <button
                key={o.key}
                onClick={() => onChange({ border: o.make() })}
                style={toolBtn(borderKey(border) === o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </SideField>
      );
    }
    case 'lineEndings': {
      const ends = (value as LineEndings) ?? { start: 'none', end: 'none' };
      const side = (which: 'start' | 'end') => (
        <select
          value={ends[which]}
          onChange={(e) => onChange({ lineEndings: { [which]: e.target.value as LineEndingName } })}
          style={{ ...tbSelect, width: '100%' }}
        >
          {LINE_ENDINGS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      );
      return (
        <>
          <SideField label={`${label} · start`}>{side('start')}</SideField>
          <SideField label={`${label} · end`}>{side('end')}</SideField>
        </>
      );
    }
    case 'fontFamily':
      return (
        <SideField label={label}>
          <select
            value={(value as string) ?? 'helvetica'}
            onChange={(e) => onChange({ fontFamily: e.target.value })}
            style={{ ...tbSelect, width: '100%' }}
          >
            {FONT_OPTIONS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.label}
              </option>
            ))}
          </select>
        </SideField>
      );
    case 'textAlign':
      return (
        <SideField label={label}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['left', 'center', 'right'] as TextAlign[]).map((al) => (
              <button
                key={al}
                onClick={() => onChange({ textAlign: al })}
                style={toolBtn(value === al)}
              >
                {al === 'left' ? '⇤' : al === 'center' ? '☰' : '⇥'}
              </button>
            ))}
          </div>
        </SideField>
      );
  }
}

/**
 * The FIELD plane panel: appears when the selection is a single widget.
 * Style props above it stay schema-driven (the widget client kinds declare
 * them); this edits what only the form plugin owns — name, required,
 * options — and routes deletion to the right door (cascade vs detach).
 */
function FieldPanel() {
  const form = useForm();
  const field = useFormField();
  if (!field) return null;
  const key = fieldKeyOf(field);
  const patch = (p: Record<string, unknown>) =>
    void form.updateField(key, { family: field.family, ...p } as FormFieldPatch);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 12,
        borderTop: '1px solid #e2e2e2',
      }}
    >
      <span style={{ fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: '#999' }}>
        Field · {field.family}
      </span>
      <SideField label="Name">
        <input
          key={field.name}
          defaultValue={field.name.split('.').pop()}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== field.name.split('.').pop()) patch({ name: next });
          }}
          style={{ ...tbSelect, width: '100%' }}
        />
      </SideField>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#666' }}>
        <input
          type="checkbox"
          checked={field.flags.required}
          onChange={(e) => patch({ required: e.target.checked })}
        />
        required
      </label>
      {(field.family === 'combobox' || field.family === 'listbox') && (
        <SideField label="Options (one per line)">
          <textarea
            key={key}
            defaultValue={field.options.map((o) => o.label).join('\n')}
            rows={4}
            onBlur={(e) => {
              const options = e.target.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((label) => ({ label, value: label }));
              if (options.length) patch({ options });
            }}
            style={{ ...tbSelect, width: '100%', resize: 'vertical' }}
          />
        </SideField>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        {field.widgets.length > 1 ? (
          <button
            style={tbBtn}
            title="unlink this widget; the field keeps its other widgets"
            onClick={() => void form.detachWidget(key, field.widgets[0]!.annotObjectNumber)}
          >
            ⛓ Detach widget
          </button>
        ) : null}
        <button
          style={{ ...tbBtn, color: '#c0322b', borderColor: '#e3b3b0' }}
          title="delete the field and all of its widgets"
          onClick={() => void form.deleteField(key)}
        >
          🗑 Delete field
        </button>
      </div>
    </div>
  );
}

/**
 * The annotation style inspector — a right-docked sidebar, opened from the tool
 * band. FULLY SCHEMA-DRIVEN: with a selection it renders the properties every
 * selected kind shares (`useSelectionProps`) and writes via `updateSelection`;
 * with none it renders the active tool's properties (`propsForTool`) over the
 * live defaults (`useAnnotationDefaults`) and writes via `setDefaults`. No
 * per-subtype branching here — new kinds get a working sidebar for free.
 */
function AnnotationSidebar({ onClose }: { onClose: () => void }) {
  const annotation = useAnnotation();
  const { activeToolId } = useTool();
  const sel = useSelectionProps();
  const defaults = useAnnotationDefaults(activeToolId);
  const selCount = useAnnotationSelection().length;

  const hasSel = sel.specs.length > 0;
  const specs = hasSel ? sel.specs : annotation.propsForTool(activeToolId);
  const values: Partial<AnnotationProps> = hasSel ? sel.values : defaults;
  const write = (patch: AnnotationPropsPatch) =>
    hasSel ? annotation.updateSelection(patch) : annotation.setDefaults(activeToolId, patch);

  return (
    <aside style={annoSidebar}>
      <header style={annoSidebarHead}>
        <span>
          {hasSel ? `${selCount} selected` : specs.length ? `${activeToolId} defaults` : 'Styles'}
        </span>
        <button onClick={onClose} title="close" style={annoSidebarClose}>
          ✕
        </button>
      </header>
      {specs.length === 0 ? (
        <p style={annoSidebarEmpty}>
          Pick a draw tool or select an annotation to edit its appearance.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 12 }}>
          {specs.map((spec) => (
            <PropControl
              key={spec.key}
              spec={spec}
              value={values[spec.key]}
              mixed={hasSel && sel.mixed.includes(spec.key)}
              onChange={write}
            />
          ))}
          {!hasSel && MARKUP_SUBTYPES.has(activeToolId) && (
            <p style={{ margin: 0, color: '#999', fontSize: 11, lineHeight: 1.5 }}>
              Select text on the page to {activeToolId} it.
            </p>
          )}
          {hasSel && (
            <button
              onClick={() => annotation.deleteSelection()}
              title="delete selected"
              style={{ ...tbBtn, color: '#c0322b', borderColor: '#e3b3b0' }}
            >
              🗑 Delete selection
            </button>
          )}
          <FieldPanel />
        </div>
      )}
    </aside>
  );
}

/** A tiny option toggle for the search box (Aa / |ab| / .*). */
function SearchToggle({
  on,
  label,
  title,
  onClick,
}: {
  on: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} title={title} style={toolBtn(on)}>
      {label}
    </button>
  );
}

/**
 * The search box: type-as-you-search over the engine's budgeted slices.
 * Enter / shift+Enter (or ↓ / ↑) steps through hits — the plugin reveals
 * the hit's page via the Stage. The dropdown lists snippets streamed in
 * viewport-first order; clicking one jumps to it.
 */
function SearchControls() {
  const search = useSearch();
  const { status, hitCount, activeIndex, progress, error } = useSearchState();
  const [text, setText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const patternError =
    regex && text.trim() ? (validateSearchRegex(text.trim()).ok ? null : 'invalid pattern') : null;

  // Debounced type-as-you-search; options re-run the query too. The query
  // IS the box: one flat SearchQuery from engine to input element.
  useEffect(() => {
    const t = setTimeout(() => {
      const needle = text.trim();
      if (!needle || patternError) search.clear();
      else search.search({ text: needle, matchCase, wholeWord, regex });
    }, 300);
    return () => clearTimeout(t);
  }, [text, matchCase, wholeWord, regex, patternError, search]);

  const hits = useSelector(SearchToken, (c) => c.hits());
  const counter =
    hitCount > 0
      ? `${activeIndex + 1}/${hitCount}`
      : status === 'searching'
        ? '…'
        : text.trim()
          ? '0'
          : '';

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3 }}>
      <input
        value={text}
        placeholder="search…"
        onChange={(e) => {
          setText(e.target.value);
          setListOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.shiftKey ? search.prev() : search.next();
          if (e.key === 'Escape') {
            setText('');
            setListOpen(false);
            search.clear();
          }
        }}
        style={{ ...tbSelect, width: 130, borderColor: patternError ? '#e5484d' : '#ccc' }}
      />
      <SearchToggle
        on={matchCase}
        label="Aa"
        title="match case"
        onClick={() => setMatchCase((v) => !v)}
      />
      <SearchToggle
        on={wholeWord}
        label="|ab|"
        title="whole word"
        onClick={() => setWholeWord((v) => !v)}
      />
      <SearchToggle
        on={regex}
        label=".*"
        title="regular expression (RE2-portable dialect)"
        onClick={() => setRegex((v) => !v)}
      />
      <button onClick={() => search.prev()} title="previous match (shift+Enter)" style={tbBtn}>
        ↑
      </button>
      <button onClick={() => search.next()} title="next match (Enter)" style={tbBtn}>
        ↓
      </button>
      <span
        title={
          status === 'searching'
            ? `scanning ${progress.scanned}/${progress.total} pages`
            : undefined
        }
        style={{ minWidth: 34, textAlign: 'center', color: patternError ? '#e5484d' : '#666' }}
      >
        {patternError ? '✕' : counter}
      </span>
      {listOpen && text.trim() && hitCount > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 40,
            marginTop: 4,
            width: 340,
            maxHeight: 300,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,.15)',
          }}
        >
          {hits.slice(0, 100).map((hit, i) => (
            <button
              key={`${hit.pon}:${hit.charStart}`}
              onClick={() => search.goTo(i)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '5px 8px',
                border: 'none',
                borderBottom: '1px solid #f2f2f2',
                background: i === activeIndex ? '#fff7df' : '#fff',
                cursor: 'pointer',
                fontSize: 11,
                color: '#444',
              }}
            >
              <span style={{ color: '#999', marginRight: 6 }}>p{hit.pageIndex + 1}</span>
              {hit.snippet ? (
                <>
                  {hit.snippet.text.slice(0, hit.snippet.matchStart)}
                  <b style={{ background: 'rgba(255,213,0,.45)' }}>
                    {hit.snippet.text.slice(
                      hit.snippet.matchStart,
                      hit.snippet.matchStart + hit.snippet.matchLength,
                    )}
                  </b>
                  {hit.snippet.text.slice(hit.snippet.matchStart + hit.snippet.matchLength)}
                </>
              ) : (
                <i>match</i>
              )}
            </button>
          ))}
          <div style={{ padding: '4px 8px', fontSize: 10, color: '#999', display: 'flex', gap: 8 }}>
            {status === 'searching'
              ? `scanning… ${progress.scanned}/${progress.total} pages`
              : `${hitCount} matches${hitCount > 100 ? ' (first 100 shown)' : ''}`}
            {error && <span style={{ color: '#e5484d' }}>{error}</span>}
            <span style={{ marginLeft: 'auto' }} />
            <button
              onClick={() => setListOpen(false)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999' }}
            >
              close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar() {
  const { zoom, mode, zoomIn, zoomOut, fitWidth, fitPage, fitAll, automatic } = useZoom();
  const { currentPage, pageCount, next, prev } = usePages();
  const {
    flow,
    setFlow,
    layout,
    setLayout,
    spread,
    setSpread,
    sizing,
    setSizing,
    bounded,
    setBounded,
  } = useLayout();
  const { settings, update, reset } = useStageSettings();
  const applyZoomMode = (m: string) => {
    if (m === 'automatic') automatic();
    else if (m === 'fit-page') fitPage();
    else if (m === 'fit-width') fitWidth();
    else if (m === 'fit-all') fitAll();
  };
  return (
    <div style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
      {/* Row 1 — navigate, zoom, presets */}
      <div style={{ ...tbRow, borderBottom: '1px solid #f0f0f0' }}>
        <button onClick={() => prev()} title="previous page/spread" style={tbBtn}>
          ◀
        </button>
        <span>
          p <b>{currentPage + 1}</b>/{pageCount}
        </span>
        <button onClick={() => next()} title="next page/spread" style={tbBtn}>
          ▶
        </button>
        <Divider />
        <button onClick={zoomOut} style={tbBtn}>
          −
        </button>
        <span style={{ minWidth: 34, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={zoomIn} style={tbBtn}>
          +
        </button>
        <select
          value={mode}
          onChange={(e) => applyZoomMode(e.target.value)}
          title="zoom mode"
          style={tbSelect}
        >
          <option value="automatic">auto</option>
          <option value="fit-page">fit page</option>
          <option value="fit-width">fit width</option>
          <option value="fit-all">fit all</option>
          <option value="custom" disabled>
            custom
          </option>
        </select>
        <Divider />
        <SearchControls />
        <span style={{ marginLeft: 'auto' }} />
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            onClick={() => update(PRESETS[name])}
            title={`apply the ${name} preset`}
            style={tbBtn}
          >
            {name}
          </button>
        ))}
        <button onClick={reset} title="reset to home" style={tbBtn}>
          ⟲
        </button>
      </div>

      {/* Row 2 — layout settings (compact) */}
      <div style={tbRow}>
        <Field label="flow" title="flow">
          <select
            value={flow}
            onChange={(e) => setFlow(e.target.value as FlowMode)}
            style={tbSelect}
          >
            <option value="continuous">scroll</option>
            <option value="paged">paged</option>
          </select>
        </Field>
        <Field label="layout" title="layout">
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as LayoutKind)}
            style={tbSelect}
          >
            <option value="vertical">vertical</option>
            <option value="horizontal">horizontal</option>
            <option value="grid">grid</option>
          </select>
        </Field>
        <Field
          label="cols"
          title="grid columns: square (≈√n), wrapped (re-wraps with viewport width and zoom), or a fixed count"
        >
          <select
            value={String(settings.columns)}
            onChange={(e) => {
              const v = e.target.value;
              update({ columns: (v === 'square' || v === 'auto' ? v : Number(v)) as GridColumns });
            }}
            style={tbSelect}
          >
            <option value="square">square</option>
            <option value="auto">wrapped</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </Field>
        <Field
          label="dir"
          title="reading direction: RTL flips horizontal order, spread binding, grid fill, and logical alignment"
        >
          <select
            value={settings.direction}
            onChange={(e) => update({ direction: e.target.value as Direction })}
            style={tbSelect}
          >
            <option value="ltr">ltr</option>
            <option value="rtl">rtl</option>
          </select>
        </Field>
        <Field label="spread" title="spread">
          <select
            value={spread}
            onChange={(e) => setSpread(e.target.value as SpreadMode)}
            style={tbSelect}
          >
            <option value="none">single</option>
            <option value="odd">spread</option>
            <option value="even">cover</option>
          </select>
        </Field>
        <Field
          label="size"
          title="page sizing: true sizes, or equalize the cross axis so pages sit flush"
        >
          <select
            value={sizing}
            onChange={(e) => setSizing(e.target.value as SizingMode)}
            style={tbSelect}
          >
            <option value="intrinsic">true</option>
            <option value="uniform">uniform</option>
          </select>
        </Field>
        <Field
          label="align"
          title="arrivalAlign: where navigation LANDS, at every zoom — 'reading start' follows direction; center for drawings"
        >
          <select
            value={
              Object.keys(ALIGNMENTS).find(
                (k) =>
                  ALIGNMENTS[k].x === settings.arrivalAlign.x &&
                  ALIGNMENTS[k].y === settings.arrivalAlign.y,
              ) ?? 'reading start'
            }
            onChange={(e) => update({ arrivalAlign: ALIGNMENTS[e.target.value] })}
            style={tbSelect}
          >
            {Object.keys(ALIGNMENTS).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Divider />
        <Field
          label="pad"
          title="breathing room (px) around the content — fit inset, arrival gutter, clamp slack"
        >
          <input
            type="number"
            min={0}
            max={200}
            step={4}
            value={settings.padding}
            onChange={(e) => update({ padding: Math.max(0, Number(e.target.value) || 0) })}
            style={tbNum}
          />
        </Field>
        <Field label="gap" title="space between pages (world units; scales with zoom)">
          <input
            type="number"
            min={0}
            max={200}
            step={4}
            value={typeof settings.gap === 'number' ? settings.gap : settings.gap.px}
            onChange={(e) => update({ gap: Math.max(0, Number(e.target.value) || 0) })}
            style={tbNum}
          />
        </Field>
        <label
          title="clamp the camera to the content (off = free infinite pan, for plans/CAD)"
          style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#666' }}
        >
          <input type="checkbox" checked={bounded} onChange={(e) => setBounded(e.target.checked)} />
          bounded{bounded ? '' : ' ∞'}
        </label>
      </div>
    </div>
  );
}

// The per-document main column: the view toolbar, the tool band, and the canvas
// with an opt-in style inspector docked on the right. Each pane owns its own
// `stylesOpen`, so toggling the inspector in one pane never affects another.
function DocumentView() {
  const [stylesOpen, setStylesOpen] = useState(false);
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Toolbar />
      <AnnotationBar stylesOpen={stylesOpen} onToggleStyles={() => setStylesOpen((o) => !o)} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Stage
          interaction
          style={{ flex: 1, background: '#0d1117' }}
          overlay={
            <>
              <AnnotationDraftMenu placement="bottom" gap={12}>
                {({ canFinish, finish, cancel, subtype, pointCount, minPoints }) => (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: 6,
                      borderRadius: 10,
                      background: '#1b1f27',
                      border: '1px solid rgba(255,255,255,.12)',
                      boxShadow: '0 8px 24px rgba(0,0,0,.4)',
                    }}
                  >
                    <button
                      aria-label={`Finish ${subtype}`}
                      title={
                        canFinish
                          ? `Finish ${subtype}`
                          : `${subtype} needs ${minPoints - pointCount} more point${
                              minPoints - pointCount === 1 ? '' : 's'
                            }`
                      }
                      disabled={!canFinish}
                      onClick={finish}
                      style={{
                        ...DRAFT_MENU_BTN,
                        opacity: canFinish ? 1 : 0.38,
                        cursor: canFinish ? 'pointer' : 'not-allowed',
                      }}
                    >
                      ✓
                    </button>
                    <button
                      aria-label={`Cancel ${subtype}`}
                      title={`Cancel ${subtype}`}
                      onClick={cancel}
                      style={DRAFT_MENU_BTN}
                    >
                      ×
                    </button>
                  </div>
                )}
              </AnnotationDraftMenu>
              <AnnotationMenu placement="bottom">
                {({
                  selected,
                  deleteSelection,
                  deselect,
                  updateSelection,
                  group,
                  ungroup,
                  canGroup,
                  canUngroup,
                }) => (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 8px',
                      borderRadius: 10,
                      background: '#1b1f27',
                      border: '1px solid rgba(255,255,255,.12)',
                      boxShadow: '0 8px 24px rgba(0,0,0,.4)',
                      color: '#e6e6e6',
                      fontSize: 12,
                    }}
                  >
                    {['#e5484d', '#f5a623', '#3858e9', '#30a46c'].map((c) => (
                      <button
                        key={c}
                        title={c}
                        onClick={() => updateSelection({ color: c })}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: c,
                          border: '1px solid rgba(255,255,255,.5)',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      />
                    ))}
                    <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,.18)' }} />
                    {canGroup && (
                      <button onClick={() => group()} style={MENU_BTN}>
                        Group{selected.length > 1 ? ` (${selected.length})` : ''}
                      </button>
                    )}
                    {canUngroup && (
                      <button onClick={() => ungroup()} style={MENU_BTN}>
                        Ungroup
                      </button>
                    )}
                    {(canGroup || canUngroup) && (
                      <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,.18)' }} />
                    )}
                    <button onClick={deleteSelection} style={MENU_BTN}>
                      Delete{selected.length > 1 ? ` (${selected.length})` : ''}
                    </button>
                    <button onClick={deselect} style={MENU_BTN}>
                      Done
                    </button>
                  </div>
                )}
              </AnnotationMenu>
            </>
          }
        >
          {() => (
            <>
              {/* the overlay owns annotation rendering, so the page bitmap excludes them */}
              <RenderLayer annotations={false} />
              <WatermarkLayer />
              <SelectionLayer />
              <SearchLayer />
              <AnnotationLayer />
              <FormLayer />
            </>
          )}
        </Stage>
        {stylesOpen && <AnnotationSidebar onClose={() => setStylesOpen(false)} />}
      </div>
    </div>
  );
}

// The thumbnail sidebar: the SAME document through a second stage lens (wrapped
// grid, fixed small zoom). Drag its right edge — the grid re-wraps 1 → 2 → 3
// columns by width. Click a thumb to navigate the MAIN lens.
function ThumbnailSidebar() {
  const { currentPage, goToPage } = usePages(); // the MAIN lens
  const editor = usePageEditor(); // PERSISTED page edits (document-scoped, shared by lenses)
  const canEdit = editor.canEdit();
  const pageCount = useSelector(ThumbsStageToken, (c) => c.pageCount()); // gates move/delete edges
  const [menuPage, setMenuPage] = useState<number | null>(null); // which thumb's action menu is open
  const thumbs = useStageSettings(ThumbsStageToken); // the SIDEBAR lens
  const thumbPx = 'pageWidth' in thumbs.settings.zoom ? thumbs.settings.zoom.pageWidth : 110;
  // FOLLOW the main view (Adobe behavior): when its current page changes, make that
  // thumb visible — minimal movement, zero when it's already on screen. Policy in
  // app code; the `reveal` verb is the mechanism.
  const { reveal } = usePages(ThumbsStageToken);
  useEffect(() => reveal(currentPage), [currentPage, reveal]);
  return (
    <div
      style={{
        width: 168,
        minWidth: 84,
        maxWidth: 560,
        resize: 'horizontal',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #e2e2e2',
        background: '#f4f4f4',
      }}
      title="drag the bottom-right corner to resize — the grid re-wraps"
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 6px',
          fontSize: 11,
          color: '#666',
          borderBottom: '1px solid #e2e2e2',
        }}
        title="thumbnail width in SCREEN px — document-independent (zoom: { pageWidth })"
      >
        thumb
        <input
          type="number"
          min={40}
          max={400}
          step={10}
          value={thumbPx}
          onChange={(e) =>
            thumbs.update({ zoom: { pageWidth: Math.max(40, Number(e.target.value) || 110) } })
          }
          style={{ width: 48 }}
        />
        px
      </label>
      <Stage
        token={ThumbsStageToken}
        style={{ flex: 1, position: 'relative' }}
        pageChrome={(page) => {
          // BOX-SPACE chrome: the click target/selection border hug the CONTENT
          // box (inset by the frame), and the label sits in the reserved bottom
          // band. None of this rotates with the page content; that's the point.
          const menuOpen = menuPage === page.pageIndex;
          // Run an edit, then close the menu — a move/delete reshuffles indices,
          // so leaving it open would leave it pointing at a different page.
          const act = (e: React.MouseEvent, fn: () => void) => {
            e.stopPropagation();
            fn();
            setMenuPage(null);
          };
          const itemStyle: React.CSSProperties = {
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '5px 10px',
            border: 'none',
            background: 'transparent',
            font: 'inherit',
            fontSize: 11,
            color: '#222',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          };
          return (
            <>
              <div
                onClick={() => goToPage(page.pageIndex)}
                style={{
                  position: 'absolute',
                  top: page.frame.top,
                  left: page.frame.left,
                  right: page.frame.right,
                  bottom: page.frame.bottom,
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  border:
                    page.pageIndex === currentPage ? '3px solid #3858e9' : '1px solid #d0d0d0',
                }}
              />
              {/* Page-actions menu. Box-space, gated on the assemble permission.
                  Every edit writes through the engine, so the MAIN lens updates too. */}
              {canEdit && (
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // don't navigate the main lens
                    setMenuPage(menuOpen ? null : page.pageIndex);
                  }}
                  title="Page actions"
                  style={{
                    position: 'absolute',
                    top: page.frame.top + 3,
                    right: page.frame.right + 3,
                    zIndex: 12,
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    fontSize: 13,
                    lineHeight: 1,
                    border: 'none',
                    borderRadius: 4,
                    background: menuOpen ? '#1f3bb3' : 'rgba(56, 88, 233, 0.9)',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  ⋯
                </button>
              )}
              {canEdit && menuOpen && (
                <>
                  {/* click-away backdrop: `fixed` escapes the Stage's overflow:hidden */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuPage(null);
                    }}
                    style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: page.frame.top + 26,
                      right: page.frame.right + 3,
                      zIndex: 11,
                      minWidth: 128,
                      background: '#fff',
                      border: '1px solid #d0d0d0',
                      borderRadius: 6,
                      boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
                      overflow: 'hidden',
                      padding: '3px 0',
                    }}
                  >
                    <button
                      style={itemStyle}
                      onClick={(e) => act(e, () => editor.rotateBy(page.pon, 90))}
                    >
                      ↻ Rotate
                    </button>
                    {/* hide "move up" on the first page; "move down" on the last */}
                    {page.pageIndex > 0 && (
                      <button
                        style={itemStyle}
                        onClick={(e) => act(e, () => editor.move([page.pon], page.pageIndex - 1))}
                      >
                        ↑ Move page up
                      </button>
                    )}
                    {page.pageIndex < pageCount - 1 && (
                      <button
                        style={itemStyle}
                        onClick={(e) => act(e, () => editor.move([page.pon], page.pageIndex + 1))}
                      >
                        ↓ Move page down
                      </button>
                    )}
                    {/* the engine rejects deleting the last remaining page */}
                    {pageCount > 1 && (
                      <button
                        style={{ ...itemStyle, color: '#c0322b' }}
                        onClick={(e) => act(e, () => editor.delete([page.pon]))}
                      >
                        🗑 Delete
                      </button>
                    )}
                  </div>
                </>
              )}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: page.frame.bottom,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#666',
                  pointerEvents: 'none',
                }}
              >
                {page.pageIndex + 1}
              </div>
            </>
          );
        }}
      >
        {/* page-space content: the bitmap, which rotates with the page */}
        {() => <RenderLayer />}
      </Stage>
    </div>
  );
}

// One pane = one view. It owns its own tab strip (view.documentIds) and a Stage
// bound to its active document. Tabs drag within and BETWEEN panes; the grip
// (⠿) drags the whole pane to reorder.
function Pane({
  view,
  names,
  canRemove,
}: {
  view: ViewInfo;
  names: Record<string, string>;
  canRemove: boolean;
}) {
  const { open, close } = useDocuments();
  const v = useViews();
  const focused = view.id === v.focusedViewId;

  const dropDoc = (e: React.DragEvent, index: number) => {
    const payload = readPayload(e);
    if (!payload || payload.kind !== 'doc') return;
    e.stopPropagation();
    if (payload.fromViewId === view.id) v.moveDocumentWithin(view.id, payload.documentId, index);
    else v.moveDocumentBetween(payload.fromViewId, view.id, payload.documentId, index);
  };
  const dropPane = (e: React.DragEvent) => {
    const payload = readPayload(e);
    if (!payload || payload.kind !== 'view' || payload.viewId === view.id) return;
    v.moveView(
      payload.viewId,
      v.views.findIndex((x) => x.id === view.id),
    );
  };

  return (
    <div
      onMouseDown={() => v.setFocused(view.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={dropPane}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRadius: 8,
        overflow: 'hidden',
        border: focused ? '2px solid #3858e9' : '2px solid #d8d8d8',
      }}
    >
      {/* tab strip */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => dropDoc(e, view.documentIds.length)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '4px 6px',
          background: '#f3f3f3',
          borderBottom: '1px solid #e2e2e2',
        }}
      >
        <span
          draggable
          onDragStart={(e) => writePayload(e, { kind: 'view', viewId: view.id })}
          title="drag to reorder pane"
          style={{ cursor: 'grab', color: '#bbb', padding: '0 2px' }}
        >
          ⠿
        </span>
        {view.documentIds.map((docId, i) => {
          const active = docId === view.activeDocumentId;
          return (
            <div
              key={docId}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                writePayload(e, { kind: 'doc', documentId: docId, fromViewId: view.id });
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => dropDoc(e, i)}
              onClick={() => {
                v.setFocused(view.id);
                v.setActiveDocument(view.id, docId);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 6px 3px 9px',
                borderRadius: 5,
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: 12,
                background: active ? '#fff' : 'transparent',
                border: active ? '1px solid #ccc' : '1px solid transparent',
                boxShadow: active ? '0 1px 2px rgba(0,0,0,.08)' : 'none',
              }}
            >
              <span>{names[docId] ?? docId}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void close(docId);
                }}
                style={{
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#999',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
        <button
          onClick={() => {
            v.setFocused(view.id);
            void newDocument().then((doc) => open(doc.source, { name: doc.name }));
          }}
          title="open a new document in this pane"
          style={{
            border: '1px dashed #bbb',
            background: 'transparent',
            borderRadius: 5,
            padding: '2px 7px',
            cursor: 'pointer',
            color: '#666',
          }}
        >
          +
        </button>
        {canRemove && (
          <button
            onClick={() => v.removeView(view.id)}
            title="close this pane (documents stay open)"
            style={{
              marginLeft: 'auto',
              border: 0,
              background: 'transparent',
              cursor: 'pointer',
              color: '#c00',
              fontSize: 12,
            }}
          >
            ✕ pane
          </button>
        )}
      </div>

      {/* body — bound to this pane's active document */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {view.activeDocumentId ? (
          <DocumentScope id={view.activeDocumentId}>
            <ThumbnailSidebar />
            <DocumentView />
          </DocumentScope>
        ) : (
          <div
            style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#aaa', fontSize: 12 }}
          >
            empty pane — drag a tab here or press <b style={{ margin: '0 4px' }}>+</b>
          </div>
        )}
      </div>
    </div>
  );
}

function Workspace() {
  const { docs } = useDocuments();
  const t = useT();
  const { views, createView } = useViews();
  const names = useMemo(() => Object.fromEntries(docs.map((d) => [d.id, d.name ?? d.id])), [docs]);
  return (
    <div
      style={{ display: 'flex', flex: 1, minHeight: 0, gap: 6, padding: 6, background: '#e9e9e9' }}
    >
      {views.map((view) => (
        <Pane key={view.id} view={view} names={names} canRemove={views.length > 1} />
      ))}
      <button
        onClick={() => createView()}
        title={t('demo.split')}
        style={{
          alignSelf: 'center',
          padding: '8px 10px',
          border: '1px dashed #bbb',
          borderRadius: 8,
          background: '#fff',
          cursor: 'pointer',
          color: '#666',
          whiteSpace: 'nowrap',
        }}
      >
        ◫ split
      </button>
    </div>
  );
}

// ── File menu: open base / base+layer, save layer / PDF, edit metadata ───────────
const saveToDisk = (bytes: Uint8Array, filename: string): void => {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
const pickFile = (accept: string): Promise<File | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });

function FileMenu() {
  const { open, download, downloadLayer } = useDocuments();
  const { views, focusedViewId } = useViews();
  const focused = views.find((v) => v.id === focusedViewId) ?? views[0];
  const targetId = focused?.activeDocumentId ?? null;
  const [sampleId, setSampleId] = useState(SAMPLES[0].id);
  const [layered, setLayered] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [status, setStatus] = useState('');

  const sample = () => SAMPLES.find((s) => s.id === sampleId)!;
  const isLayered = targetId ? layered.has(targetId) : false;

  const opened = async (source: OpenInput, name: string, isLayer: boolean) => {
    setMenu(false);
    try {
      const id = await open(source, { name });
      if (isLayer) setLayered((s) => new Set(s).add(id));
      setStatus(
        isLayer
          ? `Opened “${name}” — page ops + metadata write to the layer.`
          : `Opened “${name}”.`,
      );
    } catch (e) {
      setStatus(`Open failed: ${(e as Error).message}`);
    }
  };
  const openBase = async () => {
    const s = sample();
    void opened(
      { kind: 'bytes', id: `${s.id}-base-${Date.now()}`, bytes: await fetchBytes(s.url) },
      s.name,
      false,
    );
  };
  const openNewLayer = async () => {
    const s = sample();
    void opened(
      {
        kind: 'layerBytes',
        id: `${s.id}-layer-${Date.now()}`,
        baseBytes: await fetchBytes(s.url),
        layer: { kind: 'fresh' },
      } as OpenInput,
      `${s.name} (layer)`,
      true,
    );
  };
  const openSavedLayer = async () => {
    const file = await pickFile('.layer,application/octet-stream');
    if (!file) return;
    const s = sample();
    void opened(
      {
        kind: 'layerBytes',
        id: `${s.id}-relayer-${Date.now()}`,
        baseBytes: await fetchBytes(s.url),
        layer: { kind: 'artifact', bytes: new Uint8Array(await file.arrayBuffer()) },
      } as OpenInput,
      `${s.name} (layer)`,
      true,
    );
  };
  const doSaveLayer = async () => {
    setMenu(false);
    if (!targetId) return;
    try {
      const bytes = await downloadLayer(targetId);
      saveToDisk(bytes, `${sample().id}.layer`);
      setStatus(`Saved layer (${bytes.byteLength.toLocaleString()} bytes).`);
    } catch (e) {
      setStatus(`Save layer failed: ${(e as Error).message}`);
    }
  };
  const doSavePdf = async (mode: PdfSaveMode) => {
    setMenu(false);
    if (!targetId) return;
    try {
      const bytes = await download(targetId, { mode });
      saveToDisk(bytes, `${sample().id}-${mode}.pdf`);
      setStatus(`Saved ${mode} PDF (${bytes.byteLength.toLocaleString()} bytes).`);
    } catch (e) {
      setStatus(`Save PDF failed: ${(e as Error).message}`);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setMenu((o) => !o)} style={fileBtn}>
        File ▾
      </button>
      {status && <span style={{ marginLeft: 8, fontSize: 11, color: '#666' }}>{status}</span>}
      {menu && (
        <>
          <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={menuPanel}>
            <label style={menuRow}>
              base{' '}
              <select value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
                {SAMPLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div style={menuDiv} />
            <button style={menuItem} onClick={openBase}>
              Open base (no layer)
            </button>
            <button style={menuItem} onClick={openNewLayer}>
              Open base + new layer
            </button>
            <button style={menuItem} onClick={openSavedLayer}>
              Open base + saved layer…
            </button>
            <div style={menuDiv} />
            {isLayered && (
              <button style={menuItem} onClick={doSaveLayer}>
                ⬇ Save layer
              </button>
            )}
            <button style={menuItem} disabled={!targetId} onClick={() => doSavePdf('incremental')}>
              ⬇ Save PDF · incremental
            </button>
            <button style={menuItem} disabled={!targetId} onClick={() => doSavePdf('rewrite')}>
              ⬇ Save PDF · full
            </button>
            <div style={menuDiv} />
            <button
              style={menuItem}
              disabled={!targetId}
              onClick={() => {
                setShowMeta(true);
                setMenu(false);
              }}
            >
              Document properties…
            </button>
          </div>
        </>
      )}
      {showMeta && targetId && (
        <DocumentScope id={targetId}>
          <MetadataDialog onClose={() => setShowMeta(false)} />
        </DocumentScope>
      )}
    </div>
  );
}

const EDITABLE = ['title', 'author', 'subject', 'keywords', 'creator', 'producer'] as const;

function MetadataDialog({ onClose }: { onClose: () => void }) {
  const { metadata, update } = useMetadata();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (metadata && !draft) {
      setDraft(Object.fromEntries(EDITABLE.map((k) => [k, metadata[k] ?? ''])));
    }
  }, [metadata, draft]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    // three-state: empty clears (null), text sets.
    const patch: MetadataPatch = {};
    for (const k of EDITABLE) patch[k] = draft[k].trim() === '' ? null : draft[k];
    try {
      await update(patch);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalBackdrop} onClick={onClose}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Document properties</h3>
        {!draft ? (
          <div style={{ color: '#888' }}>loading…</div>
        ) : (
          <>
            {EDITABLE.map((k) => (
              <label
                key={k}
                style={{ display: 'flex', alignItems: 'center', marginBottom: 8, fontSize: 12 }}
              >
                <span style={{ width: 78, color: '#555', textTransform: 'capitalize' }}>{k}</span>
                <input
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  style={{ flex: 1, padding: '4px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                />
              </label>
            ))}
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={fileBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                style={{ ...fileBtn, background: '#3858e9', color: '#fff', border: 'none' }}
                disabled={saving}
                onClick={save}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const fileBtn: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  border: '1px solid #ccc',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
};
const toolBtn = (on: boolean): React.CSSProperties => ({
  padding: '2px 8px',
  borderRadius: 4,
  border: `1px solid ${on ? '#3858e9' : '#ccc'}`,
  background: on ? '#3858e9' : '#fff',
  color: on ? '#fff' : '#333',
  cursor: 'pointer',
});
const annoSidebar: React.CSSProperties = {
  width: 224,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  borderLeft: '1px solid #e2e2e2',
  background: '#fafafa',
  fontSize: 11,
  overflowY: 'auto',
};
const annoSidebarHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '7px 10px',
  borderBottom: '1px solid #eee',
  fontWeight: 700,
  color: '#444',
  textTransform: 'capitalize',
};
const annoSidebarClose: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  color: '#999',
  fontSize: 12,
  lineHeight: 1,
  padding: 0,
};
const annoSidebarEmpty: React.CSSProperties = {
  margin: 0,
  padding: 14,
  color: '#999',
  lineHeight: 1.5,
};
const menuPanel: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  marginTop: 4,
  zIndex: 41,
  minWidth: 230,
  background: '#fff',
  border: '1px solid #d0d0d0',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,.16)',
  padding: '4px 0',
};
const menuItem: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '6px 12px',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  fontSize: 12,
  color: '#222',
  cursor: 'pointer',
};
const menuRow: React.CSSProperties = {
  display: 'block',
  padding: '6px 12px',
  fontSize: 12,
  color: '#555',
};
const menuDiv: React.CSSProperties = { height: 1, background: '#eee', margin: '4px 0' };
const modalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,.35)',
  display: 'grid',
  placeItems: 'center',
  zIndex: 50,
};
const modalCard: React.CSSProperties = {
  background: '#fff',
  borderRadius: 10,
  padding: 18,
  width: 420,
  boxShadow: '0 12px 40px rgba(0,0,0,.25)',
  font: '13px system-ui',
};

// The i18n proof: this select works while the engine is still compiling WASM.
// 'es' demonstrates a LAZY pack — fetched on first switch ('…' while in flight).
function LocaleSwitcher() {
  const t = useT();
  const { locale, locales, loading, setLocale } = useLocale();
  return (
    <select
      title={t('demo.language')}
      value={locale}
      onChange={(e) => setLocale(e.target.value)}
      style={{ font: 'inherit', marginLeft: 'auto' }}
    >
      {locales.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
          {loading === l.code ? '…' : ''}
        </option>
      ))}
    </select>
  );
}

// Live plural + params: ticks up as background opens stream into the registry.
function DocCount() {
  const { docs } = useDocuments();
  const t = useT();
  return (
    <span style={{ color: '#888' }}>{t('demo.documents', { params: { count: docs.length } })}</span>
  );
}

function Shell() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        font: '13px ui-monospace, Menlo, monospace',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 12px',
          borderBottom: '1px solid #eee',
        }}
      >
        <span style={{ fontWeight: 700, color: '#3858e9' }}>EmbedPDF v3</span>
        <FileMenu />
        <span
          title="engine selected in ./engine — switch with ?engine=local|cloud|fake"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: '#fff',
            background:
              engineMode === 'local' ? '#1a7f37' : engineMode === 'cloud' ? '#8250df' : '#9a6700',
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          {engineMode} engine
        </span>
        <DocCount />
        <LocaleSwitcher />
      </div>
      <Workspace />
    </div>
  );
}

// Fetch the sample PDFs and stream them into the registry — AFTER mount, so
// the shell never waits for them. Tabs appear one by one (watch <DocCount/>).
function OpenInitialDocuments() {
  const { open } = useDocuments();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const docs = await loadInitialDocuments();
        for (const doc of docs) {
          if (!alive) return;
          await open(doc.source, { name: doc.name });
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);
  if (!error) return null;
  return (
    <div style={{ padding: '6px 12px', color: '#c00', borderBottom: '1px solid #eee' }}>
      {t('demo.openFailed', { params: { error } })}
    </div>
  );
}

// The `fallback` shows only until kernel.start() resolves (no engine work) —
// and it sits inside the kernel provider, so even IT translates. The v2
// failure mode (a hardcoded "Initializing PDF engine…" because i18n couldn't
// exist before the engine) is structurally impossible here.
function Booting() {
  const t = useT();
  return (
    <div style={{ padding: 24, color: '#888', font: '13px ui-monospace, monospace' }}>
      {t('demo.starting')}
    </div>
  );
}

// Mount at t=0. `selectedEngine()` is a RECIPE — the Viewer boots it (wasm
// worker, fonts) on mount and destroys it on unmount, and the boot is only
// awaited by documents.open(), so the chrome, its translations, and the locale
// switcher never wait for it. useMemo keeps the recipe identity stable (Viewer
// engine is init-only).
export function App() {
  const engine = useMemo(selectedEngine, []);
  return (
    <Viewer engine={engine} plugins={plugins} fallback={<Booting />}>
      <OpenInitialDocuments />
      <Shell />
    </Viewer>
  );
}
