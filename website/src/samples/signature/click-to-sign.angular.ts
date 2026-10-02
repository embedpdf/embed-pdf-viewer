import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import { EpdfStamp, withStamp } from '@embedpdf/angular/stamp';
import { createTestSigner, EpdfSignature, withSignature } from '@embedpdf/angular/signature';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const assetEngine = engine; // a person's marks are stamps, kept as PDFs; they open here too
const signer = createTestSigner({ commonName: 'Ada Lovelace' });

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    EpdfFormLayer,
  ],
  providers: [
    provideEmbedPdf(
      { engine, initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
      withForm(),
      withStamp({ assetEngine }),
      withSignature({ key: () => signer }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './click-to-sign.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button
          type="button"
          class="button"
          [disabled]="!mark()"
          [attr.aria-pressed]="stamp.armedAsset() !== null"
          (click)="toggleArmed()"
        >
          {{ stamp.armedAsset() ? 'Disarm' : 'Arm the signature' }}
        </button>
        <output class="readout">{{ hint() }}</output>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer [annotations]="false" />
          <epdf-annotation-layer />
          <epdf-form-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly stamp = inject(EpdfStamp);
  private readonly form = inject(EpdfForm);
  private readonly signature = inject(EpdfSignature);
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private done = false;

  protected readonly mark = computed(() => this.signature.signerRows()[0]?.signatures[0]);

  protected readonly hint = computed(() => {
    const signed = this.signature.signatures()[0];
    if (signed) return `The field is signed by ${signed.signer.name}`;
    if (this.stamp.armedAsset()) return 'Click the empty field to sign it, or anywhere else to place it';
    if (this.mark()) return 'Arm the signature, then click where it goes';
    return 'Getting ready…';
  });

  constructor() {
    // On load: a signature field on the last page, and a person's signature, armed.
    effect(() => {
      const page = this.document.pages().at(-1)?.ref;
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !page || !stage || this.done) return;
      this.done = true;
      untracked(() => void this.setUp(page, stage));
    });
  }

  protected toggleArmed() {
    const mark = this.mark();
    if (this.stamp.armedAsset()) this.stamp.disarm();
    else if (mark) void this.stamp.armAsset(mark.id);
  }

  private async setUp(page: PageRef, stage: EpdfStage) {
    await this.form.create({
      family: 'signature',
      name: 'approval',
      widgets: [{ page, rect: { x: 72, y: 560, width: 220, height: 64 }, color: '#94a3b8' }],
    });
    stage.goToPage(page);
    const { library } = await this.stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
    const { asset } = await this.stamp.createAsset({
      libraryId: library.id,
      name: 'signature',
      label: 'Signature',
      mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
    });
    await this.stamp.armAsset(asset.id, { targetWidth: 160 });
  }
}
