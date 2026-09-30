import { Component, inject, input } from '@angular/core';
import { EpdfComments, type CommentThread } from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-thread-actions',
  template: `
    <button [disabled]="!comments.canReply(thread().root.ref)">Reply</button>
    <button [disabled]="!comments.canDeleteThread(thread().root.ref)">Delete thread</button>
  `,
})
export class ThreadActions {
  readonly thread = input.required<CommentThread>();
  protected readonly comments = inject(EpdfComments);
}
