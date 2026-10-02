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
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Measurement {
  readonly page: PageRef;
  readonly from: Point;
  readonly to: Point;
}

// Page coordinates are points, 72 to the inch.
const lengthOf = ({ from, to }: Measurement) => {
  const inches = Math.hypot(to.x - from.x, to.y - from.y) / 72;
  return `${inches.toFixed(2)} in · ${(inches * 2.54).toFixed(1)} cm`;
};

// The measured line on its page, placed in the page's pixels.
@Component({
  selector: 'demo-ruler-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (line(); as line) {
      <svg class="ruler-layer">
        <line class="ruler-line" [attr.x1]="line.from.x" [attr.y1]="line.from.y" [attr.x2]="line.to.x" [attr.y2]="line.to.y" />
        <circle class="ruler-end" [attr.cx]="line.from.x" [attr.cy]="line.from.y" r="4" />
        <circle class="ruler-end" [attr.cx]="line.to.x" [attr.cy]="line.to.y" r="4" />
      </svg>
      <span
        class="ruler-label"
        [style.left.px]="(line.from.x + line.to.x) / 2"
        [style.top.px]="(line.from.y + line.to.y) / 2"
      >{{ line.length }}</span>
    }
  `,
})
export class RulerLayer {
  readonly measurement = input.required<Measurement | null>();
  private readonly page = injectPage('<demo-ruler-layer>');

  protected readonly line = computed(() => {
    const measurement = this.measurement();
    if (!measurement || !pageRefsEqual(measurement.page, this.page.ref)) return null;
    const transform = this.page.transform();
    return {
      from: transform.toPixels(measurement.from),
      to: transform.toPixels(measurement.to),
      length: lengthOf(measurement),
    };
  });
}

@Component({
  selector: 'demo-ruler',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, RulerLayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <output class="readout">{{ readout() }}</output>
      <output class="readout muted">
        @if (pointer(); as pointer) {
          x {{ round(pointer.x) }} · y {{ round(pointer.y) }} pt
        }
      </output>
    </div>
    <epdf-stage class="stage">
      <ng-template epdfPage>
        <epdf-render-layer />
        <demo-ruler-layer [measurement]="measurement()" />
      </ng-template>
    </epdf-stage>
  `,
})
export class Ruler {
  protected readonly measurement = signal<Measurement | null>(null);
  protected readonly pointer = signal<Point | null>(null);
  protected readonly readout = computed(() => {
    const measurement = this.measurement();
    return measurement ? lengthOf(measurement) : 'Drag on a page to measure';
  });
  protected readonly round = Math.round;

  constructor() {
    const interaction = inject(EpdfInteraction);
    // A tool you drag with: the press starts a line, the moves stretch it, the release ends it.
    const remove = interaction.registerTool({
      id: 'ruler',
      cursor: 'crosshair',
      touch: 'draw', // one finger measures, two fingers scroll and zoom
      onPointerDown: ({ page, point }) => {
        this.measurement.set({ page, from: point, to: point });
        return true;
      },
      onPointerMove: ({ point }) => {
        this.measurement.update((current) => current && { ...current, to: point });
      },
      onPointerUp: ({ point }) => {
        this.measurement.update((current) => current && { ...current, to: point });
      },
      onHover: ({ point }) => this.pointer.set(point),
    });
    interaction.activateTool('ruler');
    inject(DestroyRef).onDestroy(remove);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, Ruler],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ruler.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-ruler *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
