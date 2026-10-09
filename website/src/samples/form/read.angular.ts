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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput, PageRef } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfForm, EpdfFormLayer, toFieldRef, withForm } from '@embedpdf/angular/form';
import type { FormFieldDTO } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// How the new fields look: part of the PDF, like the rest of the page.
const look = { color: '#94a3b8', interiorColor: '#f8fafc', strokeWidth: 1, fontSize: 11 };

/** A field's value as text, whatever its family. */
function valueText(field: FormFieldDTO): string {
  switch (field.family) {
    case 'text':
    case 'combobox':
      return field.value || '—';
    case 'checkbox':
      return field.checked ? 'checked' : 'not checked';
    case 'radio':
      return field.value === 'Off' ? '—' : field.value;
    case 'listbox':
      return field.selectedValues.join(', ') || '—';
    default:
      return '';
  }
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
  styleUrl: './read.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <output class="readout">Hello, {{ greeting() }}</output>
        @if (changed(); as field) {
          <output class="note">Last change: {{ field }}</output>
        }
      </div>
      <div class="viewer">
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-form-layer />
          </ng-template>
        </epdf-stage>
        <ul class="fields">
          @for (field of form.fields(); track field.name) {
            <li class="field">
              <span class="field-name">
                {{ field.name }} <span class="family">{{ field.family }}</span>
              </span>
              <span class="field-value">{{ valueText(field) }}</span>
            </li>
          }
        </ul>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly form = inject(EpdfForm);
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private added = false;

  protected readonly valueText = valueText;
  /** One field's value: it changes only when that field does. */
  private readonly name = this.form.valueOf(toFieldRef('name'));
  protected readonly greeting = computed(() => {
    const name = this.name();
    return name && 'value' in name && name.value ? name.value : 'stranger';
  });
  protected readonly changed = signal<string | null>(null);

  constructor() {
    // Every change, whoever made it: typing, a script, or code.
    this.form.valueChanged$
      .pipe(takeUntilDestroyed())
      .subscribe(({ field }) => this.changed.set(field.name));

    // The ebook has no form, so this adds one to its last page, fills in a name, and goes there.
    effect(() => {
      const page = this.document.pages().at(-1)?.ref;
      const stage = this.stage();
      if (this.form.status() !== 'ready' || !page || !stage || this.added) return;
      this.added = true;
      untracked(() => void this.addSignUpForm(page, stage));
    });
  }

  private async addSignUpForm(page: PageRef, stage: EpdfStage) {
    const at = (y: number, width = 240, height = 24) => ({ page, rect: { x: 72, y, width, height } });
    await this.form.create({ family: 'text', name: 'name', widgets: [{ ...at(540), ...look }] });
    await this.form.create({ family: 'text', name: 'email', widgets: [{ ...at(576), ...look }] });
    await this.form.create({
      family: 'combobox',
      name: 'framework',
      options: ['React', 'Vue', 'Svelte', 'Angular'].map((label) => ({ label, value: label })),
      widgets: [{ ...at(612, 160), ...look }],
    });
    await this.form.create({
      family: 'checkbox',
      name: 'updates',
      widgets: [{ ...at(650, 16, 16), ...look }],
    });
    await this.form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
    stage.goToPage(page);
  }
}
