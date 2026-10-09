import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import {
  EpdfDocument,
  EpdfDocumentGate,
  EpdfDocuments,
  provideEmbedPdf,
} from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'demo-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs" role="tablist">
      @for (document of documents.documents(); track document.id) {
        <div class="tab" [attr.data-active]="document.id === documents.activeId()">
          <button
            type="button"
            role="tab"
            class="name"
            [attr.aria-selected]="document.id === documents.activeId()"
            (click)="documents.setActive(document.id)"
          >
            {{ document.name }}
          </button>
          <button
            type="button"
            class="close"
            [attr.aria-label]="'Close ' + document.name"
            (click)="documents.close(document.id)"
          >
            ×
          </button>
        </div>
      }
      <button type="button" class="button" aria-label="Open another copy" (click)="openCopy()">
        +
      </button>
    </div>
  `,
})
export class Tabs {
  protected readonly documents = inject(EpdfDocuments);

  protected openCopy() {
    void this.documents.open(ebook, { name: `Copy ${this.documents.documents().length + 1}` });
  }
}

// The active tab: rename it, move it to the front, and zoom it. Each tab keeps its own zoom.
@Component({
  selector: 'demo-tab-tools',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <input
        #field
        class="field"
        aria-label="Tab name"
        [value]="document.name() ?? ''"
        (input)="documents.rename(document.id(), field.value)"
      />
      <button type="button" class="button" (click)="documents.move(document.id(), 0)">
        Move to front
      </button>
      <button type="button" class="button" aria-label="Zoom out" (click)="stage().zoomOut()">
        −
      </button>
      <button type="button" class="button" aria-label="Zoom in" (click)="stage().zoomIn()">
        +
      </button>
      <output class="readout">{{ percent(stage().zoomLevel()) }}%</output>
    </div>
  `,
})
export class TabTools {
  readonly stage = input.required<EpdfStage>();
  protected readonly documents = inject(EpdfDocuments);
  protected readonly document = inject(EpdfDocument);

  protected percent(zoomLevel: number): number {
    return Math.round(zoomLevel * 100);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, Tabs, TabTools],
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
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tabs.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-tabs />
    <ng-container *epdfDocumentGate="let document; fallback: opening">
      <demo-tab-tools [stage]="stage" />
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #opening><p class="loading">Opening…</p></ng-template>
  `,
})
export class App {}
