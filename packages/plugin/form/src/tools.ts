/**
 * THE form-tool table — the single source of truth for the palette. Every
 * derivation reads this one list: interaction registration (annotation-less),
 * annotation tool/style registration (full viewer), active-tool → field
 * family lookup, click placement, and default appearance.
 *
 * "One tool system, two commit planes": the tools live in the ANNOTATION
 * registry when that plugin is present (defaults, style panel, click-create —
 * the shared authoring infrastructure), but the COMMIT always goes
 * through `doc.forms.createField` via the form place handler. The tags make
 * that structural: these tools enable `form-place`, never `annotation-draw`,
 * so the annotation draw handler can't wake up for them.
 */
import type { FormFieldFamily } from '@embedpdf/engine-core/runtime';
import type { AnnotationPropsPatch, ClickCreate } from '@embedpdf/plugin-annotation';

/** The families the palette can author (no pushbutton/signature tools). */
export type AuthorableFormFamily = Exclude<FormFieldFamily, 'pushbutton' | 'signature' | 'unknown'>;

export interface FormToolDef {
  id: string;
  /** The field family `placeField` commits (the FORM plane's vocabulary). */
  family: AuthorableFormFamily;
  /** The client kind the ANNOTATION registry routes on (props panel).
   *  Not a PDF subtype — every widget is PDF `widget`; this is the view. */
  visualKind: 'widget-text' | 'widget-choice' | 'widget-toggle';
  /** What a bare click places (box policies only — fields are boxes). */
  clickCreate: Extract<ClickCreate, { width: number }>;
  /** Seed drawing defaults: a placed field is VISIBLE (white box, gray
   *  border) and restylable per tool through the shared style panel. */
  defaults: AnnotationPropsPatch;
  cursor: string;
}

/** Palette tools keep widgets editable right after placement. */
export const PLACE_TAGS = ['form-place', 'annotation-edit'] as const;

const FIELD_CHROME: AnnotationPropsPatch = {
  interiorColor: '#ffffff',
  color: '#6b7280',
  strokeWidth: 1,
};

export const FORM_TOOLS: readonly FormToolDef[] = [
  {
    id: 'form-text',
    family: 'text',
    visualKind: 'widget-text',
    clickCreate: { width: 160, height: 24 },
    defaults: { ...FIELD_CHROME, fontSize: 12 },
    cursor: 'crosshair',
  },
  {
    id: 'form-checkbox',
    family: 'checkbox',
    visualKind: 'widget-toggle',
    clickCreate: { width: 18, height: 18 },
    defaults: FIELD_CHROME,
    cursor: 'crosshair',
  },
  {
    id: 'form-radio',
    family: 'radio',
    visualKind: 'widget-toggle',
    clickCreate: { width: 18, height: 18 },
    defaults: FIELD_CHROME,
    cursor: 'crosshair',
  },
  {
    id: 'form-combobox',
    family: 'combobox',
    visualKind: 'widget-choice',
    clickCreate: { width: 140, height: 24 },
    defaults: { ...FIELD_CHROME, fontSize: 12 },
    cursor: 'crosshair',
  },
  {
    id: 'form-listbox',
    family: 'listbox',
    visualKind: 'widget-choice',
    clickCreate: { width: 140, height: 72 },
    defaults: { ...FIELD_CHROME, fontSize: 12 },
    cursor: 'crosshair',
  },
];

export const FORM_TOOL_BY_ID: ReadonlyMap<string, FormToolDef> = new Map(
  FORM_TOOLS.map((t) => [t.id, t]),
);
