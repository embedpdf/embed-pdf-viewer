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
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { withActions } from '@embedpdf/angular/actions';
import { EpdfForm, EpdfFormLayer, toFieldRef, withForm } from '@embedpdf/angular/form';
import { cloudEngine } from '@cloudpdf/engine';

const forms: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfFormLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine(), initialDocuments: [{ source: forms }] },
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
  private readonly document = inject(EpdfDocument);
  private readonly stage = viewChild(EpdfStage);
  private started = false;

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

    // Start on the invoice: its amounts and its total are calculated by scripts.
    effect(() => {
      const page = this.document.pages()[3]?.ref;
      const stage = this.stage();
      if (!page || !stage || this.started) return;
      this.started = true;
      untracked(() => stage.goToPage(page));
    });
  }
}
