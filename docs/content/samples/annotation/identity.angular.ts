import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
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

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// On load: a sticky note on the cover. It's Dana's, like everything drawn here.
@Component({
  selector: 'demo-add-note',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
export class AddNote {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly document = inject(EpdfDocument);
  private added = false;

  constructor() {
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void this.annotation.create(cover, {
          subtype: 'text',
          rect: { x: 470, y: 232, width: 20, height: 20 },
          contents: 'Can we shorten the title?',
          color: '#facc15',
        });
      });
    });
  }
}

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
    AddNote,
    Toolbar,
    Authors,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => localEngine(),
        identity: { userId: 'u_381', displayName: 'Dana Smith' },
        initialDocuments: [{ source: ebook }],
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
      <demo-add-note />
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
