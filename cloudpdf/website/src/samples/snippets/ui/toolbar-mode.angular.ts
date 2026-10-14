import { Component, computed, inject } from '@angular/core';
import { EpdfInteraction } from '@embedpdf/angular/interaction';
import { EpdfToolbar, EpdfToolbarCommandTemplate } from '@embedpdf/angular/toolbar';
import { formBar, mainBar } from './bars';
import { ToolbarButton } from './toolbar-button';

@Component({
  selector: 'app-mode-toolbar',
  imports: [EpdfToolbar, EpdfToolbarCommandTemplate, ToolbarButton],
  template: `
    <epdf-toolbar [bar]="bar()">
      <ng-template epdfToolbarCommand let-command let-variant="variant" let-run="run">
        <app-toolbar-button [command]="command" [variant]="variant" (click)="run()" />
      </ng-template>
    </epdf-toolbar>
  `,
})
export class ModeToolbar {
  private readonly interaction = inject(EpdfInteraction);

  protected readonly bar = computed(() =>
    this.interaction.activeToolId() === 'form-edit' ? formBar : mainBar,
  );
}
