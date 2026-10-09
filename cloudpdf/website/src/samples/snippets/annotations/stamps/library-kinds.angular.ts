import { Component, computed, inject } from '@angular/core';
import { EpdfStamp } from '@embedpdf/angular/stamp';

const KINDS = ['stamps', 'legal-seals'];

@Component({
  selector: 'app-library-list',
  template: `
    <ul>
      @for (library of libraries(); track library.id) {
        <li>{{ library.name }}</li>
      }
    </ul>
  `,
})
export class LibraryList {
  private readonly stamp = inject(EpdfStamp);

  protected readonly libraries = computed(() =>
    this.stamp.libraries().filter((library) => KINDS.includes(library.kind)),
  );
}
