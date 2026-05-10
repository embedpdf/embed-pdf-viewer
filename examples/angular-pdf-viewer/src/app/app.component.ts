import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  type CommandButtonItem,
  type CommandsCapability,
  type EmbedPdfContainer,
  type GroupItem,
  type ThemeConfig,
  PDFViewer,
  type PDFViewerConfig,
  type PluginRegistry,
  type UICapability,
} from '@embedpdf/angular-pdf-viewer';

import { ANGULAR_THEME } from './viewer-config';

const VIEW_OPTIONS = [
  {
    category: 'panel-sidebar',
    label: 'Sidebar',
    description: 'Show the sidebar launcher',
    testId: 'sidebar',
  },
  {
    category: 'panel-search',
    label: 'Search',
    description: 'Show the toolbar search action',
    testId: 'search',
  },
  {
    category: 'zoom',
    label: 'Zoom controls',
    description: 'Show the zoom cluster',
    testId: 'zoom',
  },
  {
    category: 'annotation',
    label: 'Annotations',
    description: 'Show annotate tabs and tools',
    testId: 'annotations',
  },
] as const;

type ViewOptionCategory = (typeof VIEW_OPTIONS)[number]['category'];
@Component({
  selector: 'app-root',
  imports: [PDFViewer],
  template: `
    <main class="page" data-testid="angular-demo-shell">
      <header class="header">
        <div class="title-group">
          <h1>EmbedPDF Angular Viewer Demo</h1>
          <p class="details">
            Light theme, Angular red accent, annotation tools disabled, custom config panel added at
            runtime
          </p>
        </div>
        <div class="header-actions">
          <button
            type="button"
            class="panel-button panel-button-ghost"
            data-testid="header-config-toggle"
            (click)="toggleConfigPanel()"
          >
            {{ showConfigPanel() ? 'Collapse config' : 'Show config' }}
          </button>
          <p class="status" data-testid="viewer-status">
            {{ ready() ? 'ready' : 'loading' }}
          </p>
        </div>
      </header>

      <section class="workspace" [class.has-config]="showConfigPanel()">
        <embedpdf-viewer
          class="viewer"
          [config]="viewerConfig"
          (init)="onInit($event)"
          (ready)="onReady($event)"
        />

        @if (showConfigPanel()) {
          <section
            class="config-panel-shell"
            data-testid="angular-config-panel-shell"
            (keydown.escape)="closeConfigPanel()"
          >
            <div class="config-panel" data-testid="angular-config-panel">
              <div class="config-copy">
                <div class="config-copy-header">
                  <h2>Angular config panel</h2>
                </div>
                <p>
                  This example combines Angular-owned defaults via <code>[config]</code> with
                  runtime customization through <code>(ready)</code>,
                  <code>commands.registerCommand()</code>, and <code>ui.mergeSchema()</code>.
                </p>
              </div>

              <dl class="config-stats">
                <div>
                  <dt>Theme</dt>
                  <dd data-testid="theme-mode">{{ themePreference() }}</dd>
                </div>
                <div>
                  <dt>Disabled categories</dt>
                  <dd data-testid="disabled-categories">{{ disabledCategoriesLabel() }}</dd>
                </div>
                <div>
                  <dt>Toolbar customization</dt>
                  <dd>Config button injected into the viewer at runtime</dd>
                </div>
              </dl>

              <div class="config-options-group">
                <p class="config-section-title">View options</p>
                <div class="config-options-grid">
                  @for (option of viewOptions; track option.category) {
                    <label class="config-option-card">
                      <input
                        #optionToggle
                        type="checkbox"
                        class="config-checkbox"
                        [checked]="isCategoryEnabled(option.category)"
                        [attr.data-testid]="'view-option-' + option.testId"
                        (change)="setCategoryEnabled(option.category, optionToggle.checked)"
                      />
                      <span class="config-option-copy">
                        <span class="config-option-label">{{ option.label }}</span>
                        <span class="config-option-description">{{ option.description }}</span>
                      </span>
                    </label>
                  }
                </div>
              </div>

              <div class="config-actions">
                <button
                  type="button"
                  class="panel-button panel-button-ghost"
                  data-testid="collapse-config"
                  (click)="closeConfigPanel()"
                >
                  Collapse config
                </button>
                <button
                  type="button"
                  class="panel-button panel-button-primary"
                  data-testid="toggle-theme"
                  (click)="toggleTheme()"
                >
                  Switch to {{ nextThemeLabel() }} mode
                </button>
                <button
                  type="button"
                  class="panel-button"
                  data-testid="reset-demo"
                  (click)="resetDemo()"
                >
                  Reset demo
                </button>
              </div>
            </div>
          </section>
        }
      </section>
    </main>
  `,
  styles: `
    .page {
      box-sizing: border-box;
      height: 100dvh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      background: #0f172a;
      color: #e2e8f0;
      font-family:
        Inter,
        ui-sans-serif,
        system-ui,
        -apple-system,
        Segoe UI,
        Roboto,
        Helvetica,
        Arial,
        sans-serif;
      overflow: hidden;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .workspace {
      flex: 1 1 0;
      min-block-size: 0;
      display: flex;
      align-items: stretch;
      position: relative;
      overflow: hidden;
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

    .config-panel-shell {
      position: absolute;
      inset: 0 auto 0 0;
      z-index: 3;
      display: flex;
      inline-size: min(clamp(280px, 32vw, 420px), calc(100% - 20rem));
      block-size: 100%;
      max-block-size: 100%;
      overflow: hidden;
    }

    .config-panel {
      flex: 1 1 auto;
      min-block-size: 0;
      display: grid;
      gap: 16px;
      block-size: auto;
      max-block-size: 100%;
      overflow: auto;
      padding: 16px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 14px;
      background: linear-gradient(180deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.98));
      box-shadow: 0 12px 24px rgba(15, 23, 42, 0.24);
      opacity: 1;
      transform: translateY(0);
    }

    .config-copy h2 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }

    .config-copy-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-block-end: 6px;
    }

    .config-copy p {
      margin: 0;
      color: #cbd5e1;
      line-height: 1.5;
    }

    code {
      font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, monospace;
      font-size: 0.92em;
      color: #fecdd3;
    }

    .config-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin: 0;
    }

    .config-stats div {
      padding: 12px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(148, 163, 184, 0.14);
    }

    .config-stats dt {
      margin: 0 0 6px;
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #94a3b8;
    }

    .config-stats dd {
      margin: 0;
      color: #f8fafc;
      font-weight: 600;
    }

    .config-options-group {
      display: grid;
      gap: 10px;
    }

    .config-section-title {
      margin: 0;
      font-size: 0.82rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #94a3b8;
    }

    .config-options-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 10px;
    }

    .config-option-card {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      min-block-size: 74px;
      padding: 11px 12px;
      border-radius: 12px;
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(148, 163, 184, 0.14);
      cursor: pointer;
      transition:
        border-color 140ms ease,
        background-color 140ms ease,
        transform 140ms ease;
    }

    .config-option-card:hover {
      border-color: rgba(248, 250, 252, 0.18);
      background: rgba(30, 41, 59, 0.72);
      transform: translateY(-1px);
    }

    .config-checkbox {
      inline-size: 16px;
      block-size: 16px;
      margin: 2px 0 0;
      accent-color: #dd0031;
    }

    .config-option-copy {
      display: grid;
      gap: 4px;
    }

    .config-option-label {
      font-weight: 600;
      color: #f8fafc;
    }

    .config-option-description {
      color: #cbd5e1;
      font-size: 0.84rem;
      line-height: 1.4;
    }

    .config-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .panel-button {
      appearance: none;
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 999px;
      background: rgba(30, 41, 59, 0.95);
      color: #e2e8f0;
      font: inherit;
      font-weight: 600;
      padding: 10px 14px;
      cursor: pointer;
      transition:
        transform 120ms ease,
        background-color 120ms ease,
        border-color 120ms ease;
    }

    .panel-button:hover {
      transform: translateY(-1px);
      background: rgba(51, 65, 85, 0.98);
      border-color: rgba(226, 232, 240, 0.3);
    }

    .panel-button-primary {
      background: #dd0031;
      border-color: #dd0031;
      color: #fff;
    }

    .panel-button-primary:hover {
      background: #c3002f;
      border-color: #c3002f;
    }

    .panel-button-ghost {
      background: transparent;
      border-color: rgba(148, 163, 184, 0.2);
    }

    .panel-button-ghost:hover {
      background: rgba(51, 65, 85, 0.58);
      border-color: rgba(226, 232, 240, 0.3);
    }

    .viewer {
      flex: 1 1 auto;
      position: relative;
      z-index: 1;
      display: block;
      block-size: 100%;
      min-inline-size: 0;
      min-height: 0;
      min-block-size: 20rem;
      border-radius: 10px;
      overflow: hidden;
      background: #0b1220;
      border: 1px solid rgba(148, 163, 184, 0.25);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  readonly viewOptions = VIEW_OPTIONS;
  readonly ready = signal(false);
  readonly showConfigPanel = signal(false);
  readonly themePreference = signal<NonNullable<ThemeConfig['preference']>>('light');
  readonly disabledCategories = signal<string[]>(['annotation']);
  readonly nextThemeLabel = computed(() => (this.themePreference() === 'light' ? 'dark' : 'light'));
  readonly disabledCategoriesLabel = computed(() => {
    const labels = this.disabledCategories().map((category) => this.getCategoryLabel(category));
    return labels.length > 0 ? labels.join(', ') : 'none';
  });

  private toolbarCustomized = false;
  private container: EmbedPdfContainer | null = null;
  private commands: CommandsCapability | null = null;
  private ui: UICapability | null = null;

  readonly viewerConfig = {
    src: '/ebook.pdf',
    disabledCategories: ['annotation'],
    theme: {
      preference: 'light',
      ...ANGULAR_THEME,
    },
  } satisfies PDFViewerConfig;

  onInit(container: EmbedPdfContainer) {
    this.container = container;
  }
  onReady(registry: PluginRegistry) {
    this.ready.set(true);

    if (this.toolbarCustomized) return;

    const commandsPlugin = registry.getPlugin('commands');
    const uiPlugin = registry.getPlugin('ui');

    if (!commandsPlugin?.provides || !uiPlugin?.provides) return;

    const commands = commandsPlugin.provides() as CommandsCapability | undefined;
    const ui = uiPlugin.provides() as UICapability | undefined;

    if (!commands || !ui) return;

    this.commands = commands;
    this.ui = ui;

    commands.registerCommand({
      id: 'custom.angular-config',
      label: 'Config',
      action: () => this.toggleConfigPanel(),
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
      id: 'angular-config-button',
      commandId: 'custom.angular-config',
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

  toggleTheme() {
    const nextPreference = this.themePreference() === 'light' ? 'dark' : 'light';
    this.themePreference.set(nextPreference);
    this.applyThemePreference(nextPreference);
  }

  toggleConfigPanel() {
    this.showConfigPanel.update((visible) => !visible);
  }

  closeConfigPanel() {
    this.showConfigPanel.set(false);
  }

  resetDemo() {
    this.themePreference.set('light');
    this.applyDisabledCategories(['annotation']);
    this.showConfigPanel.set(true);
    this.applyThemePreference('light');
  }

  isCategoryEnabled(category: ViewOptionCategory) {
    return !this.disabledCategories().includes(category);
  }

  setCategoryEnabled(category: ViewOptionCategory, enabled: boolean) {
    const current = new Set(this.disabledCategories());

    if (enabled) {
      current.delete(category);
    } else {
      current.add(category);
    }

    this.applyDisabledCategories(Array.from(current));
  }

  private applyDisabledCategories(categories: string[]) {
    this.disabledCategories.set(categories);
    this.commands?.setDisabledCategories(categories);
    this.ui?.setDisabledCategories(categories);
  }

  private applyThemePreference(preference: NonNullable<ThemeConfig['preference']>) {
    this.container?.setTheme({
      preference,
      ...ANGULAR_THEME,
    });
  }

  private getCategoryLabel(category: string) {
    return this.viewOptions.find((option) => option.category === category)?.label ?? category;
  }
}
