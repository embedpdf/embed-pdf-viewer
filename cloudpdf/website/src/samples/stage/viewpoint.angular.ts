import {
  ChangeDetectionStrategy,
  Component,
  effect,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import type { StageViewState, Viewpoint } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './viewpoint.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <div class="group">
          <button type="button" class="button" (click)="rememberSpot(stage)">
            Remember this spot
          </button>
          @let remembered = spot();
          <button
            type="button"
            class="button"
            [disabled]="!remembered"
            (click)="
              remembered && stage.goToPage(remembered.page, { viewpoint: remembered.viewpoint })
            "
          >
            Go back{{ remembered ? ' to ' + remembered.label : '' }}
          </button>
        </div>
        <div class="group">
          <button type="button" class="button" (click)="view.set(stage.getViewState())">
            Save the view
          </button>
          @let saved = view();
          <button
            type="button"
            class="button"
            [disabled]="!saved"
            (click)="saved && stage.applyViewState(saved)"
          >
            Restore it
          </button>
        </div>
        <output class="badge">
          page <strong>{{ stage.currentPageIndex() + 1 }}</strong> ·
          <strong>{{ percent(stage.zoomLevel()) }}%</strong>
        </output>
      </div>

      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  // One spot on one page, and the whole view: settings and position.
  protected readonly spot = signal<{ page: PageRef; viewpoint: Viewpoint; label: string } | null>(
    null,
  );
  protected readonly view = signal<StageViewState | null>(null);
  private readonly stage = viewChild(EpdfStage);

  constructor() {
    // Remember where the reader starts, so "Go back" works right away.
    effect(() => {
      const stage = this.stage();
      if (!stage || stage.pageCount() === 0) return;
      untracked(() => this.rememberSpot(stage));
    });
  }

  protected rememberSpot(stage: EpdfStage) {
    const page = stage.getCurrentPage();
    if (!page) return;
    const label = `page ${stage.getCurrentPageIndex() + 1}`;
    this.spot.set({ page, viewpoint: stage.getViewpoint(), label });
  }

  protected percent(zoomLevel: number): number {
    return Math.round(zoomLevel * 100);
  }
}
