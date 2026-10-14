import { Component } from '@angular/core';
import {
  EpdfToolbarCustomTemplate,
  EpdfToolbar,
  EpdfToolbarCommandTemplate,
  custom,
  group,
} from '@embedpdf/angular/toolbar';
import { ToolbarButton } from './toolbar-button';
import { PageNumberInput } from './page-number-input';

@Component({
  selector: 'app-page-toolbar',
  imports: [EpdfToolbar, EpdfToolbarCommandTemplate, EpdfToolbarCustomTemplate, ToolbarButton, PageNumberInput],
  template: `
    <epdf-toolbar [bar]="bar">
      <ng-template epdfToolbarCommand let-command let-variant="variant" let-run="run">
        <app-toolbar-button [command]="command" [variant]="variant" (click)="run()" />
      </ng-template>
      <ng-template epdfToolbarCustom="page-number" let-variant>
        <app-page-number-input [compact]="variant === 'compact'" />
      </ng-template>
    </epdf-toolbar>
  `,
})
export class PageToolbar {
  protected readonly bar = {
    id: 'main',
    sections: {
      center: [group('page', [custom('page-number', 'page:go-to', { variants: ['full', 'compact'] })])],
    },
  };
}
