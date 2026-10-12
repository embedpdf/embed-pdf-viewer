import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
  type AnnotationRef,
} from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Create a rectangle, then change, move and delete it, all from code.
@Component({
  selector: 'demo-square-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button type="button" class="button" [disabled]="square() !== null" (click)="add()">
        Create
      </button>
      <button type="button" class="button" [disabled]="!canUpdate()" (click)="makeRed()">
        Make it red
      </button>
      <button type="button" class="button" [disabled]="!canUpdate()" (click)="moveRight()">
        Move right
      </button>
      <button type="button" class="button" [disabled]="!canUpdate()" (click)="turn()">
        Turn to 90°
      </button>
      <button type="button" class="button" [disabled]="!canDelete()" (click)="remove()">
        Delete
      </button>
      <span class="spacer"></span>
      <output class="readout">{{ status() }}</output>
    </div>
  `,
})
export class SquareControls {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly document = inject(EpdfDocument);
  private readonly squareRef = signal<AnnotationRef | null>(null);
  private readonly annotations = this.annotation.watch(); // follows the annotations, for the reads below

  protected readonly square = computed(() => {
    this.annotations(); // read again whenever the annotations change
    const ref = this.squareRef();
    return ref ? this.annotation.get(ref) : null;
  });
  // Checks are signals too: they follow the annotation, the document and its permissions.
  protected readonly canUpdate = computed(() => {
    const square = this.square();
    return square !== null && this.annotation.canUpdate(square.ref);
  });
  protected readonly canDelete = computed(() => {
    const square = this.square();
    return square !== null && this.annotation.canDelete(square.ref);
  });
  protected readonly status = computed(() => {
    const square = this.square();
    if (!square) return 'No rectangle';
    return this.annotation.isPending(square.ref) ? 'Saving…' : 'Saved';
  });
  private started = false;

  constructor() {
    // On load: one rectangle, to change.
    effect(() => {
      if (this.annotation.status() !== 'ready' || this.started) return;
      this.started = true;
      void this.add();
    });
  }

  protected async add() {
    const cover = this.document.pages()[0]?.ref;
    if (!cover) return;
    const { annotation: square } = await this.annotation.create(cover, {
      subtype: 'square',
      box: { x: 72, y: 592, width: 200, height: 100 },
      color: '#0078ff',
      strokeWidth: 3,
    });
    this.squareRef.set(square.ref);
  }

  protected makeRed() {
    const square = this.square();
    if (square) void this.annotation.update(square.ref, { color: '#dc143c' });
  }

  protected moveRight() {
    const square = this.square();
    if (!square) return;
    const { rect } = square;
    void this.annotation.update(square.ref, { rect: { ...rect, x: rect.x + 40 } }); // 40 points right
  }

  protected turn() {
    const square = this.square();
    if (square) void this.annotation.update(square.ref, { rotation: 90 });
  }

  protected remove() {
    const square = this.square();
    if (!square) return;
    void this.annotation.delete(square.ref);
    this.squareRef.set(null);
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    SquareControls,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './create-update.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-square-controls />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
