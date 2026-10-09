/**
 * The React view of @embedpdf/plugin-form.
 *
 * `<FormLayer />` paints the fields of its page as the engine draws them
 * (their values, borders and fonts) and puts a real HTML control over each
 * field box, with or without the annotation plugin. While it's on the page,
 * the `<RenderLayer>` leaves the fields out of the page's picture. The
 * controls add what people interact with on top of the pictures:
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
 * listener (`isolatePointerDown`): the Stage listens natively on an ancestor,
 * so React's synthetic events would run too late. The colors, the field
 * looks, the boxes' and controls' styles, and the toggle, text-field and
 * list-box policies are `@embedpdf/web`'s, the same for every framework.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-form';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { annotationKey, type EventHook } from '@embedpdf/core';
import type { PdfAnnotationEventKind } from '@embedpdf/plugin-actions/contract';
import type { AnnotationRef } from '@embedpdf/plugin-annotation/contract';
import {
  FormToken,
  formState,
  type FormCapability,
  type FormFieldRef,
  type FormFieldValue,
  type FormWidgetItem,
} from '@embedpdf/plugin-form';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { RenderToken } from '@embedpdf/plugin-render/contract/host';
import { SignatureToken } from '@embedpdf/plugin-signature/contract';
import {
  createTextFieldEditor,
  FORM_CONTROL_FILL,
  formColorsOf,
  isolatePointerDown,
  listBoxControlStyleOf,
  loadFieldPictureUrls,
  pressToggle,
  rectInPixels,
  shownFieldPicture,
  textFieldEditorStyleOf,
  widgetBoxStyleOf,
  type AppearanceUrl,
  type FormColors,
} from '@embedpdf/web';

import { NativeListBox } from './form-listbox';
import { FormFocusRing } from './form-focus-ring';
import { usePaintsPagePart } from './page-layers';
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

/** The colors the viewer draws fields with: the form settings over the viewer's accent. */
function useFormColors(): FormColors {
  const accent = useViewerSettings((settings) => settings.accent);
  const focus = useFormSettings((settings) => settings.focus);
  const fields = useFormSettings((settings) => settings.fields);
  return useMemo(() => formColorsOf({ focus, fields }, accent), [accent, focus, fields]);
}

/**
 * Keep the interaction hub out of gestures that begin inside a control. A
 * native listener, not React's, so it runs during real DOM bubbling, before
 * the Stage's own native listener on an ancestor. The press stops there, so
 * React's own `onPointerDown` never sees it: whoever needs the press passes
 * `onPress`, which the native listener calls.
 */
function useIsolated<T extends HTMLElement>(onPress?: () => void) {
  const ref = useRef<T>(null);
  const press = useRef(onPress);
  press.current = onPress;
  useEffect(
    () => (ref.current ? isolatePointerDown(ref.current, () => press.current?.()) : undefined),
    [],
  );
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
  'onPointerEnter' | 'onPointerLeave' | 'onPointerUp' | 'onFocus' | 'onBlur'
> & { onPress: () => void } {
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
      // The press, from the box's native listener (`useIsolated`).
      onPress: () => notify('mouseDown'),
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
  const { onPress, ...events } = useWidgetEvents(item.fieldRef, item.annotationRef);
  const wrap = useIsolated<HTMLDivElement>(onPress);
  const frame = rectInPixels(item.box, page.transform);
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
      style={{ ...widgetBoxStyleOf(item, frame, colors, { edge }), ...rest.style }}
    >
      {children}
    </div>
  );
}

// ── the controls ───────────────────────────────────────────────────────────

/** A text box: the picture at rest, an editor in the field's own font while focused. */
function TextControl({ item, page, colors }: ControlProps<'text'>) {
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(item.annotationRef);
  // The editor is always mounted, see-through at rest and shown while
  // focused: the DOM is the focus manager, so Tab reaches every field. Typing
  // drafts, blur or Enter commits, Escape puts the value back. One editing
  // policy per field (by its key) and form.
  const editor = useMemo(
    () => createTextFieldEditor(form, item.fieldRef, item.value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, item.key],
  );
  const { focused, draft } = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
    editor.getState,
  );
  // Take the field's value whenever it changes under us, but never mid-edit.
  useEffect(() => editor.setValue(item.value), [editor, item.value]);

  const frame = rectInPixels(item.box, page.transform);
  const editorProps = {
    value: draft,
    maxLength: item.maxLength ?? undefined,
    'aria-label': item.label,
    disabled: item.disabled,
    onFocus: editor.focus,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      editor.input(event.target.value),
    onBlur: editor.blur,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (editor.keyDown(event.key, item.multiline)) event.currentTarget.blur();
    },
    style: textFieldEditorStyleOf(item, frame, colors, focused),
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
  // The value first, then the widget's action (Acrobat's order).
  const press = () => pressToggle(form, item, activate);
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
          ...FORM_CONTROL_FILL,
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
  const frame = rectInPixels(item.box, page.transform);
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
        style={listBoxControlStyleOf(item, frame, colors)}
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
          ...FORM_CONTROL_FILL,
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
          style={{
            ...FORM_CONTROL_FILL,
            padding: 0,
            border: 0,
            background: 'transparent',
            cursor: 'inherit',
          }}
        />
      ) : null}
    </WidgetBox>
  );
}

/**
 * The form's fields on one page: their pictures, and the controls people fill
 * them in with. Put it above the page's picture (`<RenderLayer>`, and
 * `<AnnotationLayer>` when the annotation plugin is registered); while it's
 * there, the render layer leaves the fields out of the page's picture. The
 * controls show while the active tool fills forms (the `pointer` and `pan`
 * tools do), and stand down in design mode, where fields are boxes you
 * select and move.
 */
export function FormLayer() {
  const page = usePage();
  const form = useCapability(FormHostToken);
  const colors = useFormColors();
  const active = useSelector(InteractionToken, (interaction) =>
    interaction.activeToolEnables('form-fill'),
  );
  usePaintsPagePart(page.ref, 'formFields');

  useEffect(() => {
    void form.ensureLoaded(page.ref);
  }, [form, page.ref]);

  const items = useSelector(
    FormHostToken,
    (capability) => capability.listWidgets(page.ref),
    shallowArray,
  );

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <FieldPictures page={page} />
      {(active ? items : []).map((item) => {
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

/**
 * The pictures of the page's fields, as the engine draws them, from the render
 * plugin's shared field pictures. Every state is loaded, so a check box shows
 * its new state as soon as its value changes; hidden widgets aren't drawn.
 */
function FieldPictures({ page }: { page: PageContextValue }) {
  const render = useOptionalCapability(RenderToken);
  const widgets = useSelector(
    FormHostToken,
    (form) => form.listShownWidgets(page.ref),
    shallowArray,
  );
  // Loaded again when the page's fields change, and at appearance-scale crossings.
  const epoch = useOptionalSelector(
    RenderToken,
    (render) => render.getFieldAppearanceEpoch(page.ref),
    0,
  );
  const scale = useOptionalSelector(
    RenderToken,
    (render) => render.getAppearanceScale(page.transform.renderScale),
    0,
  );
  const [urls, setUrls] = useState<Record<string, AppearanceUrl>>({});

  useEffect(() => {
    if (!render || !scale) return;
    return loadFieldPictureUrls(
      (signal) => render.renderFieldAppearances(page.ref, { scale, signal }),
      annotationKey,
      setUrls,
    );
  }, [render, page.ref, scale, epoch]);

  return (
    <>
      {widgets.map((widget) => {
        const key = annotationKey(widget.ref);
        const picture = shownFieldPicture(urls, key, widget.appearanceState);
        if (!picture) return null;
        const frame = rectInPixels(picture.box, page.transform);
        return (
          <img
            key={key}
            src={picture.url}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: frame.left,
              top: frame.top,
              width: frame.width,
              height: frame.height,
              // A global `img { max-width: 100% }` reset would clamp it.
              maxWidth: 'none',
              maxHeight: 'none',
              pointerEvents: 'none',
            }}
          />
        );
      })}
    </>
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
