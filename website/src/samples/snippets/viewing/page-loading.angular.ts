import { Component } from '@angular/core';
import { injectPictureState } from '@embedpdf/angular/render';

// Put <app-page-loading /> in each page, after <epdf-render-layer />
@Component({
  selector: 'app-page-loading',
  template: `
    @if (picture().status === 'loading' && picture().slow) {
      <div class="page-loading" role="status" aria-label="Loading page"></div>
    } @else if (picture().status === 'error') {
      <p class="page-error">This page couldn't load.</p>
    }
  `,
})
export class PageLoading {
  protected readonly picture = injectPictureState();
}
