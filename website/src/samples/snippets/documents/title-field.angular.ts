import { Component, computed, inject } from '@angular/core';
import { EpdfMetadata } from '@embedpdf/angular/metadata';

@Component({
  selector: 'app-title-field',
  template: `
    <label>
      Title
      <input
        #input
        [value]="title()"
        [disabled]="!metadata.canUpdate()"
        (blur)="metadata.update({ title: input.value })"
      />
    </label>
  `,
})
export class TitleField {
  protected readonly metadata = inject(EpdfMetadata);
  protected readonly title = computed(() => this.metadata.metadata()?.title ?? '');
}
