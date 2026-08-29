/**
 * The React view of @embedpdf/plugin-form.
 *
 * TWO fill surfaces, one plugin:
 *
 * 1. `formWidgetRenderer` — the full-viewer path. Widgets are annotations,
 *    so the fill controls plug into the annotation stack:
 *    `<AnnotationLayer renderers={[formWidgetRenderer]} />` routes every
 *    ENGAGED widget here with its live box and its baked /AP raster. The
 *    picture IS the resting control (the engine's own rendering of value,
 *    check state, borders, fonts); these components add exactly the
 *    interaction skin on top:
 *
 *      text   → picture at rest; click swaps in an <input>/<textarea> (the
 *               focused element IS the draft store — the plugin model only
 *               learns a value on commit); blur/Enter commits, the engine
 *               re-bakes the /AP, the refreshed picture replaces the editor.
 *      toggle → the picture is the whole control; click writes the toggled
 *               value; the re-baked appearance shows the new check state.
 *      choice → an invisible native <select> over the picture (v2's trick):
 *               the browser owns the dropdown, the engine owns the pixels.
 *      button → native keyboard/click target over the picture; activation is
 *               delegated to the form plugin's isolated scripting pipeline.
 *
 * 2. `<FormLayer />` — the annotation-less path (fill-only viewers with no
 *    annotation plugin): synthetic HTML controls positioned from the form
 *    model's own widget geometry. Do NOT mount it next to an AnnotationLayer
 *    wired with `formWidgetRenderer` — the controls would double up.
 *
 * Every control isolates its pointerdown from the interaction hub with a
 * NATIVE listener (the FreeText precedent): the Stage listens natively on an
 * ancestor, so React's synthetic events would run too late.
 */

// One-line-per-feature (ADAPTERS.md): registration travels with the UI.
export * from '@embedpdf/plugin-form';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { FormToken } from '@embedpdf/plugin-form';
import type {
  FillItem,
  FormFieldDTO,
  FormUiEffect,
  FormUiEffectProvider,
} from '@embedpdf/plugin-form';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import { StageToken } from '@embedpdf/plugin-stage';
import type { Rect } from '@embedpdf/core-annotation';

import { useAnnotationSelected } from './annotation';
import type { AnnotationRenderer, AnnotationRendererProps } from './annotation';
import {
  shallowArray,
  useCapability,
  useOptionalCapability,
  usePage,
  useSelector,
} from './runtime';
import type { PageContextValue } from './runtime';

/** Content rect → a view-px box (the page wrapper's own coordinate space). */
function viewBox(r: Rect, page: PageContextValue) {
  const tl = page.transform.toPixels({ x: r.x, y: r.y });
  const br = page.transform.toPixels({ x: r.x + r.width, y: r.y + r.height });
  return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y };
}

/**
 * Keep the interaction hub out of gestures that begin inside a fill control.
 * Native listener (not React's) so it runs during real DOM bubbling, before
 * the Stage's own native listener on an ancestor — same trick as FreeText.
 */
function useIsolated<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    return () => el.removeEventListener('pointerdown', stop);
  }, []);
  return ref;
}

export interface FormScriptingUiHandlers {
  alert?: (message: string, effect: Extract<FormUiEffect, { kind: 'alert' }>) => void;
  print?: (effect: Extract<FormUiEffect, { kind: 'print' }>) => void;
  gotoPage?: (page: number, effect: Extract<FormUiEffect, { kind: 'gotoPage' }>) => void;
}

/**
 * Fulfil form-script UI requests for the active document. By default alerts use
 * the browser dialog, page navigation uses the main Stage, and print delegates
 * to the browser. Pass handlers (or one raw provider) to replace that policy.
 */
export function useFormScriptingProvider(
  adapter?: FormScriptingUiHandlers | FormUiEffectProvider,
): void {
  const form = useOptionalCapability(FormToken);
  const stage = useOptionalCapability(StageToken);
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  useEffect(() => {
    if (!form) return;
    const provider: FormUiEffectProvider = (effect) => {
      const current = adapterRef.current;
      if (typeof current === 'function') {
        current(effect);
        return;
      }
      switch (effect.kind) {
        case 'alert':
          if (current?.alert) current.alert(effect.message, effect);
          else if (typeof globalThis.alert === 'function') globalThis.alert(effect.message);
          break;
        case 'gotoPage':
          if (current?.gotoPage) current.gotoPage(effect.page, effect);
          else stage?.goToPage(effect.page);
          break;
        case 'print':
          if (current?.print) current.print(effect);
          else if (typeof globalThis.print === 'function') globalThis.print();
          break;
      }
    };
    form.setUiEffectProvider(provider);
    return () => form.setUiEffectProvider(null);
  }, [form, stage]);
}

/* ══════════════════════════ behavior widgets ══════════════════════════ */

/** The baked /AP raster, blitted by its OWN box (exactly like BakedImage). */
function Picture({
  page,
  appearance,
  apBox,
  frame,
  hidden,
}: {
  page: PageContextValue;
  appearance: { url: string; box: Rect } | null;
  /** The item's live AP box — wins over the fetched box when present. */
  apBox?: Rect;
  /** The positioned wrapper this renders INSIDE (its view box) — the blit is
   *  page-frame, so subtract the wrapper's origin. Omit when rendering
   *  directly in the layer container. */
  frame?: { left: number; top: number };
  hidden?: boolean;
}) {
  if (!appearance) return null;
  const b = viewBox(apBox ?? appearance.box, page);
  return (
    <img
      src={appearance.url}
      alt=""
      draggable={false}
      style={{
        position: 'absolute',
        left: b.left - (frame?.left ?? 0),
        top: b.top - (frame?.top ?? 0),
        width: b.width,
        height: b.height,
        // Content-unit sizing; a global `img { max-width: 100% }` reset would
        // otherwise clamp it to the containing block and distort the blit.
        maxWidth: 'none',
        pointerEvents: 'none',
        visibility: hidden ? 'hidden' : 'visible',
      }}
    />
  );
}

interface WidgetProps<C extends FillItem['control']> {
  fill: Extract<FillItem, { control: C }>;
  item: AnnotationRendererProps['item'];
  page: PageContextValue;
  appearance: AnnotationRendererProps['appearance'];
}

/**
 * Dispatch one engaged widget to its fill control. The FIELD plane (value,
 * behavior, disabled) comes from the form plugin's single-widget projection;
 * the WIDGET plane (live box, /DA font, baked raster) rides in on the
 * renderer props — no geometry is read from the form model here.
 */
function FormWidget({ item, page, appearance }: AnnotationRendererProps) {
  const annot = item.ref?.kind === 'objectNumber' ? item.ref.annotObjectNumber : 0;
  // Reference-stable per model change, so the default Object.is equality holds.
  const fill = useSelector(FormToken, (c) => (annot > 0 ? c.fillItem(annot) : null));
  // Field plane not loaded (or no fill control for this family) → picture only.
  if (!fill) return <Picture page={page} appearance={appearance} apBox={item.apBox} />;
  switch (fill.control) {
    case 'text':
      return <TextWidget fill={fill} item={item} page={page} appearance={appearance} />;
    case 'toggle':
      return <ToggleWidget fill={fill} item={item} page={page} appearance={appearance} />;
    case 'choice':
      return <ChoiceWidget fill={fill} item={item} page={page} appearance={appearance} />;
    case 'button':
      return <ButtonWidget fill={fill} item={item} page={page} appearance={appearance} />;
  }
}

function ButtonWidget({ fill, item, page, appearance }: WidgetProps<'button'>) {
  const form = useCapability(FormToken);
  const wrap = useIsolated<HTMLButtonElement>();
  const b = viewBox(item.box, page);
  return (
    <button
      ref={wrap}
      type="button"
      aria-label={fill.label}
      disabled={fill.disabled}
      onClick={() => {
        if (item.ref) void form.activateWidget(fill.key, item.ref);
      }}
      style={{
        position: 'absolute',
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        boxSizing: 'border-box',
        padding: 0,
        border: 0,
        background: 'transparent',
        cursor: fill.disabled ? 'default' : 'pointer',
        pointerEvents: fill.disabled ? 'none' : 'auto',
      }}
    >
      <Picture page={page} appearance={appearance} apBox={item.apBox} frame={b} />
    </button>
  );
}

function TextWidget({ fill, item, page, appearance }: WidgetProps<'text'>) {
  const form = useCapability(FormToken);
  const wrap = useIsolated<HTMLDivElement>();
  // The editor is ALWAYS MOUNTED (v2's pattern): transparent over the picture
  // at rest, visible while focused. That makes the DOM the focus manager —
  // native Tab order reaches every field, focus enters edit, blur commits —
  // with zero focus machinery of our own. The focused element holds the
  // draft; the plugin model only learns a value on commit (see model.ts).
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(fill.value);
  const cancelled = useRef(false);
  // Adopt engine truth whenever it changes under us — but never mid-edit.
  useEffect(() => {
    if (!focused) setDraft(fill.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill.value, focused]);

  const b = viewBox(item.box, page);
  const scale = item.box.width > 0 ? b.width / item.box.width : 1;

  // /DA font, scaled to view px. Size 0 means "auto" in PDF: approximate with
  // the box height for a single line, Acrobat's 12pt default for multiline.
  const fontSize =
    item.text && item.text.fontSize > 0
      ? item.text.fontSize * scale
      : fill.multiline
        ? 12 * scale
        : Math.max(6, b.height * 0.72);
  const editorStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    border: 'none',
    outline: focused ? '2px solid rgba(66, 133, 244, 0.8)' : 'none',
    outlineOffset: -2,
    padding: '0 2px',
    margin: 0,
    background: item.style.interiorColor ?? '#fff',
    color: item.text?.fontColor ?? '#000',
    fontFamily: item.text?.fontFamily ?? 'Helvetica, Arial, sans-serif',
    fontSize,
    textAlign: item.text?.textAlign ?? 'left',
    resize: 'none',
    cursor: 'text',
    opacity: focused ? 1 : 0, // rest: the engine's picture IS the field
  };
  const editorProps = {
    value: draft,
    maxLength: fill.maxLength ?? undefined,
    'aria-label': fill.label,
    disabled: fill.disabled,
    onFocus: () => setFocused(true),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: () => {
      setFocused(false);
      if (cancelled.current) {
        cancelled.current = false;
        setDraft(fill.value);
        return;
      }
      if (draft !== fill.value) void form.setText(fill.key, draft);
    },
    style: editorStyle,
  };
  const onKeys = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      cancelled.current = true;
      e.currentTarget.blur();
    }
    if (e.key === 'Enter' && !fill.multiline) e.currentTarget.blur(); // blur commits
  };

  return (
    <div
      ref={wrap}
      style={{
        position: 'absolute',
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        pointerEvents: fill.disabled ? 'none' : 'auto',
      }}
    >
      <Picture page={page} appearance={appearance} apBox={item.apBox} frame={b} hidden={focused} />
      {fill.multiline ? (
        <textarea {...editorProps} onKeyDown={onKeys} />
      ) : (
        <input {...editorProps} type={fill.password ? 'password' : 'text'} onKeyDown={onKeys} />
      )}
    </div>
  );
}

function ToggleWidget({ fill, item, page, appearance }: WidgetProps<'toggle'>) {
  const form = useCapability(FormToken);
  const wrap = useIsolated<HTMLDivElement>();
  const [focused, setFocused] = useState(false);
  const b = viewBox(item.box, page);
  const toggle = () => {
    if (fill.disabled) return;
    // Checkbox: click toggles on/off (null clears). Radio: click always
    // selects its own on-state — no untoggle, per PDF/Acrobat convention.
    void form.toggle(fill.key, fill.kind === 'checkbox' && fill.checked ? null : fill.onState);
  };
  return (
    <div
      ref={wrap}
      role={fill.kind === 'checkbox' ? 'checkbox' : 'radio'}
      aria-checked={fill.checked}
      aria-label={fill.label}
      tabIndex={fill.disabled ? -1 : 0}
      onClick={toggle}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          toggle();
        }
      }}
      style={{
        position: 'absolute',
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        cursor: fill.disabled ? 'default' : 'pointer',
        pointerEvents: fill.disabled ? 'none' : 'auto',
        outline: focused ? '2px solid rgba(66, 133, 244, 0.8)' : 'none',
        outlineOffset: -2,
      }}
    >
      <Picture page={page} appearance={appearance} apBox={item.apBox} frame={b} />
    </div>
  );
}

function ChoiceWidget({ fill, item, page, appearance }: WidgetProps<'choice'>) {
  const form = useCapability(FormToken);
  const wrap = useIsolated<HTMLDivElement>();
  const [focused, setFocused] = useState(false);
  const b = viewBox(item.box, page);
  const multiple = fill.kind === 'list' && fill.multi;
  return (
    <div
      ref={wrap}
      style={{
        position: 'absolute',
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        pointerEvents: fill.disabled ? 'none' : 'auto',
        outline: focused ? '2px solid rgba(66, 133, 244, 0.8)' : 'none',
        outlineOffset: -2,
      }}
    >
      <Picture page={page} appearance={appearance} apBox={item.apBox} frame={b} />
      {/* v2's trick: an invisible NATIVE select owns the dropdown/keyboard;
          the engine's baked appearance stays the visible value. Keyed +
          uncontrolled so an in-flight write never snaps the selection back. */}
      <select
        key={fill.selected.join('\0')}
        multiple={multiple}
        size={fill.kind === 'list' ? Math.max(2, fill.options.length) : undefined}
        defaultValue={multiple ? fill.selected : (fill.selected[0] ?? '')}
        aria-label={fill.label}
        disabled={fill.disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const values = Array.from(e.currentTarget.selectedOptions).map((o) => o.value);
          void form.choose(fill.key, values);
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: fill.disabled ? 'default' : 'pointer',
        }}
      >
        {fill.options.map((o, i) => (
          <option key={i} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The form plugin's renderer entry, ready for
 * `<AnnotationLayer renderers={[formWidgetRenderer]} />`. It answers for the
 * PLUGIN-registered 'form-widgets' Behavior — the form plugin decides when
 * widgets are fill controls vs. editable annotations, never the app.
 */
export const formWidgetRenderer: AnnotationRenderer = {
  behavior: 'form-widgets',
  component: FormWidget,
};

/* ══════════════════════ standalone layer (no annotations) ══════════════════ */

const controlBase: React.CSSProperties = {
  position: 'absolute',
  boxSizing: 'border-box',
  border: '1px solid rgba(56, 88, 233, 0.55)',
  background: 'rgba(255, 255, 255, 0.92)',
  borderRadius: 2,
  font: 'inherit',
};

const fillBox = (item: FillItem, page: PageContextValue) => viewBox(item.box, page);

/** Text control: keystrokes stay LOCAL (the input is the draft store);
 *  the engine write happens on blur or Enter. */
function FillText({
  item,
  page,
}: {
  item: Extract<FillItem, { control: 'text' }>;
  page: PageContextValue;
}) {
  const form = useCapability(FormToken);
  const [draft, setDraft] = useState(item.value);
  // Adopt engine truth whenever it changes under us (remote edit, reset).
  useEffect(() => setDraft(item.value), [item.value]);

  const css = fillBox(item, page);
  const fontSize = Math.max(9, Math.min(css.height * 0.62, 24));
  const commit = () => {
    if (draft !== item.value) void form.setText(item.key, draft).catch(() => setDraft(item.value));
  };
  const shared: React.CSSProperties = {
    ...controlBase,
    ...css,
    fontSize,
    padding: '0 3px',
    ...(item.comb ? { letterSpacing: css.width / Math.max(1, item.maxLength ?? 1) / 2 } : {}),
  };
  return item.multiline ? (
    <textarea
      aria-label={item.label}
      value={draft}
      disabled={item.disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      style={{ ...shared, resize: 'none' }}
    />
  ) : (
    <input
      aria-label={item.label}
      type={item.password ? 'password' : 'text'}
      value={draft}
      maxLength={item.maxLength ?? undefined}
      disabled={item.disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      style={shared}
    />
  );
}

function FillToggle({
  item,
  page,
}: {
  item: Extract<FillItem, { control: 'toggle' }>;
  page: PageContextValue;
}) {
  const form = useCapability(FormToken);
  const css = fillBox(item, page);
  const glyphSize = Math.min(css.width, css.height) * 0.72;
  return (
    <button
      role={item.kind}
      aria-checked={item.checked}
      aria-label={item.label}
      disabled={item.disabled}
      onClick={() =>
        // Checkbox re-click clears; radio click always selects its state.
        void form.toggle(item.key, item.kind === 'checkbox' && item.checked ? null : item.onState)
      }
      style={{
        ...controlBase,
        ...css,
        cursor: item.disabled ? 'default' : 'pointer',
        display: 'grid',
        placeItems: 'center',
        padding: 0,
        borderRadius: item.kind === 'radio' ? '50%' : 2,
        fontSize: glyphSize,
        lineHeight: 1,
        color: '#1f2a44',
      }}
    >
      {item.checked ? (item.kind === 'radio' ? '●' : '✓') : ''}
    </button>
  );
}

function FillChoice({
  item,
  page,
}: {
  item: Extract<FillItem, { control: 'choice' }>;
  page: PageContextValue;
}) {
  const form = useCapability(FormToken);
  const css = fillBox(item, page);
  return (
    <select
      aria-label={item.label}
      multiple={item.multi}
      disabled={item.disabled}
      value={item.multi ? item.selected : (item.selected[0] ?? '')}
      onChange={(e) => {
        const values = item.multi
          ? Array.from(e.target.selectedOptions).map((o) => o.value)
          : [e.target.value];
        void form.choose(item.key, values);
      }}
      style={{ ...controlBase, ...css, fontSize: Math.max(9, Math.min(css.height * 0.55, 18)) }}
    >
      {!item.multi && item.selected.length === 0 && <option value="" />}
      {item.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function FillButton({
  item,
  page,
}: {
  item: Extract<FillItem, { control: 'button' }>;
  page: PageContextValue;
}) {
  const form = useCapability(FormToken);
  const css = fillBox(item, page);
  return (
    <button
      type="button"
      aria-label={item.label}
      disabled={item.disabled}
      onClick={() =>
        void form.activateWidget(item.key, {
          kind: 'objectNumber',
          pageObjectNumber: page.pon,
          annotObjectNumber: item.annotObjectNumber,
        })
      }
      style={{
        ...controlBase,
        ...css,
        padding: 0,
        border: 0,
        background: 'transparent',
        cursor: item.disabled ? 'default' : 'pointer',
      }}
    />
  );
}

/**
 * Fill-mode form controls for one page, positioned from the form model's own
 * widget geometry — the ANNOTATION-LESS path (a fill-only viewer whose page
 * pixels come from an annotated RenderLayer raster). Active whenever the
 * active tool carries the 'form-fill' tag (the built-in pointer/pan tools
 * do); any other tool stands the controls down. Do not mount next to an
 * AnnotationLayer wired with `formWidgetBehaviors`.
 */
export function FormLayer() {
  const page = usePage();
  const form = useCapability(FormToken);
  const active = useSelector(InteractionToken, (c) => c.activeTool().enables.has('form-fill'));

  useEffect(() => {
    if (active) form.ensureGeom(page.pon);
  }, [active, form, page.pon]);

  const items = useSelector(FormToken, (c) => c.fillItems(page.pon), shallowArray);
  if (!active) return null;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {items.map((item) =>
        item.control === 'text' ? (
          <FillText key={`${item.key}:${item.annotObjectNumber}`} item={item} page={page} />
        ) : item.control === 'toggle' ? (
          <FillToggle key={`${item.key}:${item.annotObjectNumber}`} item={item} page={page} />
        ) : item.control === 'choice' ? (
          <FillChoice key={`${item.key}:${item.annotObjectNumber}`} item={item} page={page} />
        ) : item.control === 'button' ? (
          <FillButton key={`${item.key}:${item.annotObjectNumber}`} item={item} page={page} />
        ) : null,
      )}
    </div>
  );
}

/* ═══════════════════════════════ hooks ═══════════════════════════════ */

/** The form capability — values, interchange, design-mode verbs. */
export function useForm() {
  return useCapability(FormToken);
}

/** The reconciled form snapshot (null until the first load lands),
 *  re-rendering on every form model change. */
export function useFormSnapshot() {
  return useSelector(FormToken, (c) => c.snapshot());
}

/**
 * The FIELD behind the currently selected widget annotation (single
 * selection), or null. The design-mode join: widget selection lives in the
 * annotation plane, field properties live here.
 */
export function useFormField(): FormFieldDTO | null {
  const selected = useAnnotationSelected();
  const widget = selected.length === 1 && selected[0]!.subtype === 'widget' ? selected[0]! : null;
  const objnum = widget && widget.ref.kind === 'objectNumber' ? widget.ref.annotObjectNumber : 0;
  return useSelector(FormToken, (c) => (objnum > 0 ? c.fieldForWidget(objnum) : null));
}
