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
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
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

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};

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
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
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
  private readonly document = inject(EpdfDocument);
  private added = false;

  constructor() {
    // On load: two approval stamps on the cover, one signed off. The second sits
    // at the bottom, so its status hangs over the next page.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (this.annotation.status() !== 'ready' || !cover || this.added) return;
      this.added = true;
      untracked(() => {
        void approvedPicture().then(async (appearance) => {
          await this.annotation.create(
            cover,
            {
              subtype: 'stamp',
              box: { x: 330, y: 470, width: 180, height: 60 },
              name: 'approval-budget',
            },
            { appearance },
          );
          await this.annotation.create(
            cover,
            {
              subtype: 'stamp',
              box: { x: 96, y: 712, width: 180, height: 60 },
              name: 'approval-contract',
            },
            { appearance },
          );
        });
      });
    });
  }
}

// The stamp's picture, drawn on a canvas so the example needs no image file.
function approvedPicture(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 120;
  const context = canvas.getContext('2d')!;
  context.strokeStyle = '#30a46c';
  context.lineWidth = 10;
  context.strokeRect(5, 5, 350, 110);
  context.fillStyle = '#30a46c';
  context.font = 'bold 54px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('APPROVED', 180, 64);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'));
}
