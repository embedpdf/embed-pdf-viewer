import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfForm, EpdfFormLayer, toFieldRef, withForm } from '@embedpdf/angular/form';
import type { FormFieldDTO } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};

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
      { engine: () => localEngine(), initialDocuments: [{ source: forms }] },
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
  private started = false;

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

    // On load: a name filled in.
    effect(() => {
      if (this.form.status() !== 'ready' || this.started) return;
      this.started = true;
      untracked(() => {
        void this.form.setValue(toFieldRef('name'), { value: 'Ada Lovelace' });
      });
    });
  }
}
