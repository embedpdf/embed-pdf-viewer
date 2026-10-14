import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfStamp, withStamp } from '@embedpdf/angular/stamp';
import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
// [!asset-engine]
const assetEngine = engine; // stamp libraries are PDFs; they open here too
// [!/asset-engine]

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The middle of a Letter page, and the cover's empty corner, in page coordinates.
const MIDDLE = { x: 306, y: 396 };
const CORNER = { x: 60, y: 590, width: 220, height: 180 };

/** Next to `<epdf-stage #stage="epdfStage">`: `<demo-place-stamps [stage]="stage" />`. */
@Component({
  selector: 'demo-place-stamps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button type="button" class="button" [disabled]="!approved()" (click)="approve()">
        Approve this page
      </button>
      <button type="button" class="button" [disabled]="!draft()" (click)="draftEverywhere()">
        “Draft” on every page
      </button>
      <span class="spacer"></span>
      <output class="readout">
        {{ stamps().length }} {{ stamps().length === 1 ? 'stamp' : 'stamps' }} in the document
      </output>
    </div>
  `,
})
export class PlaceStamps {
  readonly stage = input.required<EpdfStage>();

  private readonly stamp = inject(EpdfStamp);
  private readonly annotation = inject(EpdfAnnotation);
  private readonly assets = this.stamp.assetsOf();
  protected readonly approved = computed(() =>
    this.assets().find((asset) => asset.name === 'Approved'),
  );
  protected readonly draft = computed(() => this.assets().find((asset) => asset.name === 'Draft'));
  protected readonly stamps = this.annotation.watch({ subtype: 'stamp' });
  private started = false;

  constructor() {
    // On load: the standard stamps, and "Approved" in the cover's empty corner, scrolled into view.
    effect(() => {
      if (this.annotation.status() !== 'ready' || this.started) return;
      this.started = true;
      const stage = this.stage();
      void loadDefaultLibrary('en')
        .then((bytes) => this.stamp.importLibrary(bytes))
        .then(({ library }) => {
          const asset = this.stamp
            .listAssets({ libraryId: library.id })
            .find((candidate) => candidate.name === 'Approved');
          if (!asset) return;
          return this.stamp.placeAsset(asset.id, {
            page: 0,
            center: { x: 170, y: 680 },
            targetWidth: 180,
            rotation: -8,
          });
        })
        .then(() => stage.reveal(0, { rect: CORNER }));
    });
  }

  protected approve() {
    const approved = this.approved();
    if (!approved) return;
    const page = this.stage().currentPageIndex();
    void this.stamp.placeAsset(approved.id, { page, center: MIDDLE, select: true });
  }

  protected draftEverywhere() {
    const draft = this.draft();
    if (!draft) return;
    void this.stamp.placeAssetOnPages(draft.id, 'all', {
      center: MIDDLE,
      targetWidth: 320,
      rotation: -30,
    });
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
    PlaceStamps,
  ],
  providers: [
    provideEmbedPdf(
      { engine, initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withStamp({ assetEngine }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './programmatic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-place-stamps [stage]="stage" />
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
