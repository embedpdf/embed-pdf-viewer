import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  AnnotationTransfer,
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const report: OpenInput = { kind: 'grant', grant: 'shr__TWhIGdJtaKlcnVgJdg--bcm' };

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
  protected readonly annotations = this.annotation.watch();
  protected readonly text = signal('');
  protected readonly status = signal('');
  private started = false;

  constructor() {
    // On load: everything in the document, exported at once.
    effect(() => {
      if (this.annotation.status() !== 'ready' || this.started) return;
      this.started = true;
      void this.exportAll();
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
    EpdfSelectionLayer,
    EpdfAnnotationLayer,
    Transfer,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine(), initialDocuments: [{ source: report }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
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
            <epdf-render-layer />
            <epdf-selection-layer />
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
