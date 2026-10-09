import { Component, inject, input } from '@angular/core';
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { annotationKey, type Annotation, EpdfAnnotation } from '@embedpdf/angular/annotation';
import { Approvals } from './approvals'; // your own data

// Pinned under the stamp: it stays there while the stamp moves, and scrolls away with it.
@Component({
  selector: 'app-approval-status',
  imports: [EpdfAnchored],
  template: `
    <epdf-anchored [anchor]="anchor()" placement="bottom" pinned>
      <div class="status">
        {{ approval().signedOff ? 'Signed off' : 'Waiting' }}
        <button (click)="approval().toggle()">
          {{ approval().signedOff ? 'Undo' : 'Sign off' }}
        </button>
      </div>
    </epdf-anchored>
  `,
})
export class ApprovalStatus {
  readonly stamp = input.required<Annotation>();

  protected readonly anchor = inject(EpdfAnnotation).anchorOf(() => this.stamp().ref);
  protected readonly approval = inject(Approvals).of(() => annotationKey(this.stamp().ref)); // your own data
}
