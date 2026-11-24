/**
 * The form plugin's service and feature:
 *
 *   withForm(config)          the plugin, for provideEmbedPdf()
 *   inject(EpdfForm)          read, fill and build the form: `fields()`, `setValue()`, `create()`,
 *                             the events as streams (`valueChanged$`), and the settings
 *   form.valueOf(ref)         one field's value, as a signal
 *   form.controlOf(ref)       one field as a Reactive Forms `FormControl`, for your own inputs
 *   form.widgetAnchorOf(ref)  an anchor for `<epdf-anchored>` that keeps UI on one box of a field
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
import {
  CapabilityBinding,
  injectDocumentScope,
  pluginService,
  type EmbedPdfFeature,
} from '@embedpdf/angular/runtime';
import type { AnnotationRef } from '@embedpdf/core';
import {
  formPlugin,
  formState,
  FormToken,
  type FormConfig,
  type FormFieldRef,
  type FormFieldValue,
  type FormPlainValue,
  type FormWidgetAnchor,
} from '@embedpdf/plugin-form';
import {
  FormToken as FormHostToken,
  type FormHostCapability,
} from '@embedpdf/plugin-form/contract/host';
import { samePageBounds } from '@embedpdf/web';

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
 * The form: `fields()`, `status()`, `formKind()`, `selectedField()`, `selectedFields()`,
 * `focusedField()`, `groups()` and `designGroup()` as signals; reading, filling, form data and
 * building as methods (`setValue()`, `importValues()`, `export()`, `create()`, `update()`,
 * `setGroups()`, `setDesignGroup()`, `moveToGroup()`, …, the Methods tables of the Filling forms
 * and Building forms pages); the events as streams (`valueChanged$`, `validationRejected$`,
 * `fieldCreated$`, `groupsChanged$`, `designGroupChanged$`, …); and the settings. Without a
 * document, `fields()` is empty and a method refuses with `not-ready`.
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
    'getWidgets',
    'getValue',
    'listWidgets',
    'getWidgetAt',
    'getSelectedField',
    'listSelectedFields',
    'getFocusedField',
    'listGroups',
    'getDesignGroup',
    'validate',
    'exportValues',
    'setValue',
    'setValues',
    'importValues',
    'reset',
    'activateWidget',
    'focus',
    'focusNext',
    'export',
    'import',
    'refresh',
    'create',
    'duplicate',
    'duplicateWidgets',
    'setGroups',
    'setDesignGroup',
    'moveToGroup',
    'update',
    'delete',
    'removeWidget',
    'deleteWidget',
    'reorderCalculations',
    'repair',
    'canRead',
    'canFill',
    'canDesign',
    'canSetGroup',
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
    'onFocusChanged',
    'onDesignGroupChanged',
    'onGroupsChanged',
  ],
}) {
  /** The same capability, typed with the reads only framework code has (a box's anchor). */
  private readonly host = new CapabilityBinding<FormHostCapability>(
    this.binding.host,
    () => FormHostToken,
    injectDocumentScope(),
  );

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
   * An anchor for `<epdf-anchored>` that keeps a tag or a card on one box of a field (a
   * widget's `ref`): its page and where the box stands, following the box as it is moved in
   * design mode. Pass the ref, or a function that reads it
   * (`() => this.focused()?.widget ?? null`). Null for null, or a box that isn't here. It
   * changes when the box moves, not while people scroll or zoom.
   */
  widgetAnchorOf(
    widget: AnnotationRef | null | (() => AnnotationRef | null | undefined),
  ): Signal<FormWidgetAnchor | null> {
    const widgetOf = typeof widget === 'function' ? widget : () => widget;
    return this.host.select(
      (form) => {
        const target = widgetOf();
        return target ? form.getWidgetAnchor(target) : null;
      },
      null,
      samePageBounds,
    );
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
    const fillable = this.binding.select((form) => {
      const current = form.get(refOf());
      return current !== null && !current.readOnly && form.canFill(current.ref);
    }, false);

    const control = new FormControl<FormPlainValue>(untracked(value));
    const show = (plain: FormPlainValue) => {
      if (!samePlain(plain, control.value)) control.setValue(plain, { emitEvent: false });
    };

    // The field shows a write as soon as it's made, so the control follows the field: a value
    // the form refuses, or its scripts rewrite, shows as the field has it.
    effect(() => {
      const plain = value();
      untracked(() => show(plain));
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
      // By name, through the plugin's own plain-value conversion and its write queue.
      void Promise.resolve()
        .then(() => this.importValues({ [name]: plain }))
        .catch(() => undefined);
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
    return control;
  }
}

/** The form plugin: fields people fill in on every page with an `<epdf-form-layer>`. */
export function withForm(config?: FormConfig): EmbedPdfFeature {
  return { plugins: [formPlugin(config)], services: [EpdfForm] };
}
