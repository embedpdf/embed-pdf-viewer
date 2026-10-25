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
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
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

// [!doc-source agreement]
const agreement = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-agreement.pdf');
  return { kind: 'bytes', id: 'agreement', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const APPROVAL = toFieldRef('approval');

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine, initialDocuments: [{ source: agreement }] },
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
  private readonly stage = viewChild(EpdfStage);
  private done = false;
  protected readonly assetId = signal<string | null>(null);
  protected readonly drawn = signal(false);

  constructor() {
    this.signature.filled$.pipe(takeUntilDestroyed()).subscribe(() => this.drawn.set(true));
    this.signature.cleared$.pipe(takeUntilDestroyed()).subscribe(() => this.drawn.set(false));

    // On load: Ada's typed signature, ready to draw in, and the signature field in view.
    effect(() => {
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !stage || this.done) return;
      this.done = true;
      untracked(() => void this.setUp(stage));
    });
  }

  protected drawIn() {
    const assetId = this.assetId();
    if (assetId) void this.signature.fillField(APPROVAL, { assetId });
  }

  protected takeOut() {
    void this.signature.clearField(APPROVAL);
  }

  private async setUp(stage: EpdfStage) {
    // Bring the agreement's signature field into view.
    const first = this.form.get(APPROVAL)?.widgets[0];
    const widget = first ? this.form.getWidget(first) : null;
    if (widget) stage.reveal(widget.page, { rect: widget.rect });
    const { library } = await this.stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
    const { asset } = await this.stamp.createAsset({
      libraryId: library.id,
      name: 'signature',
      label: 'Signature',
      mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
    });
    this.assetId.set(asset.id);
  }
}
