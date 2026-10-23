import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import {
  annotationKey,
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
} from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

const sketch = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-sketch.pdf');
  return { kind: 'bytes', id: 'sketch', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'square', label: 'Rectangle' },
  { id: 'note', label: 'Note' },
];

@Component({
  selector: 'demo-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Tool">
        @for (tool of tools; track tool.id) {
          <button
            type="button"
            [attr.aria-pressed]="interaction.activeToolId() === tool.id"
            (click)="interaction.activateTool(tool.id)"
          >
            {{ tool.label }}
          </button>
        }
      </div>
    </div>
  `,
})
export class Toolbar {
  protected readonly tools = TOOLS;
  protected readonly interaction = inject(EpdfInteraction);
}

const time = (date: string | null) =>
  date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

// Who wrote each annotation, and when: the engine fills these in from the identity.
@Component({
  selector: 'ul[demoAuthors]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel authors' },
  template: `
    @if (annotations().length === 0) {
      <li class="empty">Draw something</li>
    }
    @for (annotation of annotations(); track key(annotation.ref)) {
      <li class="author">
        <span class="kind">{{ annotation.subtype }}</span>
        <span>{{ annotation.author ?? 'Nobody' }} · {{ time(annotation.createdAt) }}</span>
      </li>
    }
  `,
})
export class Authors {
  protected readonly annotations = inject(EpdfAnnotation).watch();
  protected readonly key = annotationKey;
  protected readonly time = time;
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    Toolbar,
    Authors,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
        identity: { userId: 'u_381', displayName: 'Dana Smith' },
        initialDocuments: [{ source: sketch }],
      },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './identity.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-toolbar />
      <div class="viewer">
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-annotation-layer />
          </ng-template>
        </epdf-stage>
        <ul demoAuthors></ul>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
