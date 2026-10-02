import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfStamp, withStamp, type StampAsset } from '@embedpdf/angular/stamp';
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

// A stamp's button: its picture, and pressed while it's armed.
@Component({
  selector: 'button[demoStampButton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    type: 'button',
    class: 'button',
    '[title]': 'asset().label',
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
export class StampButton {
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
  selector: 'demo-stamp-picker',
  imports: [StampButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      @if (library()) {
        @for (asset of shown(); track asset.id) {
          <button demoStampButton [asset]="asset" [armed]="armedAsset()?.id === asset.id"></button>
        }
        <span class="spacer"></span>
        <output class="readout">
          @if (armedAsset(); as armed) {
            Click a page to place “{{ armed.label }}”
          } @else {
            Pick a stamp
          }
        </output>
      } @else {
        <output class="readout">Loading the stamps…</output>
      }
    </div>
  `,
})
export class StampPicker {
  private readonly stamp = inject(EpdfStamp);
  protected readonly library = computed(() => this.stamp.libraries()[0]);
  protected readonly assets = this.stamp.assetsOf(() => ({ libraryId: this.library()?.id }));
  protected readonly shown = computed(() => this.assets().slice(0, 6));
  protected readonly armedAsset = this.stamp.armedAsset; // the stamp the next click places

  constructor() {
    // On load: the standard stamps, English edition, with "Approved" armed.
    void loadDefaultLibrary('en')
      .then((bytes) => this.stamp.importLibrary(bytes))
      .then(({ library }) => {
        const approved = this.stamp
          .listAssets({ libraryId: library.id })
          .find((asset) => asset.name === 'Approved');
        if (approved) return this.stamp.armAsset(approved.id);
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
    StampPicker,
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
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-stamp-picker />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer [annotations]="false" />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
