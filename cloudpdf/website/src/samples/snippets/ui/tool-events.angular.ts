import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfInteraction } from '@embedpdf/angular/interaction';
import { analytics } from './analytics';

@Component({
  selector: 'app-viewer-layout',
  template: `<!-- your toolbar and pages -->`,
})
export class ViewerLayout {
  private readonly interaction = inject(EpdfInteraction);

  constructor() {
    this.interaction.toolChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(({ toolId }) => analytics.track('tool', { toolId }));
  }
}
