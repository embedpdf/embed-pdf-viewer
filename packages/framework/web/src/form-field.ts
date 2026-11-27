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
import { EPDF_VARIABLES, mixAccent, paint } from './theme';

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

/**
 * A field's tint: its group's color, any CSS color (a `var()` of the app's
 * included), the form's `fields.anyoneTintColor` for a field anyone fills in
 * (`anyone`), or its `fields.tintColor` for a field in no group (`base`), and
 * how strongly it shows, from 0 to 1. The structural twin of the form plugin's
 * `accent` on a box and the annotation plugin's on a lent record.
 */
export interface FieldAccent {
  readonly color: string;
  readonly strength: number;
  /** The color is `fields.tintColor`, which `--epdf-form-field-tint-color` wins over. */
  readonly base?: boolean;
  /** The color is `fields.anyoneTintColor`, which `--epdf-form-field-anyone-tint-color` wins over. */
  readonly anyone?: boolean;
}

/** A group's color as a field shows it: what fills its box, and its edge. */
export type FieldTint = {
  /** The color mixed with transparent, as strong as the tint says. */
  fill: string;
  /** The color itself. */
  edge: string;
};

/**
 * A field's tint as it shows: a fill of the accent's color, as strong as it
 * says, and an edge of the color itself. `--epdf-form-field-tint` wins over
 * the strength of the fill, `--epdf-form-field-anyone-tint-color` over the
 * color of a field anyone fills in (`anyone`), and `--epdf-form-field-tint-color`
 * over the color of a field in no group (`base`). No field has an accent while
 * the form's `fields.tint` setting is 0, which is what turns the colors off.
 */
export function fieldTintOf(accent: FieldAccent): FieldTint {
  const strength = paint('form-field-tint', accent.strength);
  const color = accent.anyone
    ? paint('form-field-anyone-tint-color', accent.color)
    : accent.base
      ? paint('form-field-tint-color', accent.color)
      : accent.color;
  return {
    fill: `color-mix(in srgb, ${color} calc(${strength} * 100%), transparent)`,
    edge: color,
  };
}

/**
 * The style of a lent record's accent (the annotation plugin's
 * `RenderItem.accent`: a form field's group's color in design mode), filling
 * the record's frame above its own drawing: the same fill and edge a field
 * shows while it's filled in.
 */
export type RecordAccentStyle = {
  position: 'absolute';
  inset: '0';
  boxSizing: 'border-box';
  background: string;
  boxShadow: string;
  pointerEvents: 'none';
};

/**
 * The edge a lent record shows when it has no border of its own and no accent (the annotation
 * plugin's `RenderItem.outline`: a form field in design mode), so a field with no look shows: a
 * CSS color, or `null` for the form's own edge, the accent at 55%. The structural twin of the
 * annotation plugin's on a lent record.
 */
export interface FieldOutline {
  readonly color: string | null;
}

/** The style of a lent record's outline: an edge around its frame, out of the pointer's way. */
export type RecordOutlineStyle = {
  position: 'absolute';
  inset: '0';
  boxSizing: 'border-box';
  boxShadow: string;
  pointerEvents: 'none';
};

/**
 * {@link RecordOutlineStyle} for an outline: the edge a field without a border of its own shows
 * while it's filled in (`fields.border`, `--epdf-form-field-border`), with `accent` the viewer's.
 */
export function recordOutlineStyleOf(outline: FieldOutline, accent: string): RecordOutlineStyle {
  const color = paint('form-field-border', outline.color ?? mixAccent('form-field-border', accent));
  return {
    position: 'absolute',
    inset: '0',
    boxSizing: 'border-box',
    boxShadow: `inset 0 0 0 1px ${color}`,
    pointerEvents: 'none',
  };
}

/** {@link RecordAccentStyle} for an accent. */
export function recordAccentStyleOf(accent: FieldAccent): RecordAccentStyle {
  const tint = fieldTintOf(accent);
  return {
    position: 'absolute',
    inset: '0',
    boxSizing: 'border-box',
    background: tint.fill,
    boxShadow: `inset 0 0 0 1px ${tint.edge}`,
    pointerEvents: 'none',
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
  /** The font the field names (a standard font such as `'helvetica-bold'`, or another), or `null`. */
  readonly fontFamily: string | null;
  /** In page points; `0` or `null` fits the text to the box. */
  readonly fontSize: number | null;
  readonly textAlign: 'left' | 'center' | 'right';
}

// The style records below are type aliases, not interfaces: an object type
// alias fits a framework's style type with an index signature for custom
// properties (Vue's `CSSProperties`), which an interface never does.

/** A font as CSS, as the form plugin gives a widget's (`getWidgetFontCss`). */
export type CssFont = {
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
};

/**
 * A field's text as CSS: its size, alignment and colors, the settings where it has none. Its
 * font is the engine's, which the form plugin gives (a text field's editor layout, a widget's
 * font), never one read off the font's name.
 */
export type FieldTextStyle = {
  /** In pixels, with its unit. */
  fontSize: string;
  textAlign: 'left' | 'center' | 'right';
  color: string;
  background: string;
};

/** Pixels per page point where the widget is drawn. */
export const scaleOf = (field: { box: { width: number } }, frame: PixelRect): number =>
  field.box.width > 0 ? frame.width / field.box.width : 1;

/** A text field as the layer's editor shows it while focused, in the field's own font. */
export type TextFieldStyle = FieldTextStyle & {
  /** A comb field's spacing (its box split into `maxLength` cells), in pixels with its unit. */
  letterSpacing?: string;
};

/**
 * The size of a text field's text in pixels at `frame`. A font size of 0 means "fit the box" in
 * PDF: the box height for one line, Acrobat's 12 pt for several.
 */
export function textFieldFontPxOf(
  field: { box: { width: number }; look: FieldLook; multiline: boolean },
  frame: PixelRect,
): number {
  const scale = scaleOf(field, frame);
  return field.look.fontSize
    ? field.look.fontSize * scale
    : field.multiline
      ? 12 * scale
      : Math.max(6, frame.height * 0.72);
}

/**
 * A text field's editor style at `frame`, with its lengths `legible` times bigger for an editor
 * laid out at a legible size (`legible-text.ts`).
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
  legible = 1,
): TextFieldStyle {
  return {
    fontSize: `${textFieldFontPxOf(field, frame) * legible}px`,
    textAlign: field.look.textAlign,
    color: field.look.color ?? colors.text,
    background: field.look.background ?? colors.background,
    ...(field.comb && field.maxLength
      ? { letterSpacing: `${(frame.width / field.maxLength / 2) * legible}px` }
      : {}),
  };
}

/** A list box as the layer draws it: the field's text look in its font, and its border. */
export type ListBoxStyle = FieldTextStyle &
  Partial<CssFont> & {
    /** In pixels, with its unit; never thinner than one pixel. */
    borderWidth: string;
    borderStyle: 'solid' | 'dashed';
    borderColor: string;
  };

/**
 * A list box's style: the field's own look, the settings where it has none (12 pt for a fitted
 * size), in `font`, the widget's font as the form plugin gives it (`null` while it has none).
 * A field with an `accent` (its group's color, and how strongly it shows) shows it over its
 * background and as its border.
 */
export function listBoxStyleOf(
  field: { box: { width: number }; look: FieldLook; accent?: FieldAccent | null },
  frame: PixelRect,
  colors: FormColors,
  font: CssFont | null = null,
): ListBoxStyle {
  const scale = scaleOf(field, frame);
  const background = field.look.background ?? colors.background;
  // The list draws its own background and border, so its group's color goes into both.
  const tint = field.accent ? fieldTintOf(field.accent) : null;
  return {
    ...(font
      ? { fontFamily: font.fontFamily, fontWeight: font.fontWeight, fontStyle: font.fontStyle }
      : {}),
    fontSize: `${(field.look.fontSize || 12) * scale}px`,
    textAlign: field.look.textAlign,
    color: field.look.color ?? colors.text,
    background: tint ? `linear-gradient(${tint.fill}, ${tint.fill}), ${background}` : background,
    borderWidth: `${Math.max(1, field.look.borderWidth * scale)}px`,
    borderStyle: field.look.borderStyle === 'dashed' ? 'dashed' : 'solid',
    borderColor: tint ? tint.edge : (field.look.border ?? colors.border),
  };
}

// ── what an empty field shows, and what the browser may offer ────────────────

/**
 * What a lent field shows while it is empty: the words, and their color, a CSS color (the form's
 * `fields.placeholder` setting). The structural twin of the annotation plugin's on a lent record.
 */
export interface FieldPlaceholder {
  readonly text: string;
  readonly color: string;
}

/**
 * A control's `aria-description` for a field's hint (the form plugin's `hint`): what a screen
 * reader hears about it besides its name. Nothing for a field without one. An attribute object,
 * since not every framework's element types list it yet.
 */
export function ariaDescriptionOf(hint: string | null): { 'aria-description'?: string } {
  return hint === null ? {} : { 'aria-description': hint };
}

/** A placeholder as a box shows it: a line of text over the field's picture, out of the pointer's way. */
export type FieldPlaceholderStyle = {
  position: 'absolute';
  inset: '0';
  boxSizing: 'border-box';
  display: 'flex';
  /** One line sits in the middle of its box; a box for several lines starts at the top. */
  alignItems: 'center' | 'flex-start';
  justifyContent: 'flex-start' | 'center' | 'flex-end';
  /** In pixels, with its unit. */
  padding: string;
  overflow: 'hidden';
  whiteSpace: 'nowrap';
  color: string;
  /** In pixels, with its unit. */
  fontSize: string;
  // The layer draws in the page, so the page's own text rules are pinned where they would show.
  lineHeight: '1.2';
  fontStyle: 'normal';
  fontWeight: '400';
  letterSpacing: 'normal';
  textTransform: 'none';
  pointerEvents: 'none';
  userSelect: 'none';
};

/** {@link FieldPlaceholderStyle} for text of `fontSize` points in a frame `height` pixels tall. */
function placeholderStyle(
  text: {
    readonly fontSize: number | null;
    readonly textAlign: 'left' | 'center' | 'right';
    readonly multiline: boolean;
  },
  height: number,
  scale: number,
  color: string | undefined,
): FieldPlaceholderStyle {
  // The field's own size, 12 pt for one that fits its box, never taller than the box has room for.
  const size = Math.min((text.fontSize || 12) * scale, height * 0.7);
  return {
    position: 'absolute',
    inset: '0',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: text.multiline ? 'flex-start' : 'center',
    justifyContent:
      text.textAlign === 'center'
        ? 'center'
        : text.textAlign === 'right'
          ? 'flex-end'
          : 'flex-start',
    padding: text.multiline ? `${2 * scale}px` : `0 ${2 * scale}px`,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    color: paint(
      'form-field-placeholder',
      color ?? EPDF_VARIABLES['form-field-placeholder'].default,
    ),
    fontSize: `${size}px`,
    lineHeight: '1.2',
    fontStyle: 'normal',
    fontWeight: '400',
    letterSpacing: 'normal',
    textTransform: 'none',
    pointerEvents: 'none',
    userSelect: 'none',
  };
}

/**
 * The style of what an empty field shows for its purpose, filling the widget's box at `frame`:
 * in the field's own text size and alignment, at the top of a box for several lines. `color` is
 * the form's `fields.placeholder` setting; `--epdf-form-field-placeholder` wins over it, and
 * left out it is the built-in color. The words are the layer's paint, not the field's value:
 * they take no pointer and no selection.
 */
export function fieldPlaceholderStyleOf(
  field: { box: { width: number }; look: FieldLook; multiline?: boolean },
  frame: PixelRect,
  color?: string,
): FieldPlaceholderStyle {
  return placeholderStyle(
    {
      fontSize: field.look.fontSize,
      textAlign: field.look.textAlign,
      multiline: field.multiline ?? false,
    },
    frame.height,
    scaleOf(field, frame),
    color,
  );
}

/**
 * {@link fieldPlaceholderStyleOf} for a lent field's placeholder, in the record's own text size
 * and alignment and the placeholder's own color. `box` is the record's frame in page points and
 * `frame` the same frame in pixels (`frameInPixels`): the words are as large as the form layer
 * writes them on the same field.
 */
export function recordPlaceholderStyleOf(
  placeholder: FieldPlaceholder,
  record: { readonly fontSize?: number | null; readonly textAlign?: string | null } | null,
  box: { readonly width: number },
  frame: { readonly width: number; readonly height: number },
): FieldPlaceholderStyle {
  const align = record?.textAlign;
  return placeholderStyle(
    {
      fontSize: record?.fontSize ?? null,
      textAlign: align === 'center' || align === 'right' ? align : 'left',
      multiline: false,
    },
    frame.height,
    box.width > 0 ? frame.width / box.width : 1,
    placeholder.color,
  );
}

/**
 * The purposes that are the web's own names for a value: the HTML `autocomplete` tokens a
 * field's purpose can be.
 */
const AUTOCOMPLETE_PURPOSES: ReadonlySet<string> = new Set([
  'name',
  'email',
  'organization',
  'organization-title',
]);

/**
 * What a field's control says in `autocomplete`, from the field's purpose, so the browser can
 * offer the person's saved value: the purpose itself where it is one of the web's names for a
 * value (`name`, `email`, `organization`, `organization-title`), `undefined` for any other
 * purpose and for none, which leaves the attribute out.
 */
export function autocompleteOf(purpose: string | null | undefined): string | undefined {
  return purpose != null && AUTOCOMPLETE_PURPOSES.has(purpose) ? purpose : undefined;
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
  /** Resolves with how the write ended (`'rejected'`: the form's validation refused it), or `null`. */
  commitDraftText(field: Field): Promise<{ readonly status: string } | null>;
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
 * commits, Escape discards. A commit keeps the typed text until the field
 * shows it (at once, as the form shows a fill before the engine answers), so
 * a blur never shows the old value for a moment. A value the form's
 * validation refuses stays typed, as in Acrobat; a write the engine refuses
 * puts the field's value back.
 */
export function createTextFieldEditor<Field>(
  form: TextFieldDrafts<Field>,
  field: Field,
  value: string,
): TextFieldEditor {
  let state: TextFieldEditorState = { focused: false, draft: value };
  let fieldValue = value;
  let cancelled = false;
  /** The text of the commit on its way, until the field shows it or the commit settles. */
  let committing: string | null = null;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<TextFieldEditorState>) => {
    const next = { ...state, ...patch };
    if (next.focused === state.focused && next.draft === state.draft) return;
    state = next;
    listeners.forEach((listener) => listener());
  };
  const commit = (typed: string) => {
    committing = typed;
    const settled = (keepTyped: boolean) => {
      if (committing !== typed) return;
      committing = null;
      if (!state.focused) set({ draft: keepTyped ? typed : fieldValue });
    };
    form.commitDraftText(field).then(
      (result) => settled(result?.status === 'rejected'),
      () => settled(false),
    );
  };
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setValue(next) {
      fieldValue = next;
      // Never mid-edit: what's typed stays until the edit ends. A commit's text stays until the
      // field shows it; from then on the field's value is what shows.
      if (state.focused || (committing !== null && next !== committing)) return;
      committing = null;
      set({ draft: next });
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
      if (cancelled || typed === fieldValue) {
        cancelled = false;
        form.discardDraftText(field);
        set({ focused: false, draft: fieldValue });
        return;
      }
      commit(typed);
      set({ focused: false, draft: typed });
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
