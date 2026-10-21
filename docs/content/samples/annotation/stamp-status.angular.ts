import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
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
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import {
  EpdfAnnotation,
  EpdfAnnotationLayer,
  withAnnotation,
  type Annotation,
} from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source review]
const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

// One stamp's status, pinned to it: a check on its corner once it's signed off,
// and a status with a button under it. Both stay there while the stamp moves.
@Component({
  selector: 'demo-approval-status',
  imports: [EpdfAnchored],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (signedOff()) {
      <epdf-anchored [anchor]="anchor()" placement="top-end" [gap]="-12" pinned>
        <span class="check">✓</span>
      </epdf-anchored>
    }
    <epdf-anchored [anchor]="anchor()" placement="bottom" [gap]="8" pinned>
      <div class="status">
        <span class="dot" [class.dot--done]="signedOff()"></span>
        {{ signedOff() ? 'Signed off' : 'Waiting' }}
        <button type="button" class="sign" [class.sign--undo]="signedOff()" (click)="toggle.emit()">
          {{ signedOff() ? 'Undo' : 'Sign off' }}
        </button>
      </div>
    </epdf-anchored>
  `,
})
export class ApprovalStatus {
  readonly stamp = input.required<Annotation>();
  readonly signedOff = input.required<boolean>();
  readonly toggle = output();

  protected readonly anchor = inject(EpdfAnnotation).anchorOf(() => this.stamp().ref);
}

// An approval stamp's name, which the stamp keeps in every PDF app; null for any other annotation.
const approvalName = (annotation: Annotation): string | null =>
  annotation.subtype === 'stamp' && annotation.name?.startsWith('approval-')
    ? annotation.name
    : null;

// Every approval stamp's status, inside <epdf-stage>. Your own data for each
// stamp is kept by its name.
@Component({
  selector: 'demo-approvals',
  imports: [ApprovalStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (approval of approvals(); track approval.name) {
      <demo-approval-status
        [stamp]="approval.stamp"
        [signedOff]="signedOff()[approval.name] ?? false"
        (toggle)="toggle(approval.name)"
      />
    }
  `,
})
export class Approvals {
  private readonly stamps = inject(EpdfAnnotation).watch({ subtype: 'stamp' });
  protected readonly signedOff = signal<Partial<Record<string, boolean>>>({
    'approval-budget': true,
  });

  protected readonly approvals = computed(() =>
    this.stamps().flatMap((stamp) => {
      const name = approvalName(stamp);
      return name ? [{ name, stamp }] : [];
    }),
  );

  protected toggle(name: string) {
    this.signedOff.update((current) => ({ ...current, [name]: !current[name] }));
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    Approvals,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: review }] },
      withStage(),
      withRender(),
      withInteraction(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './stamp-status.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <p class="hint">Sign a stamp off, then move it: its status goes with it.</p>
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-annotation-layer />
        </ng-template>
        <demo-approvals />
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  private readonly annotation = inject(EpdfAnnotation);
  private readonly stage = viewChild(EpdfStage);
  private done = false;

  constructor() {
    // On load: the page with the document's two approval stamps, the budget one already signed off.
    effect(() => {
      const stage = this.stage();
      if (!stage || this.annotation.status() !== 'ready' || this.done) return;
      this.done = true;
      untracked(() => {
        const found = this.annotation
          .list()
          .filter((each) => each.nm === 'approval-budget' || each.nm === 'approval-contract');
        if (found.length === 0) return;
        stage.reveal(found[0].page, { rect: found[0].rect });
      });
    });
  }
}
