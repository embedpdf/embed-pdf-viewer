import { Component, inject } from '@angular/core';
import { EpdfOutline } from '@embedpdf/angular/outline';

@Component({
  selector: 'app-outline-list',
  template: `
    <ul role="tree">
      @for (row of outline.rows(); track row.item.ref.objectNumber) {
        <li
          role="treeitem"
          [attr.aria-level]="row.depth + 1"
          [attr.aria-expanded]="row.hasChildren ? row.expanded : null"
          [attr.aria-current]="
            row.item.ref.objectNumber === outline.current()?.objectNumber ? 'location' : null
          "
          [style.padding-inline-start.px]="row.depth * 16"
        >
          @if (row.hasChildren) {
            <button (click)="outline.toggle(row.item.ref)">{{ row.expanded ? '▾' : '▸' }}</button>
          }
          <button (click)="outline.activate(row.item.ref)">{{ row.item.title }}</button>
        </li>
      }
    </ul>
  `,
})
export class OutlineList {
  protected readonly outline = inject(EpdfOutline);
}
