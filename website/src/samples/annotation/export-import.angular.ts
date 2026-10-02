import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  AnnotationTransfer,
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// The bundle as one JSON text: what you'd store in your own database.
@Component({
  selector: 'div[demoTransfer]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel transfer' },
  template: `
    <div class="toolbar">
      <button type="button" class="button" (click)="exportAll()">Export</button>
      <button
        type="button"
        class="button"
        [disabled]="annotations().length === 0"
        (click)="deleteAll()"
      >
        Delete all
      </button>
      <button type="button" class="button" [disabled]="text() === ''" (click)="importText()">
        Import
      </button>
    </div>
    <output class="readout">{{ status() }}</output>
    <textarea
      #bundle
      class="bundle"
      aria-label="The exported bundle"
      spellcheck="false"
      [value]="text()"
      (input)="text.set(bundle.value)"
    ></textarea>
  `,
})
export class Transfer {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly pages = inject(EpdfDocument).pages;
  protected readonly annotations = this.annotation.watch();
  protected readonly text = signal('');
  protected readonly status = signal('');
  private started = false;

  constructor() {
    // On load: a note and a rectangle on the cover, exported at once.
    effect(() => {
      const cover = this.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.started) return;
      this.started = true;
      void Promise.all([
        this.annotation.create(cover, {
          subtype: 'text',
          rect: { x: 470, y: 232, width: 20, height: 20 },
          contents: 'Can we shorten the title?',
          color: '#facc15',
        }),
        this.annotation.create(cover, {
          subtype: 'square',
          box: { x: 96, y: 506, width: 178, height: 54 },
          color: '#e5484d',
          strokeWidth: 3,
        }),
      ]).then(() => this.exportAll());
    });
  }

  protected async exportAll() {
    const bundle = await this.annotation.export(); // everything
    this.text.set(AnnotationTransfer.stringify(bundle));
    this.status.set(`Exported ${bundle.items.length}`);
  }

  protected async deleteAll() {
    await Promise.all(this.annotation.list().map((each) => this.annotation.delete(each.ref)));
    this.status.set('Deleted them all');
  }

  protected async importText() {
    try {
      const { annotations, dropped } = await this.annotation.import(
        await AnnotationTransfer.parse(this.text()),
      );
      this.status.set(`Imported ${annotations.length}, left out ${dropped.length}`);
    } catch (error) {
      this.status.set(error instanceof Error ? error.message : String(error));
    }
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    Transfer,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './export-import.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="viewer">
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer [annotations]="false" />
            <epdf-annotation-layer />
          </ng-template>
        </epdf-stage>
        <div demoTransfer></div>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
