import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { EpdfComments } from '@embedpdf/angular/annotation';
import { notifyThreadAuthor } from './notifications'; // your own

@Component({
  selector: 'app-comments-sidebar',
  template: `<aside><!-- … --></aside>`,
})
export class CommentsSidebar {
  constructor() {
    inject(EpdfComments)
      .threadChanged$.pipe(
        filter(({ change }) => change === 'reply'),
        takeUntilDestroyed(),
      )
      .subscribe(({ rootRef }) => notifyThreadAuthor(rootRef));
  }
}
