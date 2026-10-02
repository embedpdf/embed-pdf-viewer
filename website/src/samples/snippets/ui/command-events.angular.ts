import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfCommands } from '@embedpdf/angular/commands';
import { analytics } from './analytics';

@Component({
  selector: 'app-viewer-layout',
  template: `<!-- your toolbar and pages -->`,
})
export class ViewerLayout {
  private readonly commands = inject(EpdfCommands);

  constructor() {
    this.commands.executed$
      .pipe(takeUntilDestroyed())
      .subscribe(({ commandId }) => analytics.track('command', { commandId }));
  }
}
