import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { EpdfForm, EpdfFormLayer, FormTransfer, withForm } from '@embedpdf/angular/form';
import type { FormBundle } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: forms }] },
      withStage(),
      withRender(),
      withInteraction(),
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './data.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button type="button" class="button" (click)="export()">Export</button>
        <button type="button" class="button" (click)="remove()">Remove</button>
        <button type="button" class="button" [disabled]="!bundle()" (click)="import()">Import</button>
        @if (result()) {
          <output class="readout">{{ result() }}</output>
        }
      </div>
      <div class="viewer">
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-form-layer />
          </ng-template>
        </epdf-stage>
        <pre class="values">{{ values() }}</pre>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly form = inject(EpdfForm);
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private started = false;
  protected readonly bundle = signal<FormBundle | null>(null);
  protected readonly result = signal('');

  /** The values as plain data, keyed by full name: what you'd send to your backend. */
  protected readonly values = computed(() => {
    // The fields change with every value, so this reads them again each time.
    this.form.fields();
    return JSON.stringify(this.form.exportValues(), null, 2);
  });

  constructor() {
    // Start on the sign-up page, filled in.
    effect(() => {
      const page = this.document.pages()[1]?.ref;
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !page || !stage || this.started) return;
      this.started = true;
      untracked(() => {
        stage.goToPage(page);
        void this.form.importValues({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          framework: 'Svelte',
        });
      });
    });
  }

  protected async export() {
    const exported = await this.form.export();
    // One JSON text: what you'd store, and read back with FormTransfer.parse().
    const text = FormTransfer.stringify(exported);
    this.bundle.set(exported);
    this.result.set(`Exported ${exported.fields.length} fields, ${text.length} characters of JSON`);
  }

  protected async remove() {
    for (const field of this.form.list()) await this.form.delete(field.ref);
    this.result.set('The form is gone');
  }

  protected async import() {
    const bundle = this.bundle();
    if (!bundle) return;
    const { fields, dropped } = await this.form.import(bundle);
    this.result.set(`Imported ${fields.length} fields, left out ${dropped.length}`);
  }
}
