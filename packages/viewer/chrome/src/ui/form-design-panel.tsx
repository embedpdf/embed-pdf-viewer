/**
 * The form designer's sidebar (`form-design`, which `form:design` opens): what the form's
 * fields are. With no field selected it lists them by page, and a click selects one and
 * scrolls to it; with one selected it shows its settings and, for a radio group or a checkbox,
 * its buttons, with a + that adds one next in line (`form.addWidget`). How a field looks is the
 * style panel's.
 */
import { AnnotationToken, useAnnotationState } from '@embedpdf/react/annotation';
import {
  FormToken,
  type FormFieldDTO,
  type FormFieldFamily,
  type WidgetAnnotation,
} from '@embedpdf/react/form';
import { useT } from '@embedpdf/react/i18n';
import { InteractionToken } from '@embedpdf/react/interaction';
import { useOptionalCapability, useOptionalSelector, usePageList } from '@embedpdf/react/runtime';
import { useStage } from '@embedpdf/react/stage';
import { useMemo } from 'react';

import { FORM_DESIGN_TOOL, isFormDesignTool } from '../config/commands';
import { FieldSettings } from './field-settings';
import { Icon } from './icons';

/** Each family's icon and name, as its field tool shows them. */
const FAMILIES: Readonly<Partial<Record<FormFieldFamily, { icon: string; labelKey: string }>>> = {
  text: { icon: 'formTextfield', labelKey: 'commands.form.textfield' },
  checkbox: { icon: 'formCheckbox', labelKey: 'commands.form.checkbox' },
  radio: { icon: 'formRadio', labelKey: 'commands.form.radio' },
  combobox: { icon: 'formSelect', labelKey: 'commands.form.select' },
  listbox: { icon: 'formListbox', labelKey: 'commands.form.listbox' },
  pushbutton: { icon: 'formButton', labelKey: 'commands.form.button' },
  signature: { icon: 'signature', labelKey: 'commands.form.signature' },
};

const NO_FIELDS: readonly FormFieldDTO[] = [];
const NO_WIDGETS: readonly WidgetAnnotation[] = [];

/** A widget's object number, the key its rows and its selection share. */
const numberOf = (widget: WidgetAnnotation): number =>
  widget.ref.kind === 'objectNumber' ? widget.ref.objectNumber : -1;

/** The form's own actions: select a widget and show it, design on first if it was off. */
function useFormDesign() {
  const annotation = useOptionalCapability(AnnotationToken);
  const interaction = useOptionalCapability(InteractionToken);
  const stage = useStage();
  const activeTool = useOptionalSelector(
    InteractionToken,
    (tools) => tools.getActiveToolId(),
    null,
  );
  return {
    select(widget: WidgetAnnotation) {
      // The widgets are lent only while a form is designed.
      if (!isFormDesignTool(activeTool)) interaction?.activateTool(FORM_DESIGN_TOOL);
      annotation?.selection.set([widget.ref]);
      stage.reveal(widget.page, { rect: widget.box });
    },
    clear() {
      annotation?.selection.set([]);
    },
  };
}

export function FormDesignPanel() {
  const form = useOptionalCapability(FormToken);
  const selected = useOptionalSelector(
    FormToken,
    (capability) => capability.getSelectedField(),
    null,
  );
  if (!form) return null;
  return selected ? <SelectedField field={selected} /> : <FieldList />;
}

/** Every field of the form, by page, in reading order. */
function FieldList() {
  const t = useT();
  const design = useFormDesign();
  const pages = usePageList();
  const form = useOptionalCapability(FormToken);
  const fields = useOptionalSelector(FormToken, (capability) => capability.list(), NO_FIELDS);
  const groups = useMemo(() => {
    const indexOf = new Map(pages.map((page) => [page.ref.objectNumber, page.index]));
    const rows = fields.flatMap((field) => {
      const place = form?.getWidgets(field.ref)[0];
      const index = place ? indexOf.get(place.page.objectNumber) : undefined;
      return place && index !== undefined ? [{ field, place, index }] : [];
    });
    rows.sort(
      (left, right) =>
        left.index - right.index ||
        left.place.box.y - right.place.box.y ||
        left.place.box.x - right.place.box.x,
    );
    const byPage = new Map<number, typeof rows>();
    for (const row of rows) byPage.set(row.index, [...(byPage.get(row.index) ?? []), row]);
    return [...byPage];
  }, [fields, form, pages]);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <Icon name="formDesign" size={32} className="text-fg-muted" />
        <p className="text-fg-muted text-sm">{t('formDesign.empty')}</p>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {groups.map(([index, rows]) => (
        <section key={index} className="mb-3">
          <h3 className="text-fg-muted px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide">
            {t('formDesign.page', { params: { page: index + 1 } })}
          </h3>
          <ul className="flex flex-col">
            {rows.map(({ field, place }) => {
              const family = FAMILIES[field.family];
              return (
                <li key={field.name}>
                  <button
                    type="button"
                    onClick={() => design.select(place)}
                    className="hover:bg-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start"
                  >
                    <Icon
                      name={family?.icon ?? 'formTextfield'}
                      size={16}
                      className="text-fg-muted shrink-0"
                    />
                    <span className="text-fg min-w-0 flex-1 truncate text-sm">{field.name}</span>
                    {family && <span className="sr-only">{t(family.labelKey)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The selected field: its settings and, for a radio group or a checkbox, its buttons. */
function SelectedField({ field }: { field: FormFieldDTO }) {
  const t = useT();
  const design = useFormDesign();
  const family = FAMILIES[field.family];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <button
        type="button"
        onClick={design.clear}
        className="text-accent mb-3 flex items-center gap-1 text-sm"
      >
        <Icon name="chevronLeft" size={14} />
        {t('formDesign.allFields')}
      </button>
      <p className="text-fg mb-4 flex items-center gap-2 text-sm font-semibold">
        <Icon name={family?.icon ?? 'formTextfield'} size={16} className="text-fg-muted shrink-0" />
        <span className="min-w-0 truncate">{field.name}</span>
      </p>
      <p className="text-fg-muted mb-3 text-[11px] font-semibold uppercase tracking-wide">
        {t('demo.fieldSettingsTitle')}
      </p>
      <FieldSettings field={field} />
      {(field.family === 'radio' || field.family === 'checkbox') && <Buttons field={field} />}
    </div>
  );
}

/** A radio group's or a checkbox's buttons, each selectable, and a + for one more. */
function Buttons({ field }: { field: FormFieldDTO & { family: 'radio' | 'checkbox' } }) {
  const t = useT();
  const design = useFormDesign();
  const form = useOptionalCapability(FormToken);
  const places = useOptionalSelector(
    FormToken,
    (capability) => capability.getWidgets(field.ref),
    NO_WIDGETS,
  );
  const chosen = useAnnotationState((state) => state.selected);
  const isChosen = (place: WidgetAnnotation) =>
    chosen.some(
      (record) => record.ref.kind === 'objectNumber' && record.ref.objectNumber === numberOf(place),
    );
  const radio = field.family === 'radio';
  const add = async () => {
    if (!form) return;
    const { widget } = await form.addWidget(field.ref);
    design.select(widget);
  };
  return (
    <section className="border-border-subtle mt-4 border-t pt-4">
      <p className="text-fg-muted mb-2 text-[11px] font-semibold uppercase tracking-wide">
        {t(radio ? 'formDesign.buttons' : 'formDesign.boxes')}
      </p>
      <ul className="mb-2 flex flex-col">
        {places.map((place, at) => {
          const widget = field.widgets.find((each) => each.objectNumber === numberOf(place));
          return (
            <li key={numberOf(place)}>
              <button
                type="button"
                aria-pressed={isChosen(place)}
                onClick={() => design.select(place)}
                className={`hover:bg-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm ${
                  isChosen(place) ? 'bg-selected text-accent' : 'text-fg'
                }`}
              >
                <Icon name={radio ? 'formRadio' : 'formCheckbox'} size={14} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {radio && widget && 'exportValue' in widget
                    ? widget.exportValue
                    : t('formDesign.box', { params: { number: at + 1 } })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => void add().catch(() => undefined)}
        className="text-accent flex items-center gap-1 text-sm"
      >
        <Icon name="plus" size={14} />
        {t(radio ? 'formDesign.addButton' : 'formDesign.addBox')}
      </button>
    </section>
  );
}
