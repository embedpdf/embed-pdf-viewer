import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import { EpdfStamp, withStamp } from '@embedpdf/angular/stamp';
import { createTestSigner, EpdfSignature, withSignature } from '@embedpdf/angular/signature';
import { cloudEngine } from '@cloudpdf/engine';
import { localEngine } from '@embedpdf/engine';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const assetEngine = localEngine();
// A throwaway key for the demo. Bring your own with `webCryptoSigner`, a
// service with `remoteSigner`, or a person's own with `personalSigner`.
const signer = createTestSigner({ commonName: 'Ada Lovelace' });

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// A mark's button: its picture once there is one, its label until then.
@Component({
  selector: 'button[demoMarkButton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { type: 'button', class: 'button', '[title]': 'label()', '(click)': 'pick.emit()' },
  template: `
    @if (url(); as url) {
      <img [src]="url" [alt]="label()" class="preview" />
    } @else {
      {{ label() }}
    }
  `,
})
export class MarkButton {
  readonly assetId = input.required<string>();
  readonly label = input.required<string>();
  readonly pick = output();
  protected readonly url = inject(EpdfStamp).previewUrlOf(() => this.assetId());
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfFormLayer,
    MarkButton,
  ],
  providers: [
    provideEmbedPdf(
      { engine, initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withForm(),
      withStamp({ assetEngine }),
      withSignature({
        key: () => signer,
        // Trust the demo key itself, so its signatures check out as 'valid'.
        trust: { anchors: async () => [(await signer).certificate] },
      }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        @for (asset of person()?.signatures; track asset.id) {
          <button demoMarkButton [assetId]="asset.id" [label]="asset.label" (pick)="sign(asset.id)"></button>
        }
        <output class="readout">{{ status() }}</output>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <!-- An empty signature field is "sign here": a click makes it the target -->
          <epdf-form-layer />
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

  protected readonly person = computed(() => this.signature.signerRows()[0]);
  private readonly field = computed(() =>
    this.form.fields().find((candidate) => candidate.family === 'signature'),
  );
  private readonly error = signal<string | null>(null);

  protected readonly status = computed(() => {
    const signed = this.signature.signatures()[0];
    const error = this.error();
    if (!this.person() || !this.field()) return 'Getting ready…';
    if (error) return error;
    if (this.signature.busy()) return 'Signing…';
    if (signed) return `Signed by ${signed.signer.name}: ${signed.verdict?.summary ?? 'checking…'}`;
    if (this.signature.target()) return 'Now pick the signature';
    return 'Click the field, or pick the signature';
  });

  constructor() {
    // The ebook has no signature field, and the browser holds no signatures yet: add a field
    // to the last page, and one person with a typed signature.
    effect(() => {
      const page = this.document.pages().at(-1)?.ref;
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !page || !stage || this.done) return;
      this.done = true;
      untracked(() => void this.setUp(page, stage));
    });
  }

  /** The target is the field someone clicked; without one, the form's signature field. */
  protected sign(assetId: string) {
    const destination = this.signature.target() ?? this.field()?.ref;
    if (!destination) return;
    this.error.set(null);
    this.signature
      .placeMark({ assetId }, { field: destination })
      .catch((reason: Error) => this.error.set(reason.message));
  }

  private async setUp(page: PageRef, stage: EpdfStage) {
    await this.form.create({
      family: 'signature',
      name: 'approval',
      widgets: [{ page, rect: { x: 72, y: 560, width: 220, height: 64 }, color: '#94a3b8' }],
    });
    stage.goToPage(page);
    const { library } = await this.stamp.createLibrary('Ada Lovelace', { kind: 'signatures' });
    await this.stamp.createAsset({
      libraryId: library.id,
      name: 'signature',
      label: 'Signature',
      mark: { kind: 'text', text: 'Ada Lovelace', fontFamily: 'times-italic', color: '#1d2b53' },
    });
  }
}
