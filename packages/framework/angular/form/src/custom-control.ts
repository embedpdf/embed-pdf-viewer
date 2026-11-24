/**
 * A box drawn by a control of the app's: an `<ng-template [epdfFieldControl]>` inside
 * `<epdf-form-layer>` (`templates.ts`). The box is the layer's (`widget-box.ts`): placed and
 * turned like the field, the widget's event surface, and the cursor's way in, to the first
 * element inside that Tab stops at. The template draws in a frame of the field's 100% size,
 * scaled with the page. Its `native` is the field's picture and the layer's own control, drawn
 * as they are without a control of the app's. A click on the box runs the widget's action,
 * after a value the click wrote (`createFieldControlPress`).
 */
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, Directive, input } from '@angular/core';
import { EpdfSvgShapes } from '@embedpdf/angular/runtime';
import type { FormFieldValue, FormSetValueResult, FormWidgetItem } from '@embedpdf/plugin-form';
import {
  createFieldControlPress,
  fieldControlPlaceOf,
  isClickClaimed,
  runsActionOnClick,
  type FieldControlFrame,
} from '@embedpdf/web';
import {
  FormButtonControl,
  FormComboControl,
  FormListControl,
  FormSignatureControl,
  FormTextControl,
  FormToggleControl,
} from './controls';
import type { ShownLook } from './field-pictures';
import type { EpdfFieldControlTemplate } from './templates';
import { EPDF_FORM_EMBEDDED, FormWidgetBox } from './widget-box';

/**
 * The element the layer's own drawing of a box goes in, inside a control of the app's. The
 * layer's control in it only fills its place ({@link EPDF_FORM_EMBEDDED}).
 */
@Directive({
  selector: 'div[epdfFormNative]',
  providers: [{ provide: EPDF_FORM_EMBEDDED, useValue: true }],
})
export class FormNativeFrame {}

const sameFrame = (left: FieldControlFrame, right: FieldControlFrame): boolean =>
  left.width === right.width &&
  left.height === right.height &&
  left.rotation === right.rotation &&
  left.scale === right.scale;

@Component({
  selector: 'div[epdfFormCustom]',
  imports: [
    NgTemplateOutlet,
    EpdfSvgShapes,
    FormNativeFrame,
    FormTextControl,
    FormToggleControl,
    FormComboControl,
    FormListControl,
    FormButtonControl,
    FormSignatureControl,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(click)': 'clicked($event)' },
  template: `
    <!-- The layer's own drawing of the box, which the template may keep: its \`native\`. The
         controls are the ones the layer draws for a box no control of the app's matches. -->
    <ng-template #native>
      @let own = item();
      <div epdfFormNative [style]="place().nativeStyle">
        @if (look(); as shown) {
          @if (shown.kind === 'picture') {
            <img alt="" draggable="false" [attr.src]="shown.url" [style]="pictureStyle()" />
          } @else {
            <svg [attr.viewBox]="shown.viewBox" [style]="paintingStyle()">
              <svg:g [epdfSvgShapes]="shown.shapes"></svg:g>
            </svg>
          }
        }
        @switch (own.control) {
          @case ('text') {
            <div epdfFormText [item]="own" [colors]="colors()"></div>
          }
          @case ('toggle') {
            <div epdfFormToggle [item]="own" [colors]="colors()"></div>
          }
          @case ('choice') {
            @if (own.kind === 'list') {
              <div epdfFormList [item]="own" [colors]="colors()"></div>
            } @else {
              <div epdfFormCombo [item]="own" [colors]="colors()"></div>
            }
          }
          @case ('button') {
            <div epdfFormButton [item]="own" [colors]="colors()"></div>
          }
          @case ('signature') {
            <div epdfFormSignature [item]="own" [colors]="colors()"></div>
          }
        }
      </div>
    </ng-template>
    <!-- Drawn at the field's 100% size, scaled with the page as a whole. -->
    <div [style]="place().frameStyle">
      <ng-container
        [ngTemplateOutlet]="control().template"
        [ngTemplateOutletContext]="{
          $implicit: item(),
          widget: item(),
          frame: controlFrame(),
          native: native,
          setValue: setValue,
          focused: focused(),
        }"
      />
    </div>
  `,
})
export class FormCustomControl extends FormWidgetBox<FormWidgetItem> {
  /** The app's template that draws this box. */
  readonly control = input.required<EpdfFieldControlTemplate>();
  /** The widget as it looks now, for `native`; `null` while it has nothing to show. */
  readonly look = input<ShownLook | null>(null);

  // The template draws the box: an edge would be the layer's own look.
  protected override readonly drawsEdge = false;
  protected override readonly custom = true;

  /** The frame the template draws into, and where the layer's own drawing goes inside it. */
  protected readonly place = computed(() =>
    fieldControlPlaceOf(this.item(), this.page.transform()),
  );
  /** The frame the template is handed: the same object while its numbers stay the same. */
  protected readonly controlFrame = computed(() => this.place().frame, { equal: sameFrame });

  /** True while the cursor is in this box. */
  protected readonly focused = this.formBinding.select(
    (form) => form.isWidgetFocused(this.item().ref),
    false,
    Object.is,
  );

  /** Where the widget stands, inside `native`. A global `img { max-width: 100% }` reset would clamp it. */
  protected readonly pictureStyle = computed(() => ({
    ...this.place().pictureStyle,
    maxWidth: 'none',
    maxHeight: 'none',
    pointerEvents: 'none',
  }));
  protected readonly paintingStyle = computed(() => ({
    ...this.place().pictureStyle,
    overflow: 'visible',
    pointerEvents: 'none',
  }));

  /** One press for the box's life: the write the template is handed, and the box's click. */
  private readonly press = createFieldControlPress(
    (value: FormFieldValue): Promise<FormSetValueResult> => {
      try {
        return this.formBinding.require('setValue').setValue(this.item().fieldRef, value);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    () => this.activate(),
  );
  protected readonly setValue = this.press.setValue;

  /**
   * A click in the box runs the widget's action, as on the layer's own control, unless that
   * control, inside the template, dealt with the click itself.
   */
  protected clicked(event: Event): void {
    if (!isClickClaimed(event) && runsActionOnClick(this.item())) this.press.click();
  }
}
