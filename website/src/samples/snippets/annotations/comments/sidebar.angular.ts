import { Component, inject } from '@angular/core';
import { EpdfComments, annotationKey } from '@embedpdf/angular/annotation';

@Component({
  selector: 'app-comments',
  template: `
    @for (thread of comments.threads(); track key(thread.root.ref)) {
      <article>
        <p>{{ thread.root.author }}, page {{ thread.pageLabel }}: {{ thread.root.contents }}</p>
        @for (reply of thread.replies; track key(reply.ref)) {
          <p>{{ reply.author }}: {{ reply.contents }}</p>
        }
      </article>
    }
  `,
})
export class Comments {
  protected readonly comments = inject(EpdfComments);
  protected readonly key = annotationKey;
}
