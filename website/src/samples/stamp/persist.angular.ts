import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf, saveFile } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import {
  EpdfStamp,
  indexedDbByteStore,
  persistStampLibraries,
  restoreStampLibraries,
  withStamp,
  type StampAsset,
  type StampLibrary,
} from '@embedpdf/angular/stamp';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const assetEngine = engine; // stamp libraries are PDFs; they open here too

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Where the libraries live between visits: this browser's IndexedDB.
const store = indexedDbByteStore('embedpdf-stamp-example');

@Component({
  selector: 'button[demoStampButton]',
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
  selector: 'demo-libraries',
  imports: [StampButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      @for (asset of assets(); track asset.id) {
        <button demoStampButton [asset]="asset" [armed]="armedAsset()?.id === asset.id"></button>
      }
      @for (library of libraries(); track library.id) {
        <span class="group">
          <button type="button" class="button" (click)="addStamp(library.id)">Add a stamp</button>
          <button
            type="button"
            class="button"
            title="The library as the PDF it is: open it in Acrobat, or import it again"
            (click)="download(library)"
          >
            Download “{{ library.name }}”
          </button>
        </span>
      }
      <span class="spacer"></span>
      <output class="readout">
        {{
          restored() === null
            ? 'Restoring…'
            : restored() + ' restored: add a stamp, then reload the page'
        }}
      </output>
    </div>
  `,
})
export class Libraries {
  private readonly stamp = inject(EpdfStamp);
  protected readonly libraries = this.stamp.libraries;
  protected readonly assets = this.stamp.assetsOf();
  protected readonly armedAsset = this.stamp.armedAsset;
  protected readonly restored = signal<number | null>(null);

  constructor() {
    // Every change is written to the store from now on.
    inject(DestroyRef).onDestroy(persistStampLibraries(this.stamp, store));

    // On load: what the store kept. The first visit starts a library of its own.
    void restoreStampLibraries(this.stamp, store).then(async (ids) => {
      this.restored.set(ids.length);
      if (ids.length > 0) return;
      const { library } = await this.stamp.createLibrary('My stamps');
      await this.stamp.createAsset({
        libraryId: library.id,
        label: 'Checked',
        mark: { kind: 'text', text: 'Checked', fontFamily: 'times-bold-italic', color: '#1f7a3f' },
      });
    });
  }

  protected addStamp(libraryId: string) {
    const label = `Stamp ${this.assets().length + 1}`;
    void this.stamp.createAsset({
      libraryId,
      label,
      mark: { kind: 'text', text: label, fontFamily: 'helvetica-bold', color: '#054fb3' },
    });
  }

  protected download(library: StampLibrary) {
    void this.stamp
      .exportLibrary(library.id)
      .then((bytes) => saveFile(bytes, `${library.name}.pdf`, 'application/pdf'));
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
    Libraries,
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
  styleUrl: './persist.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-libraries />
      <epdf-stage class="stage">
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
