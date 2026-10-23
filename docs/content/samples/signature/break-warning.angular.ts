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
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
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

// [!doc-source agreement]
const agreement = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-agreement.pdf');
  return { kind: 'bytes', id: 'agreement', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfAnnotationLayer],
  providers: [
    provideEmbedPdf(
      { engine, initialDocuments: [{ source: agreement }] },
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
          <epdf-render-layer />
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
  private readonly stage = viewChild(EpdfStage);
  private done = false;

  /** The page of the form's signature field: the box goes next to the signature. */
  protected readonly page = computed(() => {
    const first = this.form.get(toFieldRef('approval'))?.widgets[0];
    return first ? this.form.getWidget(first)?.page : undefined;
  });
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

    // On load: the agreement, with its signature field signed by Ada with a typed signature.
    effect(() => {
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !stage || this.done) return;
      this.done = true;
      untracked(() => void this.signDocument(stage));
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

  private async signDocument(stage: EpdfStage) {
    // Bring the agreement's signature field into view.
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
    await this.signature.sign({ field: toFieldRef('approval'), mark: { assetId: asset.id } });
  }
}
