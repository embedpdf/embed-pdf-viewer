import { Component, inject } from '@angular/core';
import { EpdfDocumentScope } from '@embedpdf/angular/runtime';
import { EpdfRenderLayer } from '@embedpdf/angular/render';
import { EpdfPageTemplate, EpdfStage } from '@embedpdf/angular/stage';
import { EpdfViewManager } from '@embedpdf/angular/view-manager';
import { PaneTabs } from './pane-tabs';

@Component({
  selector: 'app-panes',
  imports: [EpdfDocumentScope, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, PaneTabs],
  template: `
    <div class="panes">
      @for (pane of views.panes(); track pane.id) {
        <section
          [attr.data-focused]="pane.id === views.focusedPaneId()"
          (focusin)="views.setFocusedPane(pane.id)"
        >
          <app-pane-tabs [pane]="pane" />
          @if (pane.activeDocumentId; as documentId) {
            <div [epdfDocumentScope]="documentId">
              <epdf-stage>
                <ng-template epdfPage>
                  <epdf-render-layer />
                </ng-template>
              </epdf-stage>
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class Panes {
  protected readonly views = inject(EpdfViewManager);
}
