import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
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
import { cloudEngine } from '@cloudpdf/engine';

const registration: OpenInput = { kind: 'share', shareToken: 'shr_sjOrUrwF2Sf0X5ADfySRG58L' };

// The printed boxes are the fields' look: a new field only sets its text size.
const look = { fontSize: 11 };

// The printed table of group tickets: a row every 36 points from the top at 470, with a country
// box at x 96 and a circle for each ticket at x 330 and 430.
const rowTop = (row: number) => 470 + row * 36;

/** A dropdown in a row's country box. */
function addDropdown(form: EpdfForm, page: PageRef, row: number) {
  return form.create({
    family: 'combobox',
    name: `country_${row + 1}`,
    options: [
      { label: 'Netherlands', value: 'NL' },
      { label: 'Belgium', value: 'BE' },
      { label: 'Germany', value: 'DE' },
    ],
    widgets: [{ page, rect: { x: 96, y: rowTop(row), width: 160, height: 24 }, ...look }],
  });
}

/** A radio group in a row's two circles: one field, a widget per circle, each with its value. */
function addRadioGroup(form: EpdfForm, page: PageRef, row: number) {
  const y = rowTop(row) + 4;
  return form.create({
    family: 'radio',
    name: `ticket_${row + 1}`,
    widgets: [
      { page, rect: { x: 330, y, width: 16, height: 16 }, exportValue: 'one-day', ...look },
      { page, rect: { x: 430, y, width: 16, height: 16 }, exportValue: 'both-days', ...look },
    ],
  });
}

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine(), initialDocuments: [{ source: registration }] },
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
          [disabled]="!page() || rowFor('combobox') >= 5"
          (click)="add(addDropdown, 'combobox')"
        >
          Add a dropdown
        </button>
        <button
          type="button"
          class="button"
          [disabled]="!page() || rowFor('radio') >= 5"
          (click)="add(addRadioGroup, 'radio')"
        >
          Add a radio group
        </button>
        <button type="button" class="button" [disabled]="!last()" (click)="removeLast()">
          Remove the last
        </button>
        <output class="readout">{{ names() || 'No fields in the table yet' }}</output>
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

  protected readonly addDropdown = addDropdown;
  protected readonly addRadioGroup = addRadioGroup;
  protected readonly page = computed(() => this.document.pages()[0]?.ref); // the printed form
  private readonly added = signal<FormFieldDTO[]>([]);
  protected readonly last = computed(() => this.added().at(-1));
  protected readonly names = computed(() =>
    this.added()
      .map((field) => field.name)
      .join(', '),
  );

  /** Each kind of field fills its column from the top: the next row that hasn't got one. */
  protected rowFor(family: FormFieldDTO['family']) {
    return this.added().filter((field) => field.family === family).length;
  }

  protected async add(addField: typeof addDropdown, family: FormFieldDTO['family']) {
    const page = this.page();
    if (!page) return;
    const { field } = await addField(this.form, page, this.rowFor(family));
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
