import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { copyImage, EpdfDocumentGate, provideEmbedPdf, saveFile } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import {
  EpdfRender,
  EpdfRenderLayer,
  EpdfSnapshotLayer,
  withRender,
} from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { cloudEngine } from '@cloudpdf/engine';

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer, EpdfSnapshotLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine(), initialDocuments: [{ source: welcome }] },
      withStage(),
      withRender(),
      withInteraction({ defaultTool: 'pan' }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './snapshot.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Tool">
          <button
            type="button"
            class="segment"
            [attr.aria-pressed]="interaction.activeToolId() === 'pan'"
            (click)="interaction.activateTool('pan')"
          >
            Hand
          </button>
          <button
            type="button"
            class="segment"
            [attr.aria-pressed]="interaction.activeToolId() === 'snapshot'"
            (click)="interaction.activateTool('snapshot')"
          >
            Snapshot
          </button>
        </div>
        <div class="actions">
          <button type="button" class="button" [disabled]="!snapshot()" (click)="copy()">
            Copy
          </button>
          <button type="button" class="button" [disabled]="!snapshot()" (click)="save()">
            Save
          </button>
        </div>
        <output class="readout">{{ readout() }}</output>
      </div>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-snapshot-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly interaction = inject(EpdfInteraction);
  private readonly render = inject(EpdfRender);
  protected readonly snapshot = computed(() => this.render.getSnapshot());
  private readonly said = signal('');

  protected readonly readout = computed(
    () =>
      this.said() ||
      (this.interaction.activeToolId() === 'snapshot' && !this.snapshot()
        ? 'Drag a box on a page'
        : ''),
  );

  constructor() {
    // A new snapshot, or none: nothing copied yet.
    effect(() => {
      this.snapshot();
      this.said.set('');
    });
  }

  protected copy() {
    const snapshot = this.snapshot();
    if (!snapshot) return;
    // In the click itself: the picture goes to the clipboard as it comes.
    copyImage(snapshot.image).then(
      () => this.said.set('Copied: paste it anywhere'),
      () => this.said.set('This browser didn’t allow the copy'),
    );
  }

  protected async save() {
    const snapshot = this.snapshot();
    if (!snapshot) return;
    saveFile(await (await snapshot.image).blob(), 'snapshot.png');
  }
}
