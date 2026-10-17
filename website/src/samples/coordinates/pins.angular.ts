import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { EpdfPageContext, OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageChrome, EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// A pin is a page and a point on it, in points from the page's top-left. No pixels.
interface Pin {
  pageIndex: number;
  point: { x: number; y: number };
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfPageChrome, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './pins.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button type="button" class="button" (click)="stage.zoomOut()">Zoom out</button>
        <button type="button" class="button" (click)="stage.zoomIn()">Zoom in</button>
        <button type="button" class="button" (click)="stage.rotateViewBy(90)">Rotate ⟳</button>
        <button type="button" class="button" (click)="pins.set([])">Clear pins</button>
        <output class="badge">
          @if (last(); as last) {
            page <strong>{{ last.pageIndex + 1 }}</strong> · x
            <strong>{{ last.point.x.toFixed(1) }}</strong> · y
            <strong>{{ last.point.y.toFixed(1) }}</strong>
          } @else {
            Click a page to drop a pin
          }
        </output>
      </div>
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
        <!-- What's drawn here sits over the page and never turns with it, so it converts with
             pageToView, which includes the turn. -->
        <ng-template epdfPageChrome let-page>
          <div class="surface" (pointerdown)="press($event)" (click)="drop($event, page)">
            @if (page.pageIndex() === 0) {
              <!-- Many things at once: the browser maps page points with one matrix. -->
              <div class="page-space" [style.transform]="page.transform().cssMatrix">
                <div class="inch">1 inch</div>
              </div>
            }
            @for (pin of pins(); track $index) {
              @if (pin.pageIndex === page.pageIndex()) {
                <!-- A point on the page, to pixels on it: at the last moment. -->
                @let at = page.transform().pageToView(pin.point);
                <div class="pin" [style.left.px]="at.x" [style.top.px]="at.y"></div>
              }
            }
          </div>
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  // One pin to start with: an inch in from the first page's top-left corner.
  protected readonly pins = signal<Pin[]>([{ pageIndex: 0, point: { x: 72, y: 72 } }]);
  protected readonly last = computed(() => this.pins().at(-1) ?? null);
  // Where the pointer went down: a press that moved was a drag to scroll, not a click.
  private pressed = { x: 0, y: 0 };

  protected press(event: PointerEvent) {
    this.pressed = { x: event.clientX, y: event.clientY };
  }

  protected drop(event: MouseEvent, page: EpdfPageContext) {
    const moved = Math.hypot(event.clientX - this.pressed.x, event.clientY - this.pressed.y);
    if (moved > 4) return;
    // A pointer event, to a point on the page.
    const point = page.toPagePoint(event.clientX, event.clientY);
    this.pins.update((current) => [...current, { pageIndex: page.pageIndex(), point }]);
  }
}
