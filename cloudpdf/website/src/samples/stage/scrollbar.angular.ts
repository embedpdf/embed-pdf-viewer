import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfScrollbar, EpdfStage, withStage } from '@embedpdf/angular/stage';
import type { ScrollMetrics } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfScrollbar, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './scrollbar.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <!-- A reading-progress bar, from the same numbers a scrollbar uses. -->
      @let progress = progressOf(stage.scrollMetrics());
      <div
        class="progress"
        role="progressbar"
        aria-label="Reading progress"
        [attr.aria-valuenow]="progress"
      >
        <div class="progress-fill" [style.width.%]="progress"></div>
      </div>

      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
        <epdf-scrollbar axis="y" [autoHide]="1200" class="scrollbar" thumbClass="thumb" />
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected progressOf({ scrollTop, scrollHeight, clientHeight }: ScrollMetrics): number {
    const travel = scrollHeight - clientHeight;
    return travel > 0 ? Math.round((scrollTop / travel) * 100) : 0;
  }
}
