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
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfForm, EpdfFormLayer, toFieldRef, withForm } from '@embedpdf/angular/form';
import type { FormValidation } from '@embedpdf/angular/form';
import { cloudEngine } from '@cloudpdf/engine';

const forms: OpenInput = { kind: 'grant', grant: 'shr_eBRW5E3MpolzD8G36Alp30EF' };

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
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './validate.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button type="button" class="button" (click)="submit()">Submit</button>
        @if (check(); as check) {
          @if (check.valid) {
            <output class="readout">Every required field is filled in</output>
          } @else {
            <output class="readout missing">Fill in first: {{ missingNames(check) }}</output>
          }
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
  private readonly stage = viewChild(EpdfStage);
  private started = false;
  protected readonly check = signal<FormValidation | null>(null);

  constructor() {
    // Fill in a name, then check the form, as if it was submitted.
    effect(() => {
      if (this.form.status() !== 'ready' || !this.stage() || this.started) return;
      this.started = true;
      untracked(() => {
        void this.form
          .setValue(toFieldRef('name'), { value: 'Ada Lovelace' })
          .then(() => this.validate());
      });
    });
  }

  /** Check the required fields. */
  private validate() {
    const result = this.form.validate();
    this.check.set(result);
    return result;
  }

  /** Submit: check, and put the cursor in the first empty field. */
  protected submit() {
    const first = this.validate().missing[0];
    if (first) this.form.focus(first.ref);
  }

  protected missingNames(check: FormValidation) {
    return check.missing.map((field) => field.name).join(', ');
  }
}
