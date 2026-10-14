/**
 * `<epdf-form-layer>`: the form's fields on one page, painted as the engine draws them (their
 * values, borders and fonts), with the controls people fill them in with. Put it above the
 * page's picture (`<epdf-render-layer>`, and `<epdf-annotation-layer>` when the annotation
 * plugin is registered); while it's there, the render layer leaves the fields out of the page's
 * picture:
 *
 *   <ng-template epdfPage>
 *     <epdf-render-layer />
 *     <epdf-form-layer />
 *   </ng-template>
 *
 * It works with or without the annotation plugin. The controls show while the active tool fills
 * forms (the `pointer` and `pan` tools do), and stand down in design mode, where fields are
 * boxes you select and move. Each field becomes a real HTML control (`controls.ts`), placed and
 * styled like the field in the PDF, in the colors of the form settings, which the
 * `--epdf-form-*` CSS variables override.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import type { CapabilityToken } from '@embedpdf/core';
import {
  CapabilityBinding,
  injectKernelHost,
  injectPage,
  paintsPagePart,
} from '@embedpdf/angular/runtime';
import {
  FORM_DEFAULTS,
  FormToken,
  type FormSettings,
  type FormWidgetItem,
} from '@embedpdf/plugin-form';
import { FormToken as FormHostToken } from '@embedpdf/plugin-form/contract/host';
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import { formColorsOf } from '@embedpdf/web';
import {
  FormButtonControl,
  FormComboControl,
  FormListControl,
  FormSignatureControl,
  FormTextControl,
  FormToggleControl,
} from './controls';
import { EpdfFieldPictures } from './field-pictures';

const NO_WIDGETS: readonly FormWidgetItem[] = Object.freeze([]);

@Component({
  selector: 'epdf-form-layer',
  imports: [
    EpdfFieldPictures,
    FormTextControl,
    FormToggleControl,
    FormComboControl,
    FormListControl,
    FormButtonControl,
    FormSignatureControl,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="position: absolute; inset: 0; pointer-events: none">
      <epdf-field-pictures />
      @if (active()) {
        <!-- One control per widget: a field with several boxes has one per box. -->
        @for (item of widgets(); track item.key + ':' + item.annotObjectNumber) {
          @switch (item.control) {
            @case ('text') {
              <div epdfFormText [item]="item" [colors]="colors()"></div>
            }
            @case ('toggle') {
              <div epdfFormToggle [item]="item" [colors]="colors()"></div>
            }
            @case ('choice') {
              @if (item.kind === 'list') {
                <div epdfFormList [item]="item" [colors]="colors()"></div>
              } @else {
                <div epdfFormCombo [item]="item" [colors]="colors()"></div>
              }
            }
            @case ('button') {
              <div epdfFormButton [item]="item" [colors]="colors()"></div>
            }
            @case ('signature') {
              <div epdfFormSignature [item]="item" [colors]="colors()"></div>
            }
          }
        }
      }
    </div>
  `,
})
export class EpdfFormLayer {
  private readonly page = injectPage('<epdf-form-layer>');
  private readonly host = injectKernelHost('<epdf-form-layer>');

  /** A plugin of the page's own document: every plugin below is read for it. */
  private bindTo<Capability>(token: CapabilityToken<Capability>): CapabilityBinding<Capability> {
    return new CapabilityBinding(
      this.host,
      () => token,
      () => this.page.documentId,
    );
  }

  private readonly form = this.bindTo(FormHostToken);

  /** Whether the active tool fills forms: the layer draws nothing in design mode. */
  protected readonly active = this.bindTo(InteractionHostToken).select(
    (interaction) => interaction.activeToolEnables('form-fill'),
    false,
  );

  /** The page's widgets: the same array while nothing on the page changes. */
  protected readonly widgets = this.form.select(
    (form) => form.listWidgets(this.page.ref),
    NO_WIDGETS,
  );

  /** The form settings, with or without a document: they belong to the plugin. */
  private readonly settings: Signal<FormSettings> = this.host.provides(FormToken)
    ? this.host.settingsOf<FormSettings>(FormToken).current
    : signal(FORM_DEFAULTS).asReadonly();

  /** The colors the viewer draws fields with: the form settings over the viewer's accent. */
  protected readonly colors = computed(() => {
    const { focus, fields } = this.settings();
    return formColorsOf({ focus, fields }, this.host.viewerSettings().accent);
  });

  constructor() {
    // While it's here with the form plugin, the page's picture leaves the fields to it.
    paintsPagePart(() => (this.form.capability() ? this.page.ref : null), 'formFields');
    // Read the page's widgets when the layer comes to it: one read for the form.
    effect(() => {
      const form = this.form.capability();
      if (form) untracked(() => void form.ensureLoaded(this.page.ref));
    });
  }
}
