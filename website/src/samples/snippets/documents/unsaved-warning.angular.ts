import { Component, effect, inject } from '@angular/core';
import { EpdfDocument } from '@embedpdf/angular/runtime';

@Component({
  selector: 'app-unsaved-warning',
  template: `
    @if (document.hasUnsavedChanges()) {
      <span>Unsaved changes</span>
    }
  `,
})
export class UnsavedWarning {
  protected readonly document = inject(EpdfDocument);

  constructor() {
    effect((onCleanup) => {
      if (!this.document.hasUnsavedChanges()) return;
      const warn = (event: BeforeUnloadEvent) => event.preventDefault();
      window.addEventListener('beforeunload', warn);
      onCleanup(() => window.removeEventListener('beforeunload', warn));
    });
  }
}
