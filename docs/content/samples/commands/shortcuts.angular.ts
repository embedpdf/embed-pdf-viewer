import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfCommands,
  EpdfCommandShortcuts,
  formatShortcut,
  standardCommands,
  withCommands,
} from '@embedpdf/angular/commands';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// One row of the sheet: the key, and what it does. A command that can't run now is greyed out.
@Component({
  selector: 'li[demoShortcutRow]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'row',
    '[attr.data-disabled]': "command()?.enabled ? null : ''",
    '[style.display]': "command()?.visible ? null : 'none'",
  },
  template: `<kbd class="key">{{ key() }}</kbd><span>{{ command()?.label }}</span>`,
})
export class ShortcutRow {
  readonly commandId = input.required<string>();
  readonly shortcut = input.required<string>();

  protected readonly command = inject(EpdfCommands).commandOf(() => this.commandId());
  protected readonly key = computed(() => formatShortcut(this.shortcut()));
}

// The sheet lists every shortcut, and shows the last command a key ran.
@Component({
  selector: 'aside[demoKeyboardHelp]',
  imports: [ShortcutRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sheet' },
  template: `
    <p class="status">
      {{ last() ? 'Ran: ' + last() : 'Click the viewer, then press a key, such as → for the next page' }}
    </p>
    <ul class="rows">
      @for (row of shortcuts; track row.commandId + ' ' + row.shortcut) {
        <li demoShortcutRow [commandId]="row.commandId" [shortcut]="row.shortcut"></li>
      }
    </ul>
  `,
})
export class KeyboardHelp {
  private readonly commands = inject(EpdfCommands);
  protected readonly shortcuts = this.commands.listShortcuts();
  protected readonly last = signal<string | null>(null);

  constructor() {
    this.commands.executed$
      .pipe(takeUntilDestroyed())
      .subscribe(({ commandId }) =>
        this.last.set(this.commands.resolveCommand(commandId)?.label ?? commandId),
      );
  }
}

// The keys work while focus is inside this viewer, so they leave the rest of the page alone. A
// click anywhere in it gives it focus: `tabindex="-1"` makes it a place for keys, not a stop in the
// Tab order.
@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfCommandShortcuts,
    KeyboardHelp,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withCommands({ commands: standardCommands }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './shortcuts.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div
      *epdfDocumentGate="let document; fallback: loading"
      class="layout"
      tabindex="-1"
      epdfCommandShortcuts
    >
      <aside demoKeyboardHelp></aside>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </div>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
