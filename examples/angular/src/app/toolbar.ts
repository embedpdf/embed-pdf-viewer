/**
 * The document toolbar: zoom and page controls, through the Stage it's given. Document UI, so
 * it sits behind the workspace's document gate, next to the Stage.
 */
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { EpdfStage } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-toolbar',
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
    <button (click)="stage().zoomOut()">−</button>
    <span class="readout">{{ percent() }}%</span>
    <button (click)="stage().zoomIn()">+</button>
    <button (click)="stage().fitWidth()">Fit width</button>
    <button (click)="stage().fitPage()">Fit page</button>
    <span class="spacer"></span>
    <button (click)="stage().previousPage()">‹</button>
    <span class="readout">{{ stage().currentPageIndex() + 1 }} / {{ stage().pageCount() }}</span>
    <button (click)="stage().nextPage()">›</button>
  `,
})
export class Toolbar {
  readonly stage = input.required<EpdfStage>();
  protected readonly percent = computed(() => Math.round(this.stage().zoomLevel() * 100));
}
