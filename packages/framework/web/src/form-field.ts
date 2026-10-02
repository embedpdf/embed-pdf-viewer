/**
 * What every framework's form layer shares: the colors the viewer draws a
 * field with, a field's text look as CSS, the widget's PDF events from DOM
 * events, the toggle and text-field policies, and the optimistic selection of
 * a list box. A framework adapter keeps the markup (a positioned box per
 * widget with a native control inside) and its bindings. The form plugin's
 * types are mirrored structurally, so this package stays free of EmbedPDF
 * imports.
 */
import type { PixelRect } from './page-pixels';
import { mixAccent, paint } from './theme';

// ── colors and looks ─────────────────────────────────────────────────────────

/** The form settings the colors read: the structural twin of the form plugin's `focus` and `fields`. */
export interface FormColorSettings {
  readonly focus: { readonly color: string | null };
  readonly fields: {
    readonly border: string | null;
    readonly background: string;
    readonly color: string;
  };
}

/** The colors the viewer draws fields with, each its `--epdf-form-*` variable first, then the setting. */
export interface FormColors {
  /** The focus ring around the field being filled in. */
  readonly focus: string;
  /** The edge of a field without a border of its own. */
  readonly border: string;
  /** Inside a field without a background of its own, while it's filled in. */
  readonly background: string;
  /** The text of a field without a color of its own. */
  readonly text: string;
}

/** The form settings as colors: an unset focus color is the accent, an unset edge the accent at 55%. */
export function formColorsOf(settings: FormColorSettings, accent: string): FormColors {
  return {
    focus: paint('form-focus', settings.focus.color ?? accent),
    border: paint(
      'form-field-border',
      settings.fields.border ?? mixAccent('form-field-border', accent),
    ),
    background: paint('form-field-background', settings.fields.background),
    text: paint('form-field-color', settings.fields.color),
  };
}

/** How a widget looks in the PDF: the structural twin of the form plugin's `FormWidgetLook`. */
export interface FieldLook {
  readonly border: string | null;
  /** In page points. */
  readonly borderWidth: number;
  readonly borderStyle: string;
  readonly background: string | null;
  readonly color: string | null;
  /** One of the 14 standard PDF fonts (`'helvetica-bold'`), or `null`. */
  readonly fontFamily: string | null;
  /** In page points; `0` or `null` fits the text to the box. */
  readonly fontSize: number | null;
  readonly textAlign: 'left' | 'center' | 'right';
}

// The style records below are type aliases, not interfaces: an object type
// alias fits a framework's style type with an index signature for custom
// properties (Vue's `CSSProperties`), which an interface never does.

/** A standard PDF font as CSS. */
export type CssFont = {
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
};

/** One of the 14 standard PDF fonts as CSS: a family that looks like it, its weight and style. */
export function cssFontOf(pdfFont: string | null): CssFont {
  const name = pdfFont ?? 'helvetica';
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

/** A field's text as CSS: its font, size, alignment and colors, the settings where it has none. */
export type FieldTextStyle = CssFont & {
  /** In pixels, with its unit. */
  fontSize: string;
  textAlign: 'left' | 'center' | 'right';
  color: string;
  background: string;
};

/** Pixels per page point where the widget is drawn. */
const scaleOf = (field: { box: { width: number } }, frame: PixelRect): number =>
  field.box.width > 0 ? frame.width / field.box.width : 1;

/** A text field as the layer's editor shows it while focused, in the field's own font. */
export type TextFieldStyle = FieldTextStyle & {
  /** A comb field's spacing (its box split into `maxLength` cells), in pixels with its unit. */
  letterSpacing?: string;
};

/**
 * A text field's editor style. A font size of 0 means "fit the box" in PDF:
 * the box height for one line, Acrobat's 12 pt for several.
 */
export function textFieldStyleOf(
  field: {
    box: { width: number };
    look: FieldLook;
    multiline: boolean;
    comb: boolean;
    maxLength: number | null;
  },
  frame: PixelRect,
  colors: FormColors,
): TextFieldStyle {
  const scale = scaleOf(field, frame);
  const fontSize = field.look.fontSize
    ? field.look.fontSize * scale
    : field.multiline
      ? 12 * scale
      : Math.max(6, frame.height * 0.72);
  return {
    ...cssFontOf(field.look.fontFamily),
    fontSize: `${fontSize}px`,
    textAlign: field.look.textAlign,
    color: field.look.color ?? colors.text,
    background: field.look.background ?? colors.background,
    ...(field.comb && field.maxLength
      ? { letterSpacing: `${frame.width / field.maxLength / 2}px` }
      : {}),
  };
}

/** A list box as the layer draws it: the field's text look, and its border. */
export type ListBoxStyle = FieldTextStyle & {
  /** In pixels, with its unit; never thinner than one pixel. */
  borderWidth: string;
  borderStyle: 'solid' | 'dashed';
  borderColor: string;
};

/** A list box's style: the field's own look, the settings where it has none (12 pt for a fitted size). */
export function listBoxStyleOf(
  field: { box: { width: number }; look: FieldLook },
  frame: PixelRect,
  colors: FormColors,
): ListBoxStyle {
  const scale = scaleOf(field, frame);
  return {
    ...cssFontOf(field.look.fontFamily),
    fontSize: `${(field.look.fontSize || 12) * scale}px`,
    textAlign: field.look.textAlign,
    color: field.look.color ?? colors.text,
    background: field.look.background ?? colors.background,
    borderWidth: `${Math.max(1, field.look.borderWidth * scale)}px`,
    borderStyle: field.look.borderStyle === 'dashed' ? 'dashed' : 'solid',
    borderColor: field.look.border ?? colors.border,
  };
}

// ── the widget's events ──────────────────────────────────────────────────────

/** The PDF events a widget's `/AA` actions answer, as the actions plugin names them. */
export type WidgetEventKind =
  | 'cursorEnter'
  | 'cursorExit'
  | 'mouseDown'
  | 'mouseUp'
  | 'focus'
  | 'blur';

/**
 * Send a widget's pointer and focus events (`/AA`: enter, exit, down, up,
 * focus, blur) to `notify`, from native listeners on the widget's box. Put
 * them on the always-active box, never on the control inside: "may edit this
 * field" and "may receive PDF action events" are different rights, and a
 * session that may not fill still sees hover tooltips. Focus is `focusin` and
 * `focusout`, so the control's focus reaches the box, and a blur arrives
 * after the control's own blur handler started its commit. Returns the
 * detach.
 */
export function bindWidgetEvents(
  box: HTMLElement,
  notify: (event: WidgetEventKind) => void,
): () => void {
  const listeners: Array<[string, WidgetEventKind]> = [
    ['pointerenter', 'cursorEnter'],
    ['pointerleave', 'cursorExit'],
    ['pointerdown', 'mouseDown'],
    ['pointerup', 'mouseUp'],
    ['focusin', 'focus'],
    ['focusout', 'blur'],
  ];
  const handlers = listeners.map(([type, kind]) => {
    const handler = () => notify(kind);
    box.addEventListener(type, handler);
    return [type, handler] as const;
  });
  return () => handlers.forEach(([type, handler]) => box.removeEventListener(type, handler));
}

/** What a toggle press writes with: the form plugin's `setValue`. */
export interface ToggleForm<Field> {
  setValue(field: Field, value: { value: string | null }): Promise<unknown>;
}

/**
 * A checkbox or radio button pressed: a checked checkbox clears, a radio
 * button always selects its own value. The value is written first, then the
 * widget's action runs (Acrobat's order), so an action script reads the new
 * state; a read-only toggle writes nothing and still runs its action.
 */
export function pressToggle<Field>(
  form: ToggleForm<Field>,
  toggle: {
    fieldRef: Field;
    kind: 'checkbox' | 'radio';
    checked: boolean;
    exportValue: string;
    disabled: boolean;
  },
  activate: () => void,
): void {
  const written = toggle.disabled
    ? undefined
    : form.setValue(toggle.fieldRef, {
        value: toggle.kind === 'checkbox' && toggle.checked ? null : toggle.exportValue,
      });
  void Promise.resolve(written).then(activate, activate);
}

// ── a text field being typed in ──────────────────────────────────────────────

/** The form plugin's draft calls for a text field (its host capability satisfies it). */
export interface TextFieldDrafts<Field> {
  draftText(field: Field, text: string): void;
  commitDraftText(field: Field): Promise<unknown>;
  discardDraftText(field: Field): void;
}

/** What a text field's editor shows: whether it has focus, and the text in it. */
export interface TextFieldEditorState {
  readonly focused: boolean;
  readonly draft: string;
}

/**
 * A text field being typed in, framework-free: the editor's `value` is
 * `draft`, and its events call the methods. Read the state with `getState`
 * and re-render on `subscribe`; the state object stays the same until it
 * changes.
 */
export interface TextFieldEditor {
  getState(): TextFieldEditorState;
  subscribe(listener: () => void): () => void;
  /** The field's value as the form has it now. The draft follows it, except while focused. */
  setValue(value: string): void;
  /** The editor took focus. */
  focus(): void;
  /** Someone typed: the draft shows it, and the plugin keeps it so a download writes it. */
  input(text: string): void;
  /**
   * A key went down. True when the editor should blur now: Escape (which
   * puts the value back) and, in a one-line field, Enter (which commits).
   */
  keyDown(key: string, multiline: boolean): boolean;
  /** The editor lost focus: commit what changed, discard what didn't or was cancelled. */
  blur(): void;
}

/**
 * The editing policy of one text field: typing drafts, blur or Enter
 * commits, Escape discards. A commit the form refuses puts the field's value
 * back.
 */
export function createTextFieldEditor<Field>(
  form: TextFieldDrafts<Field>,
  field: Field,
  value: string,
): TextFieldEditor {
  let state: TextFieldEditorState = { focused: false, draft: value };
  let fieldValue = value;
  let cancelled = false;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<TextFieldEditorState>) => {
    const next = { ...state, ...patch };
    if (next.focused === state.focused && next.draft === state.draft) return;
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setValue(next) {
      fieldValue = next;
      // Never mid-edit: what's typed stays until the edit ends.
      if (!state.focused) set({ draft: next });
    },
    focus: () => set({ focused: true }),
    input(text) {
      set({ draft: text });
      form.draftText(field, text);
    },
    keyDown(key, multiline) {
      if (key === 'Escape') {
        cancelled = true;
        return true;
      }
      // A field with several lines takes Enter as a new line.
      return key === 'Enter' && !multiline;
    },
    blur() {
      const typed = state.draft;
      if (cancelled) {
        cancelled = false;
        form.discardDraftText(field);
      } else if (typed === fieldValue) {
        form.discardDraftText(field);
      } else {
        void form.commitDraftText(field).catch(() => set({ draft: fieldValue }));
      }
      // At rest the editor shows the field's value; a commit brings the new one.
      set({ focused: false, draft: fieldValue });
    },
  };
}

// ── a list box's selection ───────────────────────────────────────────────────

/**
 * A list box's selection, shown at once while its write is on its way. The
 * native control must stay the same element (never remounted), so its own
 * scroll position stays where the user left it.
 */
export interface OptimisticSelection {
  /** The selection the control shows. */
  get(): readonly string[];
  subscribe(listener: () => void): () => void;
  /** The selection the engine has now: the control shows it once it differs from the last one. */
  setConfirmed(values: readonly string[]): void;
  /** Show `values` now and write them; a write that fails puts the engine's selection back. */
  choose(values: string[], write: (values: string[]) => void | Promise<unknown>): void;
}

/** A list box's optimistic selection, starting at the engine's. */
export function createOptimisticSelection(confirmed: readonly string[]): OptimisticSelection {
  let shown: readonly string[] = [...confirmed];
  let engine: readonly string[] = confirmed;
  let engineSignature = JSON.stringify(confirmed);
  const listeners = new Set<() => void>();
  const show = (values: readonly string[]) => {
    shown = [...values];
    listeners.forEach((listener) => listener());
  };
  const rollback = () => show(engine);
  return {
    get: () => shown,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setConfirmed(values) {
      engine = values;
      const signature = JSON.stringify(values);
      if (signature === engineSignature) return;
      engineSignature = signature;
      show(values);
    },
    choose(values, write) {
      show(values);
      try {
        const result = write(values);
        if (result) void result.then(undefined, rollback);
      } catch {
        rollback();
      }
    },
  };
}

/** A native `<select>`, as {@link showSelectedOptions} reads it: its options. */
export interface SelectOptions {
  readonly options: ArrayLike<{ readonly value: string; selected: boolean }>;
}

/**
 * Show `values` as a native `<select>`'s selection, set on each option. A
 * `value` binding can't hold several values, and setting the options also
 * puts a choice back when its write fails before the framework renders
 * again. Setting the same selection again changes nothing the user sees,
 * scroll position included.
 */
export function showSelectedOptions(select: SelectOptions, values: readonly string[]): void {
  for (const option of Array.from(select.options)) {
    option.selected = values.includes(option.value);
  }
}
