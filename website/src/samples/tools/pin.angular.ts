import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocumentGate,
  injectPage,
  pageRefsEqual,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, svgCursor, withInteraction } from '@embedpdf/angular/interaction';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

interface Pin {
  readonly id: number;
  readonly page: PageRef;
  readonly point: { readonly x: number; readonly y: number };
}

// The cursor is the pin itself; its tip is the point that clicks.
const PIN_CURSOR = svgCursor({
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M12 23s7.5-7.4 7.5-12.5a7.5 7.5 0 0 0-15 0C4.5 15.6 12 23 12 23z" fill="#e5484d" stroke="#fff" stroke-width="1.5"/>
    <circle cx="12" cy="10.5" r="2.8" fill="#fff"/>
  </svg>`,
  hotspot: { x: 12, y: 23 },
  fallback: 'copy',
});

// The pins on one page, placed in its pixels at the last moment.
@Component({
  selector: 'demo-pin-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (pin of onThisPage(); track pin.id) {
      <span class="pin" [style.left.px]="pixels(pin).x" [style.top.px]="pixels(pin).y">{{
        pin.id
      }}</span>
    }
  `,
})
export class PinLayer {
  readonly pins = input.required<readonly Pin[]>();
  private readonly page = injectPage('<demo-pin-layer>');

  protected readonly onThisPage = computed(() =>
    this.pins().filter((pin) => pageRefsEqual(pin.page, this.page.ref)),
  );

  protected pixels(pin: Pin) {
    return this.page.transform().toPixels(pin.point);
  }
}

@Component({
  selector: 'demo-pin-board',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, PinLayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Tool">
        <button
          type="button"
          class="segment"
          [attr.aria-pressed]="interaction.activeToolId() === 'pin'"
          (click)="interaction.activateTool('pin')"
        >
          Pin
        </button>
        <button
          type="button"
          class="segment"
          [attr.aria-pressed]="interaction.activeToolId() === 'pan'"
          (click)="interaction.activateTool('pan')"
        >
          Hand
        </button>
      </div>
      <button type="button" class="button" [disabled]="pins().length === 0" (click)="pins.set([])">
        Clear
      </button>
      <output class="readout">
        {{ pins().length === 0 ? 'Click a page to drop a pin' : pins().length + ' pins' }}
      </output>
    </div>
    <epdf-stage class="stage">
      <ng-template epdfPage>
        <epdf-render-layer />
        <demo-pin-layer [pins]="pins()" />
      </ng-template>
    </epdf-stage>
  `,
})
export class PinBoard {
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly pins = signal<readonly Pin[]>([]);

  constructor() {
    // A tool of your own: a click on a page drops a pin there, in page coordinates.
    const remove = this.interaction.registerTool({
      id: 'pin',
      cursor: PIN_CURSOR,
      onPointerDown: ({ page, point }) => {
        this.pins.update((current) => [...current, { id: current.length + 1, page, point }]);
        return true; // this tool handled the click
      },
    });
    this.interaction.activateTool('pin');
    inject(DestroyRef).onDestroy(remove);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, PinBoard],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pin.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-pin-board *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
