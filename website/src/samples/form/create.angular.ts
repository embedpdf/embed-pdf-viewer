import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfForm, EpdfFormLayer, withForm } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** A dropdown, the next row down the page. */
function addDropdown(form: EpdfForm, page: PageRef, row: number) {
  return form.create({
    family: 'combobox',
    name: `country_${row + 1}`,
    options: [
      { label: 'Netherlands', value: 'NL' },
      { label: 'Belgium', value: 'BE' },
    ],
    widgets: [{ page, rect: { x: 72, y: 520 + row * 36, width: 160, height: 24 }, ...look }],
  });
}

/** A radio group: one field with a widget per button, each with the value it stands for. */
function addRadioGroup(form: EpdfForm, page: PageRef, row: number) {
  const y = 524 + row * 36;
  return form.create({
    family: 'radio',
    name: `plan_${row + 1}`,
    widgets: [
      { page, rect: { x: 72, y, width: 16, height: 16 }, exportValue: 'monthly', ...look },
      { page, rect: { x: 112, y, width: 16, height: 16 }, exportValue: 'yearly', ...look },
    ],
  });
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withForm(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './create.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button
          type="button"
          class="button"
          [disabled]="!page() || full()"
          (click)="add(addDropdown)"
        >
          Add a dropdown
        </button>
        <button
          type="button"
          class="button"
          [disabled]="!page() || full()"
          (click)="add(addRadioGroup)"
        >
          Add a radio group
        </button>
        <button type="button" class="button" [disabled]="!last()" (click)="removeLast()">
          Remove the last
        </button>
        <output class="readout">{{ names() || 'No fields' }}</output>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-form-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly form = inject(EpdfForm);
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private added = false;

  protected readonly addDropdown = addDropdown;
  protected readonly addRadioGroup = addRadioGroup;
  /** The last page, which has room for a form. */
  protected readonly page = computed(() => this.document.pages().at(-1)?.ref);
  protected readonly last = computed(() => this.form.fields().at(-1));
  protected readonly full = computed(() => this.form.fields().length >= 5);
  protected readonly names = computed(() =>
    this.form
      .fields()
      .map((field) => field.name)
      .join(', '),
  );

  constructor() {
    // The ebook has no form: start with a dropdown on its last page.
    effect(() => {
      const page = this.page();
      if (this.form.status() !== 'ready' || !page || !this.stage() || this.added) return;
      this.added = true;
      untracked(() => this.add(addDropdown));
    });
  }

  /** Each new field goes a row further down the page: bring it into view. */
  protected add(addField: typeof addDropdown) {
    const page = this.page();
    if (!page) return;
    void addField(this.form, page, this.form.fields().length).then(({ field }) =>
      this.stage()?.reveal(page, { rect: field.widgets[0].rect }),
    );
  }

  protected removeLast() {
    const last = this.last();
    if (last) void this.form.delete(last.ref);
  }
}
