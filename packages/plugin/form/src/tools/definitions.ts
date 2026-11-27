/**
 * The form-tool table — the single source of truth for the palette. Every
 * derivation reads this one list: interaction registration (annotation-less),
 * annotation tool/style registration (full viewer), active-tool → field
 * kind lookup, click placement, and default appearance. With the
 * annotation plugin each tool shows a ghost: the field a click places, drawn
 * with the tool's defaults where it will land. Every tool places upright: on
 * a page shown turned, its field reads as the author sees the page.
 *
 * "One tool system, two commit planes": the tools live in the annotation
 * registry when that plugin is present (defaults, style panel, click-create —
 * the shared authoring infrastructure), but the commit always goes
 * through `form.create()` from the form place handler. The tags make
 * that structural: these tools enable `form-place`, never `annotation-draw`,
 * so the annotation draw handler can't wake up for them.
 *
 * A tool can give its fields more than a kind: `field` is what every field it
 * places starts with, such as a purpose or a date format. The tools for the
 * values a person fills in (their name, their email address, the day they
 * sign) are text tools with a purpose. An app changes a tool or adds its own
 * with the `tools` setting ({@link resolveFormTools}).
 */
import {
  checkedPurpose,
  formatWriteOf,
  type FormFieldKind,
  type WidgetAppearance,
} from '@embedpdf/engine-core/runtime';
import type { ClickCreate } from '@embedpdf/plugin-annotation/contract';

import type { FormToolField, FormToolInput } from '../contract';

/** The kinds the palette places. */
export type AuthorableFormKind = Exclude<FormFieldKind, 'unknown'>;

export interface FormToolDefinition {
  id: string;
  /** The field kind the tool places (the form plane's vocabulary). */
  fieldKind: AuthorableFormKind;
  /** The client kind the annotation registry routes on (props panel).
   *  Not a PDF subtype — every widget is PDF `widget`; this is the view. */
  visualKind:
    | 'widget-text'
    | 'widget-choice'
    | 'widget-button'
    | 'widget-toggle'
    | 'widget-radio'
    | 'widget-box';
  /** What a bare click places (box policies only — fields are boxes). */
  clickCreate: Extract<ClickCreate, { width: number }>;
  /**
   * Place the field as the author sees the page: on a page shown turned, it
   * shows the click's size as seen and its contents are turned to read
   * upright there (a quarter turn, `/MK /R`), as Acrobat places a field on a
   * rotated page. With the annotation plugin, the tool registered there
   * decides (an app may change it); this is its value without it.
   */
  upright: boolean;
  /** Seed drawing defaults, the widget's appearance fields: a placed field is
   *  visible (white box, gray border) and restylable per tool through the
   *  shared style panel. */
  defaults: WidgetAppearance;
  cursor: string;
  /**
   * What every field the tool places starts with, over what its kind starts with: a purpose,
   * a format, a flag. Left out, the field has its kind's own start.
   */
  field?: FormToolField;
}

/** Palette tools keep widgets editable right after placement. */
export const PLACE_TAGS = ['form-place', 'annotation-edit'] as const;

const FIELD_CHROME: WidgetAppearance = {
  interiorColor: '#ffffff',
  color: '#6b7280',
  strokeWidth: 1,
};

export const FORM_TOOLS: readonly FormToolDefinition[] = [
  {
    id: 'form-text',
    fieldKind: 'text',
    visualKind: 'widget-text',
    clickCreate: { width: 160, height: 24 },
    upright: true,
    defaults: { ...FIELD_CHROME, fontSize: 12 },
    cursor: 'crosshair',
  },
  {
    id: 'form-checkbox',
    fieldKind: 'checkbox',
    visualKind: 'widget-toggle',
    clickCreate: { width: 18, height: 18 },
    upright: true,
    defaults: FIELD_CHROME,
    cursor: 'crosshair',
  },
  {
    id: 'form-radio',
    fieldKind: 'radio',
    // Round, as the engine draws a radio button: its ghost and its placement too.
    visualKind: 'widget-radio',
    clickCreate: { width: 18, height: 18 },
    upright: true,
    defaults: FIELD_CHROME,
    cursor: 'crosshair',
  },
  {
    id: 'form-combobox',
    fieldKind: 'combobox',
    visualKind: 'widget-choice',
    clickCreate: { width: 140, height: 24 },
    upright: true,
    defaults: { ...FIELD_CHROME, fontSize: 12 },
    cursor: 'crosshair',
  },
  {
    id: 'form-listbox',
    fieldKind: 'listbox',
    visualKind: 'widget-choice',
    clickCreate: { width: 140, height: 72 },
    upright: true,
    defaults: { ...FIELD_CHROME, fontSize: 12 },
    cursor: 'crosshair',
  },
  // A push button: its caption is its text; what it does is its actions.
  {
    id: 'form-button',
    fieldKind: 'pushbutton',
    visualKind: 'widget-button',
    clickCreate: { width: 100, height: 28 },
    upright: true,
    defaults: { ...FIELD_CHROME, interiorColor: '#e5e7eb', fontSize: 12 },
    cursor: 'crosshair',
  },
  // A signature field: the bare widget box every non-text kind ingests
  // as (`widget-box`). It has no value of its own to style — the signing
  // act (the signature plugin) draws the mark into it later.
  {
    id: 'form-signature',
    fieldKind: 'signature',
    visualKind: 'widget-box',
    clickCreate: { width: 160, height: 48 },
    upright: true,
    defaults: FIELD_CHROME,
    cursor: 'crosshair',
  },
  // The values a person fills in: a text field that says what it is for. `prefill()` writes
  // the first four from the session's identity; the tool's id is `form-` and the purpose.
  valueTool('name'),
  valueTool('email'),
  valueTool('organization'),
  valueTool('organization-title'),
  // The day of signing is written for the signer, not typed: a read-only date field, in a
  // pattern that reads the same in every country.
  {
    ...valueTool('date-signed'),
    clickCreate: { width: 100, height: 24 },
    field: {
      purpose: 'date-signed',
      format: { kind: 'date', pattern: 'yyyy-mm-dd' },
      readOnly: true,
    },
  },
];

/** A text tool whose fields have a purpose: what `form-text` places, and the purpose. */
function valueTool(purpose: string): FormToolDefinition {
  return {
    id: `form-${purpose}`,
    fieldKind: 'text',
    visualKind: 'widget-text',
    clickCreate: { width: 160, height: 24 },
    upright: true,
    defaults: { ...FIELD_CHROME, fontSize: 12 },
    cursor: 'crosshair',
    field: { purpose },
  };
}

export const FORM_TOOL_BY_ID: ReadonlyMap<string, FormToolDefinition> = new Map(
  FORM_TOOLS.map((tool) => [tool.id, tool]),
);

/**
 * Refuse a tool whose `field` names a purpose or a format no field of its kind can have, with
 * the engine's own reason: what the engine would refuse at every click.
 */
function checkField(tool: FormToolDefinition): void {
  const field = tool.field as { purpose?: unknown; format?: unknown } | undefined;
  if (!field) return;
  try {
    if (field.purpose !== undefined) checkedPurpose(field.purpose);
    formatWriteOf({ format: field.format }, tool.fieldKind);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`[form] tool '${tool.id}': ${reason}`);
  }
}

/**
 * The field tools a document has: {@link FORM_TOOLS}, then the app's `entries`, each applied in
 * order. An entry with `extends` is a new tool that starts from a copy of the tool it names,
 * which has to be listed before it; an entry without it changes the tool that has its id. What
 * an entry gives goes over what the tool had: `field` and `defaults` member by member,
 * `clickCreate` whole. Throws for an entry that names no tool, for one that `extends` under the
 * id of a tool there is (it would replace that tool unasked), and for a `field` whose purpose
 * or format a field of the tool's kind can't have.
 */
export function resolveFormTools(
  entries: readonly FormToolInput[] = [],
): ReadonlyMap<string, FormToolDefinition> {
  const tools = new Map<string, FormToolDefinition>(FORM_TOOLS.map((tool) => [tool.id, tool]));
  for (const entry of entries) {
    const base = tools.get(entry.extends ?? entry.id);
    if (!base) {
      throw new Error(
        entry.extends === undefined
          ? `[form] tool '${entry.id}' is not a field tool: give it \`extends\` to add one`
          : `[form] tool '${entry.id}' extends '${entry.extends}', which isn't a field tool listed before it`,
      );
    }
    if (entry.extends !== undefined && tools.has(entry.id)) {
      throw new Error(
        `[form] tool '${entry.id}' extends '${entry.extends}', but '${entry.id}' is a field tool already: leave \`extends\` out to change it, or give the new tool another id`,
      );
    }
    const field =
      base.field || entry.field ? ({ ...base.field, ...entry.field } as FormToolField) : undefined;
    const tool: FormToolDefinition = {
      ...base,
      id: entry.id,
      defaults: { ...base.defaults, ...entry.defaults },
      ...(entry.clickCreate ? { clickCreate: { ...entry.clickCreate } } : {}),
      ...(field ? { field } : {}),
    };
    checkField(tool);
    tools.set(tool.id, tool);
  }
  return tools;
}
