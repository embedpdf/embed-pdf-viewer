import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, StageToken, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import {
  EpdfCommand,
  EpdfCommands,
  standardCommands,
  withCommands,
} from '@embedpdf/angular/commands';
import type { CommandDef } from '@embedpdf/angular/commands';
import { localEngine } from '@embedpdf/engine';

// A command of your own: pressed while the pages show two at a time.
const twoPages: CommandDef = {
  id: 'layout:two-pages',
  label: 'Two pages',
  categories: ['layout'],
  active: ({ get }) => get(StageToken).getSettings().spread === 'odd',
  run: ({ get }) => {
    const stage = get(StageToken);
    stage.updateSettings({ spread: stage.getSettings().spread === 'odd' ? 'none' : 'odd' });
  },
};

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Turning a category off hides its commands wherever they appear.
@Component({
  selector: 'label[demoCategorySwitch]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'switch' },
  template: `
    <input #box type="checkbox" [checked]="!off()" (change)="toggle(box.checked)" />
    <ng-content />
  `,
})
export class CategorySwitch {
  readonly category = input.required<string>({ alias: 'demoCategorySwitch' });

  private readonly commands = inject(EpdfCommands);
  protected readonly off = computed(() =>
    this.commands.settings().disabledCategories.includes(this.category()),
  );

  protected toggle(on: boolean) {
    if (on) this.commands.enableCategory(this.category());
    else this.commands.disableCategory(this.category());
  }
}

@Component({
  selector: 'div[demoToolbar]',
  imports: [EpdfCommand, CategorySwitch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'toolbar' },
  template: `
    <div class="buttons">
      @for (id of buttons; track id) {
        <button type="button" class="button" [epdfCommand]="id" #command="epdfCommand">
          {{ command.label() }}
        </button>
      }
    </div>
    <div class="switches">
      <label demoCategorySwitch="zoom">Zoom</label>
      <label demoCategorySwitch="layout">Layout</label>
    </div>
  `,
})
export class Toolbar {
  protected readonly buttons = ['zoom:out', 'zoom:in', 'zoom:fit-page', 'layout:two-pages'];

  constructor() {
    // Run from code: the document opens with its whole first page in view.
    void inject(EpdfCommands).execute('zoom:fit-page');
  }
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, Toolbar],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withCommands({ commands: [...standardCommands, twoPages] }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './custom.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div demoToolbar></div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
