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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { EpdfForm, toFieldRef, withForm } from '@embedpdf/angular/form';
import { EpdfStamp, withStamp } from '@embedpdf/angular/stamp';
import { createTestSigner, EpdfSignature, withSignature } from '@embedpdf/angular/signature';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
// [!asset-engine]
const assetEngine = engine; // a person's marks are stamps, kept as PDFs; they open here too
// [!/asset-engine]
const signer = createTestSigner({ commonName: 'Ada Lovelace' });

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfAnnotationLayer],
  providers: [
    provideEmbedPdf(
      { engine, initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withForm(),
      withStamp({ assetEngine }),
      withSignature({
        key: () => signer,
        // Trust the demo key itself, so its signature checks out as 'valid'.
        trust: { anchors: async () => [(await signer).certificate] },
      }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './break-warning.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button type="button" class="button" [disabled]="!signed() || !page()" (click)="drawBox()">
          Draw a box on the page
        </button>
        <output class="readout">{{ status() }}</output>
        @if (warning(); as warning) {
          <output class="warning">{{ warning }}</output>
        }
      </div>
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
export class App {
  private readonly form = inject(EpdfForm);
  private readonly stamp = inject(EpdfStamp);
  private readonly annotation = inject(EpdfAnnotation);
  private readonly signature = inject(EpdfSignature);
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private done = false;

  /** The last page, which has room for the field. */
  protected readonly page = computed(() => this.document.pages().at(-1)?.ref);
  protected readonly signed = computed(() => this.signature.signatures()[0]);
  protected readonly status = computed(() => {
    const signed = this.signed();
    return signed
      ? `Signed by ${signed.signer.name}: ${signed.verdict?.summary ?? 'checking…'}`
      : 'Signing…';
  });
  protected readonly warning = signal<string | null>(null);

  constructor() {
    // The moment a change would break a signature once it's saved, as Acrobat warns.
    this.signature.invalidationPredicted$.pipe(takeUntilDestroyed()).subscribe(({ field }) => {
      const name = this.signature.getSignature(field)?.fieldName;
      this.warning.set(`This change will break the signature in "${name}" when saved.`);
    });

    // On load: a signature field on the last page, signed by Ada with a typed signature.
    effect(() => {
      const page = this.page();
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !page || !stage || this.done) return;
      this.done = true;
      untracked(() => void this.signDocument(page, stage));
    });
  }

  protected drawBox() {
    const page = this.page();
    if (!page) return;
    void this.annotation.create(page, {
      subtype: 'square',
      box: { x: 320, y: 560, width: 140, height: 64 },
      color: '#e11d48',
      strokeWidth: 2,
    });
  }

  private async signDocument(page: PageRef, stage: EpdfStage) {
    await this.form.create({
      family: 'signature',
      name: 'approval',
      widgets: [{ page, rect: { x: 72, y: 560, width: 220, height: 64 } }],
    });
    stage.goToPage(page);
    const { library } = await this.stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
    const { asset } = await this.stamp.createAsset({
      libraryId: library.id,
      name: 'signature',
      label: 'Signature',
      mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
    });
    await this.signature.sign({ field: toFieldRef('approval'), mark: { assetId: asset.id } });
  }
}
