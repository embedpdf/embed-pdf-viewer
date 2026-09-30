import { Component } from '@angular/core';
import { EpdfSearchLayer } from '@embedpdf/angular/search';

@Component({
  selector: 'app-highlights',
  imports: [EpdfSearchLayer],
  template: `<epdf-search-layer color="#ffd500" activeColor="#ff9632" blendMode="multiply" />`,
})
export class Highlights {}
