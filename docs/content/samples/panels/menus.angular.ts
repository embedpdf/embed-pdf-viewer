import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { EpdfShell, withShell } from '@embedpdf/angular/shell';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const TOOLS = [
  { id: 'pointer', label: 'Select text' },
  { id: 'pan', label: 'Scroll with the hand' },
];

// A menu with a submenu: opening the submenu leaves its menu open.
@Component({
  selector: 'div[demoViewMenu]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'toolbar' },
  template: `
    <div class="menubar" #bar>
      <button
        type="button"
        class="button"
        aria-haspopup="menu"
        [attr.aria-expanded]="isOpen('view')"
        (click)="shell.toggleMenu('view')"
      >
        View ▾
      </button>
      @if (isOpen('view')) {
        <div class="menu" role="menu">
          <button
            type="button"
            role="menuitem"
            class="menu-item"
            aria-haspopup="menu"
            [attr.aria-expanded]="isOpen('view-tool')"
            (click)="shell.toggleMenu('view-tool')"
          >
            Tool <span aria-hidden="true">▸</span>
          </button>
          <button type="button" role="menuitem" class="menu-item" (click)="shell.closeAllMenus()">
            Close menus
          </button>
          @if (isOpen('view-tool')) {
            <div class="menu submenu" role="menu">
              @for (tool of tools; track tool.id) {
                <button
                  type="button"
                  role="menuitemradio"
                  [attr.aria-checked]="tool.id === interaction.activeToolId()"
                  class="menu-item"
                  (click)="choose(tool.id)"
                >
                  {{ tool.label }}
                </button>
              }
            </div>
          }
        </div>
      }
    </div>
    <output class="readout">Open menus: {{ anyOpen() ? shell.openMenus().join(' › ') : 'none' }}</output>
  `,
})
export class ViewMenu {
  protected readonly shell = inject(EpdfShell);
  protected readonly interaction = inject(EpdfInteraction);
  protected readonly tools = TOOLS;
  protected readonly anyOpen = computed(() => this.shell.openMenus().length > 0);
  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');

  constructor() {
    const document = inject(DOCUMENT);
    // A press outside the menus, or Escape, closes all of them.
    effect((onCleanup) => {
      if (!this.anyOpen()) return;
      const outside = (event: PointerEvent) => {
        if (!this.bar().nativeElement.contains(event.target as Node)) this.shell.closeAllMenus();
      };
      const escape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.shell.closeAllMenus();
      };
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', escape);
      onCleanup(() => {
        document.removeEventListener('pointerdown', outside, true);
        document.removeEventListener('keydown', escape);
      });
    });
  }

  protected isOpen(id: string) {
    return this.shell.openMenus().includes(id);
  }

  protected choose(toolId: string) {
    this.interaction.activateTool(toolId);
    this.shell.closeAllMenus();
  }
}

@Component({
  selector: 'demo-workspace',
  imports: [EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSelectionLayer, ViewMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div demoViewMenu></div>
    <epdf-stage class="stage">
      <ng-template epdfPage>
        <epdf-render-layer />
        <epdf-selection-layer />
      </ng-template>
    </epdf-stage>
  `,
})
export class Workspace {
  constructor() {
    // The menu and its submenu are open when the document is.
    const shell = inject(EpdfShell);
    shell.openMenu('view');
    shell.openMenu('view-tool');
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, Workspace],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
      withShell(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './menus.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <demo-workspace *epdfDocumentGate="let document; fallback: loading" />

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
