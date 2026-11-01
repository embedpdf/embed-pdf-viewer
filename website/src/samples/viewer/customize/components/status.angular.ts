import { Component, model, signal, ViewEncapsulation } from '@angular/core';
import { EpdfPdfViewer, EpdfToolbarItem, type Layout } from '@embedpdf/viewer-angular';

const proposal = '/pdfs/proposal.pdf';

@Component({
  selector: 'demo-review-status',
  template: `
    <label class="status" [attr.data-status]="status()">
      <span class="dot"></span>
      <select
        #picker
        aria-label="Review status"
        [value]="status()"
        (change)="status.set(picker.value)"
      >
        <option value="draft">Draft</option>
        <option value="review">In review</option>
        <option value="approved">Approved</option>
      </select>
    </label>
  `,
})
export class ReviewStatus {
  readonly status = model.required<string>();
}

@Component({
  selector: 'demo-root',
  imports: [EpdfPdfViewer, EpdfToolbarItem, ReviewStatus],
  styleUrl: './status.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <epdf-pdf-viewer [src]="proposal" [layout]="layout" style="height: 100%">
      <ng-template epdfToolbarItem="status">
        <demo-review-status [(status)]="status" />
      </ng-template>
    </epdf-pdf-viewer>
  `,
})
export class App {
  readonly proposal = proposal;
  readonly status = signal('review');
  readonly layout = (layout: Layout) =>
    layout.add({ custom: 'status' }, { to: 'main', section: 'end' });
}
