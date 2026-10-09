import { Component } from '@angular/core';
import { EpdfScrollbar } from '@embedpdf/angular/stage';

@Component({
  selector: 'app-scrollbar',
  imports: [EpdfScrollbar],
  template: `<epdf-scrollbar axis="y" [autoHide]="1200" class="my-scrollbar" thumbClass="my-thumb" />`,
})
export class MyScrollbar {}
