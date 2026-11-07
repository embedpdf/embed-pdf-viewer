import { Component, inject } from '@angular/core';
import { EpdfButton, EpdfIcon } from '@embedpdf/viewer-angular';
import { Review } from './review'; // your app

@Component({
  selector: 'app-review-controls',
  imports: [EpdfButton, EpdfIcon],
  template: `
    <span class="review">
      <epdf-button
        icon="message"
        label="Notes"
        [active]="review.notesShown()"
        (click)="review.toggleNotes()"
      />
      @if (review.saved()) {
        <span class="saved"><epdf-icon name="check" [size]="16" /> Saved</span>
      }
    </span>
  `,
})
export class ReviewControls {
  protected readonly review = inject(Review);
}
