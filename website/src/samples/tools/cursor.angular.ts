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
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const COLORS = ['#e5484d', '#2f80ed', '#30a46c', '#1a2748'];

// A pen in the current color, with its tip at the bottom left.
const penIcon = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <path d="M3 21l1.6-5.6L16.2 3.8a2.2 2.2 0 0 1 3.1 3.1L7.7 18.5z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;

interface Dot {
  readonly id: number;
  readonly page: PageRef;
  readonly point: { readonly x: number; readonly y: number };
  readonly color: string;
}

// While this is there, the dot tool's crosshair is a pen in `color`.
@Component({
  selector: 'demo-pen-cursor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class PenCursor {
  readonly color = input.required<string>();

  constructor() {
    inject(EpdfInteraction).overrideCursor(() => ({
      toolId: 'dot',
      cursors: { crosshair: { svg: penIcon(this.color()), hotspot: { x: 3, y: 21 } } },
    }));
  }
}

@Component({
  selector: 'demo-dot-layer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (dot of onThisPage(); track dot.id) {
      <span
        class="dot"
        [style.left.px]="pixels(dot).x"
        [style.top.px]="pixels(dot).y"
        [style.background]="dot.color"
      ></span>
    }
  `,
})
export class DotLayer {
  readonly dots = input.required<readonly Dot[]>();
  private readonly page = injectPage('<demo-dot-layer>');

  protected readonly onThisPage = computed(() =>
    this.dots().filter((dot) => pageRefsEqual(dot.page, this.page.ref)),
  );

  protected pixels(dot: Dot) {
    return this.page.transform().toPixels(dot.point);
  }
}

@Component({
  selector: 'demo-dots',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, PenCursor, DotLayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (penCursor()) {
      <demo-pen-cursor [color]="color()" />
    }
    <div class="toolbar">
      <div class="swatches" role="radiogroup" aria-label="Color">
        @for (swatch of colors; track swatch) {
          <button
            type="button"
            role="radio"
            [attr.aria-checked]="swatch === color()"
            [attr.aria-label]="swatch"
            class="swatch"
            [style.background]="swatch"
            (click)="color.set(swatch)"
          ></button>
        }
      </div>
      <label class="check">
        <input #check type="checkbox" [checked]="penCursor()" (change)="penCursor.set(check.checked)" />
        Pen cursor
      </label>
    </div>
    <epdf-stage class="stage">
      <ng-template epdfPage>
        <epdf-render-layer />
        <demo-dot-layer [dots]="dots()" />
      </ng-template>
    </epdf-stage>
  `,
})
export class Dots {
  protected readonly colors = COLORS;
  protected readonly color = signal(COLORS[0]);
  protected readonly penCursor = signal(true);
  protected readonly dots = signal<readonly Dot[]>([]);

  constructor() {
    const interaction = inject(EpdfInteraction);
    const remove = interaction.registerTool({
      id: 'dot',
      cursor: 'crosshair',
      // The tool reads the color at the moment of the click.
      onPointerDown: ({ page, point }) => {
        this.dots.update((current) => [
          ...current,
          { id: current.length + 1, page, point, color: this.color() },
        ]);
        return true;
      },
    });
    interaction.activateTool('dot');
    inject(DestroyRef).onDestroy(remove);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, Dots],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './cursor.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-dots *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
