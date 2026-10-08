/**
 * The form plugin's service and feature:
 *
 *   withForm(config)          the plugin, for provideEmbedPdf()
 *   inject(EpdfForm)          read, fill and build the form: `fields()`, `setValue()`, `create()`,
 *                             the events as streams (`valueChanged$`), and the settings
 *   form.valueOf(ref)         one field's value, as a signal
 *   form.controlOf(ref)       one field as a Reactive Forms `FormControl`, for your own inputs
 */
import {
  assertInInjectionContext,
  DestroyRef,
  effect,
  inject,
  Injectable,
  untracked,
  type Signal,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import {
  formPlugin,
  formState,
  FormToken,
  type FormConfig,
  type FormFieldRef,
  type FormFieldValue,
  type FormPlainValue,
} from '@embedpdf/plugin-form';

/** A field's ref, or a function that gives it (a component input, a route parameter). */
export type FieldRefSource = FormFieldRef | (() => FormFieldRef);

const refGetter = (ref: FieldRefSource): (() => FormFieldRef) =>
  typeof ref === 'function' ? ref : () => ref;

/** Two plain values the same: lists element by element, everything else by value. */
const samePlain = (left: FormPlainValue, right: FormPlainValue): boolean =>
  Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index])
    : left === right;

/**
 * The form: `fields()`, `status()`, `formKind()` and `selectedField()` as signals; reading,
 * filling, form data and building as methods (`setValue()`, `importValues()`, `export()`,
 * `create()`, `update()`, …, the Methods tables of the Filling forms and Building forms pages);
 * the events as streams (`valueChanged$`, `validationRejected$`, `fieldCreated$`, …); and the
 * settings. Without a document, `fields()` is empty and a method refuses with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfForm extends pluginService({
  name: 'EpdfForm',
  feature: 'withForm()',
  token: FormToken,
  state: formState,
  methods: [
    'getSnapshot',
    'getStatus',
    'getFormKind',
    'list',
    'get',
    'getFieldForWidget',
    'getWidget',
    'getValue',
    'listWidgets',
    'getWidgetAt',
    'getSelectedField',
    'validate',
    'exportValues',
    'setValue',
    'setValues',
    'importValues',
    'reset',
    'activateWidget',
    'export',
    'import',
    'refresh',
    'create',
    'update',
    'delete',
    'removeWidget',
    'deleteWidget',
    'reorderCalculations',
    'repair',
    'canRead',
    'canFill',
    'canDesign',
    'canRestoreAttribution',
    'canWriteScripts',
  ],
  events: [
    'onValueChanged',
    'onFieldCreated',
    'onFieldUpdated',
    'onFieldDeleted',
    'onValidationRejected',
    'onResynced',
  ],
}) {
  /**
   * One field's value, in the shape `setValue()` takes, as a signal: it changes only when that
   * field's value does, and is `null` for a field without a value, and without a document. Keep
   * it in a field (`readonly total = form.valueOf(toFieldRef('total'))`); `ref` may be a
   * function, such as a signal input, and the value follows it.
   *
   * (`override`: every object has a `valueOf()` without arguments, which JavaScript calls to
   * turn it into a primitive. Called that way, this returns a signal, which isn't one, so
   * JavaScript goes on to `toString()` as it would without it.)
   */
  override valueOf(ref: FieldRefSource): Signal<FormFieldValue | null> {
    const refOf = refGetter(ref);
    // The plugin keeps one value object per field while the field stays the same.
    return this.binding.select((form) => form.getValue(refOf()), null, Object.is);
  }

  /**
   * One field as a Reactive Forms `FormControl`, for an input of your own:
   * `<input [formControl]="name" />`. The control holds the field's value as plain data (a text
   * box's, dropdown's or radio group's text, a checkbox's `true` or `false`, a list's selected
   * values; `null` for none), and takes every change of it, whoever made it. A change of the
   * control fills in the field, with the same checks and scripts as typing in the PDF does; a
   * value the form refuses puts the field's value back in the control. The control is disabled
   * while the field can't be filled in: no such field (yet), a read-only one, or no
   * `doc.forms.fill`.
   *
   * Call it in an injection context (a constructor or a field initializer): the control follows
   * the field for as long as the caller lives.
   */
  controlOf(ref: FieldRefSource): FormControl<FormPlainValue> {
    assertInInjectionContext(this.controlOf);
    const refOf = refGetter(ref);
    const field = this.binding.select((form) => form.get(refOf()), null, Object.is);
    // The plain value the plugin exports for the field, so a control reads what
    // `exportValues()` gives and writes what `importValues()` takes.
    const value = this.binding.select(
      (form) => {
        const current = form.get(refOf());
        return current ? (form.exportValues()[current.name] ?? null) : null;
      },
      null,
      samePlain,
    );
    const fillable = this.binding.select(
      (form) => {
        const current = form.get(refOf());
        return current !== null && !current.readOnly && form.canFill();
      },
      false,
    );

    const control = new FormControl<FormPlainValue>(untracked(value));
    // Writes on their way. While there are any, the field's value lags behind the control's,
    // and putting it in the control would undo what's being typed.
    let writing = 0;
    const show = (plain: FormPlainValue) => {
      if (!samePlain(plain, control.value)) control.setValue(plain, { emitEvent: false });
    };

    effect(() => {
      const plain = value();
      if (writing === 0) untracked(() => show(plain));
    });
    effect(() => {
      const enabled = fillable();
      untracked(() =>
        enabled ? control.enable({ emitEvent: false }) : control.disable({ emitEvent: false }),
      );
    });

    const subscription = control.valueChanges.subscribe((plain) => {
      const name = untracked(field)?.name;
      if (name === undefined) return;
      writing += 1;
      // By name, through the plugin's own plain-value conversion and its write queue.
      void Promise.resolve()
        .then(() => this.importValues({ [name]: plain }))
        .catch(() => undefined)
        .finally(() => {
          writing -= 1;
          // The field has the last word: a refused or rewritten value shows as the field has it.
          if (writing === 0) show(untracked(value));
        });
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
    return control;
  }
}

/** The form plugin: fields people fill in on every page with an `<epdf-form-layer>`. */
export function withForm(config?: FormConfig): EmbedPdfFeature {
  return { plugins: [formPlugin(config)], services: [EpdfForm] };
}
