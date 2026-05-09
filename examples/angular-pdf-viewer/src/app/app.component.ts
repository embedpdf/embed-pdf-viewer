import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  type CommandButtonItem,
  type CommandsCapability,
  type GroupItem,
  PDFViewer,
  type PDFViewerConfig,
  type PluginRegistry,
  type UICapability,
} from '@embedpdf/angular-pdf-viewer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PDFViewer],
  template: `
    <main class="page">
      <header class="header">
        <div class="title-group">
          <h1>EmbedPDF Angular Viewer Demo</h1>
          <p class="details">
            Light theme, Angular red accent, annotation tools disabled, custom toolbar
            action added at runtime
          </p>
        </div>
        <div class="status-group">
          <p class="status" data-testid="viewer-status">
            {{ ready() ? 'ready' : 'loading' }}
          </p>
          @if (actionMessage()) {
            <p class="action" data-testid="viewer-action">
              {{ actionMessage() }}
            </p>
          }
        </div>
      </header>

      <embedpdf-pdf-viewer
        class="viewer"
        [config]="viewerConfig"
        (ready)="onReady($event)"
      />
    </main>
  `,
  styles: `
    .page {
      box-sizing: border-box;
      height: 100dvh;
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 12px;
      padding: 12px;
      background: #0f172a;
      color: #e2e8f0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
        Helvetica, Arial, sans-serif;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .title-group {
      display: grid;
      gap: 4px;
    }

    h1 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
    }

    .details {
      margin: 0;
      font-size: 0.9rem;
      color: #94a3b8;
    }

    .status {
      margin: 0;
      font-size: 0.85rem;
      opacity: 0.85;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status-group {
      display: grid;
      gap: 6px;
      justify-items: end;
    }

    .action {
      margin: 0;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(221, 0, 49, 0.14);
      color: #fecdd3;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .viewer {
      min-height: 0;
      border-radius: 10px;
      overflow: hidden;
      background: #0b1220;
      border: 1px solid rgba(148, 163, 184, 0.25);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly ready = signal(false);
  readonly actionMessage = signal('');

  private toolbarCustomized = false;

  readonly viewerConfig = {
    src: 'https://snippet.embedpdf.com/ebook.pdf',
    disabledCategories: ['annotation'],
    theme: {
      preference: 'light',
      light: {
        accent: {
          primary: '#dd0031',
          primaryHover: '#c3002f',
          primaryActive: '#a8002a',
          primaryLight: '#ffe5eb',
          primaryForeground: '#ffffff',
        },
      },
    },
  } satisfies PDFViewerConfig;

  onReady(registry: PluginRegistry) {
    this.ready.set(true);

    if (this.toolbarCustomized) return;

    const commandsPlugin = registry.getPlugin('commands');
    const uiPlugin = registry.getPlugin('ui');

    if (!commandsPlugin?.provides || !uiPlugin?.provides) return;

    const commands = commandsPlugin.provides() as CommandsCapability | undefined;
    const ui = uiPlugin.provides() as UICapability | undefined;

    if (!commands || !ui) return;

    commands.registerCommand({
      id: 'custom.angular-runtime',
      label: 'Angular Tips',
      action: () => {
        this.actionMessage.set('Angular runtime command triggered');
      },
    });

    const schema = ui.getSchema();
    const toolbar = schema.toolbars['main-toolbar'];
    if (!toolbar) return;

    const items = structuredClone(toolbar.items);
    const rightGroup = items.find(
      (item): item is GroupItem => item.type === 'group' && item.id === 'right-group',
    );

    if (!rightGroup) return;

    const angularButton = {
      type: 'command-button',
      id: 'angular-runtime-button',
      commandId: 'custom.angular-runtime',
      variant: 'text',
    } satisfies CommandButtonItem;

    const commentButtonIndex = rightGroup.items.findIndex(
      (item) => item.type === 'command-button' && item.id === 'comment-button',
    );

    if (commentButtonIndex >= 0) {
      rightGroup.items[commentButtonIndex] = angularButton;
    } else {
      rightGroup.items.push(angularButton);
    }

    ui.mergeSchema({
      toolbars: {
        'main-toolbar': {
          ...toolbar,
          items,
        },
      },
    });

    this.toolbarCustomized = true;
  }
}
