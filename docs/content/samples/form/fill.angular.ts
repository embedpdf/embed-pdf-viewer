import {
  ChangeDetectionStrategy,
  Component,
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
import { EpdfForm, EpdfFormLayer, toFieldRef, withForm } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** One field of each family, with `setValue()` in the shape each one takes. */
async function fillIn(form: EpdfForm) {
  await form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' }); // text
  await form.setValue(toFieldRef('updates'), { checked: true }); // checkbox
  await form.setValue(toFieldRef('plan'), { value: 'yearly' }); // radio group: a button's value
  await form.setValue(toFieldRef('framework'), { value: 'React' }); // dropdown: an option's value
  return form.setValue(toFieldRef('topics'), { selectedValues: ['Forms', 'Signatures'] }); // list
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
  styleUrl: './fill.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button type="button" class="button" (click)="fillIn()">Fill in</button>
        <button type="button" class="button" (click)="fillFromBackend()">
          Fill from your backend
        </button>
        <button type="button" class="button" (click)="reset()">Reset</button>
        @if (result()) {
          <output class="readout">{{ result() }}</output>
        }
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
  protected readonly result = signal('');

  constructor() {
    // The ebook has no form, so this adds one to its last page, fills it in, and goes there.
    effect(() => {
      const page = this.document.pages().at(-1)?.ref;
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !page || !stage || this.added) return;
      this.added = true;
      untracked(() => void this.addSignUpForm(page, stage));
    });
  }

  protected async fillIn() {
    const { status } = await fillIn(this.form);
    this.result.set(`Filled in: ${status}`);
  }

  protected async fillFromBackend() {
    // Plain values by full name, as your backend would send them.
    const { applied, skipped } = await this.form.importValues({
      name: 'Grace Hopper',
      framework: 'Vue',
      updates: false,
      topics: ['Annotations'],
      phone: '555-0100',
    });
    this.result.set(`${applied.length} filled, ${skipped.length} skipped`);
  }

  protected async reset() {
    const { fields } = await this.form.reset();
    this.result.set(`${fields.length} fields reset`);
  }

  private async addSignUpForm(page: PageRef, stage: EpdfStage) {
    const at = (x: number, y: number, width: number, height: number) => ({
      page,
      rect: { x, y, width, height },
      ...look,
    });
    await this.form.create({ family: 'text', name: 'name', widgets: [at(72, 520, 220, 22)] });
    await this.form.create({
      family: 'combobox',
      name: 'framework',
      options: ['React', 'Vue', 'Svelte', 'Angular'].map((label) => ({ label, value: label })),
      widgets: [at(72, 552, 160, 22)],
    });
    await this.form.create({
      family: 'radio',
      name: 'plan',
      widgets: [
        { ...at(72, 588, 16, 16), exportValue: 'monthly' },
        { ...at(112, 588, 16, 16), exportValue: 'yearly' },
      ],
    });
    await this.form.create({ family: 'checkbox', name: 'updates', widgets: [at(72, 618, 16, 16)] });
    await this.form.create({
      family: 'listbox',
      name: 'topics',
      multiSelect: true,
      options: ['Forms', 'Annotations', 'Signatures'].map((label) => ({ label, value: label })),
      widgets: [at(320, 520, 150, 60)],
    });
    await fillIn(this.form);
    stage.goToPage(page);
  }
}
