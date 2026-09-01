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
 *      combo  → an invisible native <select> over the picture: the browser
 *               owns the dropdown, the engine owns the resting pixels.
 *      list   → a visible native <select>: one surface owns pixels, row
 *               hit-testing, keyboard selection, and scrolling.
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PdfAnnotationEventKind } from '@embedpdf/plugin-actions/contract';
import type { AnnotationRef } from '@embedpdf/plugin-annotation/contract';
import { FormToken } from '@embedpdf/plugin-form';
import type {
  FillItem,
  FormFieldDTO,
} from '@embedpdf/plugin-form';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import type { Rect } from '@embedpdf/core-annotation';

import { useAnnotationSelected } from './annotation-hooks';
import type { AnnotationRenderer, AnnotationRendererProps } from './annotation';
import {
  shallowArray,
  useCapability,
  useOptionalCapability,
  usePage,
  useSelector,
} from './runtime';
import type { PageContextValue } from './runtime';
import { FormFocusRing } from './form-focus-ring';
import { NativeListBox } from './form-listbox';

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

/**
 * The widget DOM-event feed (Phase 2): wire one widget surface's pointer and
 * focus events to `form.notifyWidgetEvent` — the `/AA` E/X/D/U/Fo/Bl trigger
 * door. Handlers live on the ALWAYS-ACTIVE event surface, never the inner
 * control: "may edit this field" and "may receive PDF action events" are
 * different rights, and a read-only session (no `doc.forms.fill`) must still
 * see hover tooltips (session Hide needs no write authority).
 */
function useWidgetEvents(
  key: string,
  annotationRef: AnnotationRef | null,
): Pick<
  React.DOMAttributes<HTMLElement>,
  'onPointerEnter' | 'onPointerLeave' | 'onPointerDown' | 'onPointerUp' | 'onFocus' | 'onBlur'
> {
  const form = useCapability(FormToken);
  const refBox = useRef(annotationRef);
  refBox.current = annotationRef;
  return useMemo(() => {
    const notify = (event: PdfAnnotationEventKind) => {
      const target = refBox.current;
      if (target) form.notifyWidgetEvent(key, target, event);
    };
    return {
      onPointerEnter: () => notify('cursorEnter'),
      onPointerLeave: () => notify('cursorExit'),
      onPointerDown: () => notify('mouseDown'),
      onPointerUp: () => notify('mouseUp'),
      // React focus/blur bubble (focusin semantics), so the inner control's
      // focus reaches this surface; blur fires AFTER the control's own
      // commit handler, so a /Bl script always sees the committed value.
      onFocus: () => notify('focus'),
      onBlur: () => notify('blur'),
    };
  }, [form, key]);
}

/**
 * Widget ACTIVATION: a click on ANY widget runs its `/A`. ISO puts the
 * activate action on the annotation dictionary — any subtype, any field
 * type — so activation is a WIDGET behavior, not a push-button behavior:
 * real-world producers ship "buttons" as read-only text fields carrying an
 * `/A` (the Test Lab's Reset/Next/Hide controls), and Acrobat runs them.
 * A widget without an `/A` resolves inert — dispatching is the cheap,
 * honest way to ask (the dispatcher owns `/A`-vs-`/AA U` precedence).
 * Push buttons keep their own gated door: `disabled` still blocks
 * activation there — unchanged shipped semantics.
 */
function useWidgetActivation(key: string, annotationRef: AnnotationRef | null): () => void {
  const form = useCapability(FormToken);
  const refBox = useRef(annotationRef);
  refBox.current = annotationRef;
  return useCallback(() => {
    const target = refBox.current;
    if (target) void form.activateWidget(key, target);
  }, [form, key]);
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
  const wrap = useIsolated<HTMLDivElement>();
  const events = useWidgetEvents(fill.key, item.ref);
  const b = viewBox(item.box, page);
  // The OUTER div is the event surface — always pointer-active so /AA hover
  // and pointer triggers fire even for a disabled/read-only button; the
  // inner button keeps `disabled` as the ACTIVATION gate only.
  return (
    <div
      ref={wrap}
      {...events}
      style={{
        position: 'absolute',
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        cursor: fill.disabled ? 'default' : 'pointer',
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        aria-label={fill.label}
        disabled={fill.disabled}
        onClick={() => {
          if (item.ref) void form.activateWidget(fill.key, item.ref);
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          padding: 0,
          border: 0,
          background: 'transparent',
          cursor: 'inherit',
          // The event surface is the wrapper; a disabled button must not
          // swallow the pointer stream before it bubbles.
          pointerEvents: fill.disabled ? 'none' : 'auto',
        }}
      >
        <Picture page={page} appearance={appearance} apBox={item.apBox} frame={b} />
      </button>
    </div>
  );
}

function TextWidget({ fill, item, page, appearance }: WidgetProps<'text'>) {
  const form = useCapability(FormToken);
  const wrap = useIsolated<HTMLDivElement>();
  const events = useWidgetEvents(fill.key, item.ref);
  const activate = useWidgetActivation(fill.key, item.ref);
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
    // A DISABLED control suppresses click events entirely — it must not
    // swallow the stream before it reaches the wrapper, which owns /A
    // activation (the read-only "fake button" pattern) and the /AA feed.
    ...(fill.disabled ? { pointerEvents: 'none' as const } : {}),
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
      {...events}
      // ANY widget click runs its /A (see useWidgetActivation): an editable
      // field's focus click bubbles here (Acrobat runs /A on that click
      // too); a read-only field's click lands here directly (the disabled
      // editor is pointer-transparent) — the fake-button pattern.
      onClick={activate}
      style={{
        position: 'absolute',
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        // Always the event surface (see useWidgetEvents); the editor's own
        // `disabled` keeps read-only fields uneditable and unfocusable.
        pointerEvents: 'auto',
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
  const events = useWidgetEvents(fill.key, item.ref);
  const activate = useWidgetActivation(fill.key, item.ref);
  const [focused, setFocused] = useState(false);
  const b = viewBox(item.box, page);
  const press = () => {
    // Checkbox: click toggles on/off (null clears). Radio: click always
    // selects its own on-state — no untoggle, per PDF/Acrobat convention.
    // Acrobat's order: the VALUE change first, THEN the /A — so an /A
    // script reads the post-toggle state. A read-only toggle still
    // activates (it just doesn't flip).
    const flipped = fill.disabled
      ? undefined
      : form.toggle(fill.key, fill.kind === 'checkbox' && fill.checked ? null : fill.onState);
    void Promise.resolve(flipped).then(activate, activate);
  };
  return (
    <div
      ref={wrap}
      role={fill.kind === 'checkbox' ? 'checkbox' : 'radio'}
      aria-checked={fill.checked}
      aria-label={fill.label}
      tabIndex={fill.disabled ? -1 : 0}
      {...events}
      onClick={press}
      onFocus={(e) => {
        setFocused(true);
        events.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        events.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          press();
        }
      }}
      style={{
        position: 'absolute',
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        cursor: fill.disabled ? 'default' : 'pointer',
        pointerEvents: 'auto', // always the event surface; toggle() self-gates
      }}
    >
      <Picture page={page} appearance={appearance} apBox={item.apBox} frame={b} />
      <FormFocusRing visible={focused} />
    </div>
  );
}

function ChoiceWidget(props: WidgetProps<'choice'>) {
  return props.fill.kind === 'list' ? <ListBoxWidget {...props} /> : <ComboBoxWidget {...props} />;
}

function ChoiceFrame({
  fill,
  item,
  page,
  focused,
  innerRef,
  children,
}: Pick<WidgetProps<'choice'>, 'fill' | 'item' | 'page'> & {
  focused: boolean;
  innerRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const events = useWidgetEvents(fill.key, item.ref);
  const activate = useWidgetActivation(fill.key, item.ref);
  const b = viewBox(item.box, page);
  return (
    <div
      ref={innerRef}
      {...events}
      onClick={activate}
      style={{
        position: 'absolute',
        left: b.left,
        top: b.top,
        width: b.width,
        height: b.height,
        pointerEvents: 'auto',
      }}
    >
      {children}
      <FormFocusRing visible={focused} />
    </div>
  );
}

function ComboBoxWidget({ fill, item, page, appearance }: WidgetProps<'choice'>) {
  const form = useCapability(FormToken);
  const wrap = useIsolated<HTMLDivElement>();
  const [focused, setFocused] = useState(false);
  const b = viewBox(item.box, page);
  return (
    <ChoiceFrame fill={fill} item={item} page={page} focused={focused} innerRef={wrap}>
      <Picture page={page} appearance={appearance} apBox={item.apBox} frame={b} />
      {/* A combo's popup is separate from its resting box, so the baked
          appearance and transparent native trigger do not maintain competing
          in-place row geometry or scroll state. */}
      <select
        key={fill.selected.join('\0')}
        defaultValue={fill.selected[0] ?? ''}
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
          // A disabled control suppresses clicks — the frame owns /A
          // activation and must still receive them.
          ...(fill.disabled ? { pointerEvents: 'none' as const } : {}),
        }}
      >
        {fill.options.map((o, i) => (
          <option key={i} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </ChoiceFrame>
  );
}

function ListBoxWidget({ fill, item, page }: WidgetProps<'choice'>) {
  const form = useCapability(FormToken);
  const wrap = useIsolated<HTMLDivElement>();
  const [focused, setFocused] = useState(false);
  const b = viewBox(item.box, page);
  const scale = item.box.width > 0 ? b.width / item.box.width : 1;
  const strokeWidth = item.style.strokeWidth * scale;
  const borderStyle = item.style.border.kind === 'dashed' ? 'dashed' : 'solid';
  return (
    <ChoiceFrame fill={fill} item={item} page={page} focused={focused} innerRef={wrap}>
      <NativeListBox
        ariaLabel={fill.label}
        disabled={fill.disabled}
        multi={fill.multi}
        options={fill.options}
        selected={fill.selected}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSelect={(values) => form.choose(fill.key, values)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          margin: 0,
          padding: 0,
          borderWidth: strokeWidth,
          borderStyle,
          borderColor: item.style.color,
          borderRadius: 0,
          outline: 'none',
          background: item.style.interiorColor ?? '#fff',
          color: item.text?.fontColor ?? '#000',
          fontFamily: item.text?.fontFamily ?? 'Helvetica, Arial, sans-serif',
          fontSize: (item.text?.fontSize || 12) * scale,
          textAlign: item.text?.textAlign ?? 'left',
          cursor: fill.disabled ? 'default' : 'pointer',
          // A disabled control suppresses clicks — the frame owns /A
          // activation and must still receive them.
          ...(fill.disabled ? { pointerEvents: 'none' as const } : {}),
        }}
      />
    </ChoiceFrame>
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

/** The standalone layer's event surface: positions ONE control's box and
 *  carries the /AA DOM-event feed — always pointer-active (see
 *  useWidgetEvents); the control inside fills it and self-gates edits.
 *  With `activate`, a click on the box runs the widget's /A (see
 *  useWidgetActivation — activation is a WIDGET behavior); push buttons
 *  keep their own gated inner door and do NOT set it. */
function FillEventBox({
  item,
  page,
  cursor,
  activate,
  children,
}: {
  item: FillItem;
  page: PageContextValue;
  cursor?: string;
  activate?: boolean;
  children: React.ReactNode;
}) {
  const events = useWidgetEvents(item.key, {
    kind: 'objectNumber',
    pageObjectNumber: page.pon,
    annotObjectNumber: item.annotObjectNumber,
  });
  const onActivate = useWidgetActivation(item.key, {
    kind: 'objectNumber',
    pageObjectNumber: page.pon,
    annotObjectNumber: item.annotObjectNumber,
  });
  const css = fillBox(item, page);
  return (
    <div
      {...events}
      onClick={activate ? onActivate : undefined}
      style={{ position: 'absolute', ...css, pointerEvents: 'auto', ...(cursor ? { cursor } : {}) }}
    >
      {children}
    </div>
  );
}

const fillControl: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
};

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
    ...fillControl,
    fontSize,
    padding: '0 3px',
    ...(item.comb ? { letterSpacing: css.width / Math.max(1, item.maxLength ?? 1) / 2 } : {}),
  };
  // A disabled control suppresses clicks — the box owns /A activation and
  // must still receive them (the read-only "fake button" pattern).
  const editorGate = item.disabled ? ({ pointerEvents: 'none' } as const) : {};
  return (
    <FillEventBox item={item} page={page} activate>
      {item.multiline ? (
        <textarea
          aria-label={item.label}
          value={draft}
          disabled={item.disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          style={{ ...shared, resize: 'none', ...editorGate }}
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
          style={{ ...shared, ...editorGate }}
        />
      )}
    </FillEventBox>
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
  const activate = useWidgetActivation(item.key, {
    kind: 'objectNumber',
    pageObjectNumber: page.pon,
    annotObjectNumber: item.annotObjectNumber,
  });
  const css = fillBox(item, page);
  const glyphSize = Math.min(css.width, css.height) * 0.72;
  return (
    // `activate` covers the DISABLED path (pointer-transparent button → the
    // box click activates without toggling — a read-only toggle's /A still
    // runs); the enabled button below chains toggle-then-/A itself and
    // stops propagation so the click never double-activates.
    <FillEventBox item={item} page={page} cursor={item.disabled ? 'default' : 'pointer'} activate>
    <button
      role={item.kind}
      aria-checked={item.checked}
      aria-label={item.label}
      disabled={item.disabled}
      onClick={(e) => {
        e.stopPropagation();
        // Checkbox re-click clears; radio click always selects its state.
        // Acrobat's order: the VALUE change first, THEN the /A.
        void Promise.resolve(
          form.toggle(item.key, item.kind === 'checkbox' && item.checked ? null : item.onState),
        ).then(activate, activate);
      }}
      style={{
        ...controlBase,
        ...fillControl,
        cursor: 'inherit',
        display: 'grid',
        placeItems: 'center',
        padding: 0,
        borderRadius: item.kind === 'radio' ? '50%' : 2,
        fontSize: glyphSize,
        lineHeight: 1,
        color: '#1f2a44',
        // A disabled control suppresses clicks — the box must receive them.
        ...(item.disabled ? { pointerEvents: 'none' as const } : {}),
      }}
    >
      {item.checked ? (item.kind === 'radio' ? '●' : '✓') : ''}
    </button>
    </FillEventBox>
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
  // A disabled control suppresses clicks — the box owns /A activation and
  // must still receive them.
  const controlGate = item.disabled ? ({ pointerEvents: 'none' } as const) : {};
  if (item.kind === 'list') {
    return (
      <FillEventBox item={item} page={page} activate>
        <NativeListBox
          ariaLabel={item.label}
          disabled={item.disabled}
          multi={item.multi}
          options={item.options}
          selected={item.selected}
          onSelect={(values) => form.choose(item.key, values)}
          style={{
            ...controlBase,
            ...fillControl,
            fontSize: Math.max(9, Math.min(css.height * 0.55, 18)),
            ...controlGate,
          }}
        />
      </FillEventBox>
    );
  }
  return (
    <FillEventBox item={item} page={page} activate>
      <select
        aria-label={item.label}
        disabled={item.disabled}
        value={item.selected[0] ?? ''}
        onChange={(e) => void form.choose(item.key, [e.target.value])}
        style={{
          ...controlBase,
          ...fillControl,
          fontSize: Math.max(9, Math.min(css.height * 0.55, 18)),
          ...controlGate,
        }}
      >
        {item.selected.length === 0 && <option value="" />}
        {item.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FillEventBox>
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
  return (
    <FillEventBox item={item} page={page} cursor={item.disabled ? 'default' : 'pointer'}>
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
          ...fillControl,
          padding: 0,
          border: 0,
          background: 'transparent',
          cursor: 'inherit',
          // Events live on the box; a disabled button must not swallow them.
          pointerEvents: item.disabled ? 'none' : 'auto',
        }}
      />
    </FillEventBox>
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
