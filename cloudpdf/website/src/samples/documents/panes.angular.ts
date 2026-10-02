import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocumentGate,
  EpdfDocuments,
  EpdfDocumentScope,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfViewManager, withViewManager, type PaneInfo } from '@embedpdf/angular/view-manager';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentScope, EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      {
        engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }),
        initialDocuments: [
          { source: ebook, name: 'Contract' },
          { source: ebook, name: 'Report' },
        ],
      },
      withStage(),
      withRender(),
      withViewManager(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './panes.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="panes">
      @for (pane of views.panes(); track pane.id) {
        <section
          class="pane"
          [attr.data-focused]="pane.id === views.focusedPaneId()"
          (pointerdown)="views.setFocusedPane(pane.id)"
        >
          <div class="bar" role="tablist">
            @for (id of pane.documentIds; track id) {
              <button
                type="button"
                role="tab"
                class="tab"
                [attr.aria-selected]="id === pane.activeDocumentId"
                (click)="views.setActiveDocument(pane.id, id)"
              >
                {{ nameOf(id) }}
              </button>
            }
            <button
              type="button"
              class="button"
              [disabled]="!pane.activeDocumentId || pane.documentIds.length < 2"
              (click)="split(pane)"
            >
              Split
            </button>
            <button
              type="button"
              class="button"
              [disabled]="views.panes().length < 2"
              (click)="views.removePane(pane.id)"
            >
              Close pane
            </button>
          </div>
          @if (pane.activeDocumentId; as documentId) {
            <ng-container [epdfDocumentScope]="documentId">
              <epdf-stage *epdfDocumentGate="let ready; fallback: opening" class="stage">
                <ng-template epdfPage>
                  <epdf-render-layer />
                </ng-template>
              </epdf-stage>
            </ng-container>
          } @else {
            <p class="empty">No document in this pane.</p>
          }
        </section>
      }
    </div>

    <ng-template #opening><p class="empty">Opening…</p></ng-template>
  `,
})
export class App {
  protected readonly views = inject(EpdfViewManager);
  private readonly documents = inject(EpdfDocuments);

  constructor() {
    // On load, both documents land in the first pane: put the second one beside it, once.
    const splitOnLoad = effect(() => {
      const panes = this.views.panes();
      if (panes.length !== 1 || panes[0].documentIds.length !== 2) return;
      splitOnLoad.destroy();
      untracked(() => this.views.splitPane(panes[0].documentIds[1]));
    });
  }

  protected nameOf(id: string): string {
    return this.documents.documents().find((document) => document.id === id)?.name ?? id;
  }

  protected split(pane: PaneInfo) {
    if (pane.activeDocumentId) this.views.splitPane(pane.activeDocumentId, { from: pane.id });
  }
}
