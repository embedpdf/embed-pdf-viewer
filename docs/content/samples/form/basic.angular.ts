import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <output class="readout">
          @if (form.fields().length === 0) {
            Adding a form…
          } @else {
            {{ form.fields().length }} fields: click one and fill it in
          }
        </output>
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
  protected readonly form = inject(EpdfForm);
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private added = false;

  constructor() {
    // The ebook has no form, so this adds one to its last page when it opens, and goes there.
    effect(() => {
      const page = this.document.pages().at(-1)?.ref;
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !page || !stage || this.added) return;
      this.added = true;
      untracked(() => void this.addSignUpForm(page, stage));
    });
  }

  private async addSignUpForm(page: PageRef, stage: EpdfStage) {
    const at = (y: number, width = 240, height = 24) => ({ page, rect: { x: 72, y, width, height } });
    await this.form.create({ family: 'text', name: 'name', widgets: [{ ...at(540), ...look }] });
    await this.form.create({ family: 'text', name: 'email', widgets: [{ ...at(576), ...look }] });
    await this.form.create({
      family: 'combobox',
      name: 'framework',
      options: ['React', 'Vue', 'Svelte', 'Angular'].map((label) => ({ label, value: label })),
      widgets: [{ ...at(612, 160), ...look }],
    });
    await this.form.create({
      family: 'checkbox',
      name: 'updates',
      widgets: [{ ...at(650, 16, 16), ...look }],
    });
    stage.goToPage(page);
  }
}
