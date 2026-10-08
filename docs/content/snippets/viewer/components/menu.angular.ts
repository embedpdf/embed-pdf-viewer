import { Component } from '@angular/core';
import { EpdfMenu, EpdfMenuItem } from '@embedpdf/viewer-angular';
import { copyLink, emailLink } from './share'; // your app

@Component({
  selector: 'app-share-menu',
  imports: [EpdfMenu, EpdfMenuItem],
  template: `
    <epdf-menu icon="link" label="Share">
      <epdf-menu-item icon="copy" (select)="copyLink()">Copy link</epdf-menu-item>
      <epdf-menu-item icon="message" (select)="emailLink()">Email a link</epdf-menu-item>
    </epdf-menu>
  `,
})
export class ShareMenu {
  protected readonly copyLink = copyLink;
  protected readonly emailLink = emailLink;
}
