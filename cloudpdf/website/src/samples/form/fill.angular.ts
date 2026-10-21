import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfForm, EpdfFormLayer, toFieldRef, withForm } from '@embedpdf/angular/form';
import { cloudEngine } from '@cloudpdf/engine';

const forms: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

/** One field of each family, with `setValue()` in the shape each one takes. */
async function fillIn(form: EpdfForm) {
  await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }); // text
  await form.setValue(toFieldRef('updates'), { checked: true }); // checkbox
  await form.setValue(toFieldRef('plan'), { value: 'yearly' }); // radio group: a button's value
  await form.setValue(toFieldRef('framework'), { value: 'React' }); // dropdown: an option's value
  return form.setValue(toFieldRef('topics'), { selectedValues: ['Forms', 'Signatures'] }); // list
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine(), initialDocuments: [{ source: forms }] },
      withStage(),
      withRender(),
      withInteraction(),
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './fill.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button type="button" class="button" (click)="fillIn()">Fill in</button>
        <button type="button" class="button" (click)="fillFromBackend()">
          Fill from your backend
        </button>
        <button type="button" class="button" (click)="reset()">Reset</button>
        @if (result()) {
          <output class="readout">{{ result() }}</output>
        }
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-form-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly form = inject(EpdfForm);
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private started = false;
  protected readonly result = signal('');

  constructor() {
    // Start on the sign-up page, the form's first fields.
    effect(() => {
      const page = this.document.pages()[1]?.ref;
      const stage = this.stage();
      if (!page || !stage || this.started) return;
      this.started = true;
      untracked(() => stage.goToPage(page));
    });
  }

  protected async fillIn() {
    const { status } = await fillIn(this.form);
    this.result.set(`Filled in: ${status}`);
  }

  protected async fillFromBackend() {
    // Plain values by full name, as your backend would send them.
    const { applied, skipped } = await this.form.importValues({
      name: 'Grace Hopper',
      framework: 'Vue',
      updates: false,
      topics: ['Annotations'],
      phone: '555-0100',
    });
    this.result.set(`${applied.length} filled, ${skipped.length} skipped`);
  }

  protected async reset() {
    const { fields } = await this.form.reset();
    this.result.set(`${fields.length} fields reset`);
  }
}
