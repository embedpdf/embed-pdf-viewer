import { Component, inject } from '@angular/core';
import { EpdfShell } from '@embedpdf/angular/shell';
import { CommentList } from './comment-list';

@Component({
  selector: 'app-comments-panel',
  imports: [CommentList],
  template: `<app-comment-list [focus]="panel.props().focus" />`,
})
export class CommentsPanel {
  protected readonly panel = inject(EpdfShell).surface('comments'); // props(): { focus: … }
}
