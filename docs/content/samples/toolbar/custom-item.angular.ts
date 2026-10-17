import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfCommands, standardCommands, withCommands } from '@embedpdf/angular/commands';
import {
  EpdfToolbar,
  EpdfToolbarCommandTemplate,
  EpdfToolbarCustomTemplate,
  custom,
  group,
  item,
} from '@embedpdf/angular/toolbar';
import type { BarSchema } from '@embedpdf/angular/toolbar';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// The page number is an item of your own: it gets smaller first, and in the "More" menu it's the
// 'page:go-to' command.
const bar: BarSchema = {
  id: 'main',
  sections: {
    start: [group('zoom', ['zoom:out', 'zoom:in', item('zoom:fit-width', { importance: 2 })])],
    center: [
      group('pages', [
        'page:previous',
        custom('page-number', 'page:go-to', { variants: ['full', 'compact'] }),
        'page:next',
      ]),
    ],
    end: [group('document', [item('document:download', { variants: ['icon+label', 'icon'] })])],
  },
};

const ICONS: Record<string, string> = {
  'previous-page': '‹',
  'next-page': '›',
  'zoom-out': '−',
  'zoom-in': '+',
  'fit-width': '↔',
  download: '↓',
};

// The item itself: "Page 3 of 120", or "3 / 120" when there's less room.
@Component({
  selector: 'label[demoPageNumber]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'page-number' },
  template: `
    @if (!compact()) {
      Page
    }
    <input
      #field
      class="page-input"
      inputmode="numeric"
      aria-label="Page number"
      [value]="shown()"
      (focus)="field.select()"
      (input)="typed.set(field.value)"
      (blur)="typed.set(null)"
      (keydown.enter)="go()"
    />
    {{ compact() ? '/ ' + stage().pageCount() : 'of ' + stage().pageCount() }}
  `,
})
export class PageNumber {
  readonly stage = input.required<EpdfStage>();
  readonly compact = input(false);
  protected readonly typed = signal<string | null>(null);
  protected readonly shown = computed(
    () => this.typed() ?? String(this.stage().currentPageIndex() + 1),
  );

  protected go() {
    const number = Number(this.typed());
    if (Number.isInteger(number) && number >= 1) this.stage().goToPage(number - 1);
    this.typed.set(null);
  }
}

// 'page:go-to', a command of your own: it opens a small "Go to page" form.
@Component({
  selector: 'demo-go-to-page',
  imports: [PageNumber],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="go-to" role="dialog" aria-label="Go to page">
        <label demoPageNumber [stage]="stage()"></label>
        <button type="button" class="button" (click)="open.set(false)">Done</button>
      </div>
    }
  `,
})
export class GoToPage {
  readonly stage = input.required<EpdfStage>();
  protected readonly open = signal(false);

  constructor() {
    const remove = inject(EpdfCommands).registerCommand({
      id: 'page:go-to',
      label: 'Go to page…',
      run: () => this.open.set(true),
    });
    inject(DestroyRef).onDestroy(remove);
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfToolbar,
    EpdfToolbarCommandTemplate,
    EpdfToolbarCustomTemplate,
    PageNumber,
    GoToPage,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withCommands({ commands: standardCommands }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './custom-item.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <label class="width">
        Toolbar width
        <input
          #range
          type="range"
          min="30"
          max="100"
          [value]="width()"
          (input)="width.set(+range.value)"
        />
        <output>{{ width() }}%</output>
      </label>
      <div class="frame" [style.width.%]="width()">
        <epdf-toolbar [bar]="bar">
          <ng-template epdfToolbarCommand let-command let-variant="variant" let-run="run">
            <button
              type="button"
              class="button"
              [title]="command.label"
              [attr.aria-label]="command.label"
              [disabled]="!command.enabled"
              (click)="run()"
            >
              <span aria-hidden="true">{{ icons[command.icon ?? ''] ?? '…' }}</span>
              @if (variant === 'icon+label') {
                <span>{{ command.label }}</span>
              }
            </button>
          </ng-template>
          <ng-template epdfToolbarCustom="page-number" let-variant>
            <label demoPageNumber [stage]="stage" [compact]="variant === 'compact'"></label>
          </ng-template>
        </epdf-toolbar>
      </div>
      <demo-go-to-page [stage]="stage" />
      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly bar = bar;
  protected readonly icons = ICONS;
  protected readonly width = signal(100);
}
