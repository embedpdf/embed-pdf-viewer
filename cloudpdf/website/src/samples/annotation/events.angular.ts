import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

interface Entry {
  id: number;
  text: string;
  origin: string;
}

// Every change, once the engine has saved it, newest first.
@Component({
  selector: 'ol[demoActivityLog]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'panel log' },
  template: `
    @for (entry of entries(); track entry.id) {
      <li class="entry">
        <span>{{ entry.text }}</span>
        <span class="origin">{{ entry.origin }}</span>
      </li>
    } @empty {
      <li class="empty">Nothing yet</li>
    }
  `,
})
export class ActivityLog {
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly entries = signal<Entry[]>([]);
  private nextId = 0;

  constructor() {
    this.annotation.created$
      .pipe(takeUntilDestroyed())
      .subscribe(({ annotation, origin }) =>
        this.log(`${annotation.author ?? 'Someone'} added a ${annotation.subtype}`, origin.kind),
      );
    this.annotation.updated$
      .pipe(takeUntilDestroyed())
      .subscribe(({ annotation, origin }) =>
        this.log(`Changed a ${annotation.subtype}`, origin.kind),
      );
    this.annotation.deleted$
      .pipe(takeUntilDestroyed())
      .subscribe(({ refs, origin }) =>
        this.log(
          `Deleted ${refs.length === 1 ? 'one annotation' : `${refs.length} annotations`}`,
          origin.kind,
        ),
      );
    this.annotation.reordered$
      .pipe(takeUntilDestroyed())
      .subscribe(({ order, origin }) =>
        this.log(`Restacked ${order.length} on a page`, origin.kind),
      );
  }

  private log(text: string, origin: string) {
    this.entries.update((current) =>
      [{ id: this.nextId++, text, origin }, ...current].slice(0, 30),
    );
  }
}

const TOOLS = [
  { id: 'pointer', label: 'Select' },
  { id: 'square', label: 'Rectangle' },
  { id: 'ink', label: 'Pen' },
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
      <button
        type="button"
        class="button"
        [disabled]="annotation.selected().length === 0"
        (click)="annotation.selection.delete()"
      >
        Delete
      </button>
    </div>
  `,
})
export class Toolbar {
  protected readonly annotation = inject(EpdfAnnotation);
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly tools = TOOLS;
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    ActivityLog,
    Toolbar,
  ],
  providers: [
    provideEmbedPdf(
      {
        engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }),
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
  styleUrl: './events.css',
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
        <ol demoActivityLog></ol>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly pages = inject(EpdfDocument).pages;
  private added = false;

  constructor() {
    // On load: a rectangle on the cover, so the log starts with its event.
    effect(() => {
      const cover = this.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      void this.annotation.create(cover, {
        subtype: 'square',
        box: { x: 96, y: 506, width: 178, height: 54 },
        color: '#e5484d',
        strokeWidth: 3,
      });
    });
  }
}
