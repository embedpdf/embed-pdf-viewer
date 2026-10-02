import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import {
  EpdfCommand,
  EpdfCommands,
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

@Component({
  selector: 'div[demoCommandPalette]',
  imports: [EpdfCommand],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'palette' },
  template: `
    <input
      #field
      class="field"
      type="search"
      aria-label="Search commands"
      placeholder="Type a command…"
      [value]="query()"
      (input)="query.set(field.value)"
      (keydown.enter)="runFirst()"
    />
    <ul class="results">
      <!-- A result follows its command, so it greys out the moment the command can't run. -->
      @for (result of results(); track result.id) {
        <li>
          <button type="button" class="result" [epdfCommand]="result.id" #command="epdfCommand">
            <span>{{ command.label() }}</span>
            @if (command.shortcut(); as shortcut) {
              <kbd class="shortcut">{{ shortcut }}</kbd>
            }
          </button>
        </li>
      } @empty {
        <li class="empty">No command matches</li>
      }
    </ul>
  `,
})
export class CommandPalette {
  private readonly commands = inject(EpdfCommands);
  protected readonly query = signal('page');
  protected readonly results = computed(() => this.commands.searchCommands(this.query()));

  // Enter runs the first result that can run now.
  protected runFirst() {
    const first = this.results().find((command) => this.commands.canExecute(command.id));
    if (first) void this.commands.execute(first.id);
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, CommandPalette],
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
  styleUrl: './palette.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div *epdfDocumentGate="let document; fallback: loading" class="layout">
      <div demoCommandPalette></div>
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
