import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfStamp, withStamp, type StampAsset } from '@embedpdf/angular/stamp';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const assetEngine = engine; // stamp libraries are PDFs; they open here too

const approvals = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/approvals.pdf');
  return { kind: 'bytes', id: 'approvals', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const MY_STAMPS = 'my-stamps';

@Component({
  selector: 'button[demoMyStamp]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    type: 'button',
    class: 'button',
    '[title]': "'Place “' + asset().label + '”'",
    '[attr.aria-pressed]': 'armed()',
    '(click)': 'toggle()',
  },
  template: `
    @if (url(); as url) {
      <img [src]="url" [alt]="asset().label" class="preview" />
    } @else {
      {{ asset().label }}
    }
  `,
})
export class MyStamp {
  readonly asset = input.required<StampAsset>();
  readonly armed = input(false);

  private readonly stamp = inject(EpdfStamp);
  protected readonly url = this.stamp.previewUrlOf(() => this.asset().id);

  protected toggle() {
    if (this.armed()) this.stamp.disarm();
    else void this.stamp.armAsset(this.asset().id);
  }
}

@Component({
  selector: 'demo-make-stamp',
  imports: [MyStamp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button type="button" class="button" [disabled]="!canMake()" (click)="make()">
        Make a stamp of the selection
      </button>
      @for (asset of mine(); track asset.id) {
        <button demoMyStamp [asset]="asset" [armed]="armedAsset()?.id === asset.id"></button>
      }
      <span class="spacer"></span>
      <output class="readout">
        {{ armedAsset() ? 'Click a page to place it' : selected().length + ' selected' }}
      </output>
    </div>
  `,
})
export class MakeStamp {
  private readonly stamp = inject(EpdfStamp);
  protected readonly selected = inject(EpdfAnnotation).selected;
  protected readonly mine = this.stamp.assetsOf({ libraryId: MY_STAMPS });
  protected readonly armedAsset = this.stamp.armedAsset;

  // A stamp is one page of artwork: the selection must be on one page.
  private readonly page = computed(() => this.selected()[0]?.page);
  protected readonly canMake = computed(() => {
    const page = this.page();
    const onePage = this.selected().every(
      (annotation) => annotation.page.objectNumber === page?.objectNumber,
    );
    return !!page && onePage && this.stamp.canCreateFromAnnotations();
  });

  protected async make() {
    const page = this.page();
    if (!page) return;
    // The library is made on first use.
    if (!this.stamp.getLibrary(MY_STAMPS)) {
      await this.stamp.createLibrary('My stamps', { id: MY_STAMPS });
    }
    const { asset } = await this.stamp.createAssetFromAnnotations(
      page,
      this.selected().map((annotation) => annotation.ref),
      { libraryId: MY_STAMPS, label: `My stamp ${this.mine().length + 1}` },
    );
    await this.stamp.armAsset(asset.id);
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
    MakeStamp,
  ],
  providers: [
    provideEmbedPdf(
      { engine, initialDocuments: [{ source: approvals }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
      withAnnotation(),
      withStamp({ assetEngine }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './from-selection.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-make-stamp />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-selection-layer />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly stage = viewChild(EpdfStage);
  private done = false;

  constructor() {
    // On load: the document's frame and word, both selected, scrolled into view.
    effect(() => {
      const stage = this.stage();
      if (!stage || this.annotation.status() !== 'ready' || this.done) return;
      this.done = true;
      untracked(() => {
        const found = this.annotation
          .list()
          .filter((each) => each.nm === 'checked-frame' || each.nm === 'checked-text');
        if (found.length === 0) return;
        this.annotation.selection.set(found.map((each) => each.ref));
        stage.reveal(found[0].page, { rect: found[0].rect });
      });
    });
  }
}
