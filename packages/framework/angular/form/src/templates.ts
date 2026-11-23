/**
 * The template `<epdf-form-layer>` draws a box with, in place of React's `controls` prop:
 *
 *   <epdf-form-layer>
 *     <ng-template [epdfFieldControl]="isCheckbox" let-widget let-setValue="setValue">…
 *   </epdf-form-layer>
 *
 * A control is a rule: the function says which boxes the template draws. The first control
 * that matches a box draws it, in the order the templates are written; a box no control matches
 * is drawn by the layer. Which control draws a box, the frame it draws into and the order of a
 * value and the widget's action are `@embedpdf/web`'s, the same for every framework.
 */
import { Directive, inject, input, TemplateRef } from '@angular/core';
import type { FormFieldValue, FormSetValueResult, FormWidgetItem } from '@embedpdf/plugin-form';
import type { FieldControlFrame } from '@embedpdf/web';

/** Which boxes a control draws: a function of the box, with everything it tells you. */
export type FieldControlMatch = (widget: FormWidgetItem) => boolean;

/**
 * What a control's template gets. `let-widget` is the box; the rest are named:
 * `let-frame="frame"`, `let-native="native"`, `let-setValue="setValue"`, `let-focused="focused"`.
 */
export interface EpdfFieldControlTemplateContext {
  /** The box, as `listWidgets()` gives it: its field, its control, its value and what it tells you. */
  $implicit: FormWidgetItem;
  /** The same box, by name. */
  widget: FormWidgetItem;
  /**
   * The box you draw into. The layer places, turns and scales it like the field. Fill it
   * (`width: 100%; height: 100%`) and draw at the field's 100% size: your drawing scales with
   * the page.
   */
  frame: FieldControlFrame;
  /**
   * The layer's own control for the box, filling the frame:
   * `<ng-container [ngTemplateOutlet]="native" />` keeps the control, to add to it.
   */
  native: TemplateRef<unknown>;
  /**
   * Fill the field in, as `form.setValue()` does for this box's field: the same checks, scripts
   * and undo step. A click that calls it runs the widget's action after the value is written,
   * as in Acrobat.
   */
  setValue: (value: FormFieldValue) => Promise<FormSetValueResult>;
  /** True while the cursor is in this box. */
  focused: boolean;
}

/**
 * Your own control for some boxes: `<ng-template [epdfFieldControl]="isCheckbox" let-widget>`.
 * Give it a function that picks boxes by their control, their field's group or anything else a
 * box tells you. The template draws in a frame the layer places, turns and scales like the
 * field, and shows while the active tool fills forms, like the layer's own controls.
 */
@Directive({ selector: 'ng-template[epdfFieldControl]' })
export class EpdfFieldControlTemplate {
  /**
   * Which boxes it draws: a function of the box. Without one it draws none. (Not a required
   * input: a template inside `@if` is in the layer's query a moment before its inputs are set.)
   */
  readonly match = input<FieldControlMatch | undefined>(undefined, { alias: 'epdfFieldControl' });

  readonly template = inject<TemplateRef<EpdfFieldControlTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfFieldControlTemplate,
    context: unknown,
  ): context is EpdfFieldControlTemplateContext {
    return true;
  }
}
