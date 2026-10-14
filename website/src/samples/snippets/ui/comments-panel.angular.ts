import { Component, inject } from '@angular/core';
import { EpdfPanelToggle, EpdfShell } from '@embedpdf/angular/shell';
import { CommentList } from './comment-list';

@Component({
  selector: 'app-comments',
  imports: [EpdfPanelToggle, CommentList],
  template: `
    <button epdfPanelToggle="comments" epdfPanelToggleExclusive="right">Comments</button>

    @if (panel.isOpen()) {
      <aside>
        <button (click)="panel.close()">Close</button>
        <app-comment-list />
      </aside>
    }
  `,
})
export class Comments {
  protected readonly panel = inject(EpdfShell).surface('comments');
}
