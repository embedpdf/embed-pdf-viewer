import { Component } from '@angular/core';
import { EpdfToolbar, EpdfToolbarCommandTemplate, group } from '@embedpdf/angular/toolbar';
import { Icon } from './icon';

@Component({
  selector: 'app-tool-rail',
  imports: [EpdfToolbar, EpdfToolbarCommandTemplate, Icon],
  template: `
    <epdf-toolbar [bar]="rail" orientation="vertical" aria-label="Tools" style="height: 100%">
      <ng-template epdfToolbarCommand let-command let-run="run">
        <button
          (click)="run()"
          [disabled]="!command.enabled"
          [attr.aria-pressed]="command.active"
          [title]="command.label"
        >
          <app-icon [name]="command.icon" />
        </button>
      </ng-template>
    </epdf-toolbar>
  `,
})
export class ToolRail {
  protected readonly rail = {
    id: 'rail',
    sections: {
      start: [group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight'])],
      end: [group('zoom', ['zoom:in', 'zoom:out'])],
    },
  };
}
