import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  EpdfHandleTemplate,
  EpdfRotationHandleTemplate,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const ACCENTS = ['#054fb3', '#e91e63', '#0f6e56'];

@Component({
  selector: 'demo-chrome-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="swatches" role="group" aria-label="Accent">
        @for (accent of accents; track accent) {
          <button
            type="button"
            class="swatch"
            [attr.aria-label]="accent"
            [attr.aria-pressed]="chrome().accent === accent"
            [style.background]="accent"
            (click)="setAccent(accent)"
          ></button>
        }
      </div>
      <label class="check">
        <input
          #dashed
          type="checkbox"
          [checked]="chrome().outline.style === 'dashed'"
          (change)="setDashed(dashed.checked)"
        />
        Dashed outline
      </label>
      <label class="check">
        <input
          #round
          type="checkbox"
          [checked]="chrome().handles.shape === 'circle'"
          (change)="setRound(round.checked)"
        />
        Round handles
      </label>
      <label class="check">
        <input #mine type="checkbox" [checked]="own()" (change)="own.set(mine.checked)" />
        Draw them myself
      </label>
      <button type="button" class="button" (click)="annotation.resetSettings()">Reset</button>
    </div>
  `,
})
export class ChromeControls {
  /** Whether the layer draws your handles. */
  readonly own = model.required<boolean>();

  protected readonly annotation = inject(EpdfAnnotation);
  protected readonly chrome = computed(() => this.annotation.settings().chrome);
  protected readonly accents = ACCENTS;

  protected setAccent(accent: string) {
    this.annotation.updateSettings({ chrome: { accent } });
  }

  protected setDashed(dashed: boolean) {
    this.annotation.updateSettings({ chrome: { outline: { style: dashed ? 'dashed' : 'solid' } } });
  }

  protected setRound(round: boolean) {
    this.annotation.updateSettings({ chrome: { handles: { shape: round ? 'circle' : 'square' } } });
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
    EpdfHandleTemplate,
    EpdfRotationHandleTemplate,
    ChromeControls,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './handles.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-chrome-controls [(own)]="own" />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer>
            <!-- Your own handles: the layer places them, and still decides where they can be grabbed. -->
            @if (own()) {
              <ng-template epdfHandle let-handle>
                <div
                  class="handle handle--{{ handle.kind }}"
                  [class.handle--active]="handle.active"
                  [style.left.px]="handle.at.x - handle.size / 2"
                  [style.top.px]="handle.at.y - handle.size / 2"
                  [style.width.px]="handle.size"
                  [style.height.px]="handle.size"
                  [style.rotate.deg]="handle.rotation"
                ></div>
              </ng-template>
              <ng-template epdfRotationHandle let-handle>
                <div
                  class="turn"
                  [class.turn--active]="handle.active"
                  [style.left.px]="handle.at.x - handle.size"
                  [style.top.px]="handle.at.y - handle.size"
                  [style.width.px]="handle.size * 2"
                  [style.height.px]="handle.size * 2"
                >
                  ↻
                </div>
              </ng-template>
            }
          </epdf-annotation-layer>
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly own = signal(false);
  private readonly annotation = inject(EpdfAnnotation);
  private readonly document = inject(EpdfDocument);
  private added = false;

  constructor() {
    // On load: a rectangle on the cover, selected so its handles show.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void this.annotation.create(
          cover,
          {
            subtype: 'square',
            box: { x: 96, y: 506, width: 178, height: 54 },
            color: '#1a2748',
            strokeWidth: 2,
          },
          undefined,
          { select: true },
        );
      });
    });
  }
}
