/**
 * The document UI: the toolbar and the Stage, behind `*epdfDocumentGate`, which creates them
 * only once a document is ready and shows the fallback until then.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EpdfDocumentGate, EpdfViewer } from '@embedpdf/angular/runtime';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageChrome, EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';
import { Toolbar } from './toolbar';

@Component({
  selector: 'app-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfPageChrome,
    EpdfRenderLayer,
    Toolbar,
  ],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      background: #e8e8ec;
    }
    .document {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
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
    <div *epdfDocumentGate="let document; fallback: empty" class="document">
      <app-toolbar [stage]="stage" />
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
        <ng-template epdfPageChrome let-page>
          <div class="page-label">{{ page.pageIndex() + 1 }}</div>
        </ng-template>
      </epdf-stage>
    </div>

    <ng-template #empty>
      <div class="empty">
        {{ viewer.status() === 'ready' ? 'Opening document…' : 'Starting engine…' }}
      </div>
    </ng-template>
  `,
})
export class Workspace {
  protected readonly viewer = inject(EpdfViewer);
}
