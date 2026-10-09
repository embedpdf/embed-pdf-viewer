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
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfForm, EpdfFormLayer, toFieldRef, withForm } from '@embedpdf/angular/form';
import type { FormValidation } from '@embedpdf/angular/form';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './validate.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button type="button" class="button" (click)="submit()">Submit</button>
        @if (check(); as check) {
          @if (check.valid) {
            <output class="readout">Every required field is filled in</output>
          } @else {
            <output class="readout missing">Fill in first: {{ missingNames(check) }}</output>
          }
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
  private added = false;
  protected readonly check = signal<FormValidation | null>(null);

  constructor() {
    // The ebook has no form, so this adds one to its last page, with three required fields,
    // and checks it once.
    effect(() => {
      const page = this.document.pages().at(-1)?.ref;
      if (this.form.status() !== 'ready' || !page || this.added) return;
      this.added = true;
      untracked(() => void this.addSignUpForm(page).then(() => this.submit()));
    });
  }

  /** Check the required fields, and take the reader to the first empty one. */
  protected submit() {
    const result = this.form.validate();
    this.check.set(result);
    // Where a field shows is its widget's row in the form.
    const first = result.missing[0]?.widgets[0];
    const widget = first ? this.form.getWidget(first) : null;
    if (widget) this.stage()?.reveal(widget.page, { rect: widget.rect });
  }

  protected missingNames(check: FormValidation) {
    return check.missing.map((field) => field.name).join(', ');
  }

  private async addSignUpForm(page: PageRef) {
    const at = (y: number, width = 240, height = 24) => ({ page, rect: { x: 72, y, width, height } });
    await this.form.create({
      family: 'text',
      name: 'name',
      required: true,
      widgets: [{ ...at(540), ...look }],
    });
    await this.form.create({
      family: 'text',
      name: 'email',
      required: true,
      widgets: [{ ...at(576), ...look }],
    });
    await this.form.create({ family: 'text', name: 'company', widgets: [{ ...at(612), ...look }] });
    await this.form.create({
      family: 'checkbox',
      name: 'terms',
      required: true,
      widgets: [{ ...at(650, 16, 16), ...look }],
    });
    await this.form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
  }
}
