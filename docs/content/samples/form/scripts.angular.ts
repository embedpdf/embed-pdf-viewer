import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { withActions } from '@embedpdf/angular/actions';
import { EpdfForm, EpdfFormLayer, toFieldRef, withForm } from '@embedpdf/angular/form';
import { localEngine } from '@embedpdf/engine';

// [!doc-source invoice]
const invoice = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/invoice.pdf');
  return { kind: 'bytes', id: 'invoice', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: invoice }] },
      withStage(),
      withRender(),
      withInteraction(),
      withForm(),
      // The form's scripts run with JavaScript on in the actions plugin.
      withActions({ javascript: { enabled: true } }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './scripts.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <!-- The amounts and the total are calculated by the form's scripts. -->
      <div class="toolbar">
        <output class="readout">Total: {{ totalText() }}</output>
        @if (refused(); as refused) {
          <output class="refused">{{ refused }}</output>
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

  private readonly total = this.form.valueOf(toFieldRef('invoice.total'));
  protected readonly totalText = computed(() => {
    const total = this.total();
    return total && 'value' in total && total.value ? total.value : 'type a quantity';
  });
  protected readonly refused = signal<string | null>(null);

  constructor() {
    // A script refused a value, such as a date that isn't day/month/year.
    this.form.validationRejected$
      .pipe(takeUntilDestroyed())
      .subscribe(({ field, issues }) =>
        this.refused.set(`${field.name}: ${issues[0]?.message ?? 'refused'}`),
      );
  }
}
