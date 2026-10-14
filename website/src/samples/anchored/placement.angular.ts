import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSearch, EpdfSearchLayer, withSearch } from '@embedpdf/angular/search';
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import type { AnchoredPlacement, AnchoredSide } from '@embedpdf/angular/anchored';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const SIDES: AnchoredSide[] = ['top', 'right', 'bottom', 'left'];
const ALIGNS = ['start', 'center', 'end'] as const;

// A card next to the active match, where you put it, `gap` pixels away.
@Component({
  selector: 'demo-match-card',
  imports: [EpdfAnchored],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <epdf-anchored [anchor]="anchor()" [placement]="placement()" [gap]="gap()" [pinned]="pinned()">
      <div class="card">
        <span class="card-title">
          Match {{ search.activeHitIndex() + 1 }} of {{ search.hitCount() }}
        </span>
        <span class="card-page">Page {{ (search.activeHit()?.pageIndex ?? 0) + 1 }}</span>
        <div class="card-steps">
          <button
            type="button"
            class="step"
            aria-label="Previous match"
            (click)="search.previousHit()"
          >
            ←
          </button>
          <button type="button" class="step" aria-label="Next match" (click)="search.nextHit()">
            →
          </button>
        </div>
      </div>
    </epdf-anchored>
  `,
})
export class MatchCard {
  readonly placement = input.required<AnchoredPlacement>();
  readonly gap = input.required<number>();
  readonly pinned = input.required<boolean>();

  protected readonly search = inject(EpdfSearch);
  protected readonly anchor = computed(() => {
    const hit = this.search.activeHit();
    return hit && { page: hit.page, bounds: hit.bounds };
  });
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSearchLayer,
    MatchCard,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withSearch(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './placement.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <div class="segmented" role="radiogroup" aria-label="Side">
          @for (each of sides; track each) {
            <button
              type="button"
              role="radio"
              class="segment"
              [attr.aria-checked]="each === side()"
              (click)="side.set(each)"
            >
              {{ each }}
            </button>
          }
        </div>
        <div class="segmented" role="radiogroup" aria-label="Along the side">
          @for (each of aligns; track each) {
            <button
              type="button"
              role="radio"
              class="segment"
              [attr.aria-checked]="each === align()"
              (click)="align.set(each)"
            >
              {{ each }}
            </button>
          }
        </div>
        <label class="range">
          Gap {{ gap() }} px
          <input
            #range
            type="range"
            min="-24"
            max="32"
            [value]="gap()"
            (input)="gap.set(range.valueAsNumber)"
          />
        </label>
        <label class="switch">
          <input
            #switch
            type="checkbox"
            [checked]="pinned()"
            (change)="pinned.set(switch.checked)"
          />
          Pinned
        </label>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-search-layer />
        </ng-template>
        <demo-match-card [placement]="placement()" [gap]="gap()" [pinned]="pinned()" />
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly sides = SIDES;
  protected readonly aligns = ALIGNS;
  protected readonly side = signal<AnchoredSide>('top');
  protected readonly align = signal<(typeof ALIGNS)[number]>('center');
  protected readonly gap = signal(8);
  protected readonly pinned = signal(false);
  protected readonly placement = computed((): AnchoredPlacement => {
    const side = this.side();
    const align = this.align();
    return align === 'center' ? side : `${side}-${align}`;
  });

  private readonly search = inject(EpdfSearch);
  private readonly document = inject(EpdfDocument);

  constructor() {
    effect(() => {
      if (this.document.status() !== 'ready') return;
      void this.search.search({ text: 'PDF' }).then(() => this.search.revealActiveHit());
    });
  }
}
