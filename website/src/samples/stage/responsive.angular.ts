import { ChangeDetectionStrategy, Component, signal, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      // Facing pages with a roomy margin, and one rule for a narrow Stage: a thin
      // margin and one page at a time. The rule has a name, so the UI can read it too.
      withStage({
        padding: 24,
        spread: 'odd',
        responsive: [
          { name: 'compact', when: { maxWidth: 600 }, settings: { padding: 4, spread: 'none' } },
        ],
      }),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './responsive.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <!-- One breakpoint drives both the layout and this toolbar. -->
      @let compact = stage.activeRules().includes('compact');
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Stage width">
          <button type="button" [attr.aria-pressed]="!narrow()" (click)="narrow.set(false)">
            Full width
          </button>
          <button type="button" [attr.aria-pressed]="narrow()" (click)="narrow.set(true)">
            360 px
          </button>
        </div>
        <output class="badge" [attr.data-on]="compact">
          compact <strong>{{ compact ? 'on' : 'off' }}</strong>
        </output>
        <output class="badge">
          padding <strong>{{ stage.settings().padding }}</strong> · spread
          <strong>{{ stage.settings().spread }}</strong>
        </output>
        <div class="pager">
          <button type="button" class="button" (click)="stage.previousPage()">
            {{ compact ? '‹' : '‹ Previous' }}
          </button>
          <button type="button" class="button" (click)="stage.nextPage()">
            {{ compact ? '›' : 'Next ›' }}
          </button>
        </div>
      </div>

      <div class="frame" [attr.data-width]="narrow() ? 'narrow' : 'full'">
        <epdf-stage #stage="epdfStage" class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
          </ng-template>
        </epdf-stage>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly narrow = signal(false);
}
