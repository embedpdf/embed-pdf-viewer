import { Component, inject } from '@angular/core';
import { EpdfAnchored } from '@embedpdf/angular/anchored';
import { EpdfAnnotation } from '@embedpdf/angular/annotation';

// <app-stamp-card /> goes inside <epdf-stage>
@Component({
  selector: 'app-stamp-card',
  imports: [EpdfAnchored],
  template: `
    @let stamp = hovered();
    @if (stamp?.subtype === 'stamp') {
      <epdf-anchored [anchor]="anchor()" placement="top">
        <div class="card">Approved by {{ stamp.author }}</div>
      </epdf-anchored>
    }
  `,
})
export class StampCard {
  private readonly annotation = inject(EpdfAnnotation);

  protected readonly hovered = this.annotation.hovered; // the annotation under the pointer, or null
  protected readonly anchor = this.annotation.anchorOf(() => this.hovered()?.ref ?? null);
}
