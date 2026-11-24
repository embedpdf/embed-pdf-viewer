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
 *
 * An `<ng-template [epdfFieldControl]>` inside the layer draws the boxes its function matches
 * with a control of yours (`templates.ts`, `custom-control.ts`); it shows and stands down with
 * the layer's own.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  effect,
  signal,
  untracked,
  type Signal,
} from '@angular/core';
import { annotationKey, type CapabilityToken } from '@embedpdf/core';
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
import { fieldControlFor, formColorsOf } from '@embedpdf/web';
import {
  FormButtonControl,
  FormComboControl,
  FormListControl,
  FormSignatureControl,
  FormTextControl,
  FormToggleControl,
} from './controls';
import { FormCustomControl } from './custom-control';
import { EpdfFieldPictures, injectFieldLooks, type ShownLook } from './field-pictures';
import { EpdfFieldControlTemplate } from './templates';

const NO_WIDGETS: readonly FormWidgetItem[] = Object.freeze([]);

/** One box as the template draws it: with the layer's own control, or a control of the app's. */
interface DrawnBox {
  readonly item: FormWidgetItem;
  /** The app's template that draws it, when one matches. */
  readonly control: EpdfFieldControlTemplate | null;
  /** The widget as it looks now, for that template's `native`. */
  readonly look: ShownLook | null;
}

const NO_BOXES: readonly DrawnBox[] = Object.freeze([]);

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
    FormCustomControl,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="position: absolute; inset: 0; pointer-events: none">
      <epdf-field-pictures [looks]="pictures" />
      <!-- One control per widget: a field with several boxes has one per box. -->
      @for (box of boxes(); track box.item.key + ':' + box.item.annotObjectNumber) {
        @if (box.control; as control) {
          <div
            epdfFormCustom
            [item]="box.item"
            [colors]="colors()"
            [control]="control"
            [look]="box.look"
          ></div>
        } @else {
          @switch (box.item.control) {
            @case ('text') {
              <div epdfFormText [item]="box.item" [colors]="colors()"></div>
            }
            @case ('toggle') {
              <div epdfFormToggle [item]="box.item" [colors]="colors()"></div>
            }
            @case ('choice') {
              @if (box.item.kind === 'list') {
                <div epdfFormList [item]="box.item" [colors]="colors()"></div>
              } @else {
                <div epdfFormCombo [item]="box.item" [colors]="colors()"></div>
              }
            }
            @case ('button') {
              <div epdfFormButton [item]="box.item" [colors]="colors()"></div>
            }
            @case ('signature') {
              <div epdfFormSignature [item]="box.item" [colors]="colors()"></div>
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

  // ── your templates ───────────────────────────────────────────────────────────

  private readonly templates = contentChildren(EpdfFieldControlTemplate, { descendants: true });

  /** The controls of yours, in the order the templates are written: the first that matches wins. */
  private readonly controls = computed(() =>
    this.templates().flatMap((template) => {
      const match = template.match();
      return typeof match === 'function' ? [{ for: match, template }] : [];
    }),
  );

  /** Every widget's look on the page: the layer draws the ones no control of yours does. */
  private readonly looks = injectFieldLooks();

  /**
   * The boxes the layer draws controls for, while the active tool fills forms: each with the
   * layer's own control, or with the first control of yours that matches it, which draws the
   * field's picture too.
   */
  protected readonly boxes = computed((): readonly DrawnBox[] => {
    if (!this.active()) return NO_BOXES;
    const controls = this.controls();
    const widgets = this.widgets();
    if (controls.length === 0) {
      return widgets.map((item) => ({ item, control: null, look: null }));
    }
    const looks = new Map(this.looks().map((look) => [look.key, look]));
    return widgets.map((item) => {
      const control = fieldControlFor(item, controls)?.template ?? null;
      return {
        item,
        control,
        look: control ? (looks.get(annotationKey(item.ref)) ?? null) : null,
      };
    });
  });

  /** The pictures the layer draws itself: every widget's but those a control of yours draws. */
  protected readonly pictures = computed(() => {
    const drawn = new Set(
      this.boxes().flatMap((box) => (box.control ? [annotationKey(box.item.ref)] : [])),
    );
    const looks = this.looks();
    return drawn.size === 0 ? looks : looks.filter((look) => !drawn.has(look.key));
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
