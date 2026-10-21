import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
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
import type { FormFieldDTO } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#ffffff', strokeWidth: 1, fontSize: 11 };

/** A dropdown, the next row down the page. */
function addDropdown(form: EpdfForm, page: PageRef, row: number) {
  return form.create({
    family: 'combobox',
    name: `country_${row + 1}`,
    options: [
      { label: 'Netherlands', value: 'NL' },
      { label: 'Belgium', value: 'BE' },
    ],
    widgets: [{ page, rect: { x: 96, y: 270 + row * 36, width: 160, height: 24 }, ...look }],
  });
}

/** A radio group: one field with a widget per button, each with the value it stands for. */
function addRadioGroup(form: EpdfForm, page: PageRef, row: number) {
  const y = 274 + row * 36;
  return form.create({
    family: 'radio',
    name: `plan_${row + 1}`,
    widgets: [
      { page, rect: { x: 96, y, width: 16, height: 16 }, exportValue: 'monthly', ...look },
      { page, rect: { x: 136, y, width: 16, height: 16 }, exportValue: 'yearly', ...look },
    ],
  });
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: forms }] },
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
        <output class="readout">{{ names() || 'No fields on this page yet' }}</output>
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
  private started = false;

  protected readonly addDropdown = addDropdown;
  protected readonly addRadioGroup = addRadioGroup;
  /** The form's last page is empty: room for new fields. */
  protected readonly page = computed(() => this.document.pages().at(-1)?.ref);
  private readonly added = signal<FormFieldDTO[]>([]);
  protected readonly last = computed(() => this.added().at(-1));
  protected readonly full = computed(() => this.added().length >= 5);
  protected readonly names = computed(() =>
    this.added()
      .map((field) => field.name)
      .join(', '),
  );

  constructor() {
    effect(() => {
      const page = this.page();
      const stage = this.stage();
      if (!page || !stage || this.started) return;
      this.started = true;
      untracked(() => stage.goToPage(page));
    });
  }

  /** Each new field goes a row further down the page: bring it into view. */
  protected async add(addField: typeof addDropdown) {
    const page = this.page();
    if (!page) return;
    const { field } = await addField(this.form, page, this.added().length);
    this.added.update((fields) => [...fields, field]);
    this.stage()?.reveal(page, { rect: this.form.getWidget(field.widgets[0])!.rect });
  }

  protected async removeLast() {
    const last = this.last();
    if (!last) return;
    await this.form.delete(last.ref);
    this.added.update((fields) => fields.slice(0, -1));
  }
}
