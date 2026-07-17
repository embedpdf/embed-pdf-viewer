/**
 * Document toolbar — the facade inject functions in action. Strict facades
 * (they resolve the document-scoped stage capability), so this component lives
 * behind the workspace's document gate.
 */
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { injectPages, injectZoom } from '@embedpdf-x/angular/stage';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #fff;
      border-bottom: 1px solid #d8d8de;
    }
    button {
      padding: 4px 10px;
      border: 1px solid #c8c8d0;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
    }
    button:hover {
      background: #f2f2f6;
    }
    .readout {
      min-width: 52px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .spacer {
      flex: 1;
    }
  `,
  template: `
    <button (click)="zoom.zoomOut()">−</button>
    <span class="readout">{{ percent() }}%</span>
    <button (click)="zoom.zoomIn()">+</button>
    <button (click)="zoom.fitWidth()">Fit width</button>
    <button (click)="zoom.fitPage()">Fit page</button>
    <span class="spacer"></span>
    <button (click)="pages.prev()">‹</button>
    <span class="readout">{{ pages.currentPage() + 1 }} / {{ pages.pageCount() }}</span>
    <button (click)="pages.next()">›</button>
  `,
})
export class Toolbar {
  protected readonly zoom = injectZoom();
  protected readonly pages = injectPages();
  protected readonly percent = computed(() => Math.round(this.zoom.zoom() * 100));
}
