/**
 * The workspace/document split, Angular-style:
 *   - workspace chrome (tabs, open button) renders unconditionally — alive
 *     while WASM still compiles;
 *   - document UI (toolbar, stage) sits behind @if (documentId()) — the app's
 *     own template, so creation genuinely defers (eager content projection
 *     can't bite here).
 */
import { afterNextRender, ChangeDetectionStrategy, Component } from '@angular/core';
import { injectDocumentId, injectDocuments, injectKernelHost } from '@embedpdf/angular/runtime';
import { EpdfPageChrome, EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { sampleSource } from './engine';
import { Toolbar } from './toolbar';
import { DocTabs } from './doc-tabs';

@Component({
  selector: 'app-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EpdfStage, EpdfPageTemplate, EpdfPageChrome, EpdfRenderLayer, Toolbar, DocTabs],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #e8e8ec;
    }
    .stage {
      flex: 1;
      min-height: 0;
    }
    .empty {
      flex: 1;
      display: grid;
      place-items: center;
      color: #667;
    }
    .page-label {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: grid;
      place-items: center;
      font-size: 11px;
      color: #556;
    }
  `,
  template: `
    <!-- workspace chrome: outside the gate, alive from t≈0 -->
    <app-doc-tabs />
    @if (documentId()) {
      <!-- document UI: defined over a document, so gated on having one -->
      <app-toolbar />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
        <ng-template epdfPageChrome let-page>
          <div class="page-label">{{ page.pageIndex() + 1 }}</div>
        </ng-template>
      </epdf-stage>
    } @else {
      <div class="empty">
        {{ ready() ? 'Opening document…' : 'Starting engine…' }}
      </div>
    }
  `,
})
export class Workspace {
  protected readonly documentId = injectDocumentId();
  protected readonly ready = injectKernelHost().ready;
  private readonly documents = injectDocuments();

  constructor() {
    // First document: after first render — inputs are set, we're in the
    // browser, and the open() awaits the deferred engine internally.
    afterNextRender(() => {
      void (async () => {
        await this.documents.open(await sampleSource('ebook', '/ebook.pdf'), { name: 'Ebook' });
      })().catch((err) => console.error('[example] open failed', err));
    });
  }
}
