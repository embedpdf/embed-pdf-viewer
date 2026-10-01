/**
 * The React view of @embedpdf/plugin-form.
 *
 * `<FormLayer />` puts a real HTML control over each field box of its page,
 * with or without the annotation plugin. The field's own picture, the
 * engine's drawing of its value, borders and fonts, is drawn below it: by the
 * `<RenderLayer>` raster, or by the `<AnnotationLayer>` while the form plugin
 * keeps widgets inert for filling. The controls add what people interact
 * with on top of it:
 *
 *   text   → the picture at rest; focus shows an editor in the field's font
 *            (the plugin keeps what is typed, so a download writes it);
 *            blur or Enter commits, Escape puts the value back.
 *   toggle → the picture is the control; a click writes the toggled value.
 *   combo  → an invisible native <select> over the picture: the browser
 *            owns the dropdown, the engine the resting pixels.
 *   list   → a visible native <select>: one surface owns the rows, the
 *            keyboard and the scrolling.
 *   button → a native click target over the picture; activation runs the
 *            widget's action.
 *
 * What the viewer draws itself (the focus ring, the edge of a field without a
 * border, the editor) takes its colors from the form settings, which the
 * `--epdf-form-*` CSS variables override.
 *
 * Every control keeps its pointerdown from the interaction hub with a native
 * listener: the Stage listens natively on an ancestor, so React's synthetic
 * events would run too late.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-form';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventHook } from '@embedpdf/core';
import type { PdfAnnotationEventKind } from '@embedpdf/plugin-actions/contract';
import type { AnnotationRef } from '@embedpdf/plugin-annotation/contract';
import {
  FormToken,
  formState,
  type FormCapability,
  type FormFieldRef,
  type FormFieldValue,
  type FormWidgetItem,
  type FormWidgetLook,
} from '@embedpdf/plugin-form';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { SignatureToken } from '@embedpdf/plugin-signature/contract';
import { mixAccent, paint } from '@embedpdf/web';

import { NativeListBox } from './form-listbox';
import { FormFocusRing } from './form-focus-ring';
import {
  shallowArray,
  useCapability,
  useCapabilityEvent,
  useDocumentScope,
  useKernelValue,
  useOptionalCapability,
  useOptionalSelector,
  usePage,
  useSelector,
  useViewerSettings,
} from './runtime';
import type { PageContextValue } from './runtime';
import { settingsHook, stateHook } from './state';

// ── what every control shares ──────────────────────────────────────────────

/** The colors the viewer draws with, each its CSS variable first, then the setting. */
interface FormColors {
  focus: string;
  border: string;
  background: string;
  text: string;
}

function useFormColors(): FormColors {
  const accent = useViewerSettings((settings) => settings.accent);
  const focus = useFormSettings((settings) => settings.focus);
  const fields = useFormSettings((settings) => settings.fields);
  return useMemo(
    () => ({
      focus: paint('form-focus', focus.color ?? accent),
      border: paint('form-field-border', fields.border ?? mixAccent('form-field-border', accent)),
      background: paint('form-field-background', fields.background),
      text: paint('form-field-color', fields.color),
    }),
    [accent, focus, fields],
  );
}

/** A widget's page-space box as view pixels, in the page wrapper's own coordinates. */
function viewBox(item: FormWidgetItem, page: PageContextValue) {
  const { box } = item;
  const topLeft = page.transform.toPixels({ x: box.x, y: box.y });
  const bottomRight = page.transform.toPixels({ x: box.x + box.width, y: box.y + box.height });
  return {
    left: topLeft.x,
    top: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

/** One of the 14 standard PDF fonts as CSS: a family that looks like it, its weight and style. */
function cssFont(look: FormWidgetLook): Pick<
  React.CSSProperties,
  'fontFamily' | 'fontWeight' | 'fontStyle'
> {
  const name = look.fontFamily ?? 'helvetica';
  const fontFamily = name.startsWith('courier')
    ? '"Courier New", Courier, monospace'
    : name.startsWith('times')
      ? '"Times New Roman", Times, serif'
      : 'Helvetica, Arial, sans-serif';
  return {
    fontFamily,
    fontWeight: name.includes('bold') ? 700 : 400,
    fontStyle: name.includes('italic') || name.includes('oblique') ? 'italic' : 'normal',
  };
}

/**
 * The field's text size in view pixels. A size of 0 means "fit the box" in
 * PDF: the box height for one line, Acrobat's 12 pt for several.
 */
function fontSizeOf(item: FormWidgetItem, scale: number, height: number, multiline: boolean) {
  const size = item.look.fontSize;
  if (size) return size * scale;
  return multiline ? 12 * scale : Math.max(6, height * 0.72);
}

/**
 * Keep the interaction hub out of gestures that begin inside a control. A
 * native listener, not React's, so it runs during real DOM bubbling, before
 * the Stage's own native listener on an ancestor.
 */
function useIsolated<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const stop = (event: Event) => event.stopPropagation();
    element.addEventListener('pointerdown', stop);
    return () => element.removeEventListener('pointerdown', stop);
  }, []);
  return ref;
}

/**
 * The widget's pointer and focus events, sent to the actions plugin, which
 * runs the widget's `/AA` actions (enter, exit, down, up, focus, blur). They
 * live on the always-active box, never the inner control: "may edit this
 * field" and "may receive PDF action events" are different rights, and a
 * session that may not fill must still see hover tooltips.
 */
function useWidgetEvents(
  fieldRef: FormFieldRef,
  annotationRef: AnnotationRef | null,
): Pick<
  React.DOMAttributes<HTMLElement>,
  'onPointerEnter' | 'onPointerLeave' | 'onPointerDown' | 'onPointerUp' | 'onFocus' | 'onBlur'
> {
  const form = useCapability(FormHostToken);
  const refBox = useRef(annotationRef);
  refBox.current = annotationRef;
  return useMemo(() => {
    const notify = (event: PdfAnnotationEventKind) => {
      const target = refBox.current;
      if (target) form.notifyWidgetEvent(fieldRef, target, event);
    };
    return {
      onPointerEnter: () => notify('cursorEnter'),
      onPointerLeave: () => notify('cursorExit'),
      onPointerDown: () => notify('mouseDown'),
      onPointerUp: () => notify('mouseUp'),
      // React focus and blur bubble, so the inner control's focus reaches the
      // box; blur fires after the control's own commit, so a blur script
      // always sees the committed value.
      onFocus: () => notify('focus'),
      onBlur: () => notify('blur'),
    };
  }, [form, fieldRef]);
}

/**
 * A click on a widget runs its `/A` action. ISO 32000 puts the activate
 * action on the widget, whatever its field, and many forms ship "buttons" as
 * read-only text fields with an `/A` that Acrobat runs; a widget without one
 * is inert.
 */
function useWidgetActivation(annotationRef: AnnotationRef | null): () => void {
  const form = useCapability(FormHostToken);
  const refBox = useRef(annotationRef);
  refBox.current = annotationRef;
  return useCallback(() => {
    const target = refBox.current;
    if (target) void form.activateWidget(target);
  }, [form]);
}

interface ControlProps<C extends FormWidgetItem['control']> {
  item: Extract<FormWidgetItem, { control: C }>;
  page: PageContextValue;
  colors: FormColors;
}

/**
 * The positioned box every control sits in: the widget's event surface, and
 * the edge a field without a border of its own gets, so people see where to
 * fill in.
 */
function WidgetBox({
  item,
  page,
  colors,
  edge = true,
  onClick,
  children,
  ...rest
}: {
  item: FormWidgetItem;
  page: PageContextValue;
  colors: FormColors;
  edge?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'children'>) {
  const wrap = useIsolated<HTMLDivElement>();
  const events = useWidgetEvents(item.fieldRef, item.annotationRef);
  const frame = viewBox(item, page);
  return (
    <div
      ref={wrap}
      {...events}
      {...rest}
      onFocus={(event) => {
        events.onFocus?.(event);
        rest.onFocus?.(event);
      }}
      onBlur={(event) => {
        events.onBlur?.(event);
        rest.onBlur?.(event);
      }}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: frame.left,
        top: frame.top,
        width: frame.width,
        height: frame.height,
        // Always the event surface; the control inside gates the edits.
        pointerEvents: 'auto',
        boxShadow: edge && item.look.border === null ? `inset 0 0 0 1px ${colors.border}` : undefined,
        ...rest.style,
      }}
    >
      {children}
    </div>
  );
}

/** Fills the box it sits in. */
const fill: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  margin: 0,
};

// ── the controls ───────────────────────────────────────────────────────────

/** A text box: the picture at rest, an editor in the field's own font while focused. */
function TextControl({ item, page, colors }: ControlProps<'text'>) {
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(item.annotationRef);
  // The editor is always mounted, see-through at rest and shown while
  // focused: the DOM is the focus manager, so Tab reaches every field.
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(item.value);
  const cancelled = useRef(false);
  // Take the field's value whenever it changes under us, but never mid-edit.
  useEffect(() => {
    if (!focused) setDraft(item.value);
  }, [item.value, focused]);

  const frame = viewBox(item, page);
  const scale = item.box.width > 0 ? frame.width / item.box.width : 1;
  const editorStyle: React.CSSProperties = {
    ...fill,
    border: 'none',
    outline: focused ? `2px solid ${colors.focus}` : 'none',
    outlineOffset: -2,
    padding: '0 2px',
    background: item.look.background ?? colors.background,
    color: item.look.color ?? colors.text,
    ...cssFont(item.look),
    fontSize: fontSizeOf(item, scale, frame.height, item.multiline),
    textAlign: item.look.textAlign,
    letterSpacing: item.comb && item.maxLength ? frame.width / item.maxLength / 2 : undefined,
    resize: 'none',
    cursor: 'text',
    opacity: focused ? 1 : 0,
    // A disabled control swallows clicks: the box below runs the widget's
    // action, the read-only "button" pattern, so let them through.
    ...(item.disabled ? { pointerEvents: 'none' as const } : {}),
  };
  const editorProps = {
    value: draft,
    maxLength: item.maxLength ?? undefined,
    'aria-label': item.label,
    disabled: item.disabled,
    onFocus: () => setFocused(true),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(event.target.value);
      form.draftText(item.fieldRef, event.target.value);
    },
    onBlur: () => {
      setFocused(false);
      if (cancelled.current) {
        cancelled.current = false;
        form.discardDraftText(item.fieldRef);
        setDraft(item.value);
        return;
      }
      if (draft === item.value) form.discardDraftText(item.fieldRef);
      else void form.commitDraftText(item.fieldRef).catch(() => setDraft(item.value));
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === 'Escape') {
        cancelled.current = true;
        event.currentTarget.blur();
      }
      // Blur commits; a text box with several lines takes Enter as a new line.
      if (event.key === 'Enter' && !item.multiline) event.currentTarget.blur();
    },
    style: editorStyle,
  };
  return (
    // A click runs the widget's action too, as in Acrobat: the editor's
    // focus click bubbles here, a read-only field's lands here directly.
    <WidgetBox item={item} page={page} colors={colors} onClick={activate}>
      {item.multiline ? (
        <textarea {...editorProps} />
      ) : (
        <input {...editorProps} type={item.password ? 'password' : 'text'} />
      )}
    </WidgetBox>
  );
}

/** A checkbox or a radio button: the picture is the control, a click writes the toggled value. */
function ToggleControl({ item, page, colors }: ControlProps<'toggle'>) {
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(item.annotationRef);
  const [focused, setFocused] = useState(false);
  const press = () => {
    // A checkbox clicked again clears; a radio button always selects its own
    // value. The value first, then the widget's action (Acrobat's order), so
    // an action script reads the new state. A read-only toggle still runs it.
    const written = item.disabled
      ? undefined
      : form.setValue(item.fieldRef, {
          value: item.kind === 'checkbox' && item.checked ? null : item.exportValue,
        });
    void Promise.resolve(written).then(activate, activate);
  };
  return (
    <WidgetBox
      item={item}
      page={page}
      colors={colors}
      role={item.kind === 'checkbox' ? 'checkbox' : 'radio'}
      aria-checked={item.checked}
      aria-label={item.label}
      tabIndex={item.disabled ? -1 : 0}
      onClick={press}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          press();
        }
      }}
      style={{ cursor: item.disabled ? 'default' : 'pointer', outline: 'none' }}
    >
      <FormFocusRing visible={focused} color={colors.focus} />
    </WidgetBox>
  );
}

/** A dropdown: an invisible native select over the field's picture. */
function ComboControl({ item, page, colors }: ControlProps<'choice'>) {
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(item.annotationRef);
  const [focused, setFocused] = useState(false);
  return (
    <WidgetBox item={item} page={page} colors={colors} onClick={activate}>
      <select
        key={item.selected.join('\0')}
        defaultValue={item.selected[0] ?? ''}
        aria-label={item.label}
        disabled={item.disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) =>
          void form.setValue(item.fieldRef, { value: event.currentTarget.value || null })
        }
        style={{
          ...fill,
          opacity: 0,
          cursor: item.disabled ? 'default' : 'pointer',
          ...(item.disabled ? { pointerEvents: 'none' as const } : {}),
        }}
      >
        {item.selected.length === 0 && <option value="" />}
        {item.options.map((option, index) => (
          <option key={index} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FormFocusRing visible={focused} color={colors.focus} />
    </WidgetBox>
  );
}

/** A list: a visible native select in the field's own look, the settings where it has none. */
function ListControl({ item, page, colors }: ControlProps<'choice'>) {
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(item.annotationRef);
  const [focused, setFocused] = useState(false);
  const frame = viewBox(item, page);
  const scale = item.box.width > 0 ? frame.width / item.box.width : 1;
  return (
    <WidgetBox item={item} page={page} colors={colors} edge={false} onClick={activate}>
      <NativeListBox
        ariaLabel={item.label}
        disabled={item.disabled}
        multi={item.multi}
        options={item.options}
        selected={item.selected}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSelect={async (values) => {
          await form.setValue(item.fieldRef, { selectedValues: values });
        }}
        style={{
          ...fill,
          padding: 0,
          borderWidth: Math.max(1, item.look.borderWidth * scale),
          borderStyle: item.look.borderStyle === 'dashed' ? 'dashed' : 'solid',
          borderColor: item.look.border ?? colors.border,
          borderRadius: 0,
          outline: 'none',
          background: item.look.background ?? colors.background,
          color: item.look.color ?? colors.text,
          ...cssFont(item.look),
          fontSize: (item.look.fontSize || 12) * scale,
          textAlign: item.look.textAlign,
          cursor: item.disabled ? 'default' : 'pointer',
          ...(item.disabled ? { pointerEvents: 'none' as const } : {}),
        }}
      />
      <FormFocusRing visible={focused} color={colors.focus} />
    </WidgetBox>
  );
}

/** A push button: a native click target over its picture that runs its action. */
function ButtonControl({ item, page, colors }: ControlProps<'button'>) {
  const activate = useWidgetActivation(item.annotationRef);
  return (
    <WidgetBox
      item={item}
      page={page}
      colors={colors}
      edge={false}
      style={{ cursor: item.disabled ? 'default' : 'pointer' }}
    >
      <button
        type="button"
        aria-label={item.label}
        disabled={item.disabled}
        onClick={activate}
        style={{
          ...fill,
          padding: 0,
          border: 0,
          background: 'transparent',
          cursor: 'inherit',
          // The box is the event surface; a disabled button must not swallow the pointer.
          pointerEvents: item.disabled ? 'none' : 'auto',
        }}
      />
    </WidgetBox>
  );
}

/**
 * A signature field: with the signature plugin, an empty field is "sign
 * here" (it becomes the target the next mark goes to), and a signed one asks
 * your UI to show its details. Without it, the field is only its picture.
 */
function SignatureControl({ item, page, colors }: ControlProps<'signature'>) {
  const signature = useOptionalCapability(SignatureToken);
  const ref = item.fieldRef;
  // The signature plugin knows best whether it's signed (it reads again after
  // every new version); the field's own value is the fallback.
  const signed = useOptionalSelector(
    SignatureToken,
    (capability) => capability.getSignature(ref)?.signed ?? item.signed,
    item.signed,
  );
  const actionable = signature !== null && (signed || !item.disabled);
  return (
    <WidgetBox
      item={item}
      page={page}
      colors={colors}
      style={{ cursor: actionable ? 'pointer' : 'default' }}
    >
      {actionable ? (
        <button
          type="button"
          aria-label={item.label}
          data-signed={signed ? '' : undefined}
          onClick={() => (signed ? signature.requestInspection(ref) : signature.setTarget(ref))}
          style={{ ...fill, padding: 0, border: 0, background: 'transparent', cursor: 'inherit' }}
        />
      ) : null}
    </WidgetBox>
  );
}

/**
 * The form's fields on one page, as controls people fill in. Put it above the
 * page's picture (`<RenderLayer>`, and `<AnnotationLayer>` when the
 * annotation plugin is registered). It shows while the active tool fills
 * forms (the `pointer` and `pan` tools do), and stands down in design mode,
 * where fields are boxes you select and move.
 */
export function FormLayer() {
  const page = usePage();
  const form = useCapability(FormHostToken);
  const colors = useFormColors();
  const active = useSelector(InteractionToken, (interaction) =>
    interaction.activeToolEnables('form-fill'),
  );

  useEffect(() => {
    if (active) void form.ensureLoaded(page.ref);
  }, [active, form, page.ref]);

  const items = useSelector(FormHostToken, (capability) => capability.listWidgets(page.ref), shallowArray);
  if (!active) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {items.map((item) => {
        const key = `${item.key}:${item.annotObjectNumber}`;
        switch (item.control) {
          case 'text':
            return <TextControl key={key} item={item} page={page} colors={colors} />;
          case 'toggle':
            return <ToggleControl key={key} item={item} page={page} colors={colors} />;
          case 'choice':
            return item.kind === 'list' ? (
              <ListControl key={key} item={item} page={page} colors={colors} />
            ) : (
              <ComboControl key={key} item={item} page={page} colors={colors} />
            );
          case 'button':
            return <ButtonControl key={key} item={item} page={page} colors={colors} />;
          case 'signature':
            return <SignatureControl key={key} item={item} page={page} colors={colors} />;
        }
      })}
    </div>
  );
}

// ── hooks ──────────────────────────────────────────────────────────────────

/** The form API for the surrounding document: reading, filling, form data and building. */
export function useForm(): FormCapability {
  return useCapability(FormToken);
}

/** Subscribe to one form event while mounted: `useFormEvent((form) => form.onValueChanged, handler)`. */
export function useFormEvent<T>(
  select: (form: FormCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(FormToken, select, handler);
}

/**
 * The form's state: every field, whether it's read, what kind of form the
 * document has, and the field of the selected widget (the page's State
 * table, declared once in `formState`). Takes a selector, and re-renders only
 * when what it returns changes.
 */
export const useFormState = stateHook(formState);

/** The form settings (`validation`, `focus`, `fields`), with or without a document. Takes a selector. */
export const useFormSettings = settingsHook(FormToken);

/**
 * One field's value, in the shape `setValue()` takes, or `null`: re-renders
 * only when that field's value changes. Empty without a document.
 */
export function useFormValue(ref: FormFieldRef): FormFieldValue | null {
  const scoped = useDocumentScope();
  const key = ref.kind === 'fqn' ? `n:${ref.name}` : `o:${ref.objectNumber}`;
  // Keyed by value, so an inline `toFieldRef('total')` never subscribes again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => ref, [key]);
  return useKernelValue(
    (kernel) => kernel.tryCapability(FormToken, scoped ?? undefined)?.getValue(stable) ?? null,
  );
}
