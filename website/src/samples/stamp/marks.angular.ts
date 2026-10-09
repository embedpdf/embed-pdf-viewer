import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { EpdfStamp, withStamp, type StampAsset } from '@embedpdf/angular/stamp';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const assetEngine = engine; // stamp libraries are PDFs; they open here too

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// A signature as a pen would draw it: two strokes, in points.
const loop = Array.from({ length: 48 }, (_, i) => ({
  x: i * 4,
  y: 30 - Math.sin(i / 3) * 16 - i * 0.2,
}));
const underline = [
  { x: 10, y: 52 },
  { x: 180, y: 46 },
];

@Component({
  selector: 'button[demoMarkButton]',
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
export class MarkButton {
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
  selector: 'demo-marks',
  imports: [MarkButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      @for (asset of marks(); track asset.id) {
        <button demoMarkButton [asset]="asset" [armed]="armedAsset()?.id === asset.id"></button>
      }
      <span class="spacer"></span>
      <form class="type" (submit)="$event.preventDefault(); typeMark()">
        <input
          #field
          class="field"
          aria-label="Text of a typed stamp"
          [value]="text()"
          (input)="text.set(field.value)"
        />
        <button type="submit" class="button" [disabled]="!library() || !text().trim()">
          Type a stamp
        </button>
      </form>
    </div>
  `,
})
export class Marks {
  private readonly stamp = inject(EpdfStamp);
  protected readonly library = computed(() => this.stamp.libraries()[0]);
  protected readonly marks = this.stamp.assetsOf(() => ({ libraryId: this.library()?.id }));
  protected readonly armedAsset = this.stamp.armedAsset;
  protected readonly text = signal('Ada L.');

  constructor() {
    // On load: a drawn signature and typed initials, in a library of their own.
    void this.stamp.createLibrary('Ada Lovelace').then(async ({ library }) => {
      await this.stamp.createAsset({
        libraryId: library.id,
        label: 'Signature',
        mark: { kind: 'ink', strokes: [loop, underline], strokeWidth: 2.5, color: '#1d2b53' },
      });
      await this.stamp.createAsset({
        libraryId: library.id,
        label: 'Initials',
        mark: { kind: 'text', text: 'AL', fontFamily: 'times-italic', color: '#1d2b53' },
      });
    });
  }

  protected async typeMark() {
    const library = this.library();
    const text = this.text().trim();
    if (!library || !text) return;
    const { asset } = await this.stamp.createAsset({
      libraryId: library.id,
      label: text,
      mark: { kind: 'text', text, fontFamily: 'times-italic', color: '#1d2b53' },
    });
    await this.stamp.armAsset(asset.id);
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
    Marks,
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
  styleUrl: './marks.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-marks />
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
