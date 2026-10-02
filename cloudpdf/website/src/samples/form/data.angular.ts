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
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
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
  styleUrl: './data.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button type="button" class="button" (click)="export()">Export</button>
        <button type="button" class="button" (click)="clear()">Clear</button>
        <button type="button" class="button" [disabled]="!xfdf()" (click)="import()">Import</button>
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
  private added = false;
  protected readonly xfdf = signal<Uint8Array | null>(null);
  protected readonly result = signal('');

  /** The values as plain data, keyed by full name: what you'd send to your backend. */
  protected readonly values = computed(() => {
    // The fields change with every value, so this reads them again each time.
    this.form.fields();
    return JSON.stringify(this.form.exportValues(), null, 2);
  });

  constructor() {
    // The ebook has no form, so this adds one to its last page, fills it in, and goes there.
    effect(() => {
      const page = this.document.pages().at(-1)?.ref;
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !page || !stage || this.added) return;
      this.added = true;
      untracked(() => void this.addSignUpForm(page, stage));
    });
  }

  protected async export() {
    const { bytes } = await this.form.export(); // XFDF; form.export('fdf') for FDF
    this.xfdf.set(bytes);
    this.result.set(`Exported ${bytes.byteLength} bytes of XFDF`);
  }

  protected async clear() {
    await this.form.reset();
    this.result.set('The form is empty');
  }

  protected async import() {
    const xfdf = this.xfdf();
    if (!xfdf) return;
    const { applied } = await this.form.import(xfdf);
    this.result.set(`Imported ${applied} values`);
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
    await this.form.importValues({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      framework: 'Svelte',
    });
    stage.goToPage(page);
  }
}
