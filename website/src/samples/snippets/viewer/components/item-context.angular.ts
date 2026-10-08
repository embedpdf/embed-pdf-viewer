import { Component, inject, input } from '@angular/core';
import { EpdfToolbarItemContext } from '@embedpdf/viewer-angular';

@Component({
  selector: 'app-reviewers',
  template: `
    <div class="reviewers" [class.vertical]="item.orientation() === 'vertical'">
      @for (person of people(); track person.id) {
        <img [src]="person.avatar" [alt]="person.name" [title]="person.name" />
      }
    </div>
  `,
})
export class Reviewers {
  readonly people = input.required<{ id: string; name: string; avatar: string }[]>();
  protected readonly item = inject(EpdfToolbarItemContext);
}
