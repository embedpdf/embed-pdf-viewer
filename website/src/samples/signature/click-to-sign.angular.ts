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
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfForm, EpdfFormLayer, toFieldRef, withForm } from '@embedpdf/angular/form';
import { EpdfStamp, withStamp } from '@embedpdf/angular/stamp';
import { createTestSigner, EpdfSignature, withSignature } from '@embedpdf/angular/signature';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const assetEngine = engine; // a person's marks are stamps, kept as PDFs; they open here too
const signer = createTestSigner({ commonName: 'Ada Lovelace' });

const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
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
      { engine, initialDocuments: [{ source: forms }] },
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
          <epdf-render-layer />
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
    // On load: the invoice, where the form's signature field is, and a person's signature, armed.
    effect(() => {
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !stage || this.done) return;
      this.done = true;
      untracked(() => void this.setUp(stage));
    });
  }

  protected toggleArmed() {
    const mark = this.mark();
    if (this.stamp.armedAsset()) this.stamp.disarm();
    else if (mark) void this.stamp.armAsset(mark.id);
  }

  private async setUp(stage: EpdfStage) {
    // Bring the form's signature field into view, on the invoice.
    const first = this.form.get(toFieldRef('approval'))?.widgets[0];
    const widget = first ? this.form.getWidget(first) : null;
    if (widget) stage.reveal(widget.page, { rect: widget.rect });
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
