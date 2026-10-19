import { NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';
import { EpdfLinkLayer, EpdfLinkTemplate } from '@embedpdf/angular/link';

@Component({
  selector: 'app-links',
  imports: [EpdfLinkLayer, EpdfLinkTemplate, NgTemplateOutlet],
  template: `
    <epdf-link-layer>
      <ng-template epdfLink let-link let-native="native">
        <span class="pdf-link" [attr.title]="link.target.kind === 'uri' ? link.target.uri : null">
          <ng-container [ngTemplateOutlet]="native" />
        </span>
      </ng-template>
    </epdf-link-layer>
  `,
})
export class Links {}
