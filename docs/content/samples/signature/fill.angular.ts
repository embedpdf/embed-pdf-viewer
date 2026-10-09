import {
  ChangeDetectionStrategy,
  Component,
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
import { EpdfForm, toFieldRef, withForm } from '@embedpdf/angular/form';
import { EpdfStamp, withStamp } from '@embedpdf/angular/stamp';
import { EpdfSignature, withSignature } from '@embedpdf/angular/signature';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
// [!asset-engine]
const assetEngine = engine; // a person's marks are stamps, kept as PDFs; they open here too
// [!/asset-engine]

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const APPROVAL = toFieldRef('approval');

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine, initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withForm(),
      withStamp({ assetEngine }),
      // No key: a mark is only drawn in, nothing is sealed.
      withSignature(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './fill.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button type="button" class="button" [disabled]="!assetId() || drawn()" (click)="drawIn()">
          Draw it in
        </button>
        <button type="button" class="button" [disabled]="!drawn()" (click)="takeOut()">
          Take it out
        </button>
        <output class="readout">
          {{ drawn() ? 'Drawn in, not signed: no key sealed anything' : 'The field is empty' }}
        </output>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly form = inject(EpdfForm);
  private readonly stamp = inject(EpdfStamp);
  private readonly signature = inject(EpdfSignature);
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private done = false;
  protected readonly assetId = signal<string | null>(null);
  protected readonly drawn = signal(false);

  constructor() {
    this.signature.filled$.pipe(takeUntilDestroyed()).subscribe(() => this.drawn.set(true));
    this.signature.cleared$.pipe(takeUntilDestroyed()).subscribe(() => this.drawn.set(false));

    // On load: a signature field on the last page, a typed signature, drawn into the field.
    effect(() => {
      const page = this.document.pages().at(-1)?.ref;
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !page || !stage || this.done) return;
      this.done = true;
      untracked(() => void this.setUp(page, stage));
    });
  }

  protected drawIn() {
    const assetId = this.assetId();
    if (assetId) void this.signature.fillField(APPROVAL, { assetId });
  }

  protected takeOut() {
    void this.signature.clearField(APPROVAL);
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
    this.assetId.set(asset.id);
    await this.signature.fillField(APPROVAL, { assetId: asset.id });
  }
}
