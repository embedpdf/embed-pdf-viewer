import { Component, input } from '@angular/core';
import { EpdfCommand } from '@embedpdf/angular/commands';
import { Icon } from './icon';

@Component({
  selector: 'app-command-button',
  imports: [EpdfCommand, Icon],
  template: `
    <button [epdfCommand]="id()" #command="epdfCommand">
      <app-icon [name]="command.icon()" />
      {{ command.label() }}
      @if (command.shortcut()) {
        <kbd>{{ command.shortcut() }}</kbd>
      }
    </button>
  `,
})
export class CommandButton {
  readonly id = input.required<string>();
}
