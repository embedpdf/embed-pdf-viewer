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
import { EpdfSignature, withSignature } from '@embedpdf/angular/signature';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();

// The certificate Lanternfield signed the agreement with, published next to it. Trusting it is what
// makes the signature read 'valid'; your app trusts its own certificates the same way.
const lanternfieldCertificate = async () => {
  const response = await fetch('/pdfs/agreement.cer');
  return new Uint8Array(await response.arrayBuffer());
};

const agreement = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/agreement.pdf');
  return { kind: 'bytes', id: 'agreement', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Lanternfield's signature field, signed before the agreement was sent.
const PROVIDER = toFieldRef('provider');

// Two edits after an approval signature: a comment keeps it valid, a new form field breaks it.
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
      withSignature({ trust: { anchors: async () => [await lanternfieldCertificate()] } }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './break-warning.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button
          type="button"
          class="button"
          [disabled]="!signed() || made().comment"
          (click)="addComment()"
        >
          Add a comment
        </button>
        <button
          type="button"
          class="button"
          [disabled]="!signed() || made().field"
          (click)="addField()"
        >
          Add a form field
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
  private readonly annotation = inject(EpdfAnnotation);
  private readonly signature = inject(EpdfSignature);
  private readonly stage = viewChild(EpdfStage);
  private revealed = false;

  protected readonly signed = computed(() =>
    this.signature.signatures().find((each) => each.signed),
  );
  protected readonly status = computed(() => {
    const signed = this.signed();
    return signed
      ? `Signed by ${signed.signer.name}: ${signed.verdict?.summary ?? 'checking…'}`
      : 'Opening…';
  });
  protected readonly warning = signal<string | null>(null);
  protected readonly made = signal({ comment: false, field: false });

  /** Where the signature is: the edits go next to it. */
  private readonly widget = computed(() => {
    const first = this.form.get(PROVIDER)?.widgets[0];
    return first ? this.form.getWidget(first) : null;
  });

  constructor() {
    // The moment a change would break a signature once it's saved, as Acrobat warns.
    this.signature.invalidationPredicted$.pipe(takeUntilDestroyed()).subscribe(({ field }) => {
      const name = this.signature.getSignature(field)?.fieldName;
      this.warning.set(`This change will break the signature in "${name}" when saved.`);
    });

    // On load: the signatures, in view. Nothing is changed until a button is pressed.
    effect(() => {
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !stage || this.revealed) return;
      this.revealed = true;
      untracked(() => {
        const widget = this.widget();
        if (widget) stage.reveal(widget.page, { rect: widget.rect });
      });
    });
  }

  protected async addComment() {
    const widget = this.widget();
    if (!widget) return;
    const { rect } = widget;
    await this.annotation.create(widget.page, {
      subtype: 'text',
      rect: { x: rect.x + rect.width + 6, y: rect.y, width: 20, height: 20 },
      contents: 'Looks good to us.',
    });
    this.made.update((current) => ({ ...current, comment: true }));
  }

  protected async addField() {
    const widget = this.widget();
    if (!widget) return;
    const { rect } = widget;
    await this.form.create({
      family: 'text',
      name: 'purchase_order',
      widgets: [
        {
          page: widget.page,
          rect: { x: rect.x, y: rect.y + rect.height + 36, width: rect.width, height: 24 },
        },
      ],
    });
    this.made.update((current) => ({ ...current, field: true }));
  }
}
