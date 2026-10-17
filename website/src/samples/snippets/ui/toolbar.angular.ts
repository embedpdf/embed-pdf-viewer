import { Component } from '@angular/core';
import { EpdfToolbar, EpdfToolbarCommandTemplate, group, item } from '@embedpdf/angular/toolbar';
import { Icon } from './icon';

@Component({
  selector: 'app-main-toolbar',
  imports: [EpdfToolbar, EpdfToolbarCommandTemplate, Icon],
  template: `
    <epdf-toolbar [bar]="bar">
      <ng-template epdfToolbarCommand let-command let-variant="variant" let-run="run">
        <button
          (click)="run()"
          [disabled]="!command.enabled"
          [attr.aria-pressed]="command.active"
          [title]="command.label"
        >
          <app-icon [name]="command.icon" />
          @if (variant === 'icon+label') {
            {{ command.label }}
          }
        </button>
      </ng-template>
    </epdf-toolbar>
  `,
})
export class MainToolbar {
  protected readonly bar = {
    id: 'main',
    sections: {
      start: [group('navigation', ['page:previous', 'page:next'])],
      center: [group('zoom', ['zoom:out', item('zoom:in', { variants: ['icon+label', 'icon'] })])],
      end: [group('tools', ['tool:pointer', 'tool:pan', 'tool:highlight'], { collapse: 'menu' })],
    },
  };
}
