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
 *
 * An app draws a box with a control of its own through `controls`
 * ({@link FieldControl}), and attaches UI to a box with
 * `useFormWidgetAnchor()` and `<Anchored>`.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-form';
import * as React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { annotationKey, type EventHook } from '@embedpdf/core';
import { MITER_LIMIT } from '@embedpdf/core-annotation';
import type { PdfAnnotationEventKind } from '@embedpdf/plugin-actions/contract';
import type { AnnotationRef } from '@embedpdf/plugin-annotation/contract';
import { FontsToken } from '@embedpdf/plugin-fonts/contract';
import {
  FormToken,
  formState,
  type FormCapability,
  type FormFieldRef,
  type FormFieldValue,
  type FormSetValueResult,
  type FormWidgetAnchor,
  type FormWidgetItem,
} from '@embedpdf/plugin-form';
import {
  FormToken as FormHostToken,
  type ShownWidget,
  type WidgetPainting,
} from '@embedpdf/plugin-form/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { RenderToken } from '@embedpdf/plugin-render/contract/host';
import { SignatureToken } from '@embedpdf/plugin-signature/contract';
import {
  bindFieldFocus,
  claimClick,
  createFieldControlPress,
  createShownUrls,
  createTextFieldEditor,
  fieldControlFor,
  fieldControlPlaceOf,
  FORM_CONTROL_FILL,
  formColorsOf,
  isClickClaimed,
  isolatePointerDown,
  listBoxControlStyleOf,
  loadAppearanceUrls,
  pictureOrPainting,
  pressToggle,
  rectInPixels,
  runsActionOnClick,
  samePageBounds,
  shownAppearance,
  svgShapesOf,
  textFieldEditorStyleOf,
  widgetBoxStyleOf,
  type AppearanceUrl,
  type FieldControlFrame,
  type FormColors,
  type MountableFontProgram,
  type PictureOrPainting,
} from '@embedpdf/web';

export type { FieldControlFrame } from '@embedpdf/web';

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
import { useFontMounts } from './font-mounts';
import { SvgShapes } from './svg-shapes';

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
function useIsolated<T extends HTMLElement>(onPress?: () => void, isolated = true) {
  const ref = useRef<T>(null);
  const press = useRef(onPress);
  press.current = onPress;
  useEffect(
    () =>
      ref.current && isolated
        ? isolatePointerDown(ref.current, () => press.current?.())
        : undefined,
    [isolated],
  );
  return ref;
}

/**
 * True for the layer's own control drawn inside a control of the app's
 * (`native`): the app's box is then the widget's event surface and the
 * cursor's way in, and the layer's control only fills it.
 */
const EmbeddedContext = createContext(false);

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
 * fill in. It's also where the form's cursor reaches the control: `focus()`
 * and Tab go through the form, in the document's order (`bindFieldFocus`).
 * A box with nothing to focus says so (`focusable={false}`), and the cursor
 * passes over it. `custom`: the box holds a control of the app's, and the
 * cursor goes to the first element in it that Tab stops at.
 *
 * Inside a control of the app's ({@link EmbeddedContext}) the box only fills
 * the place it is given: the app's box around it sends the widget's events
 * and takes the cursor, and a click this one handled is left alone there.
 */
function WidgetBox({
  item,
  page,
  colors,
  edge = true,
  focusable = true,
  custom = false,
  onClick,
  children,
  ...rest
}: {
  item: FormWidgetItem;
  page: PageContextValue;
  colors: FormColors;
  edge?: boolean;
  focusable?: boolean;
  custom?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'children'>) {
  const form = useCapability(FormHostToken);
  const embedded = useContext(EmbeddedContext);
  const { onPress, ...events } = useWidgetEvents(item.fieldRef, item.annotationRef);
  const wrap = useIsolated<HTMLDivElement>(onPress, !embedded);
  const frame = rectInPixels(item.box, page.transform);
  const widget = item.annotationRef;
  const takesInput = !item.disabled && !embedded;
  const radio = item.control === 'toggle' && item.kind === 'radio';
  useEffect(
    () =>
      wrap.current && widget && takesInput
        ? bindFieldFocus(wrap.current, form, widget, { radio, custom, focusable })
        : undefined,
    [wrap, form, widget, takesInput, radio, custom, focusable],
  );
  if (embedded) {
    return (
      <div
        ref={wrap}
        {...rest}
        onClick={(event) => {
          claimClick(event.nativeEvent);
          onClick?.(event);
        }}
        style={{
          ...widgetBoxStyleOf(
            { look: item.look, accent: item.accent },
            { left: 0, top: 0, width: frame.width, height: frame.height },
            colors,
            { edge },
          ),
          ...rest.style,
        }}
      >
        {children}
      </div>
    );
  }
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
const TextControl = React.memo(function TextControl({ item, page, colors }: ControlProps<'text'>) {
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
  // The text being typed, where the engine will draw it, in its fonts: again once they're found.
  useOptionalSelector(FontsToken, (fonts) => fonts.getPaintFontsEpoch(), 0);
  const layout = item.annotationRef ? form.getTextEditorLayout(item.annotationRef, draft) : null;
  useFontMounts(layout ? layout.programs : NO_PROGRAMS);
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
    style: textFieldEditorStyleOf(item, frame, colors, focused, layout),
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
});

/**
 * A checkbox or a radio button: the picture is the control, a click writes the toggled value. A
 * radio button's label names its option, and it says where it comes in its group: its buttons
 * are placed apart, so no group element can.
 */
const ToggleControl = React.memo(function ToggleControl({
  item,
  page,
  colors,
}: ControlProps<'toggle'>) {
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(item.annotationRef);
  const [focused, setFocused] = useState(false);
  // The value first, then the widget's action (Acrobat's order).
  const press = () => pressToggle(form, item, activate);
  const inGroup = item.kind === 'radio' ? item.inGroup : null;
  return (
    <WidgetBox
      item={item}
      page={page}
      colors={colors}
      role={item.kind === 'checkbox' ? 'checkbox' : 'radio'}
      aria-checked={item.checked}
      aria-label={item.label}
      aria-posinset={inGroup?.position}
      aria-setsize={inGroup?.size}
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
});

/** A dropdown: an invisible native select over the field's picture. */
const ComboControl = React.memo(function ComboControl({
  item,
  page,
  colors,
}: ControlProps<'choice'>) {
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(item.annotationRef);
  const [focused, setFocused] = useState(false);
  return (
    <WidgetBox item={item} page={page} colors={colors} onClick={activate}>
      {/* Controlled, never made again on a change: a new select would drop the focus to the page
          while the old one never reports its blur. */}
      <select
        value={item.selected[0] ?? ''}
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
});

/** A list: a visible native select in the field's own look, the settings where it has none. */
const ListControl = React.memo(function ListControl({
  item,
  page,
  colors,
}: ControlProps<'choice'>) {
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(item.annotationRef);
  const [focused, setFocused] = useState(false);
  const frame = rectInPixels(item.box, page.transform);
  // The rows in the widget's font, as the engine picks it: again once the document's fonts are read.
  const font = useSelector(FormHostToken, (host) =>
    item.annotationRef ? host.getWidgetFontCss(item.annotationRef) : null,
  );
  useFontMounts(font ? font.programs : NO_PROGRAMS);
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
        style={listBoxControlStyleOf(item, frame, colors, font)}
      />
      <FormFocusRing visible={focused} color={colors.focus} />
    </WidgetBox>
  );
});

/** A push button: a native click target over its picture that runs its action. */
const ButtonControl = React.memo(function ButtonControl({
  item,
  page,
  colors,
}: ControlProps<'button'>) {
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
});

/**
 * A signature field: with the signature plugin, an empty field is "sign
 * here" (it becomes the target the next mark goes to), and a signed one asks
 * your UI to show its details. Without it, the field is only its picture.
 */
const SignatureControl = React.memo(function SignatureControl({
  item,
  page,
  colors,
}: ControlProps<'signature'>) {
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
      focusable={actionable}
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
});

// ── controls of the app's own ───────────────────────────────────────────────

/**
 * What a control's component gets: the box, the frame to draw into, the
 * layer's own control to keep or leave out, and the write.
 */
export interface FieldControlProps {
  /** The box, as `listWidgets()` gives it: its field, its control, its value and what it tells you. */
  widget: FormWidgetItem;
  /**
   * The box you draw into. The layer places, turns and scales it like the
   * field. Fill it (`width: 100%; height: 100%`) and draw at the field's 100%
   * size: your drawing scales with the page.
   */
  frame: FieldControlFrame;
  /** The layer's own control for the box, filling the frame. Render it to keep the control and add to it. */
  native: React.ReactNode;
  /**
   * Fill the field in, as `form.setValue()` does for this box's field: the
   * same checks, scripts and undo step. A click that calls it runs the
   * widget's action after the value is written, as in Acrobat.
   */
  setValue: (value: FormFieldValue) => Promise<FormSetValueResult>;
  /** True while the cursor is in this box. */
  focused: boolean;
}

/**
 * One rule: "draw these boxes with this component". `for` gets the box with
 * everything it tells you; the first control that matches wins, and a box no
 * control matches is drawn by the layer.
 *
 * Define the list once, outside your component or in `useMemo`.
 */
export interface FieldControl {
  for: (widget: FormWidgetItem) => boolean;
  component: React.ComponentType<FieldControlProps>;
}

export interface FormLayerProps {
  /** Your own control for some boxes ({@link FieldControl}). */
  controls?: readonly FieldControl[];
}

/**
 * The layer's own control for a box, as an element. Each control is memoized: it renders again
 * when its box, the page or the colors change, never because the layer did, so a picture that
 * loads leaves the controls as they are.
 */
function nativeControlOf(
  item: FormWidgetItem,
  page: PageContextValue,
  colors: FormColors,
  key?: string,
): React.ReactElement {
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
}

/** A custom box's props: the box, the app's control for it, and how the field looks now. */
type CustomControlProps = ControlProps<FormWidgetItem['control']> & {
  control: FieldControl;
  look: FieldLook | null;
};

/** The same look: the same picture, or the same drawing by the painter. */
const sameLook = (left: FieldLook | null, right: FieldLook | null): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.kind === 'picture') return right.kind === 'picture' && left.picture === right.picture;
  return right.kind === 'painting' && left.painting === right.painting;
};

/**
 * A box drawn by a control of the app's. The box is the layer's: placed and
 * turned like the field, the widget's event surface, and the cursor's way in
 * (the first element inside that Tab stops at). The control draws in a frame
 * of the field's 100% size, scaled with the page; `native` is the field's
 * picture and the layer's control, drawn as they are without the app's. A
 * click runs the widget's action, after a value the click wrote. Like the layer's own, it
 * renders again when what it is given changes: its box, its control, or its field's look.
 */
const CustomControl = React.memo(function CustomControl({
  item,
  control,
  page,
  colors,
  look,
}: CustomControlProps) {
  const form = useCapability(FormHostToken);
  const activate = useWidgetActivation(item.annotationRef);
  const focused = useSelector(FormHostToken, (host) => host.isWidgetFocused(item.ref));
  const place = fieldControlPlaceOf(item, page.transform);
  // One press for the box's life, reading the box as it is at the write.
  const latest = useRef({ form, field: item.fieldRef, activate });
  latest.current = { form, field: item.fieldRef, activate };
  const press = useMemo(
    () =>
      createFieldControlPress(
        (value: FormFieldValue) => latest.current.form.setValue(latest.current.field, value),
        () => latest.current.activate(),
      ),
    [],
  );
  const Control = control.component;
  const native = (
    <div style={place.nativeStyle}>
      {look && fieldPictureOf(look, item.rect, place.pictureStyle)}
      <EmbeddedContext.Provider value={true}>
        {nativeControlOf(item, page, colors)}
      </EmbeddedContext.Provider>
    </div>
  );
  return (
    <WidgetBox
      item={item}
      page={page}
      colors={colors}
      edge={false}
      custom
      onClick={(event) => {
        if (!isClickClaimed(event.nativeEvent) && runsActionOnClick(item)) press.click();
      }}
    >
      <div style={place.frameStyle}>
        <Control
          widget={item}
          frame={place.frame}
          native={native}
          setValue={press.setValue}
          focused={focused}
        />
      </div>
    </WidgetBox>
  );
}, sameCustomControl);

/** Whether a custom box is given what it had: its look compared by what it shows. */
function sameCustomControl(before: CustomControlProps, after: CustomControlProps): boolean {
  return (
    before.item === after.item &&
    before.control === after.control &&
    before.page === after.page &&
    before.colors === after.colors &&
    sameLook(before.look, after.look)
  );
}

/**
 * The form's fields on one page: their pictures, and the controls people fill
 * them in with. Put it above the page's picture (`<RenderLayer>`, and
 * `<AnnotationLayer>` when the annotation plugin is registered); while it's
 * there, the render layer leaves the fields out of the page's picture. The
 * controls show while the active tool fills forms (the `pointer` and `pan`
 * tools do), and stand down in design mode, where fields are boxes you
 * select and move. `controls` draws some boxes with components of yours,
 * which show and stand down with the layer's own.
 */
export function FormLayer({ controls }: FormLayerProps) {
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
  const looks = useFieldLooks(page);
  const shown = active ? items : NO_ITEMS;
  // The boxes a control of the app's draws, by widget: each draws its field's picture itself.
  const custom = useMemo(() => {
    const drawn = new Map<string, FieldControl>();
    if (controls?.length) {
      for (const item of shown) {
        const control = fieldControlFor(item, controls);
        if (control) drawn.set(annotationKey(item.ref), control);
      }
    }
    return drawn;
  }, [shown, controls]);
  // The pictures the layer draws itself: all of them, unless a control of the app's draws some.
  const pictures = useMemo(
    () => (custom.size === 0 ? looks : looks.filter(({ key }) => !custom.has(key))),
    [looks, custom],
  );
  const lookOf = useMemo(
    () => (custom.size === 0 ? NO_LOOK : new Map(looks.map(({ key, look }) => [key, look]))),
    [looks, custom],
  );

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <FieldPictures page={page} looks={pictures} />
      {shown.map((item) => {
        const key = `${item.key}:${item.annotObjectNumber}`;
        const widget = annotationKey(item.ref);
        const control = custom.get(widget);
        return control ? (
          <CustomControl
            key={key}
            item={item}
            control={control}
            page={page}
            colors={colors}
            look={lookOf.get(widget) ?? null}
          />
        ) : (
          nativeControlOf(item, page, colors, key)
        );
      })}
    </div>
  );
}

const NO_ITEMS: readonly FormWidgetItem[] = Object.freeze([]);
const NO_LOOK: ReadonlyMap<string, FieldLook | null> = new Map();

/** How a widget shows now: its picture, or the painter's drawing of it. */
type FieldLook = NonNullable<PictureOrPainting<WidgetPainting>>;

/** One widget the page shows: where it stands, and its look, `null` while it has nothing to show. */
interface ShownLook {
  key: string;
  widget: ShownWidget;
  look: FieldLook | null;
}

/**
 * The page's fields as they look now. Each widget shows its picture, as the
 * engine draws it (the form plugin's, every state loaded, so a check box
 * shows its new state at once), or the painter's drawing while its look is
 * pending or its picture is of an older version (`pictureOrPainting`): a
 * value, a calculation, a restyle shows at once. Hidden widgets aren't
 * listed; a widget with nothing to show yet has no look. The same list
 * while the page's widgets and their pictures stay the same.
 */
function useFieldLooks(page: PageContextValue): readonly ShownLook[] {
  const form = useCapability(FormHostToken);
  const widgets = useSelector(
    FormHostToken,
    (form) => form.listShownWidgets(page.ref),
    shallowArray,
  );
  // Loaded again when one of the page's widgets is drawn again, and at appearance-scale crossings.
  const epoch = useSelector(FormHostToken, (form) => form.getAppearanceEpoch(page.ref));
  const scale = useOptionalSelector(
    RenderToken,
    (render) => render.getAppearanceScale(page.transform.renderScale),
    0,
  );
  // `null` until the page's first pictures arrive.
  const [urls, setUrls] = useState<Record<string, AppearanceUrl> | null>(null);
  // The pictures shown stay valid until the next ones are shown.
  const [shown] = useState(createShownUrls);
  useEffect(() => () => shown.release(), [shown]);

  useEffect(() => {
    if (!scale) return;
    return loadAppearanceUrls(
      shown,
      (signal) => form.renderAppearances(page.ref, scale, signal),
      annotationKey,
      setUrls,
    );
  }, [shown, form, page.ref, scale, epoch]);

  // The painter's drawing changes only with the widgets: the form plugin lists them again
  // whenever a value, a format or a font it draws with does.
  return useMemo(
    () =>
      widgets.map((widget) => {
        const key = annotationKey(widget.ref);
        return {
          key,
          widget,
          look: pictureOrPainting({
            pending: widget.pending,
            picture: urls && shownAppearance(urls, key, widget.appearanceState),
            version: widget.pictureVersion,
            loaded: urls !== null,
            paint: () => form.getWidgetPainting(widget.ref),
          }),
        };
      }),
    [form, widgets, urls],
  );
}

/**
 * The pictures the layer draws itself, each where its widget stands. They render again when
 * the page's looks or its geometry change, apart from the controls.
 */
const FieldPictures = React.memo(function FieldPictures({
  page,
  looks,
}: {
  page: PageContextValue;
  looks: readonly ShownLook[];
}) {
  return (
    <>
      {looks.map(({ key, widget, look }) => {
        if (!look) return null;
        // Where the widget is now: a move keeps its picture, which comes along with it.
        const frame = rectInPixels(widget.rect, page.transform);
        return fieldPictureOf(
          look,
          widget.rect,
          {
            position: 'absolute',
            left: frame.left,
            top: frame.top,
            width: frame.width,
            height: frame.height,
          },
          key,
        );
      })}
    </>
  );
});

/**
 * One widget as it looks now, at `place`: where the widget stands, in the
 * page layer or inside its own box. Its picture and the painter's drawing
 * both fill `rect`, the rect the widget stands in, with its turn in them.
 */
function fieldPictureOf(
  look: FieldLook,
  rect: ShownWidget['rect'],
  place: React.CSSProperties,
  key?: string,
): React.ReactElement {
  if (look.kind === 'painting') {
    const { x, y, width, height } = rect;
    return (
      <svg
        key={key}
        viewBox={`${x} ${y} ${width} ${height}`}
        style={{ ...place, overflow: 'visible', pointerEvents: 'none' }}
      >
        <SvgShapes shapes={svgShapesOf(look.painting.scene, { miterLimit: MITER_LIMIT })} />
      </svg>
    );
  }
  return (
    <img
      key={key}
      src={look.picture.url}
      alt=""
      draggable={false}
      style={{
        ...place,
        // A global `img { max-width: 100% }` reset would clamp it.
        maxWidth: 'none',
        maxHeight: 'none',
        pointerEvents: 'none',
      }}
    />
  );
}

const NO_PROGRAMS: readonly MountableFontProgram[] = Object.freeze([]);

// ── hooks ──────────────────────────────────────────────────────────────────

/** The form API for the surrounding document: reading, filling, form data and building. */
export function useForm(): FormCapability {
  return useCapability(FormToken);
}

/**
 * An anchor for `<Anchored>` that keeps a tag or a card attached to one box
 * of a form field (a widget's `ref`): its page and where the box stands,
 * following the box as it is moved in design mode. `null` for `null`, or a
 * box that isn't here. The component re-renders when the box moves, not while
 * people scroll or zoom.
 */
export function useFormWidgetAnchor(widget: AnnotationRef | null): FormWidgetAnchor | null {
  const key = widget ? annotationKey(widget) : null;
  // Keyed by value, so an inline ref never subscribes again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => widget, [key]);
  return useOptionalSelector(
    FormHostToken,
    (form) => (stable ? form.getWidgetAnchor(stable) : null),
    null,
    samePageBounds,
  );
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
