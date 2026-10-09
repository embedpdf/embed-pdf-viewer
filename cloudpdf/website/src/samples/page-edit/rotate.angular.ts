import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfPageEdit, withPageEdit } from '@embedpdf/angular/page-edit';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Rotates the page you're on, in the file: the turn is kept when the document is downloaded.
@Component({
  selector: 'demo-rotate-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (page(); as page) {
      <div class="toolbar">
        <output class="readout">
          Page {{ stage().currentPageIndex() + 1 }} · {{ page.rotation }}°
        </output>
        <span class="spacer"></span>
        <button
          type="button"
          class="button"
          [disabled]="!pageEdit.canEdit()"
          (click)="pageEdit.rotateBy([page.ref], -90)"
        >
          ⟲ Rotate left
        </button>
        <button
          type="button"
          class="button"
          [disabled]="!pageEdit.canEdit()"
          (click)="pageEdit.rotateBy([page.ref], 90)"
        >
          ⟳ Rotate right
        </button>
        <button
          type="button"
          class="button"
          [disabled]="!pageEdit.canEdit()"
          (click)="everyPageUpright()"
        >
          Every page upright
        </button>
      </div>
    }
  `,
})
export class RotateToolbar {
  readonly stage = input.required<EpdfStage>();
  protected readonly pageEdit = inject(EpdfPageEdit);
  private readonly document = inject(EpdfDocument);
  protected readonly page = computed(
    () => this.document.pages()[this.stage().currentPageIndex()] ?? null,
  );

  constructor() {
    // The first page starts a quarter turn clockwise. setRotation() sets the same rotation
    // however often it runs; rotateBy() would turn it again.
    void this.pageEdit.setRotation([0], 90);
  }

  protected everyPageUpright() {
    void this.pageEdit.setRotation(
      this.document.pages().map((each) => each.ref),
      0,
    );
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, RotateToolbar],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withPageEdit(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './rotate.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-rotate-toolbar [stage]="stage" />
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
